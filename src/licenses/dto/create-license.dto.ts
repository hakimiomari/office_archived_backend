import {
  IsString,
  IsEnum,
  IsDateString,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum LicenseType {
  TRADE = 'TRADE',
  IMPORT = 'IMPORT',
  EXPORT = 'EXPORT',
  INDUSTRIAL = 'INDUSTRIAL',
  PROFESSIONAL = 'PROFESSIONAL',
}

export enum LicenseStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  PENDING = 'PENDING',
  SUSPENDED = 'SUSPENDED',
  CANCELLED = 'CANCELLED',
}

export class CreateLicenseDto {
  @ApiProperty({ enum: LicenseType })
  @IsEnum(LicenseType)
  licenseType: LicenseType;

  @ApiProperty({ enum: LicenseStatus })
  @IsEnum(LicenseStatus)
  status: LicenseStatus;

  @ApiProperty({ example: '2024-01-01' })
  @IsDateString()
  issueDate: string;

  @ApiProperty({ example: '2029-01-01' })
  @IsDateString()
  expiryDate: string;

  @ApiProperty({ example: 'Kabul' })
  @IsString()
  @IsNotEmpty()
  province: string;

  @ApiProperty({ example: 'District 1' })
  @IsString()
  @IsNotEmpty()
  district: string;
}
