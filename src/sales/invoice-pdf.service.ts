import { Injectable } from '@nestjs/common';
// pdfkit is a CommonJS module whose entry exports the constructor directly,
// so `import PDFDocument from 'pdfkit'` compiles to `.default` which is undefined.
// Use require() to grab the constructor as-is.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');

type InvoiceInput = {
  invoiceNo: string;
  saleDate: Date;
  dueDate: Date | null;
  customer: { name: string; phone: string | null; email: string | null; address: string | null } | null;
  items: {
    item: { name: string; sku: string | null; unit: string };
    quantity: number;
    unitPrice: number;
    discount: number;
    lineTotal: number;
  }[];
  subtotal: number;
  discount: number;
  tax: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: string;
  notes: string | null;
};

type CustomerReportInput = {
  customer: {
    id: number;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    creditLimit: number;
    totalOwed: number;
  };
  range: { from: Date | null; to: Date | null };
  stats: {
    salesCount: number;
    totalSpent: number;
    totalPaid: number;
    totalRemaining: number;
  };
  sales: {
    invoiceNo: string;
    saleDate: Date;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    paymentStatus: string;
  }[];
  payments: {
    paymentDate: Date;
    amount: number;
    method: string;
    invoiceNo: string | null;
    referenceNo: string | null;
  }[];
};

type SalesReportInput = {
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  range: { start: Date; end: Date };
  warehouse: { id: number; name: string } | null;
  financial: {
    revenue: number;
    expenses: number;
    profit: number;
    subtotal: number;
    discount: number;
    tax: number;
    cashReceived: number;
    pendingPayments: number;
  };
  counts: { salesCount: number; purchasesCount: number };
  byStatus: { status: string; count: number; total: number }[];
  topProducts: {
    itemId: number;
    name: string;
    sku: string | null;
    quantity: number;
    revenue: number;
  }[];
  revenueTrend: { day: Date; revenue: number; count: number }[];
};

