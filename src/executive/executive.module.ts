import { Module } from '@nestjs/common';
import { ExecutiveController } from './executive.controller';
import { ExecutiveService } from './executive.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ExecutiveController],
  providers: [ExecutiveService],
  exports: [ExecutiveService],
})
export class ExecutiveModule {}
