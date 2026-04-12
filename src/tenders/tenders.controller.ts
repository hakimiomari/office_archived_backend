import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { TendersService, TenderExportType } from './tenders.service';
import { MompScraperService } from './scraper/momp-scraper.service';
import { CreateTenderDto } from './dto/create-tender.dto';
import { UpdateTenderDto } from './dto/update-tender.dto';
import { TenderFilterDto } from './dto/tender-filter.dto';
import { CreateTenderActivityDto } from './dto/tender-activity.dto';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../guard/permissions.guard';
import { Permissions } from '../guard/permissions.decorator';
import { Request } from 'express';

@ApiTags('Tenders')
@Controller('tenders')
@UseGuards(AuthGuard, PermissionGuard)
export class TendersController {
  constructor(
    private readonly tendersService: TendersService,
    private readonly mompScraper: MompScraperService,
  ) {}

  // -------------- SCRAPER --------------

  @Post('scrape')
  @Permissions('tender.create')
  @ApiOperation({ summary: 'Manually trigger the MoMP tender scraper' })
  triggerScrape() {
    return this.mompScraper.scrapeAll();
  }

  // -------------- EXPORT (must come BEFORE :id routes) --------------

  @Get('export')
  @Permissions('tender.read')
  @ApiOperation({ summary: 'Export tenders as PDF, Excel, or CSV' })
  @ApiQuery({ name: 'format', required: false, enum: ['pdf', 'excel', 'csv'] })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'sector', required: false, type: String })
  @ApiQuery({ name: 'type', required: false, type: String })
  async exportTenders(
    @Query() filters: TenderFilterDto,
    @Query('format') format: TenderExportType = 'excel',
    @Res() res: Response,
  ) {
    const { buffer, contentType, fileName } =
      await this.tendersService.exportTenders(filters, format);

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  // -------------- REPORTS (must come BEFORE :id routes) --------------

  @Get('reports/summary')
  @Permissions('tender.read')
  @ApiOperation({ summary: 'Summary cards: total, open, closed, closing soon, high priority' })
  reportSummary() {
    return this.tendersService.reportSummary();
  }

  @Get('reports/status')
  @Permissions('tender.read')
  @ApiOperation({ summary: 'Count tenders grouped by status' })
  reportStatus() {
    return this.tendersService.reportStatusCounts();
  }

  @Get('reports/sector')
  @Permissions('tender.read')
  @ApiOperation({ summary: 'Count tenders grouped by sector' })
  reportSector() {
    return this.tendersService.reportSectorDistribution();
  }

  @Get('reports/type')
  @Permissions('tender.read')
  @ApiOperation({ summary: 'Count tenders grouped by type' })
  reportType() {
    return this.tendersService.reportTypeDistribution();
  }

  @Get('reports/monthly')
  @Permissions('tender.read')
  @ApiOperation({ summary: 'Monthly tender publish trend (last 12 months)' })
  reportMonthly() {
    return this.tendersService.reportMonthlyTrend();
  }

  @Get('reports/closing-soon')
  @Permissions('tender.read')
  @ApiOperation({ summary: 'List tenders closing within N days (default 7)' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  reportClosingSoon(@Query('days') days?: string) {
    return this.tendersService.reportClosingSoon(days ? parseInt(days) : 7);
  }

  @Get('reports/activity')
  @Permissions('tender.read')
  @ApiOperation({ summary: 'Tender action activity counts' })
  reportActivity() {
    return this.tendersService.reportActivityCounts();
  }

  // -------------- CRUD --------------

  @Post()
  @Permissions('tender.create')
  @ApiOperation({ summary: 'Create a new tender' })
  create(@Body() dto: CreateTenderDto) {
    return this.tendersService.create(dto);
  }

  @Get()
  @Permissions('tender.read')
  @ApiOperation({ summary: 'List tenders with filters and pagination' })
  findAll(@Query() filters: TenderFilterDto) {
    return this.tendersService.findAll(filters);
  }

  @Get(':id')
  @Permissions('tender.read')
  @ApiOperation({ summary: 'Get a tender by ID' })
  findOne(@Param('id') id: string) {
    return this.tendersService.findOne(id);
  }

  @Patch(':id')
  @Permissions('tender.update')
  @ApiOperation({ summary: 'Update a tender' })
  update(@Param('id') id: string, @Body() dto: UpdateTenderDto) {
    return this.tendersService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('tender.delete')
  @ApiOperation({ summary: 'Delete a tender' })
  remove(@Param('id') id: string) {
    return this.tendersService.remove(id);
  }

  // -------------- ACTIVITY --------------

  @Post(':id/activity')
  @Permissions('tender.read')
  @ApiOperation({ summary: 'Log a tender activity (view, apply, ignore, etc.)' })
  logActivity(
    @Param('id') id: string,
    @Body() dto: CreateTenderActivityDto,
    @Req() req: Request,
  ) {
    const user = req['user'];
    return this.tendersService.logActivity(
      id,
      dto,
      user?.sub ? Number(user.sub) : undefined,
    );
  }
}
