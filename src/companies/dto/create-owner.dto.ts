import { IsString, IsNotEmpty, IsNumber, Min } from 'class-validator';
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

  @ApiProperty({ example: 50.0, description: 'Ownership share amount' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  shareAmount: number;
}
