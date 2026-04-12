import { Injectable, Logger } from '@nestjs/common';
import * as cheerio from 'cheerio';
import { TendersService } from '../tenders.service';
import { TenderAiService } from '../ai/tender-ai.service';
import {
  TenderStatus,
  TenderLanguage,
  TenderType,
} from '../dto/create-tender.dto';

interface ScrapedTender {
  title: string;
  sourceUrl: string;
  description?: string;
  publishDate?: string;
  closingDate?: string;
  referenceNo?: string;
  status: TenderStatus;
}

interface LanguageRoute {
  language: TenderLanguage;
  /** URL path prefix for this language, e.g. "" for default EN, "/ps" for Pashto */
  prefix: string;
}

@Injectable()
export class MompScraperService {
  private readonly logger = new Logger(MompScraperService.name);
  private readonly BASE_URL = 'https://momp.gov.af';

  // Confirmed language routes on momp.gov.af:
  //   https://momp.gov.af/tenders         (English default)
  //   https://momp.gov.af/ps/tenders      (Pashto)
  //   https://momp.gov.af/dr/tenders      (Dari)
  private readonly LANGUAGES: LanguageRoute[] = [
    { language: TenderLanguage.EN, prefix: '' },
    { language: TenderLanguage.PS, prefix: '/ps' },
    { language: TenderLanguage.FA, prefix: '/dr' },
  ];

  // List pages for each language. Both "tenders" and "announcements" live
  // under the same Drupal content model and use identical card markup, so the
  // same scraper handles both sources.
  private readonly LIST_PATHS = [
    // Tenders
    '/tenders',
    '/all-tenders',
    '/recent-tenders',
    '/closed-tenders',
    // Announcements (public notices, award notifications, accreditation)
    '/announcements',
    '/all-announcements',
    '/planned-announcements',
  ];

  constructor(
    private readonly tendersService: TendersService,
    private readonly aiService: TenderAiService,
  ) {}

