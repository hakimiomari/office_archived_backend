import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import * as cookieParser from "cookie-parser";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );
  app.use(cookieParser());
  app.enableCors({
    credentials: true,
    origin: (origin, callback) => {
      const allowedOrigins = [
        "http://localhost:3001",
        "http://localhost:3000",
        "http://localhost:8001",
      ];
      if (allowedOrigins.includes(origin) || !origin) {
        callback(null, true); // allow the origin
      } else {
        callback(new Error("Not allowed by CORS"), false);
      }
    },
  });

  app.setGlobalPrefix("api");
  const config = new DocumentBuilder()
    .setTitle("Office Archived API")
    .setDescription("Office Archived API")
    .setVersion("1.0")
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api", app, document);
  await app.listen(8001);
}
bootstrap();
