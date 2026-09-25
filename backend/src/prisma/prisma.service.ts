import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { envConfig } from "../config/env.config";

export interface PrismaServiceOptions {
  /**
   * 仅测试用：绕过 DATABASE_URL，使用 Prisma 驱动适配器（如 PGlite）。
   * 类型保持宽松，避免生产代码依赖 driver-adapter-utils。
   */
  adapter?: unknown;
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor(options?: PrismaServiceOptions) {
    super(
      options?.adapter
        ? ({ adapter: options.adapter } as never)
        : {
            datasources: { db: { url: envConfig.databaseUrl } },
            log: ["warn", "error"],
          },
    );
  }

  async onModuleInit() {
    await this.$connect();
  }
}
