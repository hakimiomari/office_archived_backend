import {
  IsString,
  IsEnum,
  IsOptional,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum MassUnit {
  Gram = 'Gram',
  Kilogram = 'Kilogram',
  Carat = 'Carat',
}

export enum Currency {
  AFN = 'AFN',
  USD = 'USD',
}

export class CreateAuctionDto {
  @ApiProperty({ description: 'Mineral type this auction is for' })
  @IsString()
  @IsNotEmpty()
  mineralTypeId: string;

  @ApiPropertyOptional({ example: 'Round 1' })
  @IsOptional()
  @IsString()
  round?: string;

  @ApiProperty({ example: '100', description: 'Mass amount' })
  @IsString()
  @IsNotEmpty()
  mass: string;

  @ApiPropertyOptional({ enum: MassUnit, default: MassUnit.Gram })
  @IsOptional()
  @IsEnum(MassUnit)
  unit?: MassUnit;

  @ApiProperty({ example: '500', description: 'Unit price' })
  @IsString()
  @IsNotEmpty()
  unitPrice: string;

  @ApiPropertyOptional({ enum: Currency, default: Currency.AFN })
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
}
