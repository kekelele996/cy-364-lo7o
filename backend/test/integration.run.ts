import { createPGliteAdapterFactory } from "./pglite-adapter";
import { createTestContext, expectReject, ok, summarize } from "./test-context";
import { TestPrismaService } from "./test-prisma.service";
import { StocktakeService } from "../src/stocktake/stocktake.service";
import { InventoryService } from "../src/inventory/inventory.service";

async function seed(prisma: TestPrismaService) {
  const storeA = await prisma.store.create({
    data: { code: "SH001", name: "城东旗舰店", manager: "王店长" },
  });
  const storeB = await prisma.store.create({
    data: { code: "SH002", name: "西湖社区店", manager: "李店长" },
  });
  const product1 = await prisma.product.create({
    data: { sku: "P1", name: "大米", spec: "5kg", barcode: "B1", category: "粮油" },
  });
  const product2 = await prisma.product.create({
    data: { sku: "P2", name: "牛奶", spec: "250ml", barcode: "B2", category: "乳品" },
  });

  await prisma.storeInventory.createMany({
    data: [
      { storeId: storeA.id, productId: product1.id, quantity: 100, safetyQty: 10 },
      { storeId: storeA.id, productId: product2.id, quantity: 50, safetyQty: 10 },
      { storeId: storeB.id, productId: product1.id, quantity: 30, safetyQty: 10 },
      { storeId: storeB.id, productId: product2.id, quantity: 20, safetyQty: 10 },
    ],
  });

  return { storeA, storeB, product1, product2 };
}

