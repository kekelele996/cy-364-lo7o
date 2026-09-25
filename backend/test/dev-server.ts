// 本地无 PostgreSQL 时的开发/联调服务器：用 PGlite 承载数据并执行迁移与种子。
// 仅用于本地验证，生产环境使用 docker compose（真实 PostgreSQL）。
// 用法：ts-node test/dev-server.ts
import { Global, Module } from "@nestjs/common";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PrismaClient } from "@prisma/client";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { PGlite } from "@electric-sql/pglite";
import { PrismaService } from "../src/prisma/prisma.service";
import { StocktakeModule } from "../src/stocktake/stocktake.module";
import { InventoryModule } from "../src/inventory/inventory.module";
import { OverviewController } from "../src/overview/overview.controller";
import { OverviewService } from "../src/overview/overview.service";
import { createPGliteAdapterFactory } from "./pglite-adapter";

const PORT = Number(process.env.PORT ?? 29504);
const DATA_DIR = process.env.PGLITE_DATA_DIR ?? join(__dirname, "..", ".pglite-data");

async function migrate(client: PGlite) {
  const migrationsDir = join(__dirname, "..", "prisma", "migrations");
  for (const dir of readdirSync(migrationsDir).filter((name) => /^\d{10,}_/.test(name))) {
    await client.exec(readFileSync(join(migrationsDir, dir, "migration.sql"), "utf8"));
  }
}

async function bootstrap() {
  const client = new PGlite(existsSync(DATA_DIR) || process.env.PGLITE_MEMORY ? undefined : DATA_DIR);
  await migrate(client);
  const prisma = new PrismaService({ adapter: createPGliteAdapterFactory(client) });
  (globalThis as unknown as { __SEED_PRISMA__: PrismaService }).__SEED_PRISMA__ = prisma;
  const { seed } = require("../prisma/seed.cjs") as { seed: () => Promise<void> };
  await seed();

  @Global()
  @Module({
    providers: [
      { provide: PrismaService, useValue: prisma },
      { provide: PrismaClient, useExisting: PrismaService },
    ],
    exports: [PrismaService, PrismaClient],
  })
  class DevPrismaModule {}

  @Module({
    imports: [DevPrismaModule, StocktakeModule, InventoryModule],
    controllers: [OverviewController],
    providers: [OverviewService],
  })
  class DevAppModule {}

  const app: INestApplication = await NestFactory.create(DevAppModule, { logger: ["log", "error", "warn"] });
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }),
  );
  await app.listen(PORT, "0.0.0.0");
  console.log(`[dev-server] PGlite 联调服务已启动: http://127.0.0.1:${PORT}`);
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
