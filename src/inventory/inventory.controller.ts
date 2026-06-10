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
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ItemsService } from './items/items.service';
import { WarehousesService } from './warehouses/warehouses.service';
import { SuppliersService } from './suppliers/suppliers.service';
import { MovementsService } from './movements/movements.service';
import { PurchasingService } from './purchasing/purchasing.service';
import { InventoryReportsService } from './reports/inventory-reports.service';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../guard/permissions.guard';
import { Permissions } from '../guard/permissions.decorator';
import { SubscriptionModuleGuard } from '../subscriptions/guards/subscription-module.guard';
import { SubscriptionFeatureGuard } from '../subscriptions/guards/subscription-feature.guard';
import { RequireModule } from '../subscriptions/decorators/require-module.decorator';
import { RequireFeature } from '../subscriptions/decorators/require-feature.decorator';
import { ModuleCode, FeatureCode } from '@prisma/client';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { CreateWarehouseDto, UpdateWarehouseDto } from './dto/warehouse.dto';
import { CreateSupplierDto, UpdateSupplierDto } from './dto/supplier.dto';
import {
  StockInDto,
  StockOutDto,
  StockTransferDto,
  StockAdjustmentDto,
} from './dto/stock-movement.dto';
import {
  CreatePurchaseDto,
  UpdatePurchaseDto,
  CreateSupplierPaymentDto,
  SupplierPaymentFilterDto,
} from './dto/purchase.dto';
import {
  ItemFilterDto,
  PaginationDto,
  StockMovementFilterDto,
  PurchaseFilterDto,
} from './dto/inventory-filter.dto';

/**
 * Single inventory controller, deliberately kept as one file even though
 * the service layer is split. Route paths must stay stable (the frontend
 * hard-codes them) so combining all routes here is safer than splitting
 * controllers and risking ordering / collision issues. The route ordering
 * comments matter: more-specific paths (`reports/*`, `stock/*`, literal
 * sub-resources) come first; the `items/:id` catch-all is registered last
 * so it can't shadow any literal segment.
 */
@ApiTags('Inventory')
@Controller('inventory')
@UseGuards(
  AuthGuard,
  SubscriptionModuleGuard,
  SubscriptionFeatureGuard,
  PermissionGuard,
)
@RequireModule(ModuleCode.INVENTORY)
export class InventoryController {
  constructor(
    private readonly items: ItemsService,
    private readonly warehouses: WarehousesService,
    private readonly suppliers: SuppliersService,
    private readonly movements: MovementsService,
    private readonly purchasing: PurchasingService,
    private readonly reports: InventoryReportsService,
  ) {}

  // -------------------- REPORTS (must come before :id routes) --------------------

  @Get('reports/summary')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Inventory summary cards' })
  reportSummary() {
    return this.reports.summary();
  }

  @Get('reports/current-stock')
  @Permissions('inventory.read')
  @RequireFeature(FeatureCode.INVENTORY_REPORTS)
  @ApiOperation({ summary: 'Current stock per item across all warehouses' })
  reportCurrentStock() {
    return this.reports.currentStock();
  }

  @Get('reports/low-stock')
  @Permissions('inventory.read')
  @RequireFeature(FeatureCode.INVENTORY_REPORTS)
  @ApiOperation({ summary: 'Items currently below their minStock threshold' })
  reportLowStock() {
    return this.reports.lowStock();
  }

  @Get('reports/movements')
  @Permissions('inventory.read')
  @RequireFeature(FeatureCode.INVENTORY_REPORTS)
  @ApiOperation({ summary: 'Movement counts grouped by type' })
  reportMovements() {
    return this.reports.movementCounts();
  }

  @Get('reports/by-warehouse')
  @Permissions('inventory.read')
  @RequireFeature(FeatureCode.INVENTORY_REPORTS)
  @ApiOperation({ summary: 'Stock breakdown per warehouse' })
  reportByWarehouse() {
    return this.reports.byWarehouse();
  }

  @Get('reports/monthly-usage')
  @Permissions('inventory.read')
  @RequireFeature(FeatureCode.INVENTORY_REPORTS)
  @ApiOperation({ summary: 'Monthly OUT usage for the last 12 months' })
  reportMonthlyUsage() {
    return this.reports.monthlyUsage();
  }

  @Get('reports/dead-stock')
  @Permissions('inventory.read')
  @RequireFeature(FeatureCode.INVENTORY_REPORTS)
  @ApiOperation({ summary: 'Items with no OUT movement in the last N days' })
  reportDeadStock(@Query('days') days?: string) {
    return this.reports.deadStock(days ? Number(days) : 90);
  }

