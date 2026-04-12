import { Module } from '@nestjs/common';
import { TendersController } from './tenders.controller';
import { TendersService } from './tenders.service';
import { MompScraperService } from './scraper/momp-scraper.service';
import { ScraperScheduler } from './scraper/scraper.scheduler';
import { TenderAiService } from './ai/tender-ai.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [TendersController],
  providers: [
    TendersService,
    MompScraperService,
    ScraperScheduler,
    TenderAiService,
  ],
  exports: [TendersService, MompScraperService, TenderAiService],
})
export class TendersModule {}
