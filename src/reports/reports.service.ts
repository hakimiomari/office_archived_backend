import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportFilterDto, ExportFilterDto } from './dto/report-filter.dto';
import * as PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private buildWhere(filters: ReportFilterDto): Prisma.LicenseWhereInput {
    const where: Prisma.LicenseWhereInput = {};

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

    if (filters.province) {
      where.province = { contains: filters.province, mode: 'insensitive' };
    }

    return where;
  }

  async getLicenseReport(filters: ReportFilterDto) {
    const where = this.buildWhere(filters);
    const page = filters.page ? parseInt(filters.page) : 1;
    const limit = filters.limit ? parseInt(filters.limit) : 10;
    const skip = (page - 1) * limit;

    const [data, total, aggregations] = await Promise.all([
      this.prisma.license.findMany({
        where,
        skip,
        take: limit,
        orderBy: { issueDate: 'desc' },
        include: { contracts: true },
      }),
      this.prisma.license.count({ where }),
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

  private async getAggregations(where: Prisma.LicenseWhereInput) {
    const [byType, byStatus, totalCount] = await Promise.all([
      this.prisma.license.groupBy({
        by: ['licenseType'],
        where,
        _count: { id: true },
      }),
      this.prisma.license.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
      this.prisma.license.count({ where }),
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

    const [byProvince, byType, byStatus, allLicenses] = await Promise.all([
      this.prisma.license.groupBy({
        by: ['province'],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
      }),
      this.prisma.license.groupBy({
        by: ['licenseType'],
        where,
        _count: { id: true },
      }),
      this.prisma.license.groupBy({
        by: ['status'],
        where,
        _count: { id: true },
      }),
      this.prisma.license.findMany({
        where,
        select: { issueDate: true, licenseType: true },
        orderBy: { issueDate: 'asc' },
      }),
    ]);

    // Build monthly trend from actual license data
    const monthlyMap = new Map<string, { SMALL: number; LARGE: number }>();
    for (const lic of allLicenses) {
      const d = new Date(lic.issueDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!monthlyMap.has(key)) {
        monthlyMap.set(key, { SMALL: 0, LARGE: 0 });
      }
      monthlyMap.get(key)![lic.licenseType]++;
    }

    const monthlyTrend = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, counts]) => ({
        month,
        small: counts.SMALL,
        large: counts.LARGE,
        total: counts.SMALL + counts.LARGE,
      }));

    return {
      byProvince: byProvince.map((p) => ({
        province: p.province,
        count: p._count.id,
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
    };
  }

  async exportLicenses(filters: ExportFilterDto): Promise<{
    buffer: Buffer;
    contentType: string;
    fileName: string;
  }> {
    const where = this.buildWhere(filters);
    const licenses = await this.prisma.license.findMany({
      where,
      orderBy: { issueDate: 'desc' },
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
      const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => {
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: 'application/pdf',
          fileName: `licenses-report-${Date.now()}.pdf`,
        });
      });

      // Title
      doc.fontSize(18).text('Mining License Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`Generated: ${new Date().toISOString().split('T')[0]}`, { align: 'center' });
      doc.moveDown(2);

      // Table header
      const headers = ['#', 'License ID', 'Type', 'Status', 'Province', 'District', 'Issue Date', 'Expiry Date'];
      const colWidths = [30, 210, 70, 70, 80, 80, 80, 80];
      let x = 30;
      const headerY = doc.y;

      doc.fontSize(9).font('Helvetica-Bold');
      headers.forEach((header, i) => {
        doc.text(header, x, headerY, { width: colWidths[i] });
        x += colWidths[i] + 10;
      });

      doc.moveDown();
      doc.moveTo(30, doc.y).lineTo(780, doc.y).stroke();
      doc.moveDown(0.5);

      // Table rows
      doc.font('Helvetica').fontSize(8);
      licenses.forEach((lic, index) => {
        if (doc.y > 520) {
          doc.addPage();
        }
        x = 30;
        const y = doc.y;
        const rowData = [
          String(index + 1),
          lic.id,
          lic.licenseType,
          lic.status,
          lic.province,
          lic.district,
          new Date(lic.issueDate).toISOString().split('T')[0],
          new Date(lic.expiryDate).toISOString().split('T')[0],
        ];
        rowData.forEach((cell, i) => {
          doc.text(cell, x, y, { width: colWidths[i] });
          x += colWidths[i] + 10;
        });
        doc.moveDown();
      });

      // Summary
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
      'License ID': lic.id,
      'License Type': lic.licenseType,
      Status: lic.status,
      Province: lic.province,
      District: lic.district,
      'Issue Date': new Date(lic.issueDate).toISOString().split('T')[0],
      'Expiry Date': new Date(lic.expiryDate).toISOString().split('T')[0],
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Licenses');

    const buffer = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

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
      'License ID',
      'License Type',
      'Status',
      'Province',
      'District',
      'Issue Date',
      'Expiry Date',
    ];

    const rows = licenses.map((lic) =>
      [
        lic.id,
        lic.licenseType,
        lic.status,
        lic.province,
        lic.district,
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
}
