import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum EquipmentAssignmentStatus {
  ASSIGNED = 'ASSIGNED',
  RETURNED = 'RETURNED',
}

export class CreateAssignmentDto {
  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  equipmentId: number;

  @ApiProperty({ example: 42 })
  @Type(() => Number)
  @IsInt()
  employeeId: number;

  @ApiProperty({ required: false, example: 'John Doe' })
  @IsOptional()
  @IsString()
  employeeName?: string;

  @ApiProperty({ required: false, example: '2025-11-01' })
  @IsOptional()
  @IsDateString()
  assignedDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class UpdateAssignmentDto extends PartialType(CreateAssignmentDto) {}

export class ReturnAssignmentDto {
  @ApiProperty({ required: false, example: '2025-12-15' })
  @IsOptional()
  @IsDateString()
  returnDate?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class AssignmentFilterDto {
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
  @Type(() => Number)
  @IsInt()
  equipmentId?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  employeeId?: number;

  @ApiProperty({ enum: EquipmentAssignmentStatus, required: false })
  @IsOptional()
  @IsEnum(EquipmentAssignmentStatus)
  status?: EquipmentAssignmentStatus;
}
