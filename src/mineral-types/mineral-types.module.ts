import { Module } from '@nestjs/common';
import { MineralTypesController } from './mineral-types.controller';
import { MineralTypesService } from './mineral-types.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [MineralTypesController],
  providers: [MineralTypesService],
  exports: [MineralTypesService],
})
export class MineralTypesModule {}
