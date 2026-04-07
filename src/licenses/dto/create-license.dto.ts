import {
  IsString,
  IsEnum,
  IsDateString,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum LicenseType {
  SMALL = 'SMALL',
  LARGE = 'LARGE',
}

export enum LicenseStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  SUSPENDED = 'SUSPENDED',
}

export class CreateLicenseDto {
  @ApiProperty({ example: 'LIC-2024-001' })
  @IsString()
  @IsNotEmpty()
  licenseNumber: string;

  @ApiProperty({ example: 'Afghan Mining Corp' })
  @IsString()
  @IsNotEmpty()
  companyName: string;

  @ApiProperty({ enum: LicenseType })
  @IsEnum(LicenseType)
  licenseType: LicenseType;

  @ApiProperty({ example: '2024-01-01' })
  @IsDateString()
  issueDate: string;

  @ApiProperty({ example: '2029-01-01' })
  @IsDateString()
  expiryDate: string;

  @ApiProperty({ enum: LicenseStatus })
  @IsEnum(LicenseStatus)
  status: LicenseStatus;

  @ApiProperty({ example: 'Kabul' })
  @IsString()
  @IsNotEmpty()
  province: string;

  @ApiProperty({ example: 'District 1' })
  @IsString()
  @IsNotEmpty()
  district: string;
}
