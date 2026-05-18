import { IsString, IsEnum, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum MineralCategory {
  METALLIC = 'METALLIC',
  NONMETALLIC = 'NONMETALLIC',
}

export class CreateMineralTypeDto {
  @ApiProperty({ example: 'Gold' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    enum: MineralCategory,
    default: MineralCategory.METALLIC,
  })
  @IsOptional()
  @IsEnum(MineralCategory)
  mineralCategory?: MineralCategory;
}
