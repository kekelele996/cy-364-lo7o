import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from "@nestjs/common";
import { SaveCountsDto, StartStocktakeDto } from "./stocktake.dto";
import { StocktakeService } from "./stocktake.service";

// 注意：Nginx 与 Vite 开发代理都会把 /api/ 前缀重写掉，
// 因此控制器路径不再带 /api 前缀（/api/stores -> 后端 /stores）。
@Controller()
export class StocktakeController {
  constructor(private readonly stocktakeService: StocktakeService) {}

  /* 基础数据 */

  @Get("stores")
  listStores() {
    return this.stocktakeService.listStores();
  }

  @Get("stores/:storeId/products")
  listStoreProducts(@Param("storeId", ParseIntPipe) storeId: number) {
    return this.stocktakeService.listStoreProducts(storeId);
  }

  @Get("stores/:storeId/transactions")
  listTransactions(
    @Param("storeId", ParseIntPipe) storeId: number,
    @Query("type") type?: string,
    @Query("limit") limit?: string,
  ) {
    return this.stocktakeService.listTransactions(storeId, type, limit ? Number(limit) : 100);
  }

  /* 盘点单 */

  @Get("stocktakes")
  listStocktakes(@Query("storeId") storeId?: string) {
    return this.stocktakeService.listStocktakes(storeId ? Number(storeId) : undefined);
  }

  @Get("stocktakes/:id")
  getStocktake(@Param("id", ParseIntPipe) id: number) {
    return this.stocktakeService.getStocktake(id);
  }

  @Post("stocktakes")
  start(@Body() dto: StartStocktakeDto, @Query("operator") operator?: string) {
    return this.stocktakeService.startStocktake(dto, operator || "店长");
  }

  @Post("stocktakes/:id/counts")
  saveCounts(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: SaveCountsDto,
  ) {
    return this.stocktakeService.saveCounts(id, dto);
  }

  @Post("stocktakes/:id/confirm")
  confirm(@Param("id", ParseIntPipe) id: number, @Query("operator") operator?: string) {
    return this.stocktakeService.confirmStocktake(id, operator || "店长");
  }

  @Post("stocktakes/:id/cancel")
  cancel(@Param("id", ParseIntPipe) id: number) {
    return this.stocktakeService.cancelStocktake(id);
  }
}
