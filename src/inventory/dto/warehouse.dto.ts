import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';

export class CreateWarehouseDto {
  @ApiProperty({ example: 'Main Warehouse' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ required: false, example: 'Kabul, District 9' })
  @IsOptional()
  @IsString()
  location?: string;
}

export class UpdateWarehouseDto extends PartialType(CreateWarehouseDto) {}
