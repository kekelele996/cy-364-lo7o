import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class CreateTransactionDto {
  @IsInt()
  @Min(1)
  productId!: number;

  @IsIn(["INBOUND", "OUTBOUND"])
  type!: "INBOUND" | "OUTBOUND";

  @IsInt()
  @Min(1, { message: "数量必须大于 0" })
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
