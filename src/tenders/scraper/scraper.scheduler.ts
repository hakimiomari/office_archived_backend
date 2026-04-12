import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MompScraperService } from './momp-scraper.service';

@Injectable()
export class ScraperScheduler {
  private readonly logger = new Logger(ScraperScheduler.name);

  constructor(private readonly mompScraper: MompScraperService) {}

  /**
   * Run the MoMP scraper every 6 hours.
   * Override the schedule by setting SCRAPER_CRON env var.
   */
  @Cron(CronExpression.EVERY_6_HOURS, { name: 'momp-scraper' })
  async runScheduledScrape() {
    if (process.env.SCRAPER_DISABLED === 'true') {
      this.logger.log('Scraper is disabled via SCRAPER_DISABLED env');
      return;
    }
    this.logger.log('Cron triggered MoMP scrape');
    try {
      const stats = await this.mompScraper.scrapeAll();
      this.logger.log(`Cron scrape result: ${JSON.stringify(stats)}`);
    } catch (err: any) {
      this.logger.error(`Cron scrape failed: ${err.message}`);
    }
  }
}