@Injectable()
export class InvoicePdfService {
  async generate(sale: InvoiceInput): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (c) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(chunks))),
    );

    const fmt = (v: number) =>
      v.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    // Header
    doc
      .fontSize(20)
      .fillColor('#111')
      .text('INVOICE', { align: 'right' })
      .moveDown(0.2);

    doc
      .fontSize(10)
      .fillColor('#555')
      .text(`Invoice No: ${sale.invoiceNo}`, { align: 'right' })
      .text(`Date: ${sale.saleDate.toLocaleDateString()}`, { align: 'right' });
    if (sale.dueDate) {
      doc.text(`Due: ${sale.dueDate.toLocaleDateString()}`, { align: 'right' });
    }
    doc.moveDown(1);

    // Customer block
    doc.fontSize(11).fillColor('#111').text('Bill To:');
    doc.fontSize(10).fillColor('#333');
    if (sale.customer) {
      doc.text(sale.customer.name);
      if (sale.customer.phone) doc.text(sale.customer.phone);
      if (sale.customer.email) doc.text(sale.customer.email);
      if (sale.customer.address) doc.text(sale.customer.address);
    } else {
      doc.text('Walk-in customer');
    }
    doc.moveDown(1);

    // Items table
    const tableTop = doc.y;
    const cols = {
      item: 50,
      qty: 290,
      price: 340,
      disc: 410,
      total: 470,
    };

    doc.fontSize(10).fillColor('#111').font('Helvetica-Bold');
    doc.text('Item', cols.item, tableTop);
    doc.text('Qty', cols.qty, tableTop, { width: 40, align: 'right' });
    doc.text('Price', cols.price, tableTop, { width: 60, align: 'right' });
    doc.text('Disc', cols.disc, tableTop, { width: 50, align: 'right' });
    doc.text('Total', cols.total, tableTop, { width: 80, align: 'right' });

    doc
      .moveTo(50, tableTop + 15)
      .lineTo(550, tableTop + 15)
      .strokeColor('#999')
      .stroke();

    doc.font('Helvetica').fillColor('#333');
    let y = tableTop + 22;
    for (const li of sale.items) {
      const label = li.item.sku
        ? `${li.item.name} (${li.item.sku})`
        : li.item.name;
      doc.text(label, cols.item, y, { width: 230 });
      doc.text(`${li.quantity} ${li.item.unit}`, cols.qty, y, {
        width: 40,
        align: 'right',
      });
      doc.text(fmt(li.unitPrice), cols.price, y, {
        width: 60,
        align: 'right',
      });
      doc.text(fmt(li.discount), cols.disc, y, { width: 50, align: 'right' });
      doc.text(fmt(li.lineTotal), cols.total, y, {
        width: 80,
        align: 'right',
      });
      y += 20;
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
    }

    // Totals
    y += 10;
    doc
      .moveTo(300, y)
      .lineTo(550, y)
      .strokeColor('#999')
      .stroke();
    y += 10;
    const totalsRow = (label: string, value: number, bold = false) => {
      if (bold) doc.font('Helvetica-Bold').fillColor('#111');
      else doc.font('Helvetica').fillColor('#333');
      doc.fontSize(10).text(label, 300, y, { width: 150, align: 'right' });
      doc.text(fmt(value), 470, y, { width: 80, align: 'right' });
      y += 16;
    };

    totalsRow('Subtotal:', sale.subtotal);
    if (sale.discount > 0) totalsRow('Discount:', sale.discount);
    if (sale.tax > 0) totalsRow('Tax:', sale.tax);
    totalsRow('Total:', sale.totalAmount, true);
    totalsRow('Paid:', sale.paidAmount);
    if (sale.remainingAmount > 0) {
      doc.fillColor('#c00');
      totalsRow('Remaining:', sale.remainingAmount, true);
      doc.fillColor('#333');
    }

    y += 10;
    doc
      .fontSize(10)
      .fillColor('#555')
      .text(`Payment Status: ${sale.paymentStatus}`, 50, y);

    if (sale.notes) {
      y += 20;
      doc.fontSize(9).fillColor('#666').text(`Notes: ${sale.notes}`, 50, y, {
        width: 500,
      });
    }

    // Footer
    doc
      .fontSize(8)
      .fillColor('#999')
      .text('Thank you for your business!', 50, 780, {
        align: 'center',
        width: 500,
      });

    doc.end();
    return done;
  }

  async generateCustomerReport(data: CustomerReportInput): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];

    doc.on('data', (c) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(chunks))),
    );

    const fmt = (v: number) =>
      v.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    // Header
    doc
      .fontSize(20)
      .fillColor('#111')
      .text('CUSTOMER STATEMENT', { align: 'right' })
      .moveDown(0.2);

    doc.fontSize(10).fillColor('#555');
    if (data.range.from || data.range.to) {
      const fromStr = data.range.from
        ? data.range.from.toLocaleDateString()
        : '—';
      const toStr = data.range.to ? data.range.to.toLocaleDateString() : '—';
      doc.text(`Period: ${fromStr} → ${toStr}`, { align: 'right' });
    }
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, {
      align: 'right',
    });
    doc.moveDown(1);

    // Customer profile block
    doc.fontSize(14).fillColor('#111').font('Helvetica-Bold').text('Customer');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(11).fillColor('#333');
    doc.text(data.customer.name);
    if (data.customer.phone) doc.text(`Phone: ${data.customer.phone}`);
    if (data.customer.email) doc.text(`Email: ${data.customer.email}`);
    if (data.customer.address) doc.text(`Address: ${data.customer.address}`);
    doc.moveDown(1);

    // Summary block
    doc
      .fontSize(12)
      .fillColor('#111')
      .font('Helvetica-Bold')
      .text('Summary');
    doc.moveDown(0.2);

    const summaryY = doc.y;
    const box = (label: string, value: string, x: number, color = '#111') => {
      doc
        .rect(x, summaryY, 120, 40)
        .lineWidth(0.5)
        .strokeColor('#ccc')
        .stroke();
      doc
        .fontSize(8)
        .fillColor('#666')
        .font('Helvetica')
        .text(label, x + 8, summaryY + 6, { width: 104 });
      doc
        .fontSize(13)
        .fillColor(color)
        .font('Helvetica-Bold')
        .text(value, x + 8, summaryY + 20, { width: 104 });
    };

    box('Sales Count', String(data.stats.salesCount), 50);
    box('Total Spent', fmt(data.stats.totalSpent), 180);
    box('Total Paid', fmt(data.stats.totalPaid), 310, '#0a7a2f');
    box(
      'Remaining',
      fmt(data.stats.totalRemaining),
      440,
      data.stats.totalRemaining > 0 ? '#c00' : '#111',
    );

    doc.y = summaryY + 50;
    doc.moveDown(1);

    // Sales table
    doc
      .fontSize(12)
      .fillColor('#111')
      .font('Helvetica-Bold')
      .text('Sales');
    doc.moveDown(0.3);

    const salesTop = doc.y;
    const salesCols = {
      invoice: 50,
      date: 150,
      total: 240,
      paid: 320,
      remaining: 400,
      status: 480,
    };

    doc.fontSize(9).fillColor('#111').font('Helvetica-Bold');
    doc.text('Invoice #', salesCols.invoice, salesTop);
    doc.text('Date', salesCols.date, salesTop);
    doc.text('Total', salesCols.total, salesTop, { width: 70, align: 'right' });
    doc.text('Paid', salesCols.paid, salesTop, { width: 70, align: 'right' });
    doc.text('Remaining', salesCols.remaining, salesTop, {
      width: 70,
      align: 'right',
    });
    doc.text('Status', salesCols.status, salesTop, { width: 70, align: 'left' });
    doc
      .moveTo(50, salesTop + 14)
      .lineTo(550, salesTop + 14)
      .strokeColor('#999')
      .stroke();

    doc.font('Helvetica').fillColor('#333');
    let y = salesTop + 20;
    if (data.sales.length === 0) {
      doc
        .fontSize(10)
        .fillColor('#999')
        .text('No sales in this period.', 50, y);
      y += 20;
    } else {
      for (const s of data.sales) {
        if (y > 740) {
          doc.addPage();
          y = 50;
        }
        doc.fontSize(9).fillColor('#333');
        doc.text(s.invoiceNo, salesCols.invoice, y, { width: 90 });
        doc.text(s.saleDate.toLocaleDateString(), salesCols.date, y, {
          width: 80,
        });
        doc.text(fmt(s.totalAmount), salesCols.total, y, {
          width: 70,
          align: 'right',
        });
        doc.fillColor('#0a7a2f');
        doc.text(fmt(s.paidAmount), salesCols.paid, y, {
          width: 70,
          align: 'right',
        });
        doc.fillColor(s.remainingAmount > 0 ? '#c00' : '#333');
        doc.text(fmt(s.remainingAmount), salesCols.remaining, y, {
          width: 70,
          align: 'right',
        });
        doc.fillColor('#333');
        doc.text(s.paymentStatus, salesCols.status, y, { width: 70 });
        y += 16;
      }
    }

    // Totals row
    y += 4;
    doc
      .moveTo(50, y)
      .lineTo(550, y)
      .strokeColor('#999')
      .stroke();
    y += 6;
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#111');
    doc.text('Totals', salesCols.invoice, y);
    doc.text(fmt(data.stats.totalSpent), salesCols.total, y, {
      width: 70,
      align: 'right',
    });
    doc.fillColor('#0a7a2f');
    doc.text(fmt(data.stats.totalPaid), salesCols.paid, y, {
      width: 70,
      align: 'right',
    });
    doc.fillColor(data.stats.totalRemaining > 0 ? '#c00' : '#111');
    doc.text(fmt(data.stats.totalRemaining), salesCols.remaining, y, {
      width: 70,
      align: 'right',
    });
    doc.fillColor('#111');
    y += 26;

    // Payments table
    if (y > 680) {
      doc.addPage();
      y = 50;
    }
    doc.y = y;
    doc
      .fontSize(12)
      .fillColor('#111')
      .font('Helvetica-Bold')
      .text('Payments');
    doc.moveDown(0.3);

    const payTop = doc.y;
    const payCols = {
      date: 50,
      invoice: 150,
      amount: 260,
      method: 350,
      ref: 440,
    };

    doc.fontSize(9).fillColor('#111').font('Helvetica-Bold');
    doc.text('Date', payCols.date, payTop);
    doc.text('Invoice #', payCols.invoice, payTop);
    doc.text('Amount', payCols.amount, payTop, { width: 80, align: 'right' });
    doc.text('Method', payCols.method, payTop);
    doc.text('Reference', payCols.ref, payTop);
    doc
      .moveTo(50, payTop + 14)
      .lineTo(550, payTop + 14)
      .strokeColor('#999')
      .stroke();

    doc.font('Helvetica').fillColor('#333');
    y = payTop + 20;
    if (data.payments.length === 0) {
      doc
        .fontSize(10)
        .fillColor('#999')
        .text('No payments in this period.', 50, y);
    } else {
      for (const p of data.payments) {
        if (y > 760) {
          doc.addPage();
          y = 50;
        }
        doc.fontSize(9).fillColor('#333');
        doc.text(p.paymentDate.toLocaleDateString(), payCols.date, y, {
          width: 90,
        });
        doc.text(p.invoiceNo || '—', payCols.invoice, y, { width: 100 });
        doc.fillColor('#0a7a2f');
        doc.text(fmt(p.amount), payCols.amount, y, {
          width: 80,
          align: 'right',
        });
        doc.fillColor('#333');
        doc.text(p.method, payCols.method, y, { width: 80 });
        doc.text(p.referenceNo || '—', payCols.ref, y, { width: 100 });
        y += 16;
      }
    }

    // Footer
    doc
      .fontSize(8)
      .fillColor('#999')
      .text(`Customer Statement — ${data.customer.name}`, 50, 800, {
        align: 'center',
        width: 500,
      });

    doc.end();
    return done;
  }

  /**
   * Generate a printable sales report covering a period with KPIs,
   * payment-status breakdown, top products and a daily revenue trend.
   */
  async generateSalesReport(data: SalesReportInput): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(chunks))),
    );

    const fmt = (v: number) =>
      v.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    const periodLabel = data.period.charAt(0).toUpperCase() + data.period.slice(1);

    // Header
    doc
      .fontSize(20)
      .fillColor('#111')
      .text('SALES REPORT', { align: 'right' })
      .moveDown(0.2);
    doc.fontSize(10).fillColor('#555');
    doc.text(`Period: ${periodLabel}`, { align: 'right' });
    doc.text(
      `Range: ${data.range.start.toLocaleDateString()} → ${data.range.end.toLocaleDateString()}`,
      { align: 'right' },
    );
    doc.text(
      `Warehouse: ${data.warehouse ? data.warehouse.name : 'All warehouses'}`,
      { align: 'right' },
    );
    doc.text(`Generated: ${new Date().toLocaleString()}`, { align: 'right' });
    doc.moveDown(1);

    // ----- KPI grid (2 rows x 4 cols) -----
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#111').text('Summary');
    doc.moveDown(0.3);

    const kpiTop = doc.y;
    const boxW = 120;
    const boxH = 44;
    const gapX = 10;
    const startX = 50;
    const drawBox = (
      label: string,
      value: string,
      col: number,
      row: number,
      color = '#111',
    ) => {
      const x = startX + col * (boxW + gapX);
      const y = kpiTop + row * (boxH + 8);
      doc
        .rect(x, y, boxW, boxH)
        .lineWidth(0.5)
        .strokeColor('#ccc')
        .stroke();
      doc.fontSize(8).fillColor('#666').font('Helvetica').text(label, x + 8, y + 6, {
        width: boxW - 16,
      });
      doc
        .fontSize(13)
        .fillColor(color)
        .font('Helvetica-Bold')
        .text(value, x + 8, y + 22, { width: boxW - 16 });
    };

    drawBox('Revenue', fmt(data.financial.revenue), 0, 0, '#0a7a2f');
    drawBox('Expenses', fmt(data.financial.expenses), 1, 0, '#c00');
    drawBox(
      'Profit',
      fmt(data.financial.profit),
      2,
      0,
      data.financial.profit < 0 ? '#c00' : '#0a7a2f',
    );
    drawBox(
      'Pending',
      fmt(data.financial.pendingPayments),
      3,
      0,
      data.financial.pendingPayments > 0 ? '#c00' : '#111',
    );

    drawBox('Sales count', String(data.counts.salesCount), 0, 1);
    drawBox('Cash received', fmt(data.financial.cashReceived), 1, 1);
    drawBox('Subtotal', fmt(data.financial.subtotal), 2, 1);
    drawBox('Discount', fmt(data.financial.discount), 3, 1);

    doc.y = kpiTop + 2 * (boxH + 8) + 10;

    // ----- Payment status breakdown -----
    doc
      .fontSize(12)
      .fillColor('#111')
      .font('Helvetica-Bold')
      .text('Payment status breakdown');
    doc.moveDown(0.3);

    const statusTop = doc.y;
    const statusCols = { label: 50, count: 220, total: 320 };
    doc.fontSize(9).fillColor('#111').font('Helvetica-Bold');
    doc.text('Status', statusCols.label, statusTop);
    doc.text('Count', statusCols.count, statusTop, { width: 80, align: 'right' });
    doc.text('Total', statusCols.total, statusTop, { width: 80, align: 'right' });
    doc
      .moveTo(50, statusTop + 14)
      .lineTo(550, statusTop + 14)
      .strokeColor('#999')
      .stroke();

    doc.font('Helvetica').fillColor('#333');
    let y = statusTop + 20;
    if (data.byStatus.length === 0) {
      doc.fontSize(10).fillColor('#999').text('No data.', 50, y);
      y += 20;
    } else {
      for (const s of data.byStatus) {
        doc.fontSize(9).fillColor('#333');
        const color =
          s.status === 'PAID'
            ? '#0a7a2f'
            : s.status === 'PARTIAL'
            ? '#b58105'
            : s.status === 'UNPAID'
            ? '#c00'
            : '#333';
        doc.fillColor(color).text(s.status, statusCols.label, y);
        doc.fillColor('#333').text(String(s.count), statusCols.count, y, {
          width: 80,
          align: 'right',
        });
        doc.text(fmt(s.total), statusCols.total, y, {
          width: 80,
          align: 'right',
        });
        y += 16;
      }
    }
    doc.y = y + 10;

    // ----- Top products table -----
    if (doc.y > 680) {
      doc.addPage();
      doc.y = 50;
    }
    doc
      .fontSize(12)
      .fillColor('#111')
      .font('Helvetica-Bold')
      .text('Top products');
    doc.moveDown(0.3);

    const tpTop = doc.y;
    const tpCols = { idx: 50, name: 80, sku: 280, qty: 380, revenue: 460 };
    doc.fontSize(9).fillColor('#111').font('Helvetica-Bold');
    doc.text('#', tpCols.idx, tpTop);
    doc.text('Item', tpCols.name, tpTop);
    doc.text('SKU', tpCols.sku, tpTop);
    doc.text('Qty', tpCols.qty, tpTop, { width: 60, align: 'right' });
    doc.text('Revenue', tpCols.revenue, tpTop, { width: 80, align: 'right' });
    doc
      .moveTo(50, tpTop + 14)
      .lineTo(550, tpTop + 14)
      .strokeColor('#999')
      .stroke();

    doc.font('Helvetica').fillColor('#333');
    y = tpTop + 20;
    if (data.topProducts.length === 0) {
      doc.fontSize(10).fillColor('#999').text('No sales in this period.', 50, y);
      y += 20;
    } else {
      data.topProducts.forEach((p, i) => {
        if (y > 760) {
          doc.addPage();
          y = 50;
        }
        doc.fontSize(9).fillColor('#333');
        doc.text(String(i + 1), tpCols.idx, y, { width: 20 });
        doc.text(p.name, tpCols.name, y, { width: 190 });
        doc.text(p.sku ?? '—', tpCols.sku, y, { width: 90 });
        doc.text(fmt(p.quantity), tpCols.qty, y, { width: 60, align: 'right' });
        doc
          .fillColor('#0a7a2f')
          .text(fmt(p.revenue), tpCols.revenue, y, { width: 80, align: 'right' });
        doc.fillColor('#333');
        y += 14;
      });
    }
    doc.y = y + 10;

    // ----- Daily revenue trend -----
    if (doc.y > 680) {
      doc.addPage();
      doc.y = 50;
    }
    doc
      .fontSize(12)
      .fillColor('#111')
      .font('Helvetica-Bold')
      .text('Daily revenue');
    doc.moveDown(0.3);

    const trendTop = doc.y;
    const trendCols = { day: 50, count: 220, revenue: 320 };
    doc.fontSize(9).fillColor('#111').font('Helvetica-Bold');
    doc.text('Day', trendCols.day, trendTop);
    doc.text('Sales', trendCols.count, trendTop, {
      width: 80,
      align: 'right',
    });
    doc.text('Revenue', trendCols.revenue, trendTop, {
      width: 80,
      align: 'right',
    });
    doc
      .moveTo(50, trendTop + 14)
      .lineTo(550, trendTop + 14)
      .strokeColor('#999')
      .stroke();

    doc.font('Helvetica').fillColor('#333');
    y = trendTop + 20;
    if (data.revenueTrend.length === 0) {
      doc.fontSize(10).fillColor('#999').text('No daily data.', 50, y);
      y += 20;
    } else {
      for (const r of data.revenueTrend) {
        if (y > 760) {
          doc.addPage();
          y = 50;
        }
        doc.fontSize(9).fillColor('#333');
        doc.text(new Date(r.day).toLocaleDateString(), trendCols.day, y, {
          width: 160,
        });
        doc.text(String(r.count), trendCols.count, y, {
          width: 80,
          align: 'right',
        });
        doc.text(fmt(r.revenue), trendCols.revenue, y, {
          width: 80,
          align: 'right',
        });
        y += 14;
      }
      // totals row
      doc
        .moveTo(50, y + 2)
        .lineTo(550, y + 2)
        .strokeColor('#999')
        .stroke();
      y += 8;
      doc.font('Helvetica-Bold').fillColor('#111').fontSize(9);
      doc.text('Total', trendCols.day, y);
      doc.text(String(data.counts.salesCount), trendCols.count, y, {
        width: 80,
        align: 'right',
      });
      doc.text(fmt(data.financial.revenue), trendCols.revenue, y, {
        width: 80,
        align: 'right',
      });
    }

    // Footer
    doc
      .fontSize(8)
      .fillColor('#999')
      .text(`Sales Report — ${periodLabel}`, 50, 800, {
        align: 'center',
        width: 500,
      });

    doc.end();
    return done;
  }
}
