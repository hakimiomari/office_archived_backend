import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./auth/auth.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { UserModule } from "./users/users.module";
import { RolesModule } from "./roles/roles.module";
import { MinioModule } from "./minio/minio.module";
import { InventoryModule } from "./inventory/inventory.module";
import { EmployeesModule } from "./employees/employees.module";
import { SalesModule } from "./sales/sales.module";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import refreshToken from "./config/refresh-token.config";
import environmentValidation from "./config/environment.validation";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
      load: [refreshToken],
      validationSchema: environmentValidation,
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    PrismaModule,
    RedisModule,
    MinioModule,
    UserModule,
    RolesModule,
    InventoryModule,
    EmployeesModule,
    SalesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
