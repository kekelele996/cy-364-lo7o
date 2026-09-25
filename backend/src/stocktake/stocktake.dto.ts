import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export class StartStocktakeDto {
  @IsInt()
  @Min(1)
  storeId!: number;

  @IsArray()
  @ArrayMinSize(1, { message: "请至少选择一个商品参与盘点" })
  @ArrayMaxSize(500)
  @IsInt({ each: true })
  @Min(1, { each: true })
  productIds!: number[];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  remark?: string;
}

export class CountInputDto {
  @IsInt()
  @Min(1)
  itemId!: number;

  @IsInt()
  @Min(0, { message: "实盘数不能为负数" })
  countedQty!: number;
}

export class SaveCountsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CountInputDto)
  counts!: CountInputDto[];
}
