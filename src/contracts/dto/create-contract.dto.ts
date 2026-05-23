import {
  IsString,
  IsEnum,
  IsOptional,
  IsDateString,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ContractStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  TERMINATED = 'TERMINATED',
  PENDING = 'PENDING',
}

export enum Unit {
  Kilometre = 'Kilometre',
  Metre = 'Metre',
  Hectares = 'Hectares',
}

export enum Currency {
  AFN = 'AFN',
  USD = 'USD',
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

  @ApiPropertyOptional({
    enum: Currency,
    default: Currency.AFN,
    description: 'Currency for the contract price',
  })
  @IsOptional()
  @IsEnum(Currency)
  priceCurrency?: Currency;

  @ApiPropertyOptional({
    example: 5,
    description: 'Royalty percentage (0–100 inclusive)',
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  royalty?: number;

  @ApiPropertyOptional({
    example: 100,
    description: 'Number of job opportunities',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  jobـopportunities?: number;

  @ApiPropertyOptional({ example: 2000, description: 'Social service price' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  social_service_price?: number;

  @ApiPropertyOptional({
    enum: Currency,
    default: Currency.AFN,
    description: 'Currency for the social service price',
  })
  @IsOptional()
  @IsEnum(Currency)
  social_service_currency?: Currency;

  @ApiPropertyOptional({ example: 50, description: 'Mining area' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  area?: number;

  @ApiPropertyOptional({ enum: Unit, default: Unit.Kilometre })
  @IsOptional()
  @IsEnum(Unit)
  unit?: Unit;

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
