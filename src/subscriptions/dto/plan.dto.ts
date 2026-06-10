import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";
import { FeatureCode, ModuleCode } from "@prisma/client";

export class PlanLimitInputDto {
  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxUsers?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxWarehouses?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxItems?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  maxEmployees?: number | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  storageGb?: number | null;
}

export class CreatePlanDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  slug!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyPrice?: number;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  yearlyPrice?: number;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiProperty({ required: false, enum: ModuleCode, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(ModuleCode, { each: true })
  modules?: ModuleCode[];

  @ApiProperty({ required: false, enum: FeatureCode, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(FeatureCode, { each: true })
  features?: FeatureCode[];

  @ApiProperty({ required: false, type: PlanLimitInputDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PlanLimitInputDto)
  limit?: PlanLimitInputDto;
}

export class UpdatePlanDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyPrice?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  yearlyPrice?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class ReplaceModulesDto {
  @ApiProperty({ enum: ModuleCode, isArray: true })
  @IsArray()
  @IsEnum(ModuleCode, { each: true })
  codes!: ModuleCode[];
}

export class ReplaceFeaturesDto {
  @ApiProperty({ enum: FeatureCode, isArray: true })
  @IsArray()
  @IsEnum(FeatureCode, { each: true })
  codes!: FeatureCode[];
}
