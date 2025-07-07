import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./auth/auth.module";
import { PrismaService } from "./prisma/prisma.service";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { UserModule } from "./users/users.module";
import { ArchivesModule } from "./archives/archives.module";

@Module({
  imports: [AuthModule, PrismaModule, RedisModule, UserModule, ArchivesModule],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
