import { IsNotEmpty, IsNumber } from "class-validator";

export class RoleDto {
  @IsNumber()
  @IsNotEmpty()
  role: number;

  @IsNumber()
  @IsNotEmpty()
  userId: number;
}
