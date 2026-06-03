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
import { SalesModule } from "./sales/sales.module";
import { StockCountsModule } from "./stock-counts/stock-counts.module";
import { AlertsModule } from "./alerts/alerts.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { EventsModule } from "./events/events.module";
import { TenantModule } from "./tenant/tenant.module";
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
    EventEmitterModule.forRoot(),
    AuthModule,
    PrismaModule,
    TenantModule,
    EventsModule,
    RedisModule,
    MinioModule,
    UserModule,
    RolesModule,
    InventoryModule,
    SalesModule,
    StockCountsModule,
    AlertsModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
