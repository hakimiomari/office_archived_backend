import {
  ArrayMinSize,
  ArrayNotEmpty,
  IsArray,
  IsString,
} from "class-validator";

export class RoleDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMinSize(1)
  @IsString({ each: true }) // Ensure every item is a string
  roles: string[];
}
