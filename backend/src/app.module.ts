import { Module } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { OverviewController } from "./overview/overview.controller";
import { OverviewService } from "./overview/overview.service";
import { PrismaModule, PrismaService } from "./prisma/prisma.module";
import { StocktakeModule } from "./stocktake/stocktake.module";
import { InventoryModule } from "./inventory/inventory.module";

@Module({
  imports: [PrismaModule, StocktakeModule, InventoryModule],
  controllers: [OverviewController],
  providers: [
    OverviewService,
    { provide: PrismaClient, useExisting: PrismaService },
  ],
})
export class AppModule {}
