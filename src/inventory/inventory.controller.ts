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
import { InventoryService } from './inventory.service';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../guard/permissions.guard';
import { Permissions } from '../guard/permissions.decorator';
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

@ApiTags('Inventory')
@Controller('inventory')
@UseGuards(AuthGuard, PermissionGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  // -------------------- REPORTS (must come before :id routes) --------------------

  @Get('reports/summary')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Inventory summary cards' })
  reportSummary() {
    return this.inventory.reportSummary();
  }

  @Get('reports/current-stock')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Current stock per item across all warehouses' })
  reportCurrentStock() {
    return this.inventory.reportCurrentStock();
  }

  @Get('reports/low-stock')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Items currently below their minStock threshold' })
  reportLowStock() {
    return this.inventory.reportLowStock();
  }

  @Get('reports/movements')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Movement counts grouped by type' })
  reportMovements() {
    return this.inventory.reportMovementCounts();
  }

  @Get('reports/by-warehouse')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Stock breakdown per warehouse' })
  reportByWarehouse() {
    return this.inventory.reportByWarehouse();
  }

  @Get('reports/monthly-usage')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Monthly OUT usage for the last 12 months' })
  reportMonthlyUsage() {
    return this.inventory.reportMonthlyUsage();
  }

  // -------------------- STOCK OPERATIONS --------------------

  @Post('stock/in')
  @Permissions('inventory.movement')
  @ApiOperation({ summary: 'Add stock to a warehouse (IN)' })
  stockIn(@Body() dto: StockInDto, @Req() req: Request) {
    const user = req['user'];
    return this.inventory.stockIn(
      dto,
      user?.sub ? Number(user.sub) : undefined,
    );
  }

  @Post('stock/out')
  @Permissions('inventory.movement')
  @ApiOperation({ summary: 'Remove stock from a warehouse (OUT)' })
  stockOut(@Body() dto: StockOutDto, @Req() req: Request) {
    const user = req['user'];
    return this.inventory.stockOut(
      dto,
      user?.sub ? Number(user.sub) : undefined,
    );
  }

  @Post('stock/transfer')
  @Permissions('inventory.movement')
  @ApiOperation({ summary: 'Transfer stock between warehouses' })
  stockTransfer(@Body() dto: StockTransferDto, @Req() req: Request) {
    const user = req['user'];
    return this.inventory.stockTransfer(
      dto,
      user?.sub ? Number(user.sub) : undefined,
    );
  }

  @Post('stock/adjustment')
  @Permissions('inventory.movement')
  @ApiOperation({ summary: 'Set absolute stock quantity (audit adjustment)' })
  stockAdjustment(@Body() dto: StockAdjustmentDto, @Req() req: Request) {
    const user = req['user'];
    return this.inventory.stockAdjustment(
      dto,
      user?.sub ? Number(user.sub) : undefined,
    );
  }

  @Get('movements')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'List stock movements' })
  listMovements(@Query() filters: StockMovementFilterDto) {
    return this.inventory.findAllMovements(filters);
  }

  // -------------------- WAREHOUSES --------------------

  @Post('warehouses')
  @Permissions('inventory.create')
  @ApiOperation({ summary: 'Create a warehouse' })
  createWarehouse(@Body() dto: CreateWarehouseDto) {
    return this.inventory.createWarehouse(dto);
  }

  @Get('warehouses')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'List warehouses' })
  listWarehouses(@Query() filters: PaginationDto) {
    return this.inventory.findAllWarehouses(filters);
  }

  @Get('warehouses/:id')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Get a warehouse by id' })
  getWarehouse(@Param('id', ParseIntPipe) id: number) {
    return this.inventory.findOneWarehouse(id);
  }

  @Patch('warehouses/:id')
  @Permissions('inventory.update')
  @ApiOperation({ summary: 'Update a warehouse' })
  updateWarehouse(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateWarehouseDto,
  ) {
    return this.inventory.updateWarehouse(id, dto);
  }

  @Delete('warehouses/:id')
  @Permissions('inventory.delete')
  @ApiOperation({ summary: 'Delete a warehouse' })
  removeWarehouse(@Param('id', ParseIntPipe) id: number) {
    return this.inventory.removeWarehouse(id);
  }

  // -------------------- SUPPLIERS --------------------

  @Post('suppliers')
  @Permissions('inventory.create')
  @ApiOperation({ summary: 'Create a supplier' })
  createSupplier(@Body() dto: CreateSupplierDto) {
    return this.inventory.createSupplier(dto);
  }

  @Get('suppliers')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'List suppliers' })
  listSuppliers(@Query() filters: PaginationDto) {
    return this.inventory.findAllSuppliers(filters);
  }

  @Get('suppliers/:id')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Get a supplier by id' })
  getSupplier(@Param('id', ParseIntPipe) id: number) {
    return this.inventory.findOneSupplier(id);
  }

  @Patch('suppliers/:id')
  @Permissions('inventory.update')
  @ApiOperation({ summary: 'Update a supplier' })
  updateSupplier(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierDto,
  ) {
    return this.inventory.updateSupplier(id, dto);
  }

  @Delete('suppliers/:id')
  @Permissions('inventory.delete')
  @ApiOperation({ summary: 'Delete a supplier' })
  removeSupplier(@Param('id', ParseIntPipe) id: number) {
    return this.inventory.removeSupplier(id);
  }

  // -------------------- PURCHASES --------------------

  @Post('purchases')
  @Permissions('inventory.create')
  @ApiOperation({ summary: 'Create a purchase with line items' })
  createPurchase(@Body() dto: CreatePurchaseDto, @Req() req: Request) {
    const user = req['user'];
    return this.inventory.createPurchase(dto, user?.sub ? String(user.sub) : undefined);
  }

  @Get('purchases')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'List purchases' })
  listPurchases(@Query() filters: PurchaseFilterDto) {
    return this.inventory.findAllPurchases(filters);
  }

  @Get('purchases/:id')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Get a purchase by id' })
  getPurchase(@Param('id', ParseIntPipe) id: number) {
    return this.inventory.findOnePurchase(id);
  }

  @Patch('purchases/:id')
  @Permissions('inventory.update')
  @ApiOperation({ summary: 'Update a purchase' })
  updatePurchase(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePurchaseDto,
  ) {
    return this.inventory.updatePurchase(id, dto);
  }

  @Delete('purchases/:id')
  @Permissions('inventory.delete')
  @ApiOperation({ summary: 'Delete a purchase' })
  removePurchase(@Param('id', ParseIntPipe) id: number) {
    return this.inventory.removePurchase(id);
  }

  @Post('purchases/:id/receive')
  @Permissions('inventory.movement')
  @ApiOperation({ summary: 'Mark a purchase as RECEIVED and post IN movements' })
  receivePurchase(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { targetWarehouseId: number },
  ) {
    return this.inventory.receivePurchase(id, body.targetWarehouseId);
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
    return this.inventory.createSupplierPayment(
      dto,
      user?.sub ? String(user.sub) : undefined,
    );
  }

  @Get('supplier-payments')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'List supplier payments' })
  listSupplierPayments(@Query() filters: SupplierPaymentFilterDto) {
    return this.inventory.findAllSupplierPayments(filters);
  }

  @Delete('supplier-payments/:id')
  @Permissions('inventory.delete')
  @ApiOperation({ summary: 'Delete a supplier payment (reverses its effect)' })
  removeSupplierPayment(@Param('id', ParseIntPipe) id: number) {
    return this.inventory.removeSupplierPayment(id);
  }

  // -------------------- ITEMS (must come last to avoid :id shadowing) --------------------

  @Post('items')
  @Permissions('inventory.create')
  @ApiOperation({ summary: 'Create an item' })
  createItem(@Body() dto: CreateItemDto) {
    return this.inventory.createItem(dto);
  }

  @Get('items')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'List items with stock totals' })
  listItems(@Query() filters: ItemFilterDto) {
    return this.inventory.findAllItems(filters);
  }

  @Get('items/:id')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Get an item with per-warehouse stock + recent movements' })
  getItem(@Param('id', ParseIntPipe) id: number) {
    return this.inventory.findOneItem(id);
  }

  @Patch('items/:id')
  @Permissions('inventory.update')
  @ApiOperation({ summary: 'Update an item' })
  updateItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateItemDto,
  ) {
    return this.inventory.updateItem(id, dto);
  }

  @Delete('items/:id')
  @Permissions('inventory.delete')
  @ApiOperation({ summary: 'Delete an item' })
  removeItem(@Param('id', ParseIntPipe) id: number) {
    return this.inventory.removeItem(id);
  }
}
