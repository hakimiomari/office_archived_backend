import { ApiProperty } from "@nestjs/swagger";
import { BillingCycle, SubscriptionStatus } from "@prisma/client";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
} from "class-validator";

export class CreateSubscriptionDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  companyId!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  planId!: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({
    required: false,
    enum: BillingCycle,
    description:
      "Billing cadence; if provided, the server computes endDate from startDate + cycle. Required when endDate is omitted for paid plans.",
  })
  @IsOptional()
  @IsEnum(BillingCycle)
  cycle?: BillingCycle;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ChangePlanDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  planId!: number;

  @ApiProperty({
    enum: BillingCycle,
    description:
      "Required: MONTHLY → endDate = +30 days, YEARLY → endDate = +365 days, PERPETUAL → endDate = null",
  })
  @IsEnum(BillingCycle)
  cycle!: BillingCycle;

  @ApiProperty({ required: false, description: "Override start date (defaults to now)" })
  @IsOptional()
  @IsDateString()
  startDate?: string;
}

export class SubscriptionFilterDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  companyId?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  planId?: number;

  @ApiProperty({ required: false, enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;
}
