import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenderDto } from './dto/create-tender.dto';
import { UpdateTenderDto } from './dto/update-tender.dto';
import { TenderFilterDto } from './dto/tender-filter.dto';
import {
  CreateTenderActivityDto,
  TenderActivityAction,
} from './dto/tender-activity.dto';
import { Prisma } from '@prisma/client';
import * as PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';

export type TenderExportType = 'pdf' | 'excel' | 'csv';

// Resolve the Noto Sans Arabic font path whether we're running from src (dev)
// or dist (production build). nest-cli copies `src/assets/fonts` to
// `dist/assets/fonts`, and __dirname inside the compiled service is
// `dist/src/tenders`, so we walk up to find the assets dir.
const resolveArabicFontPath = (): string | null => {
  const candidates = [
    // production: dist/src/tenders -> dist/assets/fonts
    path.resolve(__dirname, '../../assets/fonts/NotoSansArabic-Regular.ttf'),
    // dev with ts-node: src/tenders -> src/assets/fonts
    path.resolve(__dirname, '../assets/fonts/NotoSansArabic-Regular.ttf'),
    // fallback from project root
    path.resolve(process.cwd(), 'src/assets/fonts/NotoSansArabic-Regular.ttf'),
    path.resolve(process.cwd(), 'dist/assets/fonts/NotoSansArabic-Regular.ttf'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
};

// Detect if a string contains Arabic-script characters (Arabic, Persian,
// Pashto, Urdu all live in Unicode Arabic blocks U+0600-U+06FF and
// U+0750-U+077F plus presentation forms)
const containsArabicScript = (text: string): boolean => {
  if (!text) return false;
  return /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
};

@Injectable()
export class TendersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create a tender */
  async create(dto: CreateTenderDto) {
    const { tags, ...tenderData } = dto;
    try {
      return await this.prisma.tender.create({
        data: {
          ...tenderData,
          publishDate: dto.publishDate ? new Date(dto.publishDate) : null,
          closingDate: dto.closingDate ? new Date(dto.closingDate) : null,
          attachments: dto.attachments as Prisma.InputJsonValue | undefined,
          ...(tags && tags.length > 0
            ? {
                tags: {
                  create: tags.map((tag) => ({ tag })),
                },
              }
            : {}),
        },
        include: {
          tags: true,
          organization: true,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictException(
          'A tender with this source URL already exists',
        );
      }
      throw error;
    }
  }

  /** Upsert by sourceUrl — used by the scraper to avoid duplicates */
  async upsertBySourceUrl(dto: CreateTenderDto) {
    const { tags, ...tenderData } = dto;
    const data = {
      ...tenderData,
      publishDate: dto.publishDate ? new Date(dto.publishDate) : null,
      closingDate: dto.closingDate ? new Date(dto.closingDate) : null,
      attachments: dto.attachments as Prisma.InputJsonValue | undefined,
    };

    return this.prisma.tender.upsert({
      where: { sourceUrl: dto.sourceUrl },
      create: data,
      update: {
        title: data.title,
        description: data.description,
        referenceNo: data.referenceNo,
        publishDate: data.publishDate,
        closingDate: data.closingDate,
        sector: data.sector,
        type: data.type,
        status: data.status,
        projectName: data.projectName,
        location: data.location,
        attachments: data.attachments,
      },
      include: { tags: true, organization: true },
    });
  }

  /** List tenders with pagination, filters, and search */
  async findAll(filters: TenderFilterDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.TenderWhereInput = {};
    const AND: Prisma.TenderWhereInput[] = [];

    if (filters.search) {
      AND.push({
        OR: [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
          { referenceNo: { contains: filters.search, mode: 'insensitive' } },
          { projectName: { contains: filters.search, mode: 'insensitive' } },
        ],
      });
    }
    if (filters.status) AND.push({ status: filters.status });
    if (filters.sector) AND.push({ sector: filters.sector });
    if (filters.type) AND.push({ type: filters.type });
    if (filters.language) AND.push({ language: filters.language });

    if (filters.closingFrom || filters.closingTo) {
      AND.push({
        closingDate: {
          ...(filters.closingFrom ? { gte: new Date(filters.closingFrom) } : {}),
          ...(filters.closingTo ? { lte: new Date(filters.closingTo) } : {}),
        },
      });
    }

    if (filters.closingWithinDays !== undefined) {
      const now = new Date();
      const horizon = new Date();
      horizon.setDate(now.getDate() + filters.closingWithinDays);
      AND.push({
        closingDate: { gte: now, lte: horizon },
        status: 'OPEN',
      });
    }

    if (AND.length > 0) where.AND = AND;

    const [data, total] = await Promise.all([
      this.prisma.tender.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ closingDate: 'asc' }, { createdAt: 'desc' }],
        include: { tags: true, organization: true },
      }),
      this.prisma.tender.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /** Get a single tender by id */
  async findOne(id: string) {
    const tender = await this.prisma.tender.findUnique({
      where: { id },
      include: {
        tags: true,
        organization: true,
        activities: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!tender) {
      throw new NotFoundException(`Tender with id ${id} not found`);
    }
    return tender;
  }

  /** Update a tender */
  async update(id: string, dto: UpdateTenderDto) {
    await this.findOne(id);
    const { tags, ...tenderData } = dto;

    return this.prisma.tender.update({
      where: { id },
      data: {
        ...tenderData,
        ...(dto.publishDate !== undefined && {
          publishDate: dto.publishDate ? new Date(dto.publishDate) : null,
        }),
        ...(dto.closingDate !== undefined && {
          closingDate: dto.closingDate ? new Date(dto.closingDate) : null,
        }),
        ...(dto.attachments !== undefined && {
          attachments: dto.attachments as Prisma.InputJsonValue,
        }),
        ...(tags !== undefined && {
          tags: {
            deleteMany: {},
            create: tags.map((tag) => ({ tag })),
          },
        }),
      },
      include: { tags: true, organization: true },
    });
  }

  /** Delete a tender */
  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.tender.delete({ where: { id } });
  }

  /** Record an activity (viewed, applied, ignored, etc.) */
  async logActivity(
    tenderId: string,
    dto: CreateTenderActivityDto,
    userId?: number,
  ) {
    await this.findOne(tenderId);
    return this.prisma.tenderActivity.create({
      data: {
        tenderId,
        action: dto.action,
        notes: dto.notes,
        userId: userId ?? null,
      },
    });
  }

  // -------------- REPORTS --------------

  /** Summary counts: open vs closed */
  async reportStatusCounts() {
    const byStatus = await this.prisma.tender.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    return byStatus.map((row) => ({
      status: row.status,
      count: row._count._all,
    }));
  }

  /** Sector-wise distribution */
  async reportSectorDistribution() {
    const bySector = await this.prisma.tender.groupBy({
      by: ['sector'],
      _count: { _all: true },
    });
    return bySector.map((row) => ({
      sector: row.sector,
      count: row._count._all,
    }));
  }

  /** Type distribution */
  async reportTypeDistribution() {
    const byType = await this.prisma.tender.groupBy({
      by: ['type'],
      _count: { _all: true },
    });
    return byType.map((row) => ({
      type: row.type,
      count: row._count._all,
    }));
  }

  /** Monthly publish trend (last 12 months) */
  async reportMonthlyTrend() {
    // Raw SQL because Prisma doesn't support DATE_TRUNC directly in groupBy
    const rows = await this.prisma.$queryRaw<
      { month: Date; count: bigint }[]
    >`
      SELECT
        DATE_TRUNC('month', "publishDate") AS month,
        COUNT(*) AS count
      FROM "tenders"
      WHERE "publishDate" IS NOT NULL
        AND "publishDate" >= NOW() - INTERVAL '12 months'
      GROUP BY month
      ORDER BY month ASC
    `;
    return rows.map((r) => ({
      month: r.month.toISOString().slice(0, 7),
      count: Number(r.count),
    }));
  }

  /** Tenders closing within N days (default 7) */
  async reportClosingSoon(days = 7) {
    const now = new Date();
    const horizon = new Date();
    horizon.setDate(now.getDate() + days);
    return this.prisma.tender.findMany({
      where: {
        status: 'OPEN',
        closingDate: { gte: now, lte: horizon },
      },
      orderBy: { closingDate: 'asc' },
      include: { tags: true, organization: true },
    });
  }

  /** Activity aggregation */
  async reportActivityCounts() {
    const rows = await this.prisma.tenderActivity.groupBy({
      by: ['action'],
      _count: { _all: true },
    });
    return rows.map((r) => ({
      action: r.action,
      count: r._count._all,
    }));
  }

  // -------------- EXPORT --------------

  /**
   * Export tenders as PDF, Excel, or CSV. Respects the same filters as the
   * list endpoint so users can export exactly what they're seeing.
   */
  async exportTenders(
    filters: TenderFilterDto,
    format: TenderExportType,
  ): Promise<{ buffer: Buffer; contentType: string; fileName: string }> {
    // Build the same WHERE clause used by findAll, but without pagination
    const where: Prisma.TenderWhereInput = {};
    const AND: Prisma.TenderWhereInput[] = [];

    if (filters.search) {
      AND.push({
        OR: [
          { title: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
          { referenceNo: { contains: filters.search, mode: 'insensitive' } },
          { projectName: { contains: filters.search, mode: 'insensitive' } },
        ],
      });
    }
    if (filters.status) AND.push({ status: filters.status });
    if (filters.sector) AND.push({ sector: filters.sector });
    if (filters.type) AND.push({ type: filters.type });
    if (filters.language) AND.push({ language: filters.language });

    if (filters.closingFrom || filters.closingTo) {
      AND.push({
        closingDate: {
          ...(filters.closingFrom ? { gte: new Date(filters.closingFrom) } : {}),
          ...(filters.closingTo ? { lte: new Date(filters.closingTo) } : {}),
        },
      });
    }

    if (AND.length > 0) where.AND = AND;

    const tenders = await this.prisma.tender.findMany({
      where,
      orderBy: [{ publishDate: 'desc' }, { createdAt: 'desc' }],
      include: { tags: true, organization: true },
    });

    switch (format) {
      case 'pdf':
        return this.exportPdf(tenders);
      case 'csv':
        return this.exportCsv(tenders);
      case 'excel':
      default:
        return this.exportExcel(tenders);
    }
  }

  private async exportPdf(tenders: any[]): Promise<{
    buffer: Buffer;
    contentType: string;
    fileName: string;
  }> {
    return new Promise((resolve) => {
      const doc = new PDFDocument({
        margin: 30,
        size: 'A4',
        layout: 'landscape',
      });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: 'application/pdf',
          fileName: `tenders-report-${Date.now()}.pdf`,
        });
      });

      // Register Arabic font if available. pdfkit uses fontkit under the hood
      // which performs OpenType shaping, so letters will join correctly.
      const arabicFontPath = resolveArabicFontPath();
      const ARABIC_FONT = 'NotoSansArabic';
      const LATIN_FONT = 'Helvetica';
      const LATIN_BOLD = 'Helvetica-Bold';

      if (arabicFontPath) {
        try {
          doc.registerFont(ARABIC_FONT, arabicFontPath);
        } catch (err) {
          // If registration fails we'll just fall back to Helvetica
        }
      }

      // Helper: pick the right font based on cell content
      const fontFor = (text: string): string => {
        if (arabicFontPath && containsArabicScript(text)) return ARABIC_FONT;
        return LATIN_FONT;
      };

      // Helper: draw text with font auto-selected and features enabled for shaping
      const drawCell = (
        text: string,
        x: number,
        y: number,
        width: number,
        opts: { bold?: boolean; align?: 'left' | 'right' | 'center' } = {},
      ) => {
        const isArabic = arabicFontPath && containsArabicScript(text);
        const font = isArabic ? ARABIC_FONT : opts.bold ? LATIN_BOLD : LATIN_FONT;
        doc.font(font);
        doc.text(text, x, y, {
          width,
          align: opts.align || (isArabic ? 'right' : 'left'),
          features: isArabic ? ['rlig', 'liga', 'calt'] : undefined,
        });
      };

      // Title
      doc.fontSize(18).font(LATIN_BOLD).text('Tender Report', { align: 'center' });
      doc.moveDown();
      doc
        .fontSize(10)
        .font(LATIN_FONT)
        .text(`Generated: ${new Date().toISOString().split('T')[0]}`, {
          align: 'center',
        });
      doc.moveDown(2);

      // Table header
      const headers = [
        '#',
        'Title',
        'Type',
        'Sector',
        'Status',
        'Ref No.',
        'Publish',
        'Closing',
      ];
      const colWidths = [25, 220, 60, 60, 55, 80, 75, 75];
      let x = 30;
      const headerY = doc.y;

      doc.fontSize(9).font(LATIN_BOLD);
      headers.forEach((header, i) => {
        doc.text(header, x, headerY, { width: colWidths[i] });
        x += colWidths[i] + 6;
      });

      doc.moveDown();
      doc.moveTo(30, doc.y).lineTo(780, doc.y).stroke();
      doc.moveDown(0.5);

      // Table rows
      doc.fontSize(8);
      tenders.forEach((t, index) => {
        if (doc.y > 520) {
          doc.addPage();
        }
        x = 30;
        const y = doc.y;
        const title = (t.title || '').slice(0, 200);
        const rowData = [
          String(index + 1),
          title,
          t.type || '',
          t.sector || '',
          t.status || '',
          t.referenceNo || '—',
          t.publishDate
            ? new Date(t.publishDate).toISOString().split('T')[0]
            : '—',
          t.closingDate
            ? new Date(t.closingDate).toISOString().split('T')[0]
            : '—',
        ];
        // Estimate row height from the title (which wraps)
        doc.font(fontFor(title));
        const titleHeight = doc.heightOfString(title, {
          width: colWidths[1],
          features: containsArabicScript(title)
            ? ['rlig', 'liga', 'calt']
            : undefined,
        });
        rowData.forEach((cell, i) => {
          drawCell(cell, x, y, colWidths[i]);
          x += colWidths[i] + 6;
        });
        doc.y = y + Math.max(titleHeight, 12) + 2;
      });

      // Summary footer
      doc.moveDown(2);
      doc.font(LATIN_BOLD).fontSize(10);
      doc.text(`Total Tenders: ${tenders.length}`);
      const openCount = tenders.filter((t) => t.status === 'OPEN').length;
      const closedCount = tenders.filter((t) => t.status === 'CLOSED').length;
      doc.text(`Open: ${openCount}   Closed: ${closedCount}`);

      doc.end();
    });
  }

  private async exportExcel(tenders: any[]): Promise<{
    buffer: Buffer;
    contentType: string;
    fileName: string;
  }> {
    const rows = tenders.map((t, i) => ({
      '#': i + 1,
      Title: t.title,
      Type: t.type,
      Sector: t.sector,
      Status: t.status,
      'Reference No.': t.referenceNo || '',
      'Project Name': t.projectName || '',
      Location: t.location || '',
      'Publish Date': t.publishDate
        ? new Date(t.publishDate).toISOString().split('T')[0]
        : '',
      'Closing Date': t.closingDate
        ? new Date(t.closingDate).toISOString().split('T')[0]
        : '',
      'Priority Score':
        t.priorityScore !== null && t.priorityScore !== undefined
          ? t.priorityScore.toFixed(2)
          : '',
      Tags: Array.isArray(t.tags) ? t.tags.map((x: any) => x.tag).join(', ') : '',
      'Source URL': t.sourceUrl,
      Description: (t.description || '').slice(0, 1000),
    }));

    const ws = XLSX.utils.json_to_sheet(rows);

    // Set column widths for readability
    (ws as any)['!cols'] = [
      { wch: 5 },   // #
      { wch: 50 },  // Title
      { wch: 12 },  // Type
      { wch: 12 },  // Sector
      { wch: 10 },  // Status
      { wch: 15 },  // Ref
      { wch: 20 },  // Project
      { wch: 15 },  // Location
      { wch: 12 },  // Publish
      { wch: 12 },  // Closing
      { wch: 10 },  // Priority
      { wch: 25 },  // Tags
      { wch: 40 },  // Source URL
      { wch: 60 },  // Description
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tenders');

    const buffer = Buffer.from(
      XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }),
    );

    return {
      buffer,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName: `tenders-report-${Date.now()}.xlsx`,
    };
  }

  private async exportCsv(tenders: any[]): Promise<{
    buffer: Buffer;
    contentType: string;
    fileName: string;
  }> {
    const headers = [
      'Title',
      'Type',
      'Sector',
      'Status',
      'Reference No.',
      'Project Name',
      'Location',
      'Publish Date',
      'Closing Date',
      'Priority Score',
      'Tags',
      'Source URL',
    ];

    const escape = (v: any): string => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };

    const rows = tenders.map((t) =>
      [
        escape(t.title),
        escape(t.type),
        escape(t.sector),
        escape(t.status),
        escape(t.referenceNo),
        escape(t.projectName),
        escape(t.location),
        escape(
          t.publishDate
            ? new Date(t.publishDate).toISOString().split('T')[0]
            : '',
        ),
        escape(
          t.closingDate
            ? new Date(t.closingDate).toISOString().split('T')[0]
            : '',
        ),
        escape(
          t.priorityScore !== null && t.priorityScore !== undefined
            ? t.priorityScore.toFixed(2)
            : '',
        ),
        escape(
          Array.isArray(t.tags) ? t.tags.map((x: any) => x.tag).join('; ') : '',
        ),
        escape(t.sourceUrl),
      ].join(','),
    );

    // BOM for Excel to recognize UTF-8 (important for Pashto/Dari text)
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');

    return {
      buffer: Buffer.from(csv, 'utf-8'),
      contentType: 'text/csv; charset=utf-8',
      fileName: `tenders-report-${Date.now()}.csv`,
    };
  }

  /** Full summary for dashboard cards */
  async reportSummary() {
    const now = new Date();
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(now.getDate() + 7);

    const [total, open, closed, closingSoon, highPriority] = await Promise.all([
      this.prisma.tender.count(),
      this.prisma.tender.count({ where: { status: 'OPEN' } }),
      this.prisma.tender.count({ where: { status: 'CLOSED' } }),
      this.prisma.tender.count({
        where: {
          status: 'OPEN',
          closingDate: { gte: now, lte: sevenDaysFromNow },
        },
      }),
      this.prisma.tender.count({
        where: { priorityScore: { gte: 0.7 } },
      }),
    ]);

    return {
      total,
      open,
      closed,
      closingSoon,
      highPriority,
    };
  }
}
