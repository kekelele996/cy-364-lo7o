import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, StocktakeOrder } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateStocktakeOrderDto, SaveStocktakeLinesDto } from "./dto/stocktake.dto";

const STATUS_IN_PROGRESS = "in_progress";
const STATUS_COMPLETED = "completed";
const STATUS_CANCELLED = "cancelled";

type Tx = Prisma.TransactionClient;

@Injectable()
export class StocktakeService {
  constructor(private readonly prisma: PrismaService) {}

  /** 进行中的盘点单 + 最近完成/取消的盘点单 */
  async listOrders(storeId: number) {
    const [inProgress, recentFinished] = await Promise.all([
      this.prisma.stocktakeOrder.findMany({
        where: { storeId, status: STATUS_IN_PROGRESS },
        include: { lines: true, store: true },
        orderBy: { id: "desc" },
      }),
      this.prisma.stocktakeOrder.findMany({
        where: { storeId, status: { in: [STATUS_COMPLETED, STATUS_CANCELLED] } },
        include: { lines: true, store: true },
        orderBy: { id: "desc" },
        take: 10,
      }),
    ]);
    return {
      inProgress: inProgress.map((order) => this.toSummary(order)),
      recentFinished: recentFinished.map((order) => this.toSummary(order)),
    };
  }

  async getOrder(orderId: number) {
    const order = await this.prisma.stocktakeOrder.findUnique({
      where: { id: orderId },
      include: { lines: { include: { product: true } }, store: true },
    });
    if (!order) {
      throw new NotFoundException("盘点单不存在");
    }
    return this.toDetail(order);
  }

  /**
   * 开盘点单：快照账面数并冻结所选商品的库存变动（仅当前门店）。
   * requestKey 唯一约束保证重复提交/网络重试返回原单。
   */
  async createOrder(dto: CreateStocktakeOrderDto) {
    const existing = await this.prisma.stocktakeOrder.findUnique({
      where: { requestKey: dto.requestKey },
      include: { lines: { include: { product: true } }, store: true },
    });
    if (existing) {
      return this.toDetail(existing);
    }

    const productIds = [...new Set(dto.productIds)];
    try {
      return await this.prisma.$transaction(async (tx) => {
        const store = await tx.store.findUnique({ where: { id: dto.storeId } });
        if (!store) {
          throw new NotFoundException("门店不存在");
        }

        const items = await tx.inventoryItem.findMany({
          where: { storeId: dto.storeId, productId: { in: productIds } },
          include: { product: true },
        });
        if (items.length !== productIds.length) {
          throw new BadRequestException("部分商品在该门店没有库存档案，无法盘点");
        }
        const frozenNames = items
          .filter((item) => item.frozenOrderId !== null)
          .map((item) => item.product.name);
        if (frozenNames.length > 0) {
          throw new ConflictException(`商品「${frozenNames.join("、")}」已在其他盘点单中，请稍后再试`);
        }

        const order = await tx.stocktakeOrder.create({
          data: {
            orderNo: this.generateOrderNo(),
            requestKey: dto.requestKey,
            storeId: dto.storeId,
            operator: dto.operator,
            status: STATUS_IN_PROGRESS,
          },
        });

        await tx.stocktakeLine.createMany({
          data: items.map((item) => ({
            orderId: order.id,
            productId: item.productId,
            bookQuantity: item.quantity,
          })),
        });

        // 原子冻结：仅冻结仍未被其他盘点单占用的商品，避免并发开单互相覆盖
        const frozenCount = await tx.inventoryItem.updateMany({
          where: { storeId: dto.storeId, productId: { in: productIds }, frozenOrderId: null },
          data: { frozenOrderId: order.id },
        });
        if (frozenCount.count !== productIds.length) {
          throw new ConflictException("部分商品刚被其他盘点单锁定，请刷新后重试");
        }

        return this.toDetail(
          await tx.stocktakeOrder.findUniqueOrThrow({
            where: { id: order.id },
            include: { lines: { include: { product: true } }, store: true },
          }),
        );
      });
    } catch (error) {
      // 并发重复提交撞上 requestKey 唯一约束时，返回先创建的那一单
      if (this.isUniqueViolation(error)) {
        const replay = await this.prisma.stocktakeOrder.findUnique({
          where: { requestKey: dto.requestKey },
          include: { lines: { include: { product: true } }, store: true },
        });
        if (replay) {
          return this.toDetail(replay);
        }
      }
      throw error;
    }
  }

