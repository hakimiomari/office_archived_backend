import { IsString, IsNotEmpty, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOwnerDto {
  @ApiProperty({ example: 'Ahmad Khan' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Director' })
  @IsString()
  @IsNotEmpty()
  position: string;

  @ApiProperty({
    example: 50.0,
    description: 'Ownership share percentage (0–100 inclusive)',
    minimum: 0,
    maximum: 100,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  shareAmount: number;
}
