import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export enum StockCountStatus {
  DRAFT = 'DRAFT',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export class CreateStockCountDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  warehouseId: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({
    required: false,
    description:
      'Item ids to seed lines with (defaults to all items present in the warehouse)',
    type: [Number],
  })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  itemIds?: number[];
}

export class CountLineDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  itemId: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  countedQty: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class SubmitCountDto {
  @ApiProperty({ type: [CountLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CountLineDto)
  lines: CountLineDto[];
}

export class CompleteCountDto {
  @ApiProperty({
    required: false,
    default: true,
    description:
      'Apply variance as ADJUSTMENT movements; otherwise just close without changing stock',
  })
  @IsOptional()
  applyAdjustments?: boolean;
}

export class UpdateStockCountDto extends PartialType(CreateStockCountDto) {}

export class StockCountFilterDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ enum: StockCountStatus })
  @IsOptional()
  @IsEnum(StockCountStatus)
  status?: StockCountStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  warehouseId?: number;
}
