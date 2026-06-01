import { IsEmail, IsEnum, IsNotEmpty, IsNumber, IsOptional, MinLength } from "class-validator";

export enum UserRoleDto {
  ADMIN = "ADMIN",
  USER = "USER",
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

  /** App role: ADMIN (full system) or USER (limited by permissions). */
  @IsOptional()
  @IsEnum(UserRoleDto)
  userRole?: UserRoleDto;
}
