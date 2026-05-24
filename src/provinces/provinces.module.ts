import { Module } from '@nestjs/common';
import { ProvincesController } from './provinces.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ProvincesController],
})
export class ProvincesModule {}