  @Get('reports/sales-velocity')
  @Permissions('inventory.read')
  @RequireFeature(FeatureCode.INVENTORY_REPORTS)
  @ApiOperation({ summary: 'Sales velocity & fast/slow movers' })
  reportSalesVelocity(@Query('days') days?: string) {
    return this.reports.salesVelocity(days ? Number(days) : 30);
  }

  @Get('reports/turnover')
  @Permissions('inventory.read')
  @RequireFeature(FeatureCode.INVENTORY_REPORTS)
  @ApiOperation({ summary: 'Inventory turnover rate (COGS / avg inventory)' })
  reportTurnover(@Query('days') days?: string) {
    return this.reports.turnover(days ? Number(days) : 90);
  }

  @Get('reports/profit-per-product')
  @Permissions('inventory.read')
  @RequireFeature(FeatureCode.INVENTORY_PROFIT_REPORT)
  @ApiOperation({ summary: 'Revenue, COGS and profit per product' })
  reportProfitPerProduct(@Query('days') days?: string) {
    return this.reports.profitPerProduct(days ? Number(days) : 30);
  }

  @Get('reports/reorder-suggestions')
  @Permissions('inventory.read')
  @RequireFeature(FeatureCode.INVENTORY_REPORTS)
  @ApiOperation({ summary: 'Items that need reordering with suggested quantities' })
  reportReorderSuggestions() {
    return this.reports.reorderSuggestions();
  }

  // -------------------- STOCK OPERATIONS --------------------

  @Post('stock/in')
  @Permissions('inventory.movement')
  @ApiOperation({ summary: 'Add stock to a warehouse (IN)' })
  stockIn(@Body() dto: StockInDto, @Req() req: Request) {
    const user = req['user'];
    return this.movements.stockIn(
      dto,
      user?.sub ? Number(user.sub) : undefined,
    );
  }

  @Post('stock/out')
  @Permissions('inventory.movement')
  @ApiOperation({ summary: 'Remove stock from a warehouse (OUT)' })
  stockOut(@Body() dto: StockOutDto, @Req() req: Request) {
    const user = req['user'];
    return this.movements.stockOut(
      dto,
      user?.sub ? Number(user.sub) : undefined,
    );
  }

  @Post('stock/transfer')
  @Permissions('inventory.movement')
  @ApiOperation({ summary: 'Transfer stock between warehouses' })
  stockTransfer(@Body() dto: StockTransferDto, @Req() req: Request) {
    const user = req['user'];
    return this.movements.stockTransfer(
      dto,
      user?.sub ? Number(user.sub) : undefined,
    );
  }

  @Post('stock/adjustment')
  @Permissions('inventory.movement')
  @ApiOperation({ summary: 'Set absolute stock quantity (audit adjustment)' })
  stockAdjustment(@Body() dto: StockAdjustmentDto, @Req() req: Request) {
    const user = req['user'];
    return this.movements.stockAdjustment(
      dto,
      user?.sub ? Number(user.sub) : undefined,
    );
  }

