import {
  IsString,
  IsEnum,
  IsOptional,
  IsDateString,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ContractType {
  SMALL_SCALE = 'SMALL_SCALE',
  LARGE_SCALE = 'LARGE_SCALE',
}

export enum ContractStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  TERMINATED = 'TERMINATED',
  PENDING = 'PENDING',
}

export class CreateContractDto {
  @ApiProperty({ description: 'Company this contract belongs to' })
  @IsString()
  @IsNotEmpty()
  companyId: string;

  @ApiProperty({ description: 'License this contract is for' })
  @IsString()
  @IsNotEmpty()
  licenseId: string;

  @ApiProperty({ enum: ContractType })
  @IsEnum(ContractType)
  contractType: ContractType;

  @ApiProperty({ enum: ContractStatus })
  @IsEnum(ContractStatus)
  status: ContractStatus;

  @ApiPropertyOptional({ example: 'CTR-2026-001' })
  @IsOptional()
  @IsString()
  contractNumber?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2027-01-01' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
