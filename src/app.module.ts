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
import { CategoriesModule } from "./categories/categories.module";
import { StockCountsModule } from "./stock-counts/stock-counts.module";
import { AlertsModule } from "./alerts/alerts.module";
import { CompaniesModule } from "./companies/companies.module";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { TenantInterceptor } from "./tenant/tenant.interceptor";
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
    CategoriesModule,
    StockCountsModule,
    AlertsModule,
    CompaniesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global interceptor: every request runs inside an AsyncLocalStorage
    // context populated from req.user, so the Prisma tenant extension can
    // scope queries automatically.
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
})
export class AppModule {}
