import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { StocktakeService } from "./stocktake.service";
import { CreateStocktakeOrderDto, SaveStocktakeLinesDto } from "./dto/stocktake.dto";

@Controller(["stocktake", "api/stocktake"])
export class StocktakeController {
  constructor(private readonly stocktakeService: StocktakeService) {}

  @Get("orders")
  listOrders(@Query("storeId", ParseIntPipe) storeId: number) {
    return this.stocktakeService.listOrders(storeId);
  }

  @Post("orders")
  createOrder(@Body() dto: CreateStocktakeOrderDto) {
    return this.stocktakeService.createOrder(dto);
  }

  @Get("orders/:id")
  getOrder(@Param("id", ParseIntPipe) id: number) {
    return this.stocktakeService.getOrder(id);
  }

  @Patch("orders/:id/lines")
  saveLines(@Param("id", ParseIntPipe) id: number, @Body() dto: SaveStocktakeLinesDto) {
    return this.stocktakeService.saveLines(id, dto);
  }

  @Post("orders/:id/complete")
  completeOrder(@Param("id", ParseIntPipe) id: number) {
    return this.stocktakeService.completeOrder(id);
  }

  @Post("orders/:id/cancel")
  cancelOrder(@Param("id", ParseIntPipe) id: number) {
    return this.stocktakeService.cancelOrder(id);
  }
}
