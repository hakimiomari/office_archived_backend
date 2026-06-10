import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../guard/permissions.guard';
import { Permissions } from '../guard/permissions.decorator';
import { SubscriptionModuleGuard } from '../subscriptions/guards/subscription-module.guard';
import { SubscriptionFeatureGuard } from '../subscriptions/guards/subscription-feature.guard';
import { RequireModule } from '../subscriptions/decorators/require-module.decorator';
import { ModuleCode } from '@prisma/client';
import { StockCountsService } from './stock-counts.service';
import {
  CompleteCountDto,
  CreateStockCountDto,
  StockCountFilterDto,
  SubmitCountDto,
} from './stock-counts.dto';

@ApiTags('Stock Counts')
@Controller('stock-counts')
@UseGuards(
  AuthGuard,
  SubscriptionModuleGuard,
  SubscriptionFeatureGuard,
  PermissionGuard,
)
@RequireModule(ModuleCode.STOCK_COUNTS)
export class StockCountsController {
  constructor(private readonly service: StockCountsService) {}

  @Get('reports/variance')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Variance summary across completed counts' })
  variance(@Query('days') days?: string) {
    return this.service.varianceSummary(days ? Number(days) : 90);
  }

  @Post()
  @Permissions('inventory.create')
  @ApiOperation({ summary: 'Open a new cycle count' })
  create(@Body() dto: CreateStockCountDto, @Req() req: Request) {
    const user = req['user'];
    return this.service.create(
      dto,
      user?.sub ? String(user.sub) : undefined,
    );
  }

  @Get()
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'List stock counts' })
  list(@Query() filters: StockCountFilterDto) {
    return this.service.findAll(filters);
  }

  @Get(':id')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Get a stock count' })
  get(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post(':id/submit')
  @Permissions('inventory.update')
  @ApiOperation({ summary: 'Record counted quantities' })
  submit(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitCountDto,
  ) {
    return this.service.submit(id, dto);
  }

  @Post(':id/complete')
  @Permissions('inventory.update')
  @ApiOperation({ summary: 'Complete and (optionally) apply adjustments' })
  complete(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompleteCountDto,
    @Req() req: Request,
  ) {
    const user = req['user'];
    return this.service.complete(
      id,
      dto,
      user?.sub ? Number(user.sub) : undefined,
    );
  }

  @Post(':id/cancel')
  @Permissions('inventory.update')
  @ApiOperation({ summary: 'Cancel an in-progress count' })
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.service.cancel(id);
  }

  @Delete(':id')
  @Permissions('inventory.delete')
  @ApiOperation({ summary: 'Delete a stock count' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
