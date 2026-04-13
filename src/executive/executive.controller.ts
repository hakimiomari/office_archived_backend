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
import { ExecutiveService } from './executive.service';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../guard/permissions.guard';
import { Permissions } from '../guard/permissions.decorator';
import { CreateKpiDto, UpdateKpiDto, KpiFilterDto } from './dto/kpi.dto';
import {
  CreateContractsSummaryDto,
  UpdateContractsSummaryDto,
  ContractsSummaryFilterDto,
} from './dto/contracts-summary.dto';
import {
  CreateTravelDto,
  UpdateTravelDto,
  TravelFilterDto,
} from './dto/travel.dto';

@ApiTags('Executive Dashboard')
@Controller('executive')
@UseGuards(AuthGuard, PermissionGuard)
export class ExecutiveController {
  constructor(private readonly executive: ExecutiveService) {}

  // -------------------- DASHBOARD --------------------

  @Get('dashboard')
  @Permissions('executive.read')
  @ApiOperation({ summary: 'Get the executive dashboard data for a year' })
  getDashboard(@Query('year') year?: string) {
    return this.executive.getDashboard(year ? parseInt(year) : undefined);
  }

  @Get('dashboard/revenue-trend')
  @Permissions('executive.read')
  @ApiOperation({ summary: 'Get yearly revenue/expense trend' })
  getRevenueTrend() {
    return this.executive.getRevenueTrend();
  }

  // -------------------- KPIs --------------------

  @Post('kpis')
  @Permissions('executive.create')
  @ApiOperation({ summary: 'Create a new KPI' })
  createKpi(@Body() dto: CreateKpiDto, @Req() req: Request) {
    const user = req['user'];
    return this.executive.createKpi(dto, user?.sub ? String(user.sub) : undefined);
  }

  @Post('kpis/upsert')
  @Permissions('executive.create')
  @ApiOperation({ summary: 'Upsert a KPI (create or update by key + year)' })
  upsertKpi(@Body() dto: CreateKpiDto, @Req() req: Request) {
    const user = req['user'];
    return this.executive.upsertKpi(dto, user?.sub ? String(user.sub) : undefined);
  }

  @Get('kpis')
  @Permissions('executive.read')
  @ApiOperation({ summary: 'List KPIs with optional filters' })
  listKpis(@Query() filters: KpiFilterDto) {
    return this.executive.findAllKpis(filters);
  }

  @Get('kpis/:id')
  @Permissions('executive.read')
  @ApiOperation({ summary: 'Get a KPI by id' })
  getKpi(@Param('id', ParseIntPipe) id: number) {
    return this.executive.findOneKpi(id);
  }

  @Patch('kpis/:id')
  @Permissions('executive.update')
  @ApiOperation({ summary: 'Update a KPI' })
  updateKpi(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateKpiDto,
    @Req() req: Request,
  ) {
    const user = req['user'];
    return this.executive.updateKpi(
      id,
      dto,
      user?.sub ? String(user.sub) : undefined,
    );
  }

  @Delete('kpis/:id')
  @Permissions('executive.delete')
  @ApiOperation({ summary: 'Delete a KPI' })
  removeKpi(@Param('id', ParseIntPipe) id: number) {
    return this.executive.removeKpi(id);
  }

  // -------------------- CONTRACTS SUMMARY --------------------

  @Post('contracts-summary')
  @Permissions('executive.create')
  @ApiOperation({ summary: 'Upsert contracts summary by year' })
  upsertContractsSummary(
    @Body() dto: CreateContractsSummaryDto,
    @Req() req: Request,
  ) {
    const user = req['user'];
    return this.executive.upsertContractsSummary(
      dto,
      user?.sub ? String(user.sub) : undefined,
    );
  }

  @Get('contracts-summary')
  @Permissions('executive.read')
  @ApiOperation({ summary: 'List all yearly contracts summaries' })
  listContractsSummaries(@Query() filters: ContractsSummaryFilterDto) {
    return this.executive.findAllContractsSummaries(filters);
  }

  @Get('contracts-summary/:year')
  @Permissions('executive.read')
  @ApiOperation({ summary: 'Get contracts summary for a specific year' })
  getContractsSummary(@Param('year', ParseIntPipe) year: number) {
    return this.executive.findOneContractsSummary(year);
  }

  @Patch('contracts-summary/:id')
  @Permissions('executive.update')
  @ApiOperation({ summary: 'Update a contracts summary' })
  updateContractsSummary(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateContractsSummaryDto,
    @Req() req: Request,
  ) {
    const user = req['user'];
    return this.executive.updateContractsSummary(
      id,
      dto,
      user?.sub ? String(user.sub) : undefined,
    );
  }

  @Delete('contracts-summary/:id')
  @Permissions('executive.delete')
  @ApiOperation({ summary: 'Delete a contracts summary' })
  removeContractsSummary(@Param('id', ParseIntPipe) id: number) {
    return this.executive.removeContractsSummary(id);
  }

  // -------------------- MINISTER TRAVELS --------------------

  @Post('travels')
  @Permissions('executive.create')
  @ApiOperation({ summary: 'Record a minister travel' })
  createTravel(@Body() dto: CreateTravelDto, @Req() req: Request) {
    const user = req['user'];
    return this.executive.createTravel(
      dto,
      user?.sub ? String(user.sub) : undefined,
    );
  }

  @Get('travels')
  @Permissions('executive.read')
  @ApiOperation({ summary: 'List minister travels with filters' })
  listTravels(@Query() filters: TravelFilterDto) {
    return this.executive.findAllTravels(filters);
  }

  @Get('travels/:id')
  @Permissions('executive.read')
  @ApiOperation({ summary: 'Get a travel by id' })
  getTravel(@Param('id', ParseIntPipe) id: number) {
    return this.executive.findOneTravel(id);
  }

  @Patch('travels/:id')
  @Permissions('executive.update')
  @ApiOperation({ summary: 'Update a travel' })
  updateTravel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTravelDto,
  ) {
    return this.executive.updateTravel(id, dto);
  }

  @Delete('travels/:id')
  @Permissions('executive.delete')
  @ApiOperation({ summary: 'Delete a travel' })
  removeTravel(@Param('id', ParseIntPipe) id: number) {
    return this.executive.removeTravel(id);
  }
}
