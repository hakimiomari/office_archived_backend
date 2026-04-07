import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { ReportFilterDto, ExportFilterDto } from './dto/report-filter.dto';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../guard/permissions.guard';
import { Permissions } from '../guard/permissions.decorator';
import { Response } from 'express';

@ApiTags('Reports')
@Controller('reports')
@UseGuards(AuthGuard, PermissionGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('licenses')
  @Permissions('report.view')
  @ApiOperation({ summary: 'Get license report with filters and aggregations' })
  getLicenseReport(@Query() filters: ReportFilterDto) {
    return this.reportsService.getLicenseReport(filters);
  }

  @Get('licenses/charts')
  @Permissions('report.view')
  @ApiOperation({ summary: 'Get chart data for license reports' })
  getChartData(@Query() filters: ReportFilterDto) {
    return this.reportsService.getChartData(filters);
  }

  @Get('licenses/export')
  @Permissions('report.export')
  @ApiOperation({ summary: 'Export license report as PDF, Excel, or CSV' })
  @ApiQuery({ name: 'type', required: false, enum: ['pdf', 'excel', 'csv'] })
  async exportLicenses(
    @Query() filters: ExportFilterDto,
    @Res() res: Response,
  ) {
    const { buffer, contentType, fileName } =
      await this.reportsService.exportLicenses(filters);

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': buffer.length,
    });

    res.end(buffer);
  }
}
