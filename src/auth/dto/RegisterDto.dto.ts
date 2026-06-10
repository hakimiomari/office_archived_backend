import { ApiProperty } from "@nestjs/swagger";
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

/**
 * Public self-signup payload. Creates a brand-new tenant (Company)
 * with an auto-assigned Basic subscription and the first user as
 * COMPANY_ADMIN of that tenant.
 *
 * Slug is optional — when missing, the server derives it from the
 * company name (lowercase, ascii-safe, hyphenated). Slug collisions
 * surface as 409 Conflict.
 */
export class RegisterDto {
  // ─── Company ───
  @ApiProperty({ example: "Acme Trading Co." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  companyName!: string;

  @ApiProperty({
    required: false,
    example: "acme",
    description:
      "Lowercase ascii-safe URL identifier. Derived from companyName if omitted.",
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, {
    message:
      "Slug must be lowercase, may contain digits and hyphens, and cannot start/end with a hyphen.",
  })
  @MaxLength(60)
  companySlug?: string;

  // ─── First admin user ───
  @ApiProperty({ example: "Jane Doe" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: "jane@acme.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "Min 6 characters" })
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password!: string;
}
