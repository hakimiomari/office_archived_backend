import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportFilterDto, ExportFilterDto } from './dto/report-filter.dto';
import {
  AuctionReportFilterDto,
  AuctionExportFilterDto,
} from './dto/auction-report-filter.dto';
import * as PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(
    filters: ReportFilterDto,
  ): Prisma.MiningLicenseWhereInput {
    const where: Prisma.MiningLicenseWhereInput = {};

    if (filters.from || filters.to) {
      where.issueDate = {};
      if (filters.from) where.issueDate.gte = new Date(filters.from);
      if (filters.to) where.issueDate.lte = new Date(filters.to);
    }

    if (filters.licenseType) {
      where.licenseType = filters.licenseType;
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.mineAddress) {
      where.mineAddress = {
        contains: filters.mineAddress,
        mode: 'insensitive',
      };
    }

    return where;
  }

  async getLicenseReport(filters: ReportFilterDto) {
    const where = this.buildWhere(filters);
    const page = filters.page ? parseInt(filters.page) : 1;
    const limit = filters.limit ? parseInt(filters.limit) : 10;
    const skip = (page - 1) * limit;

    const [data, total, aggregations] = await Promise.all([
      this.prisma.miningLicense.findMany({
        where,
        skip,
        take: limit,
        orderBy: { issueDate: 'desc' },
        include: { company: true, mineralType: true },
      }),
      this.prisma.miningLicense.count({ where }),
      this.getAggregations(where),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      aggregations,
    };
  }

  private async getAggregations(where: Prisma.MiningLicenseWhereInput) {
    const [byType, byStatus, totalCount] = await Promise.all([
      this.prisma.miningLicense.groupBy({
        by: ['licenseType'],
        where,
        _count: { id: true },
      }),
      this.prisma.miningLicense.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
      this.prisma.miningLicense.count({ where }),
    ]);

    return {
      totalLicenses: totalCount,
      byType: byType.map((t) => ({
        type: t.licenseType,
        count: t._count.id,
      })),
      byStatus: byStatus.map((s) => ({
        status: s.status,
        count: s._count.id,
      })),
    };
  }

  async getChartData(filters: ReportFilterDto) {
    const where = this.buildWhere(filters);

    const [byMineralGroup, byType, byStatus, allLicenses] = await Promise.all([
      this.prisma.miningLicense.groupBy({
        by: ['mieralTypeId'],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      this.prisma.miningLicense.groupBy({
        by: ['licenseType'],
        where,
        _count: { id: true },
      }),
      this.prisma.miningLicense.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
      this.prisma.miningLicense.findMany({
        where,
        select: { issueDate: true, expiryDate: true },
      }),
    ]);

    // Resolve mineral type names for the byMineral breakdown
    const minerals = await this.prisma.mineralType.findMany({
      where: { id: { in: byMineralGroup.map((m) => m.mieralTypeId) } },
      select: { id: true, name: true },
    });
    const mineralName = new Map(minerals.map((m) => [m.id, m.name]));

    // Trends are derived ONLY from issueDate (licenses issued) and
    // expiryDate (licenses expiring) — never createdAt/updatedAt.
    const monthKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const yearKey = (d: Date) => `${d.getFullYear()}`;

    const monthlyMap = new Map<
      string,
      { issued: number; expiring: number }
    >();
    const yearlyMap = new Map<
      string,
      { issued: number; expiring: number }
    >();

    const bump = (
      map: Map<string, { issued: number; expiring: number }>,
      key: string,
      field: 'issued' | 'expiring',
    ) => {
      if (!map.has(key)) map.set(key, { issued: 0, expiring: 0 });
      map.get(key)![field]++;
    };

    for (const lic of allLicenses) {
      const issued = new Date(lic.issueDate);
      const expiry = new Date(lic.expiryDate);
      bump(monthlyMap, monthKey(issued), 'issued');
      bump(monthlyMap, monthKey(expiry), 'expiring');
      bump(yearlyMap, yearKey(issued), 'issued');
      bump(yearlyMap, yearKey(expiry), 'expiring');
    }

    const monthlyTrend = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, c]) => ({
        month,
        issued: c.issued,
        expiring: c.expiring,
        total: c.issued + c.expiring,
      }));

    const yearlyTrend = Array.from(yearlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, c]) => ({
        year,
        issued: c.issued,
        expiring: c.expiring,
        total: c.issued + c.expiring,
      }));

    return {
      byMineral: byMineralGroup.map((m) => ({
        mineral: mineralName.get(m.mieralTypeId) ?? m.mieralTypeId,
        count: m._count.id,
      })),
      byType: byType.map((t) => ({
        type: t.licenseType,
        count: t._count.id,
      })),
      byStatus: byStatus.map((s) => ({
        status: s.status,
        count: s._count.id,
      })),
      monthlyTrend,
      yearlyTrend,
    };
  }

  async exportLicenses(filters: ExportFilterDto): Promise<{
    buffer: Buffer;
    contentType: string;
    fileName: string;
  }> {
    const where = this.buildWhere(filters);
    const licenses = await this.prisma.miningLicense.findMany({
      where,
      orderBy: { issueDate: 'desc' },
      include: { company: true, mineralType: true },
    });

    const exportType = filters.type || 'excel';

    switch (exportType) {
      case 'pdf':
        return this.exportPdf(licenses);
      case 'csv':
        return this.exportCsv(licenses);
      case 'excel':
      default:
        return this.exportExcel(licenses);
    }
  }

  private async exportPdf(licenses: any[]): Promise<{
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
          fileName: `licenses-report-${Date.now()}.pdf`,
        });
      });

      doc.fontSize(18).text('Mining License Report', { align: 'center' });
      doc.moveDown();
      doc
        .fontSize(10)
        .text(`Generated: ${new Date().toISOString().split('T')[0]}`, {
          align: 'center',
        });
      doc.moveDown(2);

      const headers = [
        '#',
        'Company',
        'Mineral',
        'Type',
        'Status',
        'Address',
        'Issue Date',
        'Expiry Date',
      ];
      const colWidths = [25, 140, 90, 80, 75, 140, 75, 75];
      let x = 30;
      const headerY = doc.y;

      doc.fontSize(9).font('Helvetica-Bold');
      headers.forEach((header, i) => {
        doc.text(header, x, headerY, { width: colWidths[i] });
        x += colWidths[i] + 8;
      });

      doc.moveDown();
      doc.moveTo(30, doc.y).lineTo(780, doc.y).stroke();
      doc.moveDown(0.5);

      doc.font('Helvetica').fontSize(8);
      licenses.forEach((lic, index) => {
        if (doc.y > 520) {
          doc.addPage();
        }
        x = 30;
        const y = doc.y;
        const rowData = [
          String(index + 1),
          lic.company?.name ?? '—',
          lic.mineralType?.name ?? '—',
          lic.licenseType,
          lic.status,
          lic.mineAddress,
          new Date(lic.issueDate).toISOString().split('T')[0],
          new Date(lic.expiryDate).toISOString().split('T')[0],
        ];
        rowData.forEach((cell, i) => {
          doc.text(String(cell), x, y, { width: colWidths[i] });
          x += colWidths[i] + 8;
        });
        doc.moveDown();
      });

      doc.moveDown(2);
      doc.font('Helvetica-Bold').fontSize(10);
      doc.text(`Total Licenses: ${licenses.length}`);

      doc.end();
    });
  }

  private async exportExcel(licenses: any[]): Promise<{
    buffer: Buffer;
    contentType: string;
    fileName: string;
  }> {
    const rows = licenses.map((lic, i) => ({
      '#': i + 1,
      Company: lic.company?.name ?? '',
      Mineral: lic.mineralType?.name ?? '',
      'License Type': lic.licenseType,
      Status: lic.status,
      Address: lic.mineAddress,
      'Issue Date': new Date(lic.issueDate).toISOString().split('T')[0],
      'Expiry Date': new Date(lic.expiryDate).toISOString().split('T')[0],
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Licenses');

    const buffer = Buffer.from(
      XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }),
    );

    return {
      buffer,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName: `licenses-report-${Date.now()}.xlsx`,
    };
  }

  private async exportCsv(licenses: any[]): Promise<{
    buffer: Buffer;
    contentType: string;
    fileName: string;
  }> {
    const headers = [
      'Company',
      'Mineral',
      'License Type',
      'Status',
      'Address',
      'Issue Date',
      'Expiry Date',
    ];

    const rows = licenses.map((lic) =>
      [
        lic.company?.name ?? '',
        lic.mineralType?.name ?? '',
        lic.licenseType,
        lic.status,
        `"${String(lic.mineAddress).replace(/"/g, '""')}"`,
        new Date(lic.issueDate).toISOString().split('T')[0],
        new Date(lic.expiryDate).toISOString().split('T')[0],
      ].join(','),
    );

    const csv = [headers.join(','), ...rows].join('\n');

    return {
      buffer: Buffer.from(csv),
      contentType: 'text/csv',
      fileName: `licenses-report-${Date.now()}.csv`,
    };
  }

  // ==========================================================================
  //                                 AUCTIONS
  // ==========================================================================

  private buildAuctionWhere(
    filters: AuctionReportFilterDto,
  ): Prisma.AuctionWhereInput {
    const where: Prisma.AuctionWhereInput = {};

    if (filters.from || filters.to) {
      where.auctionDate = {};
      if (filters.from) where.auctionDate.gte = new Date(filters.from);
      if (filters.to) where.auctionDate.lte = new Date(filters.to);
    }
    if (filters.mineralTypeId) where.mieralTypeId = filters.mineralTypeId;
    if (filters.provinceId) where.provinceId = Number(filters.provinceId);
    if (filters.priceCurrency) where.priceCurrency = filters.priceCurrency;

    return where;
  }

  async getAuctionReport(filters: AuctionReportFilterDto) {
    const where = this.buildAuctionWhere(filters);
    const page = filters.page ? parseInt(filters.page) : 1;
    const limit = filters.limit ? parseInt(filters.limit) : 10;
    const skip = (page - 1) * limit;

    const [data, total, aggregations] = await Promise.all([
      this.prisma.auction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { auctionDate: 'desc' },
        include: { mineralType: true, province: true },
      }),
      this.prisma.auction.count({ where }),
      this.getAuctionAggregations(where),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
      aggregations,
    };
  }

  private async getAuctionAggregations(where: Prisma.AuctionWhereInput) {
    // Counts + per-currency money totals (mass * unitPrice) and royalty
    // (mass * unitPrice * royalty / 100). String fields are parsed in JS;
    // AFN/USD are bucketed because they can't be summed together.
    const rows = await this.prisma.auction.findMany({
      where,
      select: {
        mass: true,
        unitPrice: true,
        priceCurrency: true,
        royalty: true,
      },
    });

    const totalsMap = new Map<string, number>();
    const royaltiesMap = new Map<string, number>();
    for (const r of rows) {
      const mass = parseFloat(r.mass);
      const price = parseFloat(r.unitPrice);
      if (!Number.isFinite(mass) || !Number.isFinite(price)) continue;
      const cur = r.priceCurrency ?? 'AFN';
      const line = mass * price;
      totalsMap.set(cur, (totalsMap.get(cur) ?? 0) + line);
      if (r.royalty != null) {
        royaltiesMap.set(
          cur,
          (royaltiesMap.get(cur) ?? 0) + line * (r.royalty / 100),
        );
      }
    }
    return {
      totalAuctions: rows.length,
      totalsByCurrency: Array.from(totalsMap.entries()).map(
        ([currency, total]) => ({ currency, total }),
      ),
      royaltyByCurrency: Array.from(royaltiesMap.entries()).map(
        ([currency, royalty]) => ({ currency, royalty }),
      ),
    };
  }

  async getAuctionChartData(filters: AuctionReportFilterDto) {
    const where = this.buildAuctionWhere(filters);

    const [byMineralGroup, byProvinceGroup, byCurrency, rows] =
      await Promise.all([
        this.prisma.auction.groupBy({
          by: ['mieralTypeId'],
          where,
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
        }),
        this.prisma.auction.groupBy({
          by: ['provinceId'],
          where,
          _count: { id: true },
          orderBy: { _count: { id: 'desc' } },
        }),
        this.prisma.auction.groupBy({
          by: ['priceCurrency'],
          where,
          _count: { id: true },
        }),
        this.prisma.auction.findMany({
          where,
          select: { auctionDate: true },
          orderBy: { auctionDate: 'asc' },
        }),
      ]);

    const minerals = await this.prisma.mineralType.findMany({
      where: { id: { in: byMineralGroup.map((m) => m.mieralTypeId) } },
      select: { id: true, name: true },
    });
    const mineralName = new Map(minerals.map((m) => [m.id, m.name]));

    const provinceIds = byProvinceGroup
      .map((p) => p.provinceId)
      .filter((id): id is number => id != null);
    const provinces = await this.prisma.province.findMany({
      where: { id: { in: provinceIds } },
      select: { id: true, name: true },
    });
    const provinceName = new Map(provinces.map((p) => [p.id, p.name]));

    // Monthly + yearly trends keyed strictly by auctionDate.
    const monthKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const yearKey = (d: Date) => `${d.getFullYear()}`;

    const monthly = new Map<string, number>();
    const yearly = new Map<string, number>();
    for (const r of rows) {
      const d = new Date(r.auctionDate);
      const mk = monthKey(d);
      const yk = yearKey(d);
      monthly.set(mk, (monthly.get(mk) ?? 0) + 1);
      yearly.set(yk, (yearly.get(yk) ?? 0) + 1);
    }

    const monthlyTrend = Array.from(monthly.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));
    const yearlyTrend = Array.from(yearly.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([year, count]) => ({ year, count }));

    return {
      byMineral: byMineralGroup.map((m) => ({
        mineral: mineralName.get(m.mieralTypeId) ?? m.mieralTypeId,
        count: m._count.id,
      })),
      byProvince: byProvinceGroup.map((p) => ({
        province:
          p.provinceId == null
            ? 'Unspecified'
            : (provinceName.get(p.provinceId) ?? `#${p.provinceId}`),
        count: p._count.id,
      })),
      byCurrency: byCurrency.map((c) => ({
        currency: c.priceCurrency,
        count: c._count.id,
      })),
      monthlyTrend,
      yearlyTrend,
    };
  }

  async exportAuctions(filters: AuctionExportFilterDto): Promise<{
    buffer: Buffer;
    contentType: string;
    fileName: string;
  }> {
    const where = this.buildAuctionWhere(filters);
    const auctions = await this.prisma.auction.findMany({
      where,
      orderBy: { auctionDate: 'desc' },
      include: { mineralType: true, province: true },
    });

    const exportType = filters.type || 'excel';

    switch (exportType) {
      case 'pdf':
        return this.exportAuctionsPdf(auctions);
      case 'csv':
        return this.exportAuctionsCsv(auctions);
      case 'excel':
      default:
        return this.exportAuctionsExcel(auctions);
    }
  }

  private currencySym(c?: string | null) {
    return c === 'USD' ? '$' : (c ?? 'AFN');
  }

  private async exportAuctionsPdf(auctions: any[]): Promise<{
    buffer: Buffer;
    contentType: string;
    fileName: string;
  }> {
    return new Promise((resolve) => {
      const doc = new (PDFDocument as any)({
        margin: 30,
        size: 'A4',
        layout: 'landscape',
      });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => {
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: 'application/pdf',
          fileName: `auctions-report-${Date.now()}.pdf`,
        });
      });

      doc.fontSize(18).text('Auctions Report', { align: 'center' });
      doc.moveDown();
      doc
        .fontSize(10)
        .text(`Generated: ${new Date().toISOString().split('T')[0]}`, {
          align: 'center',
        });
      doc.moveDown(2);

      const headers = [
        '#',
        'Date',
        'Mineral',
        'Province',
        'Round',
        'Mass',
        'Unit Price',
        'Royalty',
      ];
      const colWidths = [25, 75, 110, 100, 70, 90, 110, 60];
      let x = 30;
      const headerY = doc.y;

      doc.fontSize(9).font('Helvetica-Bold');
      headers.forEach((h, i) => {
        doc.text(h, x, headerY, { width: colWidths[i] });
        x += colWidths[i] + 8;
      });
      doc.moveDown();
      doc.moveTo(30, doc.y).lineTo(780, doc.y).stroke();
      doc.moveDown(0.5);

      doc.font('Helvetica').fontSize(8);
      auctions.forEach((a, index) => {
        if (doc.y > 520) doc.addPage();
        x = 30;
        const y = doc.y;
        const sym = this.currencySym(a.priceCurrency);
        const row = [
          String(index + 1),
          new Date(a.auctionDate).toISOString().split('T')[0],
          a.mineralType?.name ?? '—',
          a.province?.name ?? '—',
          a.round ?? '—',
          `${a.mass} ${a.unit}`,
          `${a.unitPrice} ${sym}`,
          a.royalty != null ? `${a.royalty}%` : '—',
        ];
        row.forEach((cell, i) => {
          doc.text(String(cell), x, y, { width: colWidths[i] });
          x += colWidths[i] + 8;
        });
        doc.moveDown();
      });

      doc.moveDown(2);
      doc.font('Helvetica-Bold').fontSize(10);
      doc.text(`Total Auctions: ${auctions.length}`);
      doc.end();
    });
  }

  private async exportAuctionsExcel(auctions: any[]): Promise<{
    buffer: Buffer;
    contentType: string;
    fileName: string;
  }> {
    const rows = auctions.map((a, i) => {
      const sym = this.currencySym(a.priceCurrency);
      return {
        '#': i + 1,
        'Auction Date': new Date(a.auctionDate).toISOString().split('T')[0],
        Mineral: a.mineralType?.name ?? '',
        Province: a.province?.name ?? '',
        Round: a.round ?? '',
        Mass: `${a.mass} ${a.unit}`,
        'Unit Price': `${a.unitPrice} ${sym}`,
        Currency: a.priceCurrency,
        Royalty: a.royalty != null ? `${a.royalty}%` : '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Auctions');

    const buffer = Buffer.from(
      XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }),
    );

    return {
      buffer,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileName: `auctions-report-${Date.now()}.xlsx`,
    };
  }

  private async exportAuctionsCsv(auctions: any[]): Promise<{
    buffer: Buffer;
    contentType: string;
    fileName: string;
  }> {
    const headers = [
      'Auction Date',
      'Mineral',
      'Province',
      'Round',
      'Mass',
      'Unit Price',
      'Currency',
      'Royalty',
    ];

    const rows = auctions.map((a) =>
      [
        new Date(a.auctionDate).toISOString().split('T')[0],
        a.mineralType?.name ?? '',
        a.province?.name ?? '',
        `"${(a.round ?? '').replace(/"/g, '""')}"`,
        `${a.mass} ${a.unit}`,
        `${a.unitPrice}`,
        a.priceCurrency,
        a.royalty != null ? `${a.royalty}%` : '',
      ].join(','),
    );
    const csv = [headers.join(','), ...rows].join('\n');

    return {
      buffer: Buffer.from(csv),
      contentType: 'text/csv',
      fileName: `auctions-report-${Date.now()}.csv`,
    };
  }
}
