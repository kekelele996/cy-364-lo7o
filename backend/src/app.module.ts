import { Module } from "@nestjs/common";
import { OverviewController } from "./overview/overview.controller";
import { OverviewService } from "./overview/overview.service";
import { AppLogger } from "./common/app.logger";
import { PrismaService } from "./prisma/prisma.service";
import { InventoryController } from "./inventory/inventory.controller";
import { InventoryService } from "./inventory/inventory.service";
import { StocktakeController } from "./stocktake/stocktake.controller";
import { StocktakeService } from "./stocktake/stocktake.service";

@Module({
  controllers: [OverviewController, InventoryController, StocktakeController],
  providers: [OverviewService, AppLogger, PrismaService, InventoryService, StocktakeService],
})
export class AppModule {}
