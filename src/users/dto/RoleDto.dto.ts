import { IsNotEmpty, IsNumber } from "class-validator";

/**
 * DTO for assigning a role to a user.
 */
export class RoleDto {
  @IsNumber()
  @IsNotEmpty()
  role: number;

  @IsNumber()
  @IsNotEmpty()
  userId: number;
}
