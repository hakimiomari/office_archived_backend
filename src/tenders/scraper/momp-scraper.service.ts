import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { TendersService } from '../tenders.service';
import { TenderAiService } from '../ai/tender-ai.service';
import {
  TenderType,
  TenderSector,
  TenderStatus,
} from '../dto/create-tender.dto';

interface ScrapedTender {
  title: string;
  sourceUrl: string;
  description?: string;
  publishDate?: string;
  closingDate?: string;
  referenceNo?: string;
  type: TenderType;
  sector: TenderSector;
  status: TenderStatus;
}

@Injectable()
export class MompScraperService {
  private readonly logger = new Logger(MompScraperService.name);
  private readonly BASE_URL = 'https://momp.gov.af';
  private readonly LIST_PATHS = ['/tenders', '/all-tenders'];

  /**
   * Main entry — scrapes the MoMP tender listing pages and upserts every
   * tender it finds. Returns counts.
   */
  async scrapeAll(): Promise<{
    fetched: number;
    inserted: number;
    updated: number;
    skipped: number;
    errors: number;
  }> {
    this.logger.log('Starting MoMP tender scrape...');
    const stats = { fetched: 0, inserted: 0, updated: 0, skipped: 0, errors: 0 };

    const seenUrls = new Set<string>();
    for (const path of this.LIST_PATHS) {
      try {
        const links = await this.scrapeListPage(`${this.BASE_URL}${path}`);
        this.logger.log(`Found ${links.length} links on ${path}`);
        for (const link of links) {
          if (seenUrls.has(link)) continue;
          seenUrls.add(link);
          try {
            const tender = await this.scrapeDetailPage(link);
            if (!tender) {
              stats.skipped++;
              continue;
            }
            stats.fetched++;

            // AI classification (or heuristic fallback)
            const ai = await this.aiService.classify(
              tender.title,
              tender.description,
            );

            const upsertResult = await this.tendersService.upsertBySourceUrl({
              title: tender.title,
              sourceUrl: tender.sourceUrl,
              description: tender.description,
              publishDate: tender.publishDate,
              closingDate: tender.closingDate,
              referenceNo: tender.referenceNo,
              type: ai.type,
              sector: ai.sector,
              status: tender.status,
              priorityScore: ai.priorityScore,
              tags: ai.tags.length > 0 ? ai.tags : undefined,
            });
            // Heuristic: if createdAt == updatedAt then it was inserted
            if (
              new Date(upsertResult.createdAt).getTime() ===
              new Date(upsertResult.updatedAt).getTime()
            ) {
              stats.inserted++;
            } else {
              stats.updated++;
            }
          } catch (err: any) {
            this.logger.error(
              `Failed to scrape detail page ${link}: ${err.message}`,
            );
            stats.errors++;
          }
        }
      } catch (err: any) {
        this.logger.error(
          `Failed to scrape list page ${path}: ${err.message}`,
        );
        stats.errors++;
      }
    }

    this.logger.log(
      `Scrape complete. fetched=${stats.fetched} inserted=${stats.inserted} updated=${stats.updated} skipped=${stats.skipped} errors=${stats.errors}`,
    );
    return stats;
  }

  constructor(
    private readonly tendersService: TendersService,
    private readonly aiService: TenderAiService,
  ) {}

  /** Fetches a list page and extracts every tender detail link */
  private async scrapeListPage(url: string): Promise<string[]> {
    const html = await this.fetch(url);
    const $ = cheerio.load(html);
    const links = new Set<string>();

    // Drupal sites typically render tender cards with anchors. We try a few
    // selectors that match common Drupal/MoMP patterns.
    const selectors = [
      'article a[href*="tender"]',
      'a[href*="tender-notice"]',
      'a[href*="/node/"]',
      '.view-content a[href]',
      '.views-row a[href]',
    ];

    for (const sel of selectors) {
      $(sel).each((_, el) => {
        const href = $(el).attr('href');
        if (!href) return;
        const absolute = this.toAbsolute(href);
        if (this.looksLikeTenderUrl(absolute)) {
          links.add(absolute);
        }
      });
    }

    return Array.from(links);
  }

