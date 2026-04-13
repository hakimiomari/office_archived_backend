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

export enum EquipmentMaintenanceStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export class CreateMaintenanceDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  equipmentId: number;

  @ApiProperty({ example: 'Screen replacement needed' })
  @IsString()
  @IsNotEmpty()
  issue: string;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @ApiProperty({ required: false, example: '2025-11-01' })
  @IsOptional()
  @IsDateString()
  maintenanceDate?: string;

  @ApiProperty({ required: false, example: '2025-11-05' })
  @IsOptional()
  @IsDateString()
  completedDate?: string;

  @ApiProperty({ required: false, example: 'Tech Solutions Ltd' })
  @IsOptional()
  @IsString()
  vendor?: string;

  @ApiProperty({
    enum: EquipmentMaintenanceStatus,
    default: EquipmentMaintenanceStatus.PENDING,
  })
  @IsOptional()
  @IsEnum(EquipmentMaintenanceStatus)
  status?: EquipmentMaintenanceStatus;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateMaintenanceDto extends PartialType(CreateMaintenanceDto) {}

export class MaintenanceFilterDto {
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
  equipmentId?: number;

  @ApiProperty({ enum: EquipmentMaintenanceStatus, required: false })
  @IsOptional()
  @IsEnum(EquipmentMaintenanceStatus)
  status?: EquipmentMaintenanceStatus;
}
