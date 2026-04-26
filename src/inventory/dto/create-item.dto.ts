import {
  IsString,
  IsEnum,
  IsOptional,
  IsNotEmpty,
  IsNumber,
  IsInt,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum ItemCategory {
  OFFICE_SUPPLIES = 'OFFICE_SUPPLIES',
  IT_EQUIPMENT = 'IT_EQUIPMENT',
  PROJECT_MATERIALS = 'PROJECT_MATERIALS',
  CONSUMABLES = 'CONSUMABLES',
  ASSETS = 'ASSETS',
  OTHER = 'OTHER',
}

export class CreateItemDto {
  @ApiProperty({ example: 'A4 Paper' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'SKU-001', required: false })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiProperty({ enum: ItemCategory, default: ItemCategory.OTHER })
  @IsOptional()
  @IsEnum(ItemCategory)
  category?: ItemCategory;

  @ApiProperty({ required: false, description: 'FK to Category (hierarchy)' })
  @IsOptional()
  @IsInt()
  categoryId?: number;

  @ApiProperty({ example: 'pcs', default: 'pcs' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 10, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minStock?: number;

  @ApiProperty({ example: 200, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxStock?: number;

  @ApiProperty({ example: 20, required: false, description: 'Trigger reorder when total stock <= reorderPoint' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderPoint?: number;

  @ApiProperty({ example: 100, required: false, description: 'Suggested quantity to reorder' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  reorderQuantity?: number;

  @ApiProperty({ example: 7, required: false, description: 'Supplier lead time in days' })
  @IsOptional()
  @IsInt()
  @Min(0)
  leadTimeDays?: number;

  @ApiProperty({ example: 150, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  salePrice?: number;

  @ApiProperty({ example: 100, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  purchasePrice?: number;
}
