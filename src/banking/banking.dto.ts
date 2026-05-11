import { ApiProperty } from "@nestjs/swagger";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

export enum BankTransactionDirectionDto {
  CREDIT = "CREDIT",
  DEBIT = "DEBIT",
}

export enum BankTransactionStatusDto {
  UNMATCHED = "UNMATCHED",
  MATCHED = "MATCHED",
  IGNORED = "IGNORED",
}

// ─────────────── Bank account DTOs ───────────────

export class CreateBankAccountDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiProperty({ required: false, default: "USD" })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  openingBalance?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateBankAccountDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  openingBalance?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ─────────────── Bank transaction DTOs ───────────────

export class BankTransactionInput {
  @ApiProperty()
  @IsDateString()
  statementDate: string;

  @ApiProperty({ enum: BankTransactionDirectionDto })
  @IsEnum(BankTransactionDirectionDto)
  direction: BankTransactionDirectionDto;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  raw?: Record<string, unknown>;
}

export class CreateBankTransactionDto extends BankTransactionInput {
  @ApiProperty()
  @IsInt()
  bankAccountId: number;
}

export class ImportBankTransactionsDto {
  @ApiProperty()
  @IsInt()
  bankAccountId: number;

  @ApiProperty({ type: [BankTransactionInput] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BankTransactionInput)
  transactions: BankTransactionInput[];
}

export class MatchBankTransactionDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  paymentId?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  supplierPaymentId?: number;
}

export class BankTransactionFilterDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  bankAccountId?: number;

  @ApiProperty({ required: false, enum: BankTransactionStatusDto })
  @IsOptional()
  @IsEnum(BankTransactionStatusDto)
  status?: BankTransactionStatusDto;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiProperty({ required: false, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}

// ─────────────── Reconciliation DTOs ───────────────

export class CreateReconciliationDto {
  @ApiProperty()
  @IsInt()
  bankAccountId: number;

  @ApiProperty()
  @IsDateString()
  periodStart: string;

  @ApiProperty()
  @IsDateString()
  periodEnd: string;

  @ApiProperty()
  @IsNumber()
  openingBalance: number;

  @ApiProperty()
  @IsNumber()
  closingBalance: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;
}
