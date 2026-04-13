import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum EquipmentCategory {
  LAPTOP = 'LAPTOP',
  DESKTOP = 'DESKTOP',
  PRINTER = 'PRINTER',
  PHONE = 'PHONE',
  FURNITURE = 'FURNITURE',
  NETWORK = 'NETWORK',
  MONITOR = 'MONITOR',
  OTHER = 'OTHER',
}

export enum EquipmentStatus {
  AVAILABLE = 'AVAILABLE',
  ASSIGNED = 'ASSIGNED',
  MAINTENANCE = 'MAINTENANCE',
  RETIRED = 'RETIRED',
}

export enum EquipmentCondition {
  NEW = 'NEW',
  GOOD = 'GOOD',
  FAIR = 'FAIR',
  DAMAGED = 'DAMAGED',
}

export class CreateEquipmentDto {
  @ApiProperty({ example: 'Dell Latitude 5420' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: EquipmentCategory, default: EquipmentCategory.OTHER })
  @IsOptional()
  @IsEnum(EquipmentCategory)
  category?: EquipmentCategory;

  @ApiProperty({ required: false, example: 'Dell' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiProperty({ required: false, example: 'Latitude 5420' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiProperty({ required: false, example: 'DL5420-AF-0012' })
  @IsOptional()
  @IsString()
  serialNumber?: string;

  @ApiProperty({ required: false, example: '2024-06-15' })
  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  purchasePrice?: number;

  @ApiProperty({ required: false, example: '2027-06-15' })
  @IsOptional()
  @IsDateString()
  warrantyExpiry?: string;

  @ApiProperty({ enum: EquipmentStatus, default: EquipmentStatus.AVAILABLE })
  @IsOptional()
  @IsEnum(EquipmentStatus)
  status?: EquipmentStatus;

  @ApiProperty({ enum: EquipmentCondition, default: EquipmentCondition.GOOD })
  @IsOptional()
  @IsEnum(EquipmentCondition)
  condition?: EquipmentCondition;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  warehouseId?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  itemId?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateEquipmentDto extends PartialType(CreateEquipmentDto) {}

export class EquipmentFilterDto {
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
  @IsString()
  search?: string;

  @ApiProperty({ enum: EquipmentCategory, required: false })
  @IsOptional()
  @IsEnum(EquipmentCategory)
  category?: EquipmentCategory;

  @ApiProperty({ enum: EquipmentStatus, required: false })
  @IsOptional()
  @IsEnum(EquipmentStatus)
  status?: EquipmentStatus;

  @ApiProperty({ enum: EquipmentCondition, required: false })
  @IsOptional()
  @IsEnum(EquipmentCondition)
  condition?: EquipmentCondition;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  warehouseId?: number;
}
