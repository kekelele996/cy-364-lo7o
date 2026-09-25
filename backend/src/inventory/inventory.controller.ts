import { Body, Controller, Param, ParseIntPipe, Post, Query } from "@nestjs/common";
import { CreateTransactionDto } from "./inventory.dto";
import { InventoryService } from "./inventory.service";

@Controller("stores/:storeId/transactions")
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  create(
    @Param("storeId", ParseIntPipe) storeId: number,
    @Body() dto: CreateTransactionDto,
    @Query("operator") operator?: string,
  ) {
    return this.inventoryService.createTransaction(storeId, dto, operator || "店员");
  }
}