  /** 暂存实盘数：中途退出后再次进入可继续录入 */
  async saveLines(orderId: number, dto: SaveStocktakeLinesDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      if (order.status !== STATUS_IN_PROGRESS) {
        throw new ConflictException("盘点单已结束，不能再修改实盘数");
      }

      const lines = await tx.stocktakeLine.findMany({ where: { orderId } });
      const byProduct = new Map(lines.map((line) => [line.productId, line]));
      for (const input of dto.lines) {
        const line = byProduct.get(input.productId);
        if (!line) {
          throw new BadRequestException(`商品 ${input.productId} 不在该盘点单中`);
        }
        await tx.stocktakeLine.update({
          where: { id: line.id },
          data: {
            actualQuantity: input.actualQuantity,
            difference: input.actualQuantity - line.bookQuantity,
          },
        });
      }

      return this.toDetail(
        await tx.stocktakeOrder.findUniqueOrThrow({
          where: { id: orderId },
          include: { lines: { include: { product: true } }, store: true },
        }),
      );
    });
  }

  /**
   * 提交盘点：一个事务内更新库存、写入盘点调整流水、标记完成。
   * 任一步失败整体回滚不留半成品；行锁 + 状态判断保证重复提交返回原结果。
   */
  async completeOrder(orderId: number) {
    return this.prisma.$transaction(
      async (tx) => {
        const order = await this.lockOrder(tx, orderId);
        if (order.status === STATUS_COMPLETED) {
          return this.loadDetail(tx, orderId);
        }
        if (order.status === STATUS_CANCELLED) {
          throw new ConflictException("盘点单已取消，不能提交");
        }

        const lines = await tx.stocktakeLine.findMany({
          where: { orderId },
          include: { product: true },
        });
        const uncounted = lines.filter((line) => line.actualQuantity === null);
        if (uncounted.length > 0) {
          throw new BadRequestException(
            `还有 ${uncounted.length} 个商品未录入实盘数：${uncounted.map((line) => line.product.name).join("、")}`,
          );
        }

        for (const line of lines) {
          const actual = line.actualQuantity as number;
          const difference = actual - line.bookQuantity;
          await tx.stocktakeLine.update({
            where: { id: line.id },
            data: { difference },
          });
          // 盘点期间商品已冻结，账面数未变，直接按实盘数校准库存并解除冻结
          await tx.inventoryItem.update({
            where: { storeId_productId: { storeId: order.storeId, productId: line.productId } },
            data: { quantity: actual, frozenOrderId: null },
          });
          if (difference !== 0) {
            await tx.inventoryMovement.create({
              data: {
                storeId: order.storeId,
                productId: line.productId,
                changeType: "stocktake_adjust",
                quantity: difference,
                balanceAfter: actual,
                refType: "stocktake_order",
                refId: order.id,
                operator: order.operator,
                note: `盘点单 ${order.orderNo} ${difference > 0 ? "盘盈" : "盘亏"}调整`,
              },
            });
          }
        }

        await tx.stocktakeOrder.update({
          where: { id: orderId },
          data: { status: STATUS_COMPLETED, completedAt: new Date() },
        });

        return this.loadDetail(tx, orderId);
      },
      { timeout: 15000 },
    );
  }

  /** 取消盘点：解除商品冻结，不做任何库存变更 */
  async cancelOrder(orderId: number) {
    return this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      if (order.status === STATUS_COMPLETED) {
        throw new ConflictException("盘点单已完成，不能取消");
      }
      if (order.status === STATUS_IN_PROGRESS) {
        await tx.inventoryItem.updateMany({
          where: { frozenOrderId: orderId },
          data: { frozenOrderId: null },
        });
        await tx.stocktakeOrder.update({
          where: { id: orderId },
          data: { status: STATUS_CANCELLED, cancelledAt: new Date() },
        });
      }
      return this.loadDetail(tx, orderId);
    });
  }

  private async lockOrder(tx: Tx, orderId: number): Promise<StocktakeOrder> {
    const rows = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM stocktake_orders WHERE id = ${orderId} FOR UPDATE`;
    if (rows.length === 0) {
      throw new NotFoundException("盘点单不存在");
    }
    return tx.stocktakeOrder.findUniqueOrThrow({ where: { id: orderId } });
  }

  private async loadDetail(tx: Tx, orderId: number) {
    return this.toDetail(
      await tx.stocktakeOrder.findUniqueOrThrow({
        where: { id: orderId },
        include: { lines: { include: { product: true } }, store: true },
      }),
      tx,
    );
  }

  private async toDetail(
    order: Prisma.StocktakeOrderGetPayload<{
      include: { lines: { include: { product: true } }; store: true };
    }>,
    client: PrismaService | Tx = this.prisma,
  ) {
    const movements =
      order.status === STATUS_COMPLETED
        ? await client.inventoryMovement.findMany({
            where: { refType: "stocktake_order", refId: order.id },
            include: { product: true },
            orderBy: { id: "asc" },
          })
        : [];
    return {
      ...this.toSummary(order),
      lines: order.lines
        .slice()
        .sort((a, b) => a.productId - b.productId)
        .map((line) => ({
          lineId: line.id,
          productId: line.productId,
          sku: line.product.sku,
          name: line.product.name,
          spec: line.product.spec,
          bookQuantity: line.bookQuantity,
          actualQuantity: line.actualQuantity,
          difference: line.difference,
        })),
      movements: movements.map((movement) => ({
        id: movement.id,
        productId: movement.productId,
        productName: movement.product.name,
        changeType: movement.changeType,
        quantity: movement.quantity,
        balanceAfter: movement.balanceAfter,
        note: movement.note,
        createdAt: movement.createdAt,
      })),
    };
  }

  private toSummary(
    order: StocktakeOrder & { lines: { actualQuantity: number | null; difference: number | null }[]; store?: { name: string } },
  ) {
    const counted = order.lines.filter((line) => line.actualQuantity !== null);
    const surplus = counted.reduce((sum, line) => sum + Math.max(line.difference ?? 0, 0), 0);
    const deficit = counted.reduce((sum, line) => sum + Math.max(-(line.difference ?? 0), 0), 0);
    return {
      id: order.id,
      orderNo: order.orderNo,
      storeId: order.storeId,
      storeName: order.store?.name ?? "",
      status: order.status,
      operator: order.operator,
      startedAt: order.startedAt,
      completedAt: order.completedAt,
      cancelledAt: order.cancelledAt,
      totalLines: order.lines.length,
      countedLines: counted.length,
      surplus,
      deficit,
    };
  }

  private generateOrderNo() {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `PD${stamp}-${suffix}`;
  }

  private isUniqueViolation(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }
}
