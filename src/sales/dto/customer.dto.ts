import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateCustomerDto {
  @ApiProperty({ example: 'Ahmad Khan' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  /**
   * SUPER_ADMIN only — explicit target company. Ignored (silently) for any
   * other role; their tenant comes from the JWT. Required when a SUPER_ADMIN
   * is unscoped (hasn't selected a company in the CompanySwitcher) since
   * the server has no other way to know which tenant the customer belongs to.
   */
  @ApiProperty({
    required: false,
    description: 'SUPER_ADMIN only: target company id',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyId?: number;
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}

export class CustomerFilterDto {
  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({ required: false, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  search?: string;
}
