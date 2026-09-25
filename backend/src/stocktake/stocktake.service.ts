import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { SaveCountsDto, StartStocktakeDto } from "./stocktake.dto";
import {
  toProductView,
  toStocktakeListItem,
  toStocktakeView,
  toStoreView,
  toTransactionView,
  type StocktakeView,
  type StoreProductRow,
  type TransactionView,
} from "./stocktake.serializer";

interface LockedStocktakeRow {
  id: number;
  status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
}

@Injectable()
export class StocktakeService {
  constructor(private readonly prisma: PrismaClient) {}

  /* ---------------- 基础数据（门店 / 商品 / 库存） ---------------- */

  async listStores() {
    const stores = await this.prisma.store.findMany({ orderBy: { id: "asc" } });
    return stores.map(toStoreView);
  }

  async listStoreProducts(storeId: number) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      throw new NotFoundException("门店不存在");
    }

    const [inventories, activeStocktake] = await Promise.all([
      this.prisma.storeInventory.findMany({
        where: { storeId },
        include: { product: true },
        orderBy: { product: { id: "asc" } },
      }),
      this.prisma.stocktake.findFirst({
        where: { storeId, status: "IN_PROGRESS" },
        select: { id: true, items: { select: { productId: true } } },
      }),
    ]);

    const pausedIds = new Set(activeStocktake?.items.map((item) => item.productId) ?? []);

    const products: StoreProductRow[] = inventories.map((inventory): StoreProductRow => ({
      ...toProductView(inventory.product),
      productId: inventory.productId,
      quantity: inventory.quantity,
      safetyQty: inventory.safetyQty,
      paused: pausedIds.has(inventory.productId),
    }));

    return {
      store: toStoreView(store),
      pausedStocktakeId: activeStocktake?.id ?? null,
      products,
    };
  }

  async listTransactions(storeId: number, type?: string, limit = 100): Promise<TransactionView[]> {
    const take = Math.min(Math.max(Number(limit) || 100, 1), 200);
    const rows = await this.prisma.inventoryTransaction.findMany({
      where: {
        storeId,
        ...(type ? { type: String(type).toUpperCase() } : {}),
      },
      include: { product: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" } ],
      take,
    });
    return rows.map(toTransactionView);
  }

  /* ---------------- 盘点单列表 / 详情 ---------------- */

  /** 总览页：进行中排在最前，其后是最近完成/取消的盘点单 */
  async listStocktakes(storeId?: number): Promise<StocktakeView[]> {
    const rows = await this.prisma.stocktake.findMany({
      where: storeId ? { storeId: Number(storeId) } : undefined,
      include: { store: true, items: { select: { countedQty: true, variance: true } } },
      orderBy: { startedAt: "desc" },
      take: 50,
    });

    return rows.map(toStocktakeListItem).sort((a, b) => {
      if ((a.status === "IN_PROGRESS") !== (b.status === "IN_PROGRESS")) {
        return a.status === "IN_PROGRESS" ? -1 : 1;
      }
      return b.startedAt.localeCompare(a.startedAt);
    });
  }

  async getStocktake(id: number): Promise<StocktakeView> {
    const stocktake = await this.prisma.stocktake.findUnique({
      where: { id },
      include: { store: true, items: { include: { product: true } } },
    });
    if (!stocktake) {
      throw new NotFoundException("盘点单不存在");
    }
    return toStocktakeView(stocktake);
  }

  /* ---------------- 开始盘点 ---------------- */

  /**
   * 开始盘点：
   * 1. 同门店同时只允许一张进行中的盘点单（锁住门店行，串行化并发请求）；
   * 2. 快照参与商品当时的账面数，之后这些商品在该门店的库存变动被暂停；
   * 3. 只暂停本门店被选中的商品，其他门店与其他商品不受影响。
   */
  async startStocktake(dto: StartStocktakeDto, operator = "店长"): Promise<StocktakeView> {
    const store = await this.prisma.store.findUnique({ where: { id: dto.storeId } });
    if (!store) {
      throw new NotFoundException("门店不存在");
    }
    const productIds = [...new Set(dto.productIds)];

    const run = () =>
      this.prisma.$transaction(
        async (tx) => {
          // 锁住门店行：同一门店并发开始盘点时排队，避免开出两张进行中单据
          await tx.$queryRaw`SELECT id FROM stores WHERE id = ${dto.storeId} FOR UPDATE`;

          const existing = await tx.stocktake.findFirst({
            where: { storeId: dto.storeId, status: "IN_PROGRESS" },
            select: { id: true },
          });
          if (existing) {
            throw new ConflictException("该门店已有进行中的盘点单，请先完成或取消后再开始新的盘点");
          }

          const products = await tx.product.findMany({ where: { id: { in: productIds } } });
          if (products.length !== productIds.length) {
            throw new BadRequestException("所选商品中存在无效商品，请刷新后重试");
          }

          // 首次盘点的商品先按 0 建账，再加锁取账面快照
          await Promise.all(
            productIds.map((productId) =>
              tx.storeInventory.upsert({
                where: { storeId_productId: { storeId: dto.storeId, productId } },
                create: { storeId: dto.storeId, productId, quantity: 0 },
                update: {},
              }),
            ),
          );

          const inventories = await tx.$queryRaw<
            { product_id: number; quantity: number }[]
          >`SELECT product_id, quantity FROM store_inventories
            WHERE store_id = ${dto.storeId} AND product_id = ANY(${productIds}::int[])
            FOR UPDATE`;

          const bookMap = new Map(inventories.map((row) => [row.product_id, row.quantity]));

          return tx.stocktake.create({
            data: {
              code: this.generateCode(),
              storeId: dto.storeId,
              remark: dto.remark?.trim() || null,
              createdBy: operator,
              items: {
                create: productIds.map((productId) => ({
                  productId,
                  bookQuantity: bookMap.get(productId) ?? 0,
                })),
              },
            },
            include: { store: true, items: { include: { product: true } } },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      );

    // 单号极小概率碰撞时换号整体重试
    let attempt = 0;
    for (;;) {
      try {
        return toStocktakeView(await run());
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002" &&
          attempt < 2
        ) {
          attempt += 1;
          continue;
        }
        throw error;
      }
    }
  }

  /* ---------------- 录入 / 暂存实盘数（中途退出可继续） ---------------- */

  async saveCounts(id: number, dto: SaveCountsDto): Promise<StocktakeView> {
    await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockStocktake(tx, id);
      if (locked.status !== "IN_PROGRESS") {
        throw new ConflictException("盘点单已结束，不能继续录入实盘数");
      }

      const items = await tx.stocktakeItem.findMany({
        where: { stocktakeId: id },
        select: { id: true },
      });
      const itemIds = new Set(items.map((item) => item.id));

      const counts = new Map<number, number>();
      for (const entry of dto.counts) {
        if (!itemIds.has(entry.itemId)) {
          throw new BadRequestException("实盘明细不属于该盘点单");
        }
        counts.set(entry.itemId, entry.countedQty);
      }

      const now = new Date();
      for (const [itemId, countedQty] of counts) {
        await tx.stocktakeItem.update({
          where: { id: itemId },
          data: { countedQty, countStatus: "COUNTED", countedAt: now },
        });
      }
    });

    return this.getStocktake(id);
  }

  /* ---------------- 确认盘点（幂等） ---------------- */

  /**
   * 确认盘点：
   * - 重复提交（双击 / 网络重试）直接返回原结果，绝不二次调整库存；
   * - 全部明细必须录入实盘数；
   * - 按开始时的账面快照逐项计算盘盈盘亏；
   * - 库存更新、调整流水、盘点完结在同一事务内，失败整体回滚不留半成品。
   */
  async confirmStocktake(id: number, operator = "店长"): Promise<StocktakeView> {
    const existing = await this.prisma.stocktake.findUnique({
      where: { id },
      include: { store: true, items: { include: { product: true } } },
    });
    if (!existing) {
      throw new NotFoundException("盘点单不存在");
    }
    // 已完成的单据直接返回原结果（幂等成功响应）
    if (existing.status === "COMPLETED") {
      return toStocktakeView(existing);
    }
    if (existing.status === "CANCELLED") {
      throw new ConflictException("盘点单已取消，不能确认");
    }

    await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockStocktake(tx, id);
      if (locked.status === "COMPLETED") {
        // 并发下已被另一请求确认：本次不产生任何变动，外层返回原结果
        return;
      }
      if (locked.status === "CANCELLED") {
        throw new ConflictException("盘点单已取消，不能确认");
      }

      const items = await tx.stocktakeItem.findMany({
        where: { stocktakeId: id },
        orderBy: { id: "asc" },
      });
      const pending = items.filter((item) => item.countedQty === null);
      if (pending.length > 0) {
        throw new BadRequestException(`还有 ${pending.length} 个商品未录入实盘数，不能确认盘点`);
      }

      const productIds = items.map((item) => item.productId);
      const inventories = await tx.$queryRaw<
        { id: number; product_id: number; quantity: number }[]
      >`SELECT id, product_id, quantity FROM store_inventories
        WHERE store_id = ${existing.storeId} AND product_id = ANY(${productIds}::int[])
        FOR UPDATE`;
      const inventoryMap = new Map(inventories.map((row) => [row.product_id, row]));

      for (const item of items) {
        const countedQty = item.countedQty as number;
        // 盘盈盘亏一律以开始时的账面快照为基准
        const variance = countedQty - item.bookQuantity;
        const current = inventoryMap.get(item.productId);
        const currentQty = current?.quantity ?? item.bookQuantity;
        // 盘点期间该商品库存已暂停变动，正常情况下 currentQty == bookQuantity
        const newBalance = currentQty + variance;

        await tx.stocktakeItem.update({
          where: { id: item.id },
          data: { variance },
        });

        if (current) {
          await tx.storeInventory.update({
            where: { id: current.id },
            data: { quantity: newBalance },
          });
        } else {
          await tx.storeInventory.create({
            data: {
              storeId: existing.storeId,
              productId: item.productId,
              quantity: newBalance,
            },
          });
        }

        // 有差异才落调整流水；盘点明细本身即盘点流水
        if (variance !== 0) {
          await tx.inventoryTransaction.create({
            data: {
              storeId: existing.storeId,
              productId: item.productId,
              type: "ADJUST",
              changeQty: variance,
              balance: newBalance,
              reason: variance > 0 ? `盘盈 ${variance}` : `盘亏 ${-variance}`,
              refCode: existing.code,
              createdBy: operator,
            },
          });
        }
      }

      await tx.stocktake.update({
        where: { id },
        data: { status: "COMPLETED", finishedAt: new Date(), completedBy: operator },
      });
    });

    return this.getStocktake(id);
  }

  /* ---------------- 取消盘点（解除暂停） ---------------- */

  /**
   * 取消盘点：单据置为 CANCELLED 即解除该门店这些商品的库存暂停；
   * 不改动任何库存。已录入的实盘数保留留痕。
   */
  async cancelStocktake(id: number): Promise<StocktakeView> {
    await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockStocktake(tx, id);
      if (locked.status !== "IN_PROGRESS") {
        throw new ConflictException("只有进行中的盘点单可以取消");
      }
      await tx.stocktake.update({
        where: { id },
        data: { status: "CANCELLED", finishedAt: new Date() },
      });
    });
    return this.getStocktake(id);
  }

  /* ---------------- 内部工具 ---------------- */

  private generateCode(): string {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    const day = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const suffix = Math.floor(1000 + Math.random() * 9000);
    return `PD${day}${suffix}`;
  }

  private async lockStocktake(
    tx: Prisma.TransactionClient,
    id: number,
  ): Promise<LockedStocktakeRow> {
    const rows = await tx.$queryRaw<LockedStocktakeRow[]>`
      SELECT id, status FROM stocktakes WHERE id = ${id} FOR UPDATE`;
    if (rows.length === 0) {
      throw new NotFoundException("盘点单不存在");
    }
    return rows[0];
  }
}
