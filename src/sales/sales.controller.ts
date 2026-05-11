import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { CustomersService } from './customers/customers.service';
import { InvoicesService } from './invoices/invoices.service';
import { PaymentsService } from './payments/payments.service';
import { SalesReportsService } from './reports/sales-reports.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../guard/permissions.guard';
import { Permissions } from '../guard/permissions.decorator';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  CustomerFilterDto,
} from './dto/customer.dto';
import {
  CreateSaleDto,
  UpdateSaleDto,
  SaleFilterDto,
} from './dto/sale.dto';
import {
  CreatePaymentDto,
  PaymentFilterDto,
  OverdueFilterDto,
} from './dto/payment.dto';

/**
 * Single sales controller, deliberately kept as one file even though the
 * service layer is split. Route paths must stay stable (the frontend
 * hard-codes them) so combining all routes here is safer than splitting
 * controllers and risking ordering / collision issues — for example, a
 * `:id` route on one controller can shadow a literal `summary` on another
 * if registration order is wrong. Keeping one controller eliminates that
 * class of bug entirely.
 *
 * Each handler delegates to the right sub-service:
 *  - SalesReportsService → /summary, /reports, /reports/pdf, /overdue,
 *    /customers/:id/report-pdf
 *  - CustomersService    → /customers/*
 *  - PaymentsService     → /payments/*
 *  - InvoicesService     → / (sales CRUD)
 */
@ApiTags('Sales')
@Controller('sales')
@UseGuards(AuthGuard, PermissionGuard)
export class SalesController {
  constructor(
    private readonly customers: CustomersService,
    private readonly invoices: InvoicesService,
    private readonly payments: PaymentsService,
    private readonly reports: SalesReportsService,
    private readonly pdf: InvoicePdfService,
  ) {}

  // -------------------- SUMMARY (before :id routes) --------------------

  @Get('summary')
  @Permissions('sale.read')
  @ApiOperation({ summary: 'Get sales summary (today, month, pending)' })
  getSummary() {
    return this.reports.getSummary();
  }

  @Get('reports')
  @Permissions('sale.read')
  @ApiOperation({ summary: 'Aggregate report for daily / weekly / monthly / yearly' })
  getReport(
    @Query('period') period?: 'daily' | 'weekly' | 'monthly' | 'yearly',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.reports.getReport(
      period ?? 'monthly',
      from,
      to,
      warehouseId ? Number(warehouseId) : undefined,
    );
  }

