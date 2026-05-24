import { IsOptional, IsString, IsEnum, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Currency } from '../../auctions/dto/create-auction.dto';

export class AuctionReportFilterDto {
  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mineralTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  provinceId?: number;

  @ApiPropertyOptional({ enum: Currency })
  @IsOptional()
  @IsEnum(Currency)
  priceCurrency?: Currency;

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional({ example: '10' })
  @IsOptional()
  @IsString()
  limit?: string;
}

export class AuctionExportFilterDto extends AuctionReportFilterDto {
  @ApiPropertyOptional({ enum: ['pdf', 'excel', 'csv'], default: 'excel' })
  @IsOptional()
  @IsString()
  type?: 'pdf' | 'excel' | 'csv';
}