async function main() {
  const { client } = await createTestContext();
  const prisma = new TestPrismaService(createPGliteAdapterFactory(client));
  const stocktakeService = new StocktakeService(prisma);
  const inventoryService = new InventoryService(prisma);
  const { storeA, storeB, product1, product2 } = await seed(prisma);

  console.log("\n[1] 开始盘点：快照账面数并暂停");
  const stocktake = await stocktakeService.startStocktake({
    storeId: storeA.id,
    productIds: [product1.id, product2.id],
  });
  ok(stocktake.status === "IN_PROGRESS", "盘点单状态为进行中");
  ok(stocktake.itemCount === 2, "盘点单包含 2 个商品");
  const bookItem1 = stocktake.items!.find((i) => i.productId === product1.id)!;
  const bookItem2 = stocktake.items!.find((i) => i.productId === product2.id)!;
  ok(bookItem1.bookQuantity === 100, `商品1账面快照=100（实际 ${bookItem1.bookQuantity}）`);
  ok(bookItem2.bookQuantity === 50, `商品2账面快照=50（实际 ${bookItem2.bookQuantity}）`);
  ok(/^PD\d{8}\d{4}$/.test(stocktake.code), `盘点单号格式正确（${stocktake.code}）`);

  console.log("\n[2] 盘点期间：本门店参与商品的库存变动被拒绝");
  await expectReject(
    inventoryService.createTransaction(storeA.id, {
      productId: product1.id,
      type: "OUTBOUND",
      quantity: 10,
    }),
    (e) => e.message.includes("盘点"),
    "门店A商品1出库被拒绝",
  );
  await expectReject(
    inventoryService.createTransaction(storeA.id, {
      productId: product2.id,
      type: "INBOUND",
      quantity: 5,
    }),
    (e) => e.message.includes("盘点"),
    "门店A商品2入库被拒绝",
  );

  console.log("\n[3] 盘点期间：其他门店不受影响");
  const inboundB = await inventoryService.createTransaction(storeB.id, {
    productId: product1.id,
    type: "INBOUND",
    quantity: 8,
  });
  ok(inboundB.changeQty === 8 && inboundB.balance === 38, "门店B商品1入库成功，结余38");
  const outboundB = await inventoryService.createTransaction(storeB.id, {
    productId: product2.id,
    type: "OUTBOUND",
    quantity: 7,
  });
  ok(outboundB.changeQty === -7 && outboundB.balance === 13, "门店B商品2出库成功，结余13");

  console.log("\n[4] 同门店不能重复开盘点单");
  await expectReject(
    stocktakeService.startStocktake({ storeId: storeA.id, productIds: [product1.id] }),
    (e) => e.message.includes("进行中"),
    "门店A重复开始盘点被拒绝",
  );
  // 另一门店仍可开盘点单
  const stocktakeB = await stocktakeService.startStocktake({
    storeId: storeB.id,
    productIds: [product1.id],
  });
  ok(stocktakeB.status === "IN_PROGRESS", "门店B可以独立开始盘点");
  await stocktakeService.cancelStocktake(stocktakeB.id);

  console.log("\n[5] 录入实盘数：暂存、中途退出可继续");
  const beforeSave = await stocktakeService.getStocktake(stocktake.id);
  ok(beforeSave.countedCount === 0, "开始时没有已录入商品");
  await stocktakeService.saveCounts(stocktake.id, {
    counts: [{ itemId: bookItem1.itemId, countedQty: 96 }],
  });
  const partial = await stocktakeService.getStocktake(stocktake.id);
  ok(partial.countedCount === 1, "暂存 1 个实盘数后 countedCount=1");
  const savedItem = partial.items!.find((i) => i.productId === product1.id)!;
  ok(savedItem.countedQty === 96 && savedItem.variance === null, "已录项=96，差异尚未计算");

  console.log("\n[6] 未录完不允许确认（不留半成品）");
  await expectReject(
    stocktakeService.confirmStocktake(stocktake.id),
    (e) => e.message.includes("未录入"),
    "存在未录入商品时确认被拒绝",
  );
  const invAfterFail = await prisma.storeInventory.findUnique({
    where: { storeId_productId: { storeId: storeA.id, productId: product1.id } },
  });
  ok(invAfterFail!.quantity === 100, "确认失败后库存仍是 100（无半成品）");
  const txCountAfterFail = await prisma.inventoryTransaction.count({
    where: { type: "ADJUST", refCode: stocktake.code },
  });
  ok(txCountAfterFail === 0, "确认失败后没有调整流水");
  const stillActive = await stocktakeService.getStocktake(stocktake.id);
  ok(stillActive.status === "IN_PROGRESS", "确认失败后盘点单仍是进行中");

  console.log("\n[7] 补齐实盘数并确认：盘盈盘亏按开始时账面计算");
  // 录入第二行：实盘 55（账面快照 50）-> 盘盈 5
  await stocktakeService.saveCounts(stocktake.id, {
    counts: [{ itemId: bookItem2.itemId, countedQty: 55 }],
  });
  const confirmed = await stocktakeService.confirmStocktake(stocktake.id);
  ok(confirmed.status === "COMPLETED", "确认后盘点单已完成");
  const cItem1 = confirmed.items!.find((i) => i.productId === product1.id)!;
  const cItem2 = confirmed.items!.find((i) => i.productId === product2.id)!;
  ok(cItem1.variance === -4, `商品1盘亏 4（实际 ${cItem1.variance}）`);
  ok(cItem2.variance === 5, `商品2盘盈 5（实际 ${cItem2.variance}）`);
  ok(confirmed.totalVariance === 1, `总差异 +1（实际 ${confirmed.totalVariance}）`);

  const inv1 = await prisma.storeInventory.findUnique({
    where: { storeId_productId: { storeId: storeA.id, productId: product1.id } },
  });
  const inv2 = await prisma.storeInventory.findUnique({
    where: { storeId_productId: { storeId: storeA.id, productId: product2.id } },
  });
  ok(inv1!.quantity === 96, `商品1库存更新为 96（实际 ${inv1!.quantity}）`);
  ok(inv2!.quantity === 55, `商品2库存更新为 55（实际 ${inv2!.quantity}）`);

  const adjustments = await prisma.inventoryTransaction.findMany({
    where: { type: "ADJUST", refCode: stocktake.code },
    orderBy: { id: "asc" },
  });
  ok(adjustments.length === 2, `生成 2 条调整流水（实际 ${adjustments.length}）`);
  ok(adjustments[0].changeQty === -4 && adjustments[0].balance === 96, "流水1：-4，结余96");
  ok(adjustments[1].changeQty === 5 && adjustments[1].balance === 55, "流水2：+5，结余55");

  console.log("\n[8] 完成后暂停解除，库存恢复变动");
  const inboundAfter = await inventoryService.createTransaction(storeA.id, {
    productId: product1.id,
    type: "INBOUND",
    quantity: 10,
  });
  ok(inboundAfter.balance === 106, "门店A商品1恢复入库，结余106");

  console.log("\n[9] 重复提交看到原结果（幂等，不二次调整）");
  const again = await stocktakeService.confirmStocktake(stocktake.id);
  ok(again.status === "COMPLETED", "重复确认仍返回已完成");
  const adjustmentsAgain = await prisma.inventoryTransaction.count({
    where: { type: "ADJUST", refCode: stocktake.code },
  });
  ok(adjustmentsAgain === 2, "调整流水仍是 2 条，未重复生成");
  const inv1Again = await prisma.storeInventory.findUnique({
    where: { storeId_productId: { storeId: storeA.id, productId: product1.id } },
  });
  ok(inv1Again!.quantity === 106, `库存保持 106（实际 ${inv1Again!.quantity}，未被二次调整）`);

  console.log("\n[10] 取消盘点：解除暂停且不动库存");
  const stocktake2 = await stocktakeService.startStocktake({
    storeId: storeA.id,
    productIds: [product1.id],
  });
  await expectReject(
    inventoryService.createTransaction(storeA.id, {
      productId: product1.id,
      type: "OUTBOUND",
      quantity: 1,
    }),
    (e) => e.message.includes("盘点"),
    "第二次盘点期间出库被拒绝",
  );
  await stocktakeService.cancelStocktake(stocktake2.id);
  const outboundAfterCancel = await inventoryService.createTransaction(storeA.id, {
    productId: product1.id,
    type: "OUTBOUND",
    quantity: 6,
  });
  ok(outboundAfterCancel.balance === 100, "取消后恢复出库，结余100");
  const cancelled = await stocktakeService.getStocktake(stocktake2.id);
  ok(cancelled.status === "CANCELLED", "盘点单状态为已取消");
  await expectReject(
    stocktakeService.confirmStocktake(stocktake2.id),
    (e) => e.message.includes("取消"),
    "已取消单据不能确认",
  );

  console.log("\n[11] 列表：进行中排在最前，含最近完成");
  const fresh = await stocktakeService.startStocktake({
    storeId: storeA.id,
    productIds: [product2.id],
  });
  const list = await stocktakeService.listStocktakes(storeA.id);
  ok(list[0].id === fresh.id, "列表第一项是进行中的盘点单");
  ok(
    list.some((s) => s.id === stocktake.id && s.status === "COMPLETED"),
    "列表包含最近完成的盘点单",
  );
  ok(
    list.some((s) => s.id === stocktake2.id && s.status === "CANCELLED"),
    "列表包含已取消的盘点单",
  );

  console.log("\n[12] 盘盈盘亏以开始时账面为准（暂停期间无变动，快照=开始值）");
  // fresh 单商品2开始时账面 55（上一单已更新）
  const fItem = fresh.items!.find((i) => i.productId === product2.id)!;
  ok(fItem.bookQuantity === 55, `商品2新单账面快照=55（实际 ${fItem.bookQuantity}）`);
  await stocktakeService.saveCounts(fresh.id, {
    counts: [{ itemId: fItem.itemId, countedQty: 55 }],
  });
  const noDiff = await stocktakeService.confirmStocktake(fresh.id);
  ok(noDiff.totalVariance === 0, "账实相符总差异为 0");
  const zeroAdjustCount = await prisma.inventoryTransaction.count({
    where: { type: "ADJUST", refCode: fresh.code },
  });
  ok(zeroAdjustCount === 0, "账实相符不生成调整流水");

  await prisma.$disconnect();
  process.exit(summarize());
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
