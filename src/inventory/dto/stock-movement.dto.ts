import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum StockMovementType {
  IN = 'IN',
  OUT = 'OUT',
  TRANSFER = 'TRANSFER',
  ADJUSTMENT = 'ADJUSTMENT',
}

export enum StockMovementReference {
  PURCHASE = 'PURCHASE',
  TENDER = 'TENDER',
  MANUAL = 'MANUAL',
  TRANSFER = 'TRANSFER',
  ADJUSTMENT = 'ADJUSTMENT',
}

/** Stock IN: add quantity to target warehouse */
export class StockInDto {
  @ApiProperty()
  @IsInt()
  itemId: number;

  @ApiProperty()
  @IsInt()
  targetWarehouseId: number;

  @ApiProperty()
  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @ApiProperty({ enum: StockMovementReference, default: StockMovementReference.MANUAL })
  @IsOptional()
  @IsEnum(StockMovementReference)
  referenceType?: StockMovementReference;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  referenceId?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

/** Stock OUT: remove quantity from source warehouse */
export class StockOutDto {
  @ApiProperty()
  @IsInt()
  itemId: number;

  @ApiProperty()
  @IsInt()
  sourceWarehouseId: number;

  @ApiProperty()
  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @ApiProperty({ enum: StockMovementReference, default: StockMovementReference.MANUAL })
  @IsOptional()
  @IsEnum(StockMovementReference)
  referenceType?: StockMovementReference;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  referenceId?: number;

  @ApiProperty({
    required: false,
    description: 'Link to a tender when this stock is consumed for a tender',
  })
  @IsOptional()
  @IsString()
  tenderId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

/** Transfer: move quantity between warehouses */
export class StockTransferDto {
  @ApiProperty()
  @IsInt()
  itemId: number;

  @ApiProperty()
  @IsInt()
  sourceWarehouseId: number;

  @ApiProperty()
  @IsInt()
  targetWarehouseId: number;

  @ApiProperty()
  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

/** Adjustment: set stock to a specific quantity (for audits) */
export class StockAdjustmentDto {
  @ApiProperty()
  @IsInt()
  itemId: number;

  @ApiProperty()
  @IsInt()
  warehouseId: number;

  @ApiProperty({ description: 'New absolute quantity' })
  @IsNumber()
  @Min(0)
  newQuantity: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
