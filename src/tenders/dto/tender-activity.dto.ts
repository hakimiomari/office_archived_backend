import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum TenderActivityAction {
  VIEWED = 'VIEWED',
  APPLIED = 'APPLIED',
  IGNORED = 'IGNORED',
  ASSIGNED = 'ASSIGNED',
  NOTIFIED = 'NOTIFIED',
}

export class CreateTenderActivityDto {
  @ApiProperty({ enum: TenderActivityAction })
  @IsEnum(TenderActivityAction)
  action: TenderActivityAction;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
