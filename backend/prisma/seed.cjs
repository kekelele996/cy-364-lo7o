/* eslint-disable */
// 种子数据：门店、商品、初始库存与历史流水。
// 幂等：已有门店数据时直接跳过。容器启动时由 entrypoint 执行 `prisma db seed`。
const { PrismaClient } = require("@prisma/client");

// 正常情况下直连 DATABASE_URL；测试可通过 globalThis.__SEED_PRISMA__ 注入客户端
const prisma = globalThis.__SEED_PRISMA__ || new PrismaClient();

async function seed() {
  const storeCount = await prisma.store.count();
  if (storeCount > 0) {
    console.log("[seed] 数据已存在，跳过种子数据");
    return;
  }

  const storesData = [
    { code: "SH001", name: "城东旗舰店", manager: "王店长" },
    { code: "SH002", name: "西湖社区店", manager: "李店长" },
    { code: "SH003", name: "南站便利店", manager: "赵店长" },
  ];

  const productsData = [
    { sku: "SP1001", name: "五常大米 5kg", spec: "5kg/袋", barcode: "6901001000011", category: "粮油", unit: "袋", safetyQty: 20 },
    { sku: "SP1002", name: "压榨花生油 1.8L", spec: "1.8L/桶", barcode: "6901001000028", category: "粮油", unit: "桶", safetyQty: 15 },
    { sku: "SP1003", name: "纯牛奶 250ml*12", spec: "250ml*12盒/箱", barcode: "6901001000035", category: "乳品", unit: "箱", safetyQty: 30 },
    { sku: "SP1004", name: "瓶装饮用水 550ml*24", spec: "550ml*24瓶/箱", barcode: "6901001000042", category: "饮料", unit: "箱", safetyQty: 40 },
    { sku: "SP1005", name: "抽纸 3层100抽", spec: "100抽*6包/提", barcode: "6901001000059", category: "日用", unit: "提", safetyQty: 25 },
    { sku: "SP1006", name: "海盐薯片 70g", spec: "70g/袋", barcode: "6901001000066", category: "零食", unit: "袋", safetyQty: 50 },
    { sku: "SP1007", name: "冷萃咖啡 280ml", spec: "280ml/瓶", barcode: "6901001000073", category: "饮料", unit: "瓶", safetyQty: 35 },
    { sku: "SP1008", name: "洗洁精 1kg", spec: "1kg/瓶", barcode: "6901001000080", category: "日用", unit: "瓶", safetyQty: 18 },
  ];

  const stockMatrix = [
    // 城东旗舰店
    [120, 64, 200, 320, 90, 150, 88, 45],
    // 西湖社区店
    [46, 22, 95, 130, 30, 60, 12, 28],
    // 南站便利店
    [18, 9, 40, 88, 14, 210, 66, 8],
  ];

  const stores = [];
  for (const data of storesData) {
    stores.push(await prisma.store.create({ data }));
  }

  const products = [];
  for (const data of productsData) {
    const { safetyQty, ...rest } = data;
    products.push(await prisma.product.create({ data: rest }));
  }

  const txData = [];
  for (let s = 0; s < stores.length; s += 1) {
    for (let p = 0; p < products.length; p += 1) {
      const quantity = stockMatrix[s][p];
      await prisma.storeInventory.create({
        data: {
          storeId: stores[s].id,
          productId: products[p].id,
          quantity,
          safetyQty: productsData[p].safetyQty,
        },
      });
      // 期初入库流水
      txData.push({
        storeId: stores[s].id,
        productId: products[p].id,
        type: "INBOUND",
        changeQty: quantity,
        balance: quantity,
        reason: "期初建账",
        createdBy: "系统",
      });
    }
  }
  await prisma.inventoryTransaction.createMany({ data: txData });

  console.log(`[seed] 完成：${stores.length} 家门店，${products.length} 个商品`);
}

module.exports = { seed };

// 直接运行时执行（被 require 时不自动执行）
if (require.main === module) {
  seed()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
