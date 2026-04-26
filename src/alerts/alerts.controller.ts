import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../guard/permissions.guard';
import { Permissions } from '../guard/permissions.decorator';
import { AlertsService } from './alerts.service';
import { AlertFilterDto } from './alerts.dto';

@ApiTags('Alerts')
@Controller('alerts')
@UseGuards(AuthGuard, PermissionGuard)
export class AlertsController {
  constructor(private readonly service: AlertsService) {}

  @Get()
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'List inventory alerts' })
  list(@Query() filters: AlertFilterDto) {
    return this.service.findAll(filters);
  }

  @Post('scan')
  @Permissions('inventory.update')
  @ApiOperation({ summary: 'Force-rerun the threshold scanner' })
  scan() {
    return this.service.scanAll();
  }

  @Post('scan-dead-stock')
  @Permissions('inventory.update')
  @ApiOperation({ summary: 'Force-rerun the dead-stock scanner' })
  scanDead(@Body() body: { days?: number } = {}) {
    return this.service.scanDeadStock(body.days ?? 90);
  }

  @Post('dispatch')
  @Permissions('inventory.update')
  @ApiOperation({ summary: 'Dispatch all OPEN alerts (email/webhook hook)' })
  dispatch() {
    return this.service.dispatchOpen();
  }

  @Post(':id/acknowledge')
  @Permissions('inventory.update')
  @ApiOperation({ summary: 'Acknowledge an alert' })
  acknowledge(@Param('id', ParseIntPipe) id: number) {
    return this.service.acknowledge(id);
  }

  @Post(':id/resolve')
  @Permissions('inventory.update')
  @ApiOperation({ summary: 'Resolve an alert' })
  resolve(@Param('id', ParseIntPipe) id: number) {
    return this.service.resolve(id);
  }

  @Delete(':id')
  @Permissions('inventory.delete')
  @ApiOperation({ summary: 'Delete an alert' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
