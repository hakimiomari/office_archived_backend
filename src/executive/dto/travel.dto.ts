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

export enum TravelType {
  DOMESTIC = 'DOMESTIC',
  INTERNATIONAL = 'INTERNATIONAL',
}

export class CreateTravelDto {
  @ApiProperty({ enum: TravelType })
  @IsEnum(TravelType)
  type: TravelType;

  @ApiProperty({ example: 'Kabul to Herat' })
  @IsString()
  @IsNotEmpty()
  destination: string;

  @ApiProperty({ required: false, example: 'Mining sector inspection' })
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiProperty({ example: '2025-11-01' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ required: false, example: '2025-11-05' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;
}

export class UpdateTravelDto extends PartialType(CreateTravelDto) {}

export class TravelFilterDto {
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

  @ApiProperty({ enum: TravelType, required: false })
  @IsOptional()
  @IsEnum(TravelType)
  type?: TravelType;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;
}