  @Get('reports/pdf')
  @Permissions('sale.read')
  @ApiOperation({ summary: 'Generate the sales report as a downloadable PDF' })
  async downloadReportPdf(
    @Query('period') period: 'daily' | 'weekly' | 'monthly' | 'yearly' = 'monthly',
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('warehouseId') warehouseId: string | undefined,
    @Res() res: Response,
  ) {
    const data = await this.reports.getReport(
      period,
      from,
      to,
      warehouseId ? Number(warehouseId) : undefined,
    );
    const buffer = await this.pdf.generateSalesReport({
      period: data.period,
      range: { start: new Date(data.range.start), end: new Date(data.range.end) },
      warehouse: data.warehouse,
      financial: data.financial,
      counts: data.counts,
      byStatus: data.byStatus,
      topProducts: data.topProducts,
      revenueTrend: data.revenueTrend.map((r) => ({
        day: new Date(r.day),
        revenue: r.revenue,
        count: r.count,
      })),
    });

    const stamp = new Date().toISOString().slice(0, 10);
    const whSlug = data.warehouse
      ? `_${data.warehouse.name.replace(/[^a-z0-9]+/gi, '_')}`
      : '';
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="sales_report_${period}${whSlug}_${stamp}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('overdue')
  @Permissions('sale.read')
  @ApiOperation({ summary: 'List overdue sales (dueDate passed, still unpaid or partial)' })
  getOverdue(@Query() filters: OverdueFilterDto) {
    return this.reports.getOverdueSales(filters);
  }

  // -------------------- CUSTOMERS --------------------

  @Post('customers')
  @Permissions('customer.create')
  @ApiOperation({ summary: 'Create a customer' })
  createCustomer(@Body() dto: CreateCustomerDto, @Req() req: Request) {
    const user = req['user'];
    return this.customers.create(
      dto,
      user?.sub ? String(user.sub) : undefined,
    );
  }

  @Get('customers')
  @Permissions('customer.read')
  @ApiOperation({ summary: 'List customers' })
  listCustomers(@Query() filters: CustomerFilterDto) {
    return this.customers.findAll(filters);
  }

  @Get('customers/:id')
  @Permissions('customer.read')
  @ApiOperation({ summary: 'Get customer by id' })
  getCustomer(@Param('id', ParseIntPipe) id: number) {
    return this.customers.findOne(id);
  }

  @Get('customers/:id/report-pdf')
  @Permissions('customer.read')
  @ApiOperation({
    summary: 'Download a single PDF statement with all sales + payments for a customer',
  })
  async downloadCustomerReportPdf(
    @Param('id', ParseIntPipe) id: number,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Res() res: Response,
  ) {
    const data = await this.reports.getCustomerReportData(id, from, to);
    const buffer = await this.pdf.generateCustomerReport({
      customer: {
        id: data.customer.id,
        name: data.customer.name,
        phone: data.customer.phone,
        email: data.customer.email,
        address: data.customer.address,
        creditLimit: data.customer.creditLimit,
        totalOwed: data.customer.totalOwed,
      },
      range: data.range,
      stats: data.stats,
      sales: data.sales.map((s) => ({
        invoiceNo: s.invoiceNo,
        saleDate: s.saleDate,
        totalAmount: s.totalAmount,
        paidAmount: s.paidAmount,
        remainingAmount: s.remainingAmount,
        paymentStatus: s.paymentStatus,
      })),
      payments: data.payments.map((p) => ({
        paymentDate: p.paymentDate,
        amount: p.amount,
        method: p.method,
        invoiceNo: p.invoiceNo,
        referenceNo: p.referenceNo,
      })),
    });

    const safeName = data.customer.name.replace(/[^a-z0-9]+/gi, '_');
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="customer_${data.customer.id}_${safeName}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Patch('customers/:id')
  @Permissions('customer.update')
  @ApiOperation({ summary: 'Update customer' })
  updateCustomer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customers.update(id, dto);
  }

  @Delete('customers/:id')
  @Permissions('customer.delete')
  @ApiOperation({ summary: 'Delete customer' })
  removeCustomer(@Param('id', ParseIntPipe) id: number) {
    return this.customers.remove(id);
  }

  // -------------------- PAYMENTS --------------------

  @Post('payments')
  @Permissions('payment.create')
  @ApiOperation({ summary: 'Record a payment against a sale' })
  createPayment(@Body() dto: CreatePaymentDto, @Req() req: Request) {
    const user = req['user'];
    return this.payments.create(
      dto,
      user?.sub ? String(user.sub) : undefined,
    );
  }

  @Get('payments')
  @Permissions('payment.read')
  @ApiOperation({ summary: 'List payments' })
  listPayments(@Query() filters: PaymentFilterDto) {
    return this.payments.findAll(filters);
  }

  @Delete('payments/:id')
  @Permissions('payment.delete')
  @ApiOperation({ summary: 'Delete a payment (reverses its effect)' })
  removePayment(@Param('id', ParseIntPipe) id: number) {
    return this.payments.remove(id);
  }

  // -------------------- SALES --------------------

  @Post()
  @Permissions('sale.create')
  @ApiOperation({ summary: 'Create a sale (invoice)' })
  createSale(@Body() dto: CreateSaleDto, @Req() req: Request) {
    const user = req['user'];
    return this.invoices.create(
      dto,
      user?.sub ? String(user.sub) : undefined,
    );
  }

  @Get()
  @Permissions('sale.read')
  @ApiOperation({ summary: 'List sales with filters' })
  listSales(@Query() filters: SaleFilterDto) {
    return this.invoices.findAll(filters);
  }

  @Get(':id')
  @Permissions('sale.read')
  @ApiOperation({ summary: 'Get a sale by id' })
  getSale(@Param('id', ParseIntPipe) id: number) {
    return this.invoices.findOne(id);
  }

  @Get(':id/pdf')
  @Permissions('sale.read')
  @ApiOperation({ summary: 'Download a sale as a PDF invoice' })
  async downloadPdf(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const sale = await this.invoices.findOne(id);
    const buffer = await this.pdf.generate({
      invoiceNo: sale.invoiceNo,
      saleDate: sale.saleDate,
      dueDate: sale.dueDate,
      customer: sale.customer,
      items: sale.items.map((i) => ({
        item: {
          name: i.item.name,
          sku: i.item.sku,
          unit: i.item.unit,
        },
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        discount: i.discount,
        lineTotal: i.lineTotal,
      })),
      subtotal: sale.subtotal,
      discount: sale.discount,
      tax: sale.tax,
      totalAmount: sale.totalAmount,
      paidAmount: sale.paidAmount,
      remainingAmount: sale.remainingAmount,
      paymentStatus: sale.paymentStatus,
      notes: sale.notes,
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${sale.invoiceNo}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Patch(':id')
  @Permissions('sale.update')
  @ApiOperation({ summary: 'Update sale notes / due date / status' })
  updateSale(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSaleDto,
  ) {
    return this.invoices.update(id, dto);
  }

  @Patch(':id/cancel')
  @Permissions('sale.update')
  @ApiOperation({ summary: 'Cancel a sale and restore stock' })
  cancelSale(@Param('id', ParseIntPipe) id: number, @Req() req: Request) {
    const user = req['user'];
    return this.invoices.cancel(
      id,
      user?.sub ? String(user.sub) : undefined,
    );
  }

  @Delete(':id')
  @Permissions('sale.delete')
  @ApiOperation({ summary: 'Delete a sale' })
  removeSale(@Param('id', ParseIntPipe) id: number) {
    return this.invoices.remove(id);
  }
}
