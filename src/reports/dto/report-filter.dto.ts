import { IsOptional, IsString, IsEnum, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { LicenseType, LicenseStatus } from '../../licenses/dto/create-license.dto';

export class ReportFilterDto {
  @ApiPropertyOptional({ example: '2024-01-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2024-12-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: LicenseType })
  @IsOptional()
  @IsEnum(LicenseType)
  licenseType?: LicenseType;

  @ApiPropertyOptional({ enum: LicenseStatus })
  @IsOptional()
  @IsEnum(LicenseStatus)
  status?: LicenseStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mineAddress?: string;

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsString()
  page?: string;

  @ApiPropertyOptional({ example: '10' })
  @IsOptional()
  @IsString()
  limit?: string;
}

export class ExportFilterDto extends ReportFilterDto {
  @ApiPropertyOptional({ enum: ['pdf', 'excel', 'csv'], default: 'excel' })
  @IsOptional()
  @IsString()
  type?: 'pdf' | 'excel' | 'csv';
}
