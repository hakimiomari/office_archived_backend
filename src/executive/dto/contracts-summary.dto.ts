import {
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';

export class CreateContractsSummaryDto {
  @ApiProperty({ example: 2025 })
  @IsInt()
  @Min(2000)
  year: number;

  @ApiProperty({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  totalContracts?: number;

  @ApiProperty({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  activeContracts?: number;

  @ApiProperty({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  suspendedContracts?: number;

  @ApiProperty({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  cancelledContracts?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateContractsSummaryDto extends PartialType(
  CreateContractsSummaryDto,
) {}
