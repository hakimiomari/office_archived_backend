import { BillingCycle } from "@prisma/client";
import { Transform } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

/**
 * Company-admin payload for `POST /plan-requests`. The receipt
 * is uploaded separately as multipart `receipt` (handled by
 * `FileInterceptor` in the controller).
 */
export class CreatePlanRequestDto {
  @Transform(({ value }) =>
    typeof value === "string" ? parseInt(value, 10) : value,
  )
  @IsInt()
  @Min(1)
  requestedPlanId!: number;

  @IsEnum(BillingCycle)
  billingCycle!: BillingCycle;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
