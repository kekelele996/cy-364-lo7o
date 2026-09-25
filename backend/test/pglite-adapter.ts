import { PGlite, type PGliteInterface, type Transaction as PgTx, type Results } from "@electric-sql/pglite";
import {
  ColumnTypeEnum,
  DriverAdapterError,
  type ColumnType,
  type SqlDriverAdapter,
  type SqlDriverAdapterFactory,
  type SqlQuery,
  type SqlResultSet,
  type Transaction as PrismaTransaction,
  type IsolationLevel,
} from "@prisma/driver-adapter-utils";

// 仅用于本地集成测试：让 Prisma 6 通过驱动适配器跑在 PGlite（WASM Postgres）上。
// 生产环境仍通过 DATABASE_URL 直连真实 PostgreSQL。

const PG_OID_TO_COLUMN: Record<number, ColumnType> = {
  16: ColumnTypeEnum.Boolean,
  17: ColumnTypeEnum.Bytes,
  20: ColumnTypeEnum.Int64,
  21: ColumnTypeEnum.Int32,
  23: ColumnTypeEnum.Int32,
  700: ColumnTypeEnum.Float,
  701: ColumnTypeEnum.Double,
  1082: ColumnTypeEnum.Date,
  1083: ColumnTypeEnum.Time,
  // 1114/1184(timestamp) -> Prisma DateTime：协议要求 ISO 字符串
  1114: ColumnTypeEnum.DateTime,
  1184: ColumnTypeEnum.DateTime,
  114: ColumnTypeEnum.Json,
  3802: ColumnTypeEnum.Json,
  2950: ColumnTypeEnum.Uuid,
  1007: ColumnTypeEnum.Int32Array,
  1009: ColumnTypeEnum.TextArray,
  1015: ColumnTypeEnum.TextArray,
};

function convertRow(row: unknown[], columnTypes: ColumnType[]): unknown[] {
  return row.map((value, index) => {
    if (value === null || value === undefined) return null;
    const type = columnTypes[index];
    if (
      (type === ColumnTypeEnum.Int64 || type === ColumnTypeEnum.Int32) &&
      typeof value === "bigint"
    ) {
      return Number(value);
    }
    if (type === ColumnTypeEnum.DateTime && value instanceof Date) {
      return value.toISOString();
    }
    return value;
  });
}

type QueryExecutor = Pick<PGliteInterface, "query">;

function toPgParam(value: unknown): unknown {
  if (value instanceof Date) {
    // PGlite 不能直接接收 JS Date，转成 ISO 时间戳由 PG 隐式转换
    return value.toISOString();
  }
  if (value === undefined) return null;
  return value;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function runQuery(
  client: QueryExecutor,
  query: SqlQuery,
): Promise<SqlResultSet> {
  try {
    const result = (await client.query(query.sql, query.args.map(toPgParam), {
      rowMode: "array",
    })) as Results<unknown[]>;

    const fields = (result.fields ?? []) as { name: string; dataTypeID: number }[];
    const columnTypes = fields.map(
      (field) => PG_OID_TO_COLUMN[field.dataTypeID] ?? ColumnTypeEnum.Text,
    );
    return {
      columnNames: fields.map((field) => field.name),
      columnTypes,
      rows: (result.rows ?? []).map((row) => convertRow(row, columnTypes)),
    };
  } catch (error) {
    throw new DriverAdapterError({
      kind: "postgres",
      code: (error as { code?: string }).code ?? "0",
      severity: "ERROR",
      message: (error as Error).message,
      detail: undefined,
      column: undefined,
      hint: undefined,
    });
  }
}

class PGliteAdapter implements SqlDriverAdapter {
  readonly provider = "postgres" as const;
  readonly adapterName = "pglite-test";

  constructor(private readonly client: PGlite) {}

  async queryRaw(query: SqlQuery): Promise<SqlResultSet> {
    return runQuery(this.client, query);
  }

  async executeRaw(query: SqlQuery): Promise<number> {
    const result = await runQuery(this.client, query);
    return result.rows.length;
  }

  async executeScript(script: string): Promise<void> {
    await this.client.exec(script);
  }

  async startTransaction(_isolationLevel?: IsolationLevel): Promise<PrismaTransaction> {
    // PGlite 0.2 只有回调式事务：用 deferred promise 把事务对象“递”出来，
    // 在 commit/rollback 被调用前让回调一直挂起。
    const txReady = deferred<PgTx>();
    let finish!: (error?: Error) => void;
    const lifecycle = new Promise<void>((resolve, reject) => {
      finish = (error?: Error) => (error ? reject(error) : resolve());
    });

    const txPromise = this.client.transaction(async (tx) => {
      txReady.resolve(tx);
      await lifecycle;
    });
    txPromise.catch(() => {
      /* rollback 时 reject 属于预期路径 */
    });

    const tx = await txReady.promise;

    return {
      provider: "postgres",
      adapterName: "pglite-test",
      options: { usePhantomQuery: false },
      queryRaw: (query: SqlQuery) => runQuery(tx, query),
      async executeRaw(query: SqlQuery): Promise<number> {
        const result = await runQuery(tx, query);
        return result.rows.length;
      },
      async commit(): Promise<void> {
        finish();
        await txPromise;
      },
      async rollback(): Promise<void> {
        await tx.rollback();
        finish(new Error("rolled back"));
        await txPromise.catch(() => undefined);
      },
    };
  }

  async dispose(): Promise<void> {
    await this.client.close();
  }
}

export function createPGliteAdapterFactory(client: PGlite): SqlDriverAdapterFactory {
  return {
    provider: "postgres",
    adapterName: "pglite-test",
    async connect(): Promise<SqlDriverAdapter> {
      return new PGliteAdapter(client);
    },
  };
}