  /** Fetches a tender detail page and parses out the structured fields */
  private async scrapeDetailPage(url: string): Promise<ScrapedTender | null> {
    const html = await this.fetch(url);
    const $ = cheerio.load(html);

    // Title — try common Drupal node title selectors
    const title =
      $('h1.page-title').first().text().trim() ||
      $('h1').first().text().trim() ||
      $('title').text().trim();

    if (!title || title.length < 5) return null;

    // Body / description — Drupal usually has .field--name-body or .node__content
    const description =
      $('.field--name-body').first().text().trim() ||
      $('.node__content').first().text().trim() ||
      $('article').first().text().trim() ||
      '';

    // Try to extract dates from text using regex (publish/closing keywords)
    const fullText = `${title}\n${description}`;
    const publishDate = this.extractDate(fullText, [
      'publish',
      'published',
      'date of publication',
      'date',
    ]);
    const closingDate = this.extractDate(fullText, [
      'closing',
      'closes',
      'deadline',
      'submission deadline',
      'closing date',
    ]);

    // Reference number — try common patterns
    const refMatch =
      fullText.match(/(?:ref(?:erence)?(?:\s*no\.?)?[:\s]+)([A-Z0-9\-\/]{4,})/i) ||
      fullText.match(/\b(MOMP[-\/][A-Z0-9\-\/]+)\b/i);
    const referenceNo = refMatch?.[1]?.trim();

    // Heuristic classification
    const type = this.classifyType(title, description);
    const sector = this.classifySector(title, description);
    const status = this.classifyStatus(closingDate);

    return {
      title: title.slice(0, 500),
      sourceUrl: url,
      description: description.slice(0, 5000) || undefined,
      publishDate,
      closingDate,
      referenceNo,
      type,
      sector,
      status,
    };
  }

  // -------------- Helpers --------------

  private async fetch(url: string): Promise<string> {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; OfficeArchivedBot/1.0; +https://momp.gov.af)',
        Accept: 'text/html,application/xhtml+xml',
      },
      // Drupal sometimes redirects, follow them
      redirect: 'follow',
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return res.text();
  }

  private toAbsolute(href: string): string {
    if (href.startsWith('http')) return href;
    if (href.startsWith('//')) return `https:${href}`;
    if (href.startsWith('/')) return `${this.BASE_URL}${href}`;
    return `${this.BASE_URL}/${href}`;
  }

  private looksLikeTenderUrl(url: string): boolean {
    // Filter out obvious non-tender pages
    if (!url.startsWith(this.BASE_URL)) return false;
    if (url === this.BASE_URL) return false;
    if (url.includes('/tenders') && !url.includes('?')) return false; // list page itself
    if (url.endsWith('/tenders')) return false;
    const tenderHints = [
      'tender-notice',
      'tender_notice',
      'expression-of-interest',
      'request-for-proposal',
      'auction',
      'consultancy',
      'consulting',
      '/node/',
    ];
    return tenderHints.some((h) => url.toLowerCase().includes(h));
  }

  private extractDate(text: string, keywords: string[]): string | undefined {
    const lower = text.toLowerCase();
    for (const kw of keywords) {
      const idx = lower.indexOf(kw);
      if (idx === -1) continue;
      // Look at the next 80 chars after the keyword
      const slice = text.slice(idx, idx + 120);
      const match = slice.match(
        /(\d{4}[-\/]\d{1,2}[-\/]\d{1,2}|\d{1,2}[-\/]\d{1,2}[-\/]\d{4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i,
      );
      if (match) {
        const parsed = new Date(match[1]);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString();
        }
      }
    }
    return undefined;
  }

  private classifyType(title: string, description: string): TenderType {
    const text = `${title} ${description}`.toLowerCase();
    if (text.includes('expression of interest') || text.includes('eoi'))
      return TenderType.CONSULTING;
    if (text.includes('consultanc') || text.includes('consultant'))
      return TenderType.CONSULTING;
    if (text.includes('auction')) return TenderType.AUCTION;
    if (text.includes('notice')) return TenderType.NOTICE;
    if (text.includes('tender')) return TenderType.TENDER;
    return TenderType.OTHER;
  }

  private classifySector(title: string, description: string): TenderSector {
    const text = `${title} ${description}`.toLowerCase();
    if (text.includes('oil')) return TenderSector.OIL;
    if (text.includes('gas') || text.includes('tapi'))
      return TenderSector.GAS;
    if (
      text.includes('mine') ||
      text.includes('mining') ||
      text.includes('emerald') ||
      text.includes('gold') ||
      text.includes('copper') ||
      text.includes('coal')
    )
      return TenderSector.MINING;
    if (text.includes('consult')) return TenderSector.CONSULTING;
    return TenderSector.OTHER;
  }

  private classifyStatus(closingDate?: string): TenderStatus {
    if (!closingDate) return TenderStatus.OPEN;
    const closing = new Date(closingDate);
    return closing.getTime() < Date.now()
      ? TenderStatus.CLOSED
      : TenderStatus.OPEN;
  }
}
