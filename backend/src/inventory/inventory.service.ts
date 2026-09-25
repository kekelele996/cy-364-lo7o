import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { CreateTransactionDto } from "./inventory.dto";
import { toTransactionView, type TransactionView } from "../stocktake/stocktake.serializer";

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * 入库 / 出库：
   * 若该门店的该商品正处在进行中的盘点单里，库存变动一律拒绝（盘点优先），
   * 其他门店和未参与盘点的商品照常变动。
   */
  async createTransaction(
    storeId: number,
    dto: CreateTransactionDto,
    operator = "店员",
  ): Promise<TransactionView> {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      throw new NotFoundException("门店不存在");
    }
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) {
      throw new NotFoundException("商品不存在");
    }

    const txRow = await this.prisma.$transaction(
      async (tx) => {
        // 暂停守卫：该商品在本门店有进行中的盘点则禁止任何库存变动
        const paused = await tx.stocktakeItem.findFirst({
          where: { productId: dto.productId, stocktake: { storeId, status: "IN_PROGRESS" } },
          select: { stocktakeId: true },
        });
        if (paused) {
          throw new ConflictException("该商品正在盘点，库存变动已暂停；盘点完成或取消后恢复");
        }

        const inventory = await tx.storeInventory.upsert({
          where: { storeId_productId: { storeId, productId: dto.productId } },
          create: { storeId, productId: dto.productId, quantity: 0 },
          update: {},
        });

        const locked = await tx.$queryRaw<{ quantity: number }[]>`
          SELECT quantity FROM store_inventories WHERE id = ${inventory.id} FOR UPDATE`;
        const currentQty = locked[0]?.quantity ?? 0;

        const signedChange = dto.type === "INBOUND" ? dto.quantity : -dto.quantity;
        const newBalance = currentQty + signedChange;
        if (newBalance < 0) {
          throw new BadRequestException(
            `库存不足：当前账面 ${currentQty}，本次出库 ${dto.quantity}`,
          );
        }

        await tx.storeInventory.update({
          where: { id: inventory.id },
          data: { quantity: newBalance },
        });

        const reason =
          dto.reason?.trim() || (dto.type === "INBOUND" ? "采购入库" : "销售出库");

        return tx.inventoryTransaction.create({
          data: {
            storeId,
            productId: dto.productId,
            type: dto.type,
            changeQty: signedChange,
            balance: newBalance,
            reason,
            createdBy: operator,
          },
          include: { product: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );

    return toTransactionView(txRow);
  }
}
