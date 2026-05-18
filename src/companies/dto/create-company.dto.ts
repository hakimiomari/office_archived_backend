import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCompanyDto {
  @ApiProperty({ example: 'LIC-2026-001' })
  @IsString()
  @IsNotEmpty()
  licenseNumber: string;

  @ApiProperty({ example: '1234567890' })
  @IsString()
  @IsNotEmpty()
  TIN: string;

  @ApiProperty({ example: 'Kabul, Afghanistan' })
  @IsString()
  @IsNotEmpty()
  address: string;
}
