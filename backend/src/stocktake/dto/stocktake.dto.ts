import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export class CreateStocktakeOrderDto {
  @IsInt()
  storeId!: number;

  @IsArray()
  @ArrayMinSize(1, { message: "至少选择一个要盘点的商品" })
  @IsInt({ each: true })
  productIds!: number[];

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  operator!: string;

  /** 客户端生成的幂等键，重复提交/网络重试返回原单 */
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @Matches(/^[A-Za-z0-9_-]{8,80}$/, { message: "requestKey 格式不正确" })
  requestKey!: string;
}

export class StocktakeLineInput {
  @IsInt()
  productId!: number;

  @IsInt()
  @Min(0, { message: "实盘数不能为负数" })
  actualQuantity!: number;
}

export class SaveStocktakeLinesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StocktakeLineInput)
  lines!: StocktakeLineInput[];
}
