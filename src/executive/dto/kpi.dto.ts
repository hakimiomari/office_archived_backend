import {
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

export enum KpiCategory {
  FINANCIAL = 'FINANCIAL',
  CONTRACT = 'CONTRACT',
  TRAVEL = 'TRAVEL',
  OPERATIONAL = 'OPERATIONAL',
  OTHER = 'OTHER',
}

export class CreateKpiDto {
  @ApiProperty({ example: 'totalRevenue' })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({ example: 1250000 })
  @IsNumber()
  value: number;

  @ApiProperty({ example: 2025 })
  @IsInt()
  @Min(2000)
  year: number;

  @ApiProperty({ enum: KpiCategory, default: KpiCategory.OTHER })
  @IsOptional()
  @IsEnum(KpiCategory)
  category?: KpiCategory;

  @ApiProperty({ required: false, example: 'Total Revenue' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateKpiDto extends PartialType(CreateKpiDto) {}

export class KpiFilterDto {
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
  year?: number;

  @ApiProperty({ enum: KpiCategory, required: false })
  @IsOptional()
  @IsEnum(KpiCategory)
  category?: KpiCategory;
}
