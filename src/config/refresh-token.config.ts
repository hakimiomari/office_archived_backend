import { registerAs } from "@nestjs/config";

export default registerAs("refreshToken", () => ({
  access_token: process.env.ACCESS_TOKEN_KEY,
  access_token_expires_in: process.env.ACCESS_TOKEN_EXPIRED_TIME,
}));
