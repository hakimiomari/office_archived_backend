import {
  IsString,
  IsEnum,
  IsDateString,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum LicenseType {
  SMALL_SCALE = 'SMALL_SCALE',
  LARGE_SCALE = 'LARGE_SCALE',
}

export enum LicenseStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  TERMINATED = 'TERMINATED',
  PENDING = 'PENDING',
}

export class CreateLicenseDto {
  @ApiProperty({ description: 'Company this license belongs to' })
  @IsString()
  @IsNotEmpty()
  companyId: string;

  @ApiProperty({ description: 'Mineral type this license covers' })
  @IsString()
  @IsNotEmpty()
  mineralTypeId: string;

  @ApiPropertyOptional({ enum: LicenseType, default: LicenseType.SMALL_SCALE })
  @IsOptional()
  @IsEnum(LicenseType)
  licenseType?: LicenseType;

  @ApiPropertyOptional({ enum: LicenseStatus, default: LicenseStatus.ACTIVE })
  @IsOptional()
  @IsEnum(LicenseStatus)
  status?: LicenseStatus;

  @ApiProperty({ example: '2024-01-01' })
  @IsDateString()
  issueDate: string;

  @ApiProperty({ example: '2029-01-01' })
  @IsDateString()
  expiryDate: string;

  @ApiProperty({ example: 'Kabul, District 1' })
  @IsString()
  @IsNotEmpty()
  mineAddress: string;
}
