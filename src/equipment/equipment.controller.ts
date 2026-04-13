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
import { EquipmentService } from './equipment.service';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../guard/permissions.guard';
import { Permissions } from '../guard/permissions.decorator';
import {
  CreateEquipmentDto,
  UpdateEquipmentDto,
  EquipmentFilterDto,
} from './dto/equipment.dto';
import {
  CreateAssignmentDto,
  UpdateAssignmentDto,
  ReturnAssignmentDto,
  AssignmentFilterDto,
} from './dto/assignment.dto';
import {
  CreateMaintenanceDto,
  UpdateMaintenanceDto,
  MaintenanceFilterDto,
} from './dto/maintenance.dto';

@ApiTags('Equipment')
@Controller('equipment')
@UseGuards(AuthGuard, PermissionGuard)
export class EquipmentController {
  constructor(private readonly equipment: EquipmentService) {}

  // -------------------- REPORTS (before :id routes) --------------------

  @Get('summary')
  @Permissions('equipment.read')
  @ApiOperation({ summary: 'Get equipment summary (totals, status, categories)' })
  getSummary() {
    return this.equipment.getSummary();
  }

  @Get('warranty-expiring')
  @Permissions('equipment.read')
  @ApiOperation({ summary: 'Equipment with warranty expiring within N days' })
  getWarrantyExpiring(@Query('days') days?: string) {
    return this.equipment.getWarrantyExpiring(days ? parseInt(days) : 30);
  }

  // -------------------- ASSIGNMENTS --------------------

  @Post('assignments')
  @Permissions('equipment.assign')
  @ApiOperation({ summary: 'Assign equipment to an employee' })
  createAssignment(@Body() dto: CreateAssignmentDto, @Req() req: Request) {
    const user = req['user'];
    return this.equipment.createAssignment(
      dto,
      user?.sub ? String(user.sub) : undefined,
    );
  }

  @Get('assignments')
  @Permissions('equipment.read')
  @ApiOperation({ summary: 'List equipment assignments' })
  listAssignments(@Query() filters: AssignmentFilterDto) {
    return this.equipment.findAllAssignments(filters);
  }

  @Patch('assignments/:id/return')
  @Permissions('equipment.assign')
  @ApiOperation({ summary: 'Return an assignment' })
  returnAssignment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReturnAssignmentDto,
  ) {
    return this.equipment.returnAssignment(id, dto);
  }

  @Patch('assignments/:id')
  @Permissions('equipment.assign')
  @ApiOperation({ summary: 'Update an assignment' })
  updateAssignment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAssignmentDto,
  ) {
    return this.equipment.updateAssignment(id, dto);
  }

  @Delete('assignments/:id')
  @Permissions('equipment.assign')
  @ApiOperation({ summary: 'Delete an assignment' })
  removeAssignment(@Param('id', ParseIntPipe) id: number) {
    return this.equipment.removeAssignment(id);
  }

  // -------------------- MAINTENANCE --------------------

  @Post('maintenance')
  @Permissions('equipment.maintenance')
  @ApiOperation({ summary: 'Create a maintenance record' })
  createMaintenance(@Body() dto: CreateMaintenanceDto, @Req() req: Request) {
    const user = req['user'];
    return this.equipment.createMaintenance(
      dto,
      user?.sub ? String(user.sub) : undefined,
    );
  }

  @Get('maintenance')
  @Permissions('equipment.read')
  @ApiOperation({ summary: 'List maintenance records' })
  listMaintenance(@Query() filters: MaintenanceFilterDto) {
    return this.equipment.findAllMaintenance(filters);
  }

  @Patch('maintenance/:id')
  @Permissions('equipment.maintenance')
  @ApiOperation({ summary: 'Update a maintenance record' })
  updateMaintenance(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMaintenanceDto,
  ) {
    return this.equipment.updateMaintenance(id, dto);
  }

  @Delete('maintenance/:id')
  @Permissions('equipment.maintenance')
  @ApiOperation({ summary: 'Delete a maintenance record' })
  removeMaintenance(@Param('id', ParseIntPipe) id: number) {
    return this.equipment.removeMaintenance(id);
  }

  // -------------------- EQUIPMENT --------------------

  @Post()
  @Permissions('equipment.create')
  @ApiOperation({ summary: 'Create a new equipment' })
  createEquipment(@Body() dto: CreateEquipmentDto, @Req() req: Request) {
    const user = req['user'];
    return this.equipment.createEquipment(
      dto,
      user?.sub ? String(user.sub) : undefined,
    );
  }

  @Get()
  @Permissions('equipment.read')
  @ApiOperation({ summary: 'List equipment with filters' })
  listEquipment(@Query() filters: EquipmentFilterDto) {
    return this.equipment.findAllEquipment(filters);
  }

  @Get(':id')
  @Permissions('equipment.read')
  @ApiOperation({ summary: 'Get equipment by id' })
  getEquipment(@Param('id', ParseIntPipe) id: number) {
    return this.equipment.findOneEquipment(id);
  }

  @Patch(':id')
  @Permissions('equipment.update')
  @ApiOperation({ summary: 'Update equipment' })
  updateEquipment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEquipmentDto,
  ) {
    return this.equipment.updateEquipment(id, dto);
  }

  @Patch(':id/retire')
  @Permissions('equipment.update')
  @ApiOperation({ summary: 'Retire equipment (mark as retired)' })
  retireEquipment(@Param('id', ParseIntPipe) id: number) {
    return this.equipment.retireEquipment(id);
  }

  @Delete(':id')
  @Permissions('equipment.delete')
  @ApiOperation({ summary: 'Delete equipment' })
  removeEquipment(@Param('id', ParseIntPipe) id: number) {
    return this.equipment.removeEquipment(id);
  }
}
