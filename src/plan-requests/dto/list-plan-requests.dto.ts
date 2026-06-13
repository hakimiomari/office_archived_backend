import { PlanChangeRequestStatus } from "@prisma/client";
import { Transform } from "class-transformer";
import { IsEnum, IsInt, IsOptional, Min } from "class-validator";

export class ListPlanRequestsDto {
  @IsOptional()
  @IsEnum(PlanChangeRequestStatus)
  status?: PlanChangeRequestStatus;

  @IsOptional()
  @Transform(({ value }) => (value != null ? parseInt(value, 10) : value))
  @IsInt()
  @Min(1)
  companyId?: number;

  @IsOptional()
  @Transform(({ value }) => (value != null ? parseInt(value, 10) : value))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => (value != null ? parseInt(value, 10) : value))
  @IsInt()
  @Min(1)
  limit?: number;
}
