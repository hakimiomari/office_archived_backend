import * as Joi from "joi";

export default Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "production", "test")
    .default("development"),
  PORT: Joi.number().default(3000),
  ACCESS_TOKEN_KEY: Joi.string().required(),
  REFRESH_TOKEN_KEY: Joi.string().required(),
  ACCESS_TOKEN_EXPIRED_TIME: Joi.string().required().default("15m"),
  REFRESH_TOKEN_EXPIRED_TIME: Joi.string().required().default("15d"),
  GOOGLE_CLIENT_ID: Joi.string().required(),
  GOOGLE_CLIENT_SECRET: Joi.string().required(),
  //   REDIS_HOST: Joi.string().required(),
  //   REDIS_PORT: Joi.number().default(6379),
  //   REDIS_PASSWORD: Joi.string().required(),
  //   REDIS_DB: Joi.number().default(0),
  //   REDIS_USER: Joi.string().required(),
  //   DATABASE_URL: Joi.string().required(),
  //   JWT_SECRET: Joi.string().required(),
});
