import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { PGlite } from "@electric-sql/pglite";

let passed = 0;
let failed = 0;

export async function createTestContext(): Promise<{ client: PGlite }> {
  const client = new PGlite();

  // 执行 prisma/migrations 下的迁移 SQL
  const migrationsDir = join(__dirname, "..", "prisma", "migrations");
  const dirs = readdirSync(migrationsDir).filter((name) =>
    /^\d{10,}_/.test(name),
  );
  for (const dir of dirs) {
    const sql = readFileSync(join(migrationsDir, dir, "migration.sql"), "utf8");
    await client.exec(sql);
  }

  return { client };
}

export function ok(condition: unknown, message: string): asserts condition {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

export async function expectReject(
  promise: Promise<unknown>,
  check: (error: Error) => boolean,
  message: string,
): Promise<void> {
  try {
    await promise;
    failed += 1;
    console.error(`  ✗ ${message}（未抛错）`);
  } catch (error) {
    if (check(error as Error)) {
      passed += 1;
      console.log(`  ✓ ${message}`);
    } else {
      failed += 1;
      console.error(`  ✗ ${message}（错误不符: ${(error as Error).message}）`);
    }
  }
}

export function summarize(): number {
  console.log(`\n${passed} 通过，${failed} 失败`);
  return failed === 0 ? 0 : 1;
}
