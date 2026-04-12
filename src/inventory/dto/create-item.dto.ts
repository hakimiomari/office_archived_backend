import {
  IsString,
  IsEnum,
  IsOptional,
  IsNotEmpty,
  IsNumber,
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
}
