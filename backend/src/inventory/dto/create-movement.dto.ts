import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class CreateMovementDto {
  @IsInt()
  storeId!: number;

  @IsInt()
  productId!: number;

  @IsIn(["in", "out"])
  direction!: "in" | "out";

  @IsInt()
  @Min(1)
  @Max(1_000_000)
  quantity!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  operator!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
