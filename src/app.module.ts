import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./auth/auth.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { UserModule } from "./users/users.module";
import { ArchivesModule } from "./archives/archives.module";
import { LicensesModule } from "./licenses/licenses.module";
import { ContractsModule } from "./contracts/contracts.module";
import { ReportsModule } from "./reports/reports.module";
import { RolesModule } from "./roles/roles.module";
import { MinioModule } from "./minio/minio.module";
import { ConfigModule } from "@nestjs/config";
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
    AuthModule,
    PrismaModule,
    RedisModule,
    MinioModule,
    UserModule,
    ArchivesModule,
    LicensesModule,
    ContractsModule,
    ReportsModule,
    RolesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
