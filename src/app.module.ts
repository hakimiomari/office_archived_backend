import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./auth/auth.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { UserModule } from "./users/users.module";
import { LicensesModule } from "./licenses/licenses.module";
import { ContractsModule } from "./contracts/contracts.module";
import { CompaniesModule } from "./companies/companies.module";
import { MineralTypesModule } from "./mineral-types/mineral-types.module";
import { AuctionsModule } from "./auctions/auctions.module";
import { ReportsModule } from "./reports/reports.module";
import { RolesModule } from "./roles/roles.module";
import { MinioModule } from "./minio/minio.module";
import { ExecutiveModule } from "./executive/executive.module";
import { EquipmentModule } from "./equipment/equipment.module";
import { EmployeesModule } from "./employees/employees.module";
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
    LicensesModule,
    ContractsModule,
    CompaniesModule,
    MineralTypesModule,
    AuctionsModule,
    ReportsModule,
    RolesModule,
    ExecutiveModule,
    EquipmentModule,
    EmployeesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