  @Get('movements')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'List stock movements' })
  listMovements(@Query() filters: StockMovementFilterDto) {
    return this.movements.findAll(filters);
  }

  // -------------------- WAREHOUSES --------------------

  @Post('warehouses')
  @Permissions('inventory.create')
  @ApiOperation({ summary: 'Create a warehouse' })
  createWarehouse(@Body() dto: CreateWarehouseDto) {
    return this.warehouses.create(dto);
  }

  @Get('warehouses')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'List warehouses' })
  listWarehouses(@Query() filters: PaginationDto) {
    return this.warehouses.findAll(filters);
  }

  @Get('warehouses/:id')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Get a warehouse by id' })
  getWarehouse(@Param('id', ParseIntPipe) id: number) {
    return this.warehouses.findOne(id);
  }

  @Patch('warehouses/:id')
  @Permissions('inventory.update')
  @ApiOperation({ summary: 'Update a warehouse' })
  updateWarehouse(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWarehouseDto,
  ) {
    return this.warehouses.update(id, dto);
  }

  @Delete('warehouses/:id')
  @Permissions('inventory.delete')
  @ApiOperation({ summary: 'Delete a warehouse' })
  removeWarehouse(@Param('id', ParseIntPipe) id: number) {
    return this.warehouses.remove(id);
  }

  // -------------------- SUPPLIERS --------------------

  @Post('suppliers')
  @Permissions('inventory.create')
  @ApiOperation({ summary: 'Create a supplier' })
  createSupplier(@Body() dto: CreateSupplierDto) {
    return this.suppliers.create(dto);
  }

  @Get('suppliers')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'List suppliers' })
  listSuppliers(@Query() filters: PaginationDto) {
    return this.suppliers.findAll(filters);
  }

  @Get('suppliers/:id')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Get a supplier by id' })
  getSupplier(@Param('id', ParseIntPipe) id: number) {
    return this.suppliers.findOne(id);
  }

  @Patch('suppliers/:id')
  @Permissions('inventory.update')
  @ApiOperation({ summary: 'Update a supplier' })
  updateSupplier(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.suppliers.update(id, dto);
  }

  @Delete('suppliers/:id')
  @Permissions('inventory.delete')
  @ApiOperation({ summary: 'Delete a supplier' })
  removeSupplier(@Param('id', ParseIntPipe) id: number) {
    return this.suppliers.remove(id);
  }

  // -------------------- PURCHASES --------------------

  @Post('purchases')
  @Permissions('inventory.create')
  @ApiOperation({ summary: 'Create a purchase with line items' })
  createPurchase(@Body() dto: CreatePurchaseDto, @Req() req: Request) {
    const user = req['user'];
    return this.purchasing.create(
      dto,
      user?.sub ? String(user.sub) : undefined,
    );
  }

  @Get('purchases')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'List purchases' })
  listPurchases(@Query() filters: PurchaseFilterDto) {
    return this.purchasing.findAll(filters);
  }

  @Get('purchases/:id')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Get a purchase by id' })
  getPurchase(@Param('id', ParseIntPipe) id: number) {
    return this.purchasing.findOne(id);
  }

  @Patch('purchases/:id')
  @Permissions('inventory.update')
  @ApiOperation({ summary: 'Update a purchase' })
  updatePurchase(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurchaseDto,
  ) {
    return this.purchasing.update(id, dto);
  }

  @Delete('purchases/:id')
  @Permissions('inventory.delete')
  @ApiOperation({ summary: 'Delete a purchase' })
  removePurchase(@Param('id', ParseIntPipe) id: number) {
    return this.purchasing.remove(id);
  }

  @Post('purchases/:id/receive')
  @Permissions('inventory.movement')
  @ApiOperation({ summary: 'Mark a purchase as RECEIVED and post IN movements' })
  receivePurchase(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { targetWarehouseId: number },
  ) {
    return this.purchasing.receive(id, body.targetWarehouseId);
  }

  // -------------------- SUPPLIER PAYMENTS --------------------

  @Post('supplier-payments')
  @Permissions('inventory.create')
  @ApiOperation({ summary: 'Record a payment to a supplier' })
  createSupplierPayment(
    @Body() dto: CreateSupplierPaymentDto,
    @Req() req: Request,
  ) {
    const user = req['user'];
    return this.purchasing.createSupplierPayment(
      dto,
      user?.sub ? String(user.sub) : undefined,
    );
  }

  @Get('supplier-payments')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'List supplier payments' })
  listSupplierPayments(@Query() filters: SupplierPaymentFilterDto) {
    return this.purchasing.findAllSupplierPayments(filters);
  }

  @Delete('supplier-payments/:id')
  @Permissions('inventory.delete')
  @ApiOperation({ summary: 'Delete a supplier payment (reverses its effect)' })
  removeSupplierPayment(@Param('id', ParseIntPipe) id: number) {
    return this.purchasing.removeSupplierPayment(id);
  }

  // -------------------- ITEMS (must come last to avoid :id shadowing) --------------------

  @Post('items')
  @Permissions('inventory.create')
  @ApiOperation({ summary: 'Create an item' })
  createItem(@Body() dto: CreateItemDto) {
    return this.items.create(dto);
  }

  @Get('items')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'List items with stock totals' })
  listItems(@Query() filters: ItemFilterDto) {
    return this.items.findAll(filters);
  }

  @Get('items/:id')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Get an item with per-warehouse stock + recent movements' })
  getItem(@Param('id', ParseIntPipe) id: number) {
    return this.items.findOne(id);
  }

  @Patch('items/:id')
  @Permissions('inventory.update')
  @ApiOperation({ summary: 'Update an item' })
  updateItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateItemDto,
  ) {
    return this.items.update(id, dto);
  }

  @Delete('items/:id')
  @Permissions('inventory.delete')
  @ApiOperation({ summary: 'Delete an item' })
  removeItem(@Param('id', ParseIntPipe) id: number) {
    return this.items.remove(id);
  }
}
