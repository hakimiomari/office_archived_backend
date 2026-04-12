import {
  IsEnum,
  IsOptional,
  IsString,
  IsInt,
  IsDateString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TenderSector, TenderStatus, TenderType } from './create-tender.dto';

export class TenderFilterDto {
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

  @ApiPropertyOptional({ description: 'Search title, description, or reference number' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: TenderStatus })
  @IsOptional()
  @IsEnum(TenderStatus)
  status?: TenderStatus;

  @ApiPropertyOptional({ enum: TenderSector })
  @IsOptional()
  @IsEnum(TenderSector)
  sector?: TenderSector;

  @ApiPropertyOptional({ enum: TenderType })
  @IsOptional()
  @IsEnum(TenderType)
  type?: TenderType;

  @ApiPropertyOptional({ description: 'Filter tenders with closing date from this date' })
  @IsOptional()
  @IsDateString()
  closingFrom?: string;

  @ApiPropertyOptional({ description: 'Filter tenders with closing date until this date' })
  @IsOptional()
  @IsDateString()
  closingTo?: string;

  @ApiPropertyOptional({ description: 'Return tenders closing within N days' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  closingWithinDays?: number;

  @ApiPropertyOptional({
    enum: ['pdf', 'excel', 'csv'],
    description: 'Export format (only used by /tenders/export)',
  })
  @IsOptional()
  @IsEnum(['pdf', 'excel', 'csv'] as any)
  format?: 'pdf' | 'excel' | 'csv';
}
