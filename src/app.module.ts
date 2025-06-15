import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaService } from './prisma/prisma.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { UserModule } from './user/user.module';
import { ArchivesModule } from './archives/archives.module';
import { ReportsService } from './reports/reports.service';

@Module({
  imports: [AuthModule, PrismaModule, RedisModule, UserModule, ArchivesModule],
  controllers: [AppController],
  providers: [AppService, PrismaService, ReportsService],
})
export class AppModule {}
