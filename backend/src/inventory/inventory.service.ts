import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateMovementDto } from "./dto/create-movement.dto";

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  listStores() {
    return this.prisma.store.findMany({ orderBy: { id: "asc" } });
  }

  async getCatalog(storeId: number) {
    await this.ensureStore(storeId);
    const items = await this.prisma.inventoryItem.findMany({
      where: { storeId },
      include: { product: true },
      orderBy: { productId: "asc" },
    });
    return items.map((item) => ({
      productId: item.productId,
      sku: item.product.sku,
      name: item.product.name,
      spec: item.product.spec,
      category: item.product.category,
      quantity: item.quantity,
      frozen: item.frozenOrderId !== null,
      frozenOrderId: item.frozenOrderId,
    }));
  }

  /**
   * 库存出入库。被盘点冻结的商品直接拒绝，其他门店/商品不受影响。
   * 用带条件的原子 UPDATE 保证并发下不会出现负库存或绕过冻结。
   */
  async createMovement(dto: CreateMovementDto) {
    const delta = dto.direction === "in" ? dto.quantity : -dto.quantity;

    return this.prisma.$transaction(async (tx) => {
      const affected = await tx.$executeRaw`
        UPDATE inventory_items
        SET quantity = quantity + ${delta}, updated_at = NOW()
        WHERE store_id = ${dto.storeId}
          AND product_id = ${dto.productId}
          AND frozen_order_id IS NULL
          AND quantity + ${delta} >= 0`;

      if (affected === 0) {
        const item = await tx.inventoryItem.findUnique({
          where: { storeId_productId: { storeId: dto.storeId, productId: dto.productId } },
          include: { product: true },
        });
        if (!item) {
          throw new NotFoundException("该门店没有此商品的库存记录");
        }
        if (item.frozenOrderId !== null) {
          throw new ConflictException(
            `商品「${item.product.name}」正在盘点中，库存变动已暂停，盘点结束后自动恢复`,
          );
        }
        throw new ConflictException(`库存不足，当前仅剩 ${item.quantity} 件，无法出库 ${dto.quantity} 件`);
      }

      const item = await tx.inventoryItem.findUniqueOrThrow({
        where: { storeId_productId: { storeId: dto.storeId, productId: dto.productId } },
        include: { product: true },
      });

      const movement = await tx.inventoryMovement.create({
        data: {
          storeId: dto.storeId,
          productId: dto.productId,
          changeType: dto.direction === "in" ? "stock_in" : "stock_out",
          quantity: delta,
          balanceAfter: item.quantity,
          operator: dto.operator,
          note: dto.note ?? null,
        },
      });

      return {
        movementId: movement.id,
        productId: item.productId,
        productName: item.product.name,
        changeType: movement.changeType,
        quantity: movement.quantity,
        balanceAfter: movement.balanceAfter,
        createdAt: movement.createdAt,
      };
    });
  }

  private async ensureStore(storeId: number) {
    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) {
      throw new NotFoundException("门店不存在");
    }
  }
}
