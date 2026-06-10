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
import { EmployeesService } from './employees.service';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../guard/permissions.guard';
import { Permissions } from '../guard/permissions.decorator';
import { SubscriptionModuleGuard } from '../subscriptions/guards/subscription-module.guard';
import { SubscriptionFeatureGuard } from '../subscriptions/guards/subscription-feature.guard';
import { RequireModule } from '../subscriptions/decorators/require-module.decorator';
import { ModuleCode } from '@prisma/client';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  EmployeeFilterDto,
} from './dto/employee.dto';
import {
  CreateDepartmentDto,
  UpdateDepartmentDto,
  DepartmentFilterDto,
} from './dto/department.dto';

@ApiTags('Employees (HR)')
@Controller('employees')
@UseGuards(
  AuthGuard,
  SubscriptionModuleGuard,
  SubscriptionFeatureGuard,
  PermissionGuard,
)
@RequireModule(ModuleCode.EMPLOYEES)
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  // -------------------- REPORTS (before :id routes) --------------------

  @Get('summary')
  @Permissions('employee.read')
  @ApiOperation({ summary: 'Get employee summary (counts, departments)' })
  getSummary() {
    return this.employees.getSummary();
  }

  // -------------------- DEPARTMENTS --------------------

  @Post('departments')
  @Permissions('department.create')
  @ApiOperation({ summary: 'Create a department' })
  createDepartment(@Body() dto: CreateDepartmentDto) {
    return this.employees.createDepartment(dto);
  }

  @Get('departments')
  @Permissions('department.read')
  @ApiOperation({ summary: 'List departments' })
  listDepartments(@Query() filters: DepartmentFilterDto) {
    return this.employees.findAllDepartments(filters);
  }

  @Get('departments/:id')
  @Permissions('department.read')
  @ApiOperation({ summary: 'Get a department by id' })
  getDepartment(@Param('id', ParseIntPipe) id: number) {
    return this.employees.findOneDepartment(id);
  }

  @Patch('departments/:id')
  @Permissions('department.update')
  @ApiOperation({ summary: 'Update a department' })
  updateDepartment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateDepartmentDto,
  ) {
    return this.employees.updateDepartment(id, dto);
  }

  @Delete('departments/:id')
  @Permissions('department.delete')
  @ApiOperation({ summary: 'Delete a department' })
  removeDepartment(@Param('id', ParseIntPipe) id: number) {
    return this.employees.removeDepartment(id);
  }

  // -------------------- EMPLOYEES --------------------

  @Post()
  @Permissions('employee.create')
  @ApiOperation({ summary: 'Create an employee' })
  createEmployee(@Body() dto: CreateEmployeeDto, @Req() req: Request) {
    const user = req['user'];
    return this.employees.createEmployee(
      dto,
      user?.sub ? String(user.sub) : undefined,
    );
  }

  @Get()
  @Permissions('employee.read')
  @ApiOperation({ summary: 'List employees with filters' })
  listEmployees(@Query() filters: EmployeeFilterDto) {
    return this.employees.findAllEmployees(filters);
  }

  @Get(':id')
  @Permissions('employee.read')
  @ApiOperation({ summary: 'Get employee by id' })
  getEmployee(@Param('id', ParseIntPipe) id: number) {
    return this.employees.findOneEmployee(id);
  }

  @Patch(':id')
  @Permissions('employee.update')
  @ApiOperation({ summary: 'Update an employee' })
  updateEmployee(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeDto,
  ) {
    return this.employees.updateEmployee(id, dto);
  }

  @Delete(':id')
  @Permissions('employee.delete')
  @ApiOperation({ summary: 'Delete an employee' })
  removeEmployee(@Param('id', ParseIntPipe) id: number) {
    return this.employees.removeEmployee(id);
  }
}
