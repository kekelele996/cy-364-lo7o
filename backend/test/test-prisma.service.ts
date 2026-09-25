import { PrismaClient } from "@prisma/client";
import type { SqlDriverAdapterFactory } from "@prisma/driver-adapter-utils";

// 测试用 PrismaService：注入 PGlite 适配器，跳过真实数据库连接配置
export class TestPrismaService extends PrismaClient {
  constructor(adapter: SqlDriverAdapterFactory) {
    super({ adapter } as never);
  }
}
