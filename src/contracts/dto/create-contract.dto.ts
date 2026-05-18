import {
  IsString,
  IsEnum,
  IsOptional,
  IsDateString,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ContractStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  TERMINATED = 'TERMINATED',
  PENDING = 'PENDING',
}

export class CreateContractDto {
  @ApiProperty({ example: 'Acme Trading Co.' })
  @IsString()
  @IsNotEmpty()
  companyName: string;

  @ApiPropertyOptional({
    enum: ContractStatus,
    default: ContractStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @ApiProperty({ description: 'Mineral type this contract covers' })
  @IsString()
  @IsNotEmpty()
  mineralTypeId: string;

  @ApiPropertyOptional({ example: 'REG-2026-001' })
  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @ApiProperty({ example: '50000', description: 'Contract price' })
  @IsString()
  @IsNotEmpty()
  price: string;

  @ApiProperty({ example: 'Kabul, District 1' })
  @IsString()
  @IsNotEmpty()
  mineAddress: string;

  @ApiProperty({ example: '2026-01-01' })
  @IsDateString()
  issueDate: string;

  @ApiProperty({ example: '2027-01-01' })
  @IsDateString()
  expiryDate: string;
}
