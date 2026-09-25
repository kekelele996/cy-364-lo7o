import { Global, Module } from "@nestjs/common";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { PrismaClient } from "@prisma/client";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { PGlite } from "@electric-sql/pglite";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { StocktakeModule } from "../src/stocktake/stocktake.module";
import { InventoryModule } from "../src/inventory/inventory.module";
import { OverviewController } from "../src/overview/overview.controller";
import { OverviewService } from "../src/overview/overview.service";
import { createPGliteAdapterFactory } from "./pglite-adapter";

const PORT = 29611;
let failures = 0;

async function api<T = any>(path: string, init?: RequestInit) {
  const response = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    ...init,
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as T) : (null as T),
  };
}

function check(condition: unknown, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${message}`);
  }
}

async function migrate(client: PGlite) {
  const migrationsDir = join(__dirname, "..", "prisma", "migrations");
  for (const dir of readdirSync(migrationsDir).filter((name) => /^\d{10,}_/.test(name))) {
    await client.exec(readFileSync(join(migrationsDir, dir, "migration.sql"), "utf8"));
  }
}

function buildTestModule(pglitePrisma: PrismaService) {
  @Global()
  @Module({
    providers: [
      { provide: PrismaService, useValue: pglitePrisma },
      { provide: PrismaClient, useExisting: PrismaService },
    ],
    exports: [PrismaService, PrismaClient],
  })
  class TestPrismaModule {}

  @Module({
    imports: [TestPrismaModule, StocktakeModule, InventoryModule],
    controllers: [OverviewController],
    providers: [OverviewService],
  })
  class TestAppModule {}
  return TestAppModule;
}

void AppModule; // 保持引用，表明测试与生产 AppModule 使用相同的控制器/模块装配

async function main() {
  const client = new PGlite();
  await migrate(client);
  const pglitePrisma = new PrismaService({ adapter: createPGliteAdapterFactory(client) });

  const app: INestApplication = await NestFactory.create(buildTestModule(pglitePrisma), {
    logger: ["error", "warn"],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.listen(PORT, "127.0.0.1");

  console.log("\n[A] 健康检查与基础数据");
  const health = await api("/health");
  check(health.status === 200 && health.body?.status === "ok", "GET /health 返回 ok");
  const overview = await api("/overview");
  check(overview.status === 200 && !!overview.body?.appName, "GET /overview 正常");
  const storesEmpty = await api("/stores");
  check(storesEmpty.status === 200 && Array.isArray(storesEmpty.body), "GET /stores 空数组");

  console.log("\n[B] 播种基础数据");
  await pglitePrisma.store.createMany({
    data: [
      { code: "SH001", name: "城东旗舰店", manager: "王店长" },
      { code: "SH002", name: "西湖社区店", manager: "李店长" },
    ],
  });
  await pglitePrisma.product.createMany({
    data: [
      { sku: "P1", name: "大米", spec: "5kg", barcode: "B1", category: "粮油" },
      { sku: "P2", name: "牛奶", spec: "250ml", barcode: "B2", category: "乳品" },
    ],
  });
  await pglitePrisma.storeInventory.createMany({
    data: [
      { storeId: 1, productId: 1, quantity: 100 },
      { storeId: 1, productId: 2, quantity: 50 },
      { storeId: 2, productId: 1, quantity: 30 },
      { storeId: 2, productId: 2, quantity: 20 },
    ],
  });

  const stores = await api<any[]>("/stores");
  check(stores.body?.length === 2, `门店列表返回 2 家（实际 ${stores.body?.length}）`);
  const products = await api<any>("/stores/1/products");
  check(products.body?.products?.length === 2, "门店商品返回 2 个");
  check(products.body?.products[0]?.paused === false, "初始没有商品被暂停");

  console.log("\n[C] 参数校验");
  const badStart = await api("/stocktakes", {
    method: "POST",
    body: JSON.stringify({ storeId: 1, productIds: [] }),
  });
  check(badStart.status === 400, "空商品列表被 400 拒绝");
  const badStore = await api("/stocktakes", {
    method: "POST",
    body: JSON.stringify({ storeId: 999, productIds: [1] }),
  });
  check(badStore.status === 404, "不存在的门店返回 404");
  const badPayload = await api("/stocktakes", {
    method: "POST",
    body: JSON.stringify({ storeId: 1, productIds: ["abc"] }),
  });
  check(badPayload.status === 400, "非法商品ID被 400 拒绝");

  console.log("\n[D] 开始盘点 -> 暂停 -> 出入库守卫");
  const startRes = await api<any>("/stocktakes", {
    method: "POST",
    body: JSON.stringify({ storeId: 1, productIds: [1, 2] }),
  });
  check(startRes.status === 201, "POST /stocktakes 返回 201");
  check(startRes.body?.status === "IN_PROGRESS", "盘点单进行中");
  check(startRes.body?.items?.[0]?.bookQuantity === 100, "账面快照 100");
  const stocktakeId = startRes.body?.id as number;

  const productsPaused = await api<any>("/stores/1/products");
  check(productsPaused.body?.products.every((p: any) => p.paused), "门店1两个商品都显示暂停");
  const store2Products = await api<any>("/stores/2/products");
  check(store2Products.body?.products.every((p: any) => !p.paused), "门店2商品不受影响");

  const blockedOut = await api("/stores/1/transactions", {
    method: "POST",
    body: JSON.stringify({ productId: 1, type: "OUTBOUND", quantity: 10 }),
  });
  check(blockedOut.status === 409, `盘点期间出库 409（${blockedOut.body?.message}）`);
  const blockedIn = await api("/stores/1/transactions", {
    method: "POST",
    body: JSON.stringify({ productId: 2, type: "INBOUND", quantity: 3 }),
  });
  check(blockedIn.status === 409, "盘点期间入库同样被拒绝");

  const allowedOther = await api("/stores/2/transactions", {
    method: "POST",
    body: JSON.stringify({ productId: 1, type: "INBOUND", quantity: 5 }),
  });
  check(allowedOther.status === 201 && allowedOther.body?.balance === 35, "门店2入库成功结余35");

  console.log("\n[E] 录入 -> 未录完拒绝确认（失败不留半成品）");
  const firstItemId = startRes.body.items[0].itemId;
  const secondItemId = startRes.body.items[1].itemId;
  const save1 = await api(`/stocktakes/${stocktakeId}/counts`, {
    method: "POST",
    body: JSON.stringify({ counts: [{ itemId: firstItemId, countedQty: 96 }] }),
  });
  check(save1.status === 201 && save1.body?.countedCount === 1, "暂存 1 条，进度 1/2");

  const confirmIncomplete = await api(`/stocktakes/${stocktakeId}/confirm`, { method: "POST" });
  check(confirmIncomplete.status === 400, "未录完确认被 400 拒绝");
  const stillInProgress = await api<any>(`/stocktakes/${stocktakeId}`);
  check(stillInProgress.body?.status === "IN_PROGRESS", "确认失败后盘点单仍进行中");
  const invUnchanged = await api<any>("/stores/1/products");
  check(
    invUnchanged.body.products.find((p: any) => p.productId === 1).quantity === 100,
    "确认失败后库存未变化（无半成品）",
  );

  console.log("\n[F] 确认完成 + 重复提交幂等");
  await api(`/stocktakes/${stocktakeId}/counts`, {
    method: "POST",
    body: JSON.stringify({ counts: [{ itemId: secondItemId, countedQty: 55 }] }),
  });
  const confirm1 = await api<any>(`/stocktakes/${stocktakeId}/confirm`, { method: "POST" });
  check(confirm1.status === 201 && confirm1.body?.status === "COMPLETED", "确认成功 COMPLETED");
  check(confirm1.body?.totalVariance === 1, "总盘盈 +1");

  const confirm2 = await api<any>(`/stocktakes/${stocktakeId}/confirm`, { method: "POST" });
  check(confirm2.status === 201 && confirm2.body?.status === "COMPLETED", "重复确认仍返回原结果");

  const adjustments = await api<any[]>("/stores/1/transactions?type=ADJUST");
  check(adjustments.body?.length === 2, `只有 2 条调整流水（实际 ${adjustments.body?.length}）`);
  check(
    adjustments.body?.some((r) => r.changeQty === -4 && r.refCode === startRes.body.code),
    "包含盘亏 -4 且关联盘点单号",
  );

  const afterProducts = await api<any>("/stores/1/products");
  const p1 = afterProducts.body.products.find((p: any) => p.productId === 1);
  const p2 = afterProducts.body.products.find((p: any) => p.productId === 2);
  check(p1.quantity === 96 && p2.quantity === 55, "库存一次性更新为 96 / 55");
  check(!p1.paused && !p2.paused, "完成后暂停解除");

  console.log("\n[G] 中途退出可继续（暂存数据保留）");
  const resume = await api<any>("/stocktakes", {
    method: "POST",
    body: JSON.stringify({ storeId: 2, productIds: [1, 2] }),
  });
  await api(`/stocktakes/${resume.body.id}/counts`, {
    method: "POST",
    body: JSON.stringify({ counts: [{ itemId: resume.body.items[0].itemId, countedQty: 33 }] }),
  });
  const reopened = await api<any>(`/stocktakes/${resume.body.id}`);
  check(reopened.body?.countedCount === 1, "重新打开盘点单时已录数据仍在");
  check(reopened.body?.items[0].countedQty === 33, "暂存实盘数为 33");

  console.log("\n[H] 取消盘点解除暂停");
  const cancelRes = await api(`/stocktakes/${resume.body.id}/cancel`, { method: "POST" });
  check(cancelRes.status === 201 && cancelRes.body?.status === "CANCELLED", "取消成功");
  const afterCancel = await api("/stores/2/transactions", {
    method: "POST",
    body: JSON.stringify({ productId: 1, type: "OUTBOUND", quantity: 5 }),
  });
  check(afterCancel.status === 201 && afterCancel.body?.balance === 30, "取消后出库恢复，结余30");

  console.log("\n[I] 列表：进行中在前 + 含最近完成");
  const start3 = await api<any>("/stocktakes", {
    method: "POST",
    body: JSON.stringify({ storeId: 1, productIds: [1] }),
  });
  const listRes = await api<any[]>("/stocktakes");
  check(listRes.body?.[0]?.id === start3.body.id, "列表第一项是进行中的盘点单");
  check(listRes.body?.some((s) => s.status === "COMPLETED"), "列表含已完成");
  check(listRes.body?.some((s) => s.status === "CANCELLED"), "列表含已取消");

  console.log("\n[J] 同门店唯一进行中约束");
  const duplicate = await api("/stocktakes", {
    method: "POST",
    body: JSON.stringify({ storeId: 1, productIds: [2] }),
  });
  check(duplicate.status === 409, "同门店重复开盘点单 409");

  console.log("\n[K] 库存不足被拦截");
  await api(`/stocktakes/${start3.body.id}/cancel`, { method: "POST" });
  const oversell = await api("/stores/2/transactions", {
    method: "POST",
    body: JSON.stringify({ productId: 2, type: "OUTBOUND", quantity: 999 }),
  });
  check(oversell.status === 400, "超量出库被 400 拒绝");

  await app.close();
  await pglitePrisma.$disconnect();

  console.log(`\nHTTP 冒烟结果：${failures === 0 ? "全部通过" : `${failures} 项失败`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
