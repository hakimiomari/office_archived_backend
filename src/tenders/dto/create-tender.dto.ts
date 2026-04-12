import {
  IsString,
  IsEnum,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsUrl,
  IsInt,
  IsNumber,
  IsArray,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum TenderType {
  TENDER = 'TENDER',
  CONSULTING = 'CONSULTING',
  AUCTION = 'AUCTION',
  NOTICE = 'NOTICE',
  ANNOUNCEMENT = 'ANNOUNCEMENT',
  OTHER = 'OTHER',
}

export enum TenderSector {
  MINING = 'MINING',
  OIL = 'OIL',
  GAS = 'GAS',
  CONSULTING = 'CONSULTING',
  OTHER = 'OTHER',
}

export enum TenderStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

export enum TenderLanguage {
  EN = 'EN',
  PS = 'PS',
  FA = 'FA',
}

export class CreateTenderDto {
  @ApiProperty({ example: 'Tender Notice - Oil Exploration' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'https://momp.gov.af/tender-notice-xyz' })
  @IsUrl()
  sourceUrl: string;

  @ApiProperty({ required: false, example: 'MOMP-2026-042' })
  @IsOptional()
  @IsString()
  referenceNo?: string;

  @ApiProperty({ required: false, example: '2026-02-04' })
  @IsOptional()
  @IsDateString()
  publishDate?: string;

  @ApiProperty({ required: false, example: '2026-03-06' })
  @IsOptional()
  @IsDateString()
  closingDate?: string;

  @ApiProperty({ enum: TenderSector, default: TenderSector.OTHER, required: false })
  @IsOptional()
  @IsEnum(TenderSector)
  sector?: TenderSector;

  @ApiProperty({ enum: TenderType, default: TenderType.TENDER, required: false })
  @IsOptional()
  @IsEnum(TenderType)
  type?: TenderType;

  @ApiProperty({ enum: TenderStatus, default: TenderStatus.OPEN, required: false })
  @IsOptional()
  @IsEnum(TenderStatus)
  status?: TenderStatus;

  @ApiProperty({ enum: TenderLanguage, default: TenderLanguage.EN, required: false })
  @IsOptional()
  @IsEnum(TenderLanguage)
  language?: TenderLanguage;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  projectName?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({ required: false, type: [Object] })
  @IsOptional()
  @IsArray()
  attachments?: any[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  priorityScore?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  organizationId?: number;

  @ApiProperty({ required: false, type: [String], description: 'Tags to attach to the tender' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
