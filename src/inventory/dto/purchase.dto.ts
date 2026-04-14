import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, PartialType } from '@nestjs/swagger';

export enum PurchaseStatus {
  PENDING = 'PENDING',
  RECEIVED = 'RECEIVED',
  CANCELLED = 'CANCELLED',
}

export class PurchaseItemDto {
  @ApiProperty()
  @IsInt()
  itemId: number;

  @ApiProperty()
  @IsNumber()
  @Min(0.0001)
  quantity: number;

  @ApiProperty({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;
}

export class CreatePurchaseDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  supplierId?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  referenceNo?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @ApiProperty({ enum: PurchaseStatus, default: PurchaseStatus.PENDING })
  @IsOptional()
  @IsEnum(PurchaseStatus)
  status?: PurchaseStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [PurchaseItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items: PurchaseItemDto[];

  @ApiProperty({
    required: false,
    description: 'Warehouse to deposit items into when the purchase is RECEIVED',
  })
  @IsOptional()
  @IsInt()
  targetWarehouseId?: number;

  @ApiProperty({
    required: false,
    default: 0,
    description: 'Amount paid up-front against this purchase',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  paidAmount?: number;
}

export class UpdatePurchaseDto extends PartialType(CreatePurchaseDto) {}

export enum SupplierPaymentMethod {
  CASH = 'CASH',
  BANK = 'BANK',
  MOBILE = 'MOBILE',
  CREDIT = 'CREDIT',
  OTHER = 'OTHER',
}

export class CreateSupplierPaymentDto {
  @ApiProperty()
  @IsInt()
  supplierId: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  purchaseId?: number;

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ enum: SupplierPaymentMethod, default: SupplierPaymentMethod.CASH })
  @IsOptional()
  @IsEnum(SupplierPaymentMethod)
  method?: SupplierPaymentMethod;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  referenceNo?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class SupplierPaymentFilterDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({ required: false, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  supplierId?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  purchaseId?: number;
}
