import { Body, Controller, Get, Param, ParseIntPipe, Post } from "@nestjs/common";
import { InventoryService } from "./inventory.service";
import { CreateMovementDto } from "./dto/create-movement.dto";

@Controller(["inventory", "api/inventory"])
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get("stores")
  listStores() {
    return this.inventoryService.listStores();
  }

  @Get("stores/:storeId/catalog")
  getCatalog(@Param("storeId", ParseIntPipe) storeId: number) {
    return this.inventoryService.getCatalog(storeId);
  }

  @Post("movements")
  createMovement(@Body() dto: CreateMovementDto) {
    return this.inventoryService.createMovement(dto);
  }
}
