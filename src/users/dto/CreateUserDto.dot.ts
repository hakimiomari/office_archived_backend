import { IsEmail, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, MinLength } from "class-validator";

export enum UserRoleDto {
  SUPER_ADMIN = "SUPER_ADMIN",
  COMPANY_ADMIN = "COMPANY_ADMIN",
  COMPANY_USER = "COMPANY_USER",
}

export class CreateUserDto {
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @MinLength(6)
  password: string;

  @IsNotEmpty()
  @IsNumber()
  role: number;

  /** Tenancy role; only SUPER_ADMIN can set this when creating users. */
  @IsOptional()
  @IsEnum(UserRoleDto)
  userRole?: UserRoleDto;

  /** Company the user belongs to. Required for non-SUPER_ADMIN users. */
  @IsOptional()
  @IsInt()
  companyId?: number;
}