  /**
   * Main entry — crawls each language route + list page, extracts tender
   * detail links, scrapes each detail page, classifies via AI, upserts.
   */
  async scrapeAll(): Promise<{
    fetched: number;
    inserted: number;
    updated: number;
    skipped: number;
    errors: number;
    byLanguage: Record<string, number>;
  }> {
    this.logger.log('Starting MoMP tender scrape (EN + PS + FA)...');
    const stats = {
      fetched: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      byLanguage: { EN: 0, PS: 0, FA: 0 } as Record<string, number>,
    };

    // seenUrls tracks URLs we've already processed in this run so the same
    // detail page isn't scraped twice when it appears on multiple list pages.
    const seenUrls = new Set<string>();

    for (const lang of this.LANGUAGES) {
      // Collect all unique detail links for THIS language first, plus track
      // which links came from announcement list pages so we can override the
      // AI classifier and tag them as ANNOUNCEMENT.
      const langLinks = new Set<string>();
      const announcementLinks = new Set<string>();

      for (const listPath of this.LIST_PATHS) {
        const listUrl = `${this.BASE_URL}${lang.prefix}${listPath}`;
        const isAnnouncementSource = listPath.includes('announcement');
        try {
          const links = await this.scrapeListPage(listUrl);
          links.forEach((l) => {
            langLinks.add(l);
            if (isAnnouncementSource) announcementLinks.add(l);
          });
          this.logger.debug(
            `[${lang.language}] ${listPath} → ${links.length} links`,
          );
        } catch (err: any) {
          this.logger.debug(
            `[${lang.language}] ${listPath} unavailable: ${err.message}`,
          );
        }
      }

      this.logger.log(
        `[${lang.language}] ${langLinks.size} unique detail links found (${announcementLinks.size} announcements)`,
      );

      for (const link of langLinks) {
        // Skip if we already processed this exact URL (cross-list dedup)
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

          // If the link came from an announcement list page, FORCE the type
          // to ANNOUNCEMENT — that's the authoritative source signal, no
          // matter how the AI classified the body text.
          const finalType = announcementLinks.has(link)
            ? TenderType.ANNOUNCEMENT
            : ai.type;

          const upsertResult = await this.tendersService.upsertBySourceUrl({
            title: tender.title,
            sourceUrl: tender.sourceUrl,
            description: tender.description,
            publishDate: tender.publishDate,
            closingDate: tender.closingDate,
            referenceNo: tender.referenceNo,
            type: finalType,
            sector: ai.sector,
            status: tender.status,
            language: lang.language,
            priorityScore: ai.priorityScore,
            tags: ai.tags.length > 0 ? ai.tags : undefined,
          });

          stats.byLanguage[lang.language] =
            (stats.byLanguage[lang.language] || 0) + 1;

          // Heuristic: if createdAt == updatedAt then it's newly inserted
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
            `Failed to scrape ${link}: ${err.message}`,
          );
          stats.errors++;
        }
      }
    }

    this.logger.log(
      `Scrape complete. fetched=${stats.fetched} inserted=${stats.inserted} updated=${stats.updated} skipped=${stats.skipped} errors=${stats.errors} byLanguage=${JSON.stringify(stats.byLanguage)}`,
    );
    return stats;
  }

  // -------------- List page scraping --------------

  /**
   * MoMP list pages render tender cards with:
   *   <h2 class="card-title"><a href="/tender-notice-N">...</a></h2>
   *   <a class="card-link" href="/tender-notice-N">Read more</a>
   *
   * We extract both selectors and deduplicate.
   */
  private async scrapeListPage(url: string): Promise<string[]> {
    let html: string;
    try {
      html = await this.fetch(url);
    } catch (err: any) {
      if (/\b404\b/.test(err.message)) return [];
      throw err;
    }

    const $ = cheerio.load(html);
    const links = new Set<string>();

    // Primary selectors matching MoMP's real Drupal card layout
    $('h2.card-title a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        const abs = this.toAbsolute(href);
        if (this.isTenderDetailUrl(abs)) links.add(this.normalizeUrl(abs));
      }
    });

    $('a.card-link[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (href) {
        const abs = this.toAbsolute(href);
        if (this.isTenderDetailUrl(abs)) links.add(this.normalizeUrl(abs));
      }
    });

    // Fallback: any anchor that matches the tender-notice-N or tender_notice-N pattern
    $('a[href*="tender-notice"], a[href*="tender_notice"], a[href*="emerald-auction"]').each(
      (_, el) => {
        const href = $(el).attr('href');
        if (href) {
          const abs = this.toAbsolute(href);
          if (this.isTenderDetailUrl(abs)) links.add(this.normalizeUrl(abs));
        }
      },
    );

    return Array.from(links);
  }

  // -------------- Detail page scraping --------------

  /**
   * Detail page scraper. Handles both tender-style pages (with <time> elements)
   * and announcement-style pages (with dates embedded in body text).
   */
  private async scrapeDetailPage(url: string): Promise<ScrapedTender | null> {
    let html: string;
    try {
      html = await this.fetch(url);
    } catch (err: any) {
      if (/\b404\b/.test(err.message)) return null;
      throw err;
    }

    const $ = cheerio.load(html);

    // Title — Drupal's field--name-title inside h1, fallback to plain h1
    let title =
      $('h1 .field--name-title').first().text().trim() ||
      $('h1').first().text().trim() ||
      $('meta[property="og:title"]').attr('content')?.trim() ||
      '';
    title = title.replace(/\s+/g, ' ').trim();

    if (!title || title.length < 3) return null;

    // Description — try common body field selectors in order of preference
    const description =
      $('.field--name-body').first().text().trim() ||
      $('.node__content .field--type-text-with-summary').first().text().trim() ||
      $('article .content').first().text().trim() ||
      $('meta[property="og:description"]').attr('content')?.trim() ||
      '';

    // Dates — FIRST try <time datetime="..."> elements (tender pages do this).
    // Then fall back to keyword-based extraction from body text
    // (announcement pages like "Published Date: November 22, 2025").
    let publishDate: string | undefined;
    let closingDate: string | undefined;

    const timeElements = $('time[datetime]');
    const timeDates: string[] = [];
    timeElements.each((_, el) => {
      const dt = $(el).attr('datetime');
      if (dt) timeDates.push(dt);
    });

    if (timeDates.length > 0) {
      publishDate = timeDates[0];
      closingDate = timeDates[1] || timeDates[0];
    } else {
      // Fallback: parse from body text using labeled keywords
      publishDate = this.extractLabeledDate(description, [
        'published date',
        'publish date',
        'publication date',
        'date of publication',
        'issued on',
        'issued',
        'تاریخ نشر',
        'تاریخ انتشار',
        'د خپرېدو نېټه',
      ]);
      closingDate = this.extractLabeledDate(description, [
        'closing date',
        'submission deadline',
        'deadline',
        'last date',
        'closes on',
        'تاریخ بسته',
        'مهلت',
        'آخرین تاریخ',
        'د بندېدو نېټه',
        'د پای نېټه',
      ]);
    }

    // Reference number — common patterns:
    //   "RFP No: MoMP-03-CS-QCBS-1404"
    //   "Reference: ABC-123"
    //   "MOMP-2026-001"
    const fullText = this.normalizeDigits(`${title}\n${description}`);
    const refMatch =
      fullText.match(
        /(?:rfp\s*no\.?|ref(?:erence)?(?:\s*no\.?|number)?)[:\s]+([A-Z][\w\-\/]{3,})/i,
      ) ||
      fullText.match(/\b(MOMP[-\/][A-Z0-9][\w\-\/]+)\b/i) ||
      fullText.match(/\b([A-Z]{2,}[-\/]\d{2,}[-\/][\w\-\/]+)\b/);
    const referenceNo = refMatch?.[1]?.trim();

    // Status — derived from closing date (open if future, closed if past)
    const status = this.classifyStatus(closingDate);

    return {
      title: title.slice(0, 500),
      sourceUrl: url,
      description: description ? description.slice(0, 5000) : undefined,
      publishDate,
      closingDate,
      referenceNo,
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
        'Accept-Language': 'en,ps,fa,dr',
      },
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

  /**
   * Normalize a URL by stripping /index.php (some links use it, others don't).
   * Keeps the URL unique & consistent so upsert works.
   */
  private normalizeUrl(url: string): string {
    return url.replace('/index.php/', '/').replace(/\/$/, '');
  }

  /**
   * A detail URL on MoMP looks like one of:
   *   /tender-notice-21
   *   /notice-emerald-auction-panjshir-province
   *   /notification-intention-award-3
   *   /invitation-apply-accreditation
   *   /ps/tender-notice-...
   *   /dr/announcements-...
   */
  private isTenderDetailUrl(url: string): boolean {
    if (!url.startsWith(this.BASE_URL)) return false;

    // Exclude known list/category pages
    const excluded = [
      '/tenders',
      '/all-tenders',
      '/recent-tenders',
      '/closed-tenders',
      '/announcements',
      '/all-announcements',
      '/planned-announcements',
    ];
    const path = url
      .replace(this.BASE_URL, '')
      .replace(/\?.*$/, '')
      .replace(/#.*$/, '');

    // Trim language prefix for comparison
    const stripped = path.replace(/^\/(ps|dr|en)/, '');
    if (excluded.includes(stripped)) return false;
    if (stripped === '' || stripped === '/') return false;

    // Accept if path contains any recognizable tender/announcement keyword
    const keywords = [
      // Tender-family
      'tender-notice',
      'tender_notice',
      'tender-',
      'auction',
      'expression-of-interest',
      'eoi',
      'consultancy',
      'consulting',
      // Announcement-family
      'notification-',
      'notice-',
      'invitation-',
      'accreditation',
      'announcement',
      'award',
    ];
    return keywords.some((k) => stripped.toLowerCase().includes(k));
  }

  /**
   * Extract a date from unstructured text given a list of label keywords
   * that precede the date value. Handles multiple date formats including
   * natural English ("November 22, 2025"), numeric (2025-11-22, 22/11/2025),
   * and Arabic/Persian digits.
   */
  private extractLabeledDate(
    text: string,
    keywords: string[],
  ): string | undefined {
    if (!text) return undefined;
    const normalized = this.normalizeDigits(text);
    const lower = normalized.toLowerCase();

    const monthMap: Record<string, number> = {
      jan: 1, january: 1,
      feb: 2, february: 2,
      mar: 3, march: 3,
      apr: 4, april: 4,
      may: 5,
      jun: 6, june: 6,
      jul: 7, july: 7,
      aug: 8, august: 8,
      sep: 9, sept: 9, september: 9,
      oct: 10, october: 10,
      nov: 11, november: 11,
      dec: 12, december: 12,
    };

    for (const kw of keywords) {
      const kwLower = kw.toLowerCase();
      const idx = lower.indexOf(kwLower);
      if (idx === -1) continue;

      // Look at the text window AFTER the keyword
      const slice = normalized.slice(idx + kw.length, idx + kw.length + 200);

      // Format 1: "November 22, 2025" or "Nov 22, 2025"
      const natural = slice.match(
        /\b(january|february|march|april|may|june|july|august|september|sept|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2}),?\s+(\d{4})/i,
      );
      if (natural) {
        const month = monthMap[natural[1].toLowerCase()];
        const day = parseInt(natural[2], 10);
        const year = parseInt(natural[3], 10);
        if (month && day && year) {
          const d = new Date(Date.UTC(year, month - 1, day));
          if (!isNaN(d.getTime())) return d.toISOString();
        }
      }

      // Format 2: "22 November 2025" (day first)
      const natural2 = slice.match(
        /\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|sept|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})/i,
      );
      if (natural2) {
        const day = parseInt(natural2[1], 10);
        const month = monthMap[natural2[2].toLowerCase()];
        const year = parseInt(natural2[3], 10);
        if (month && day && year) {
          const d = new Date(Date.UTC(year, month - 1, day));
          if (!isNaN(d.getTime())) return d.toISOString();
        }
      }

      // Format 3: numeric "2025-11-22" or "22/11/2025" or "22.11.2025"
      const numeric = slice.match(
        /(\d{4}[-\/.]\d{1,2}[-\/.]\d{1,2}|\d{1,2}[-\/.]\d{1,2}[-\/.]\d{4})/,
      );
      if (numeric) {
        const parsed = new Date(numeric[1].replace(/\./g, '-'));
        if (!isNaN(parsed.getTime())) return parsed.toISOString();
      }
    }

    return undefined;
  }

  /** Normalize Arabic-Indic / Persian digits to ASCII for parsing */
  private normalizeDigits(text: string): string {
    return text.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => {
      const code = d.charCodeAt(0);
      if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
      if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
      return d;
    });
  }

  private classifyStatus(closingDate?: string): TenderStatus {
    if (!closingDate) return TenderStatus.OPEN;
    const closing = new Date(closingDate);
    if (isNaN(closing.getTime())) return TenderStatus.OPEN;
    return closing.getTime() < Date.now()
      ? TenderStatus.CLOSED
      : TenderStatus.OPEN;
  }
}
