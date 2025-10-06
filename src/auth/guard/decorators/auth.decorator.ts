import { SetMetadata } from "@nestjs/common";

export enum AuthType {
  Bearer,
  None,
}

export const ATUH_TYPE_KEY = "auth_type";

export const Auth = (type: AuthType) => SetMetadata(ATUH_TYPE_KEY, type);
