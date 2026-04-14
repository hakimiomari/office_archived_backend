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
}
