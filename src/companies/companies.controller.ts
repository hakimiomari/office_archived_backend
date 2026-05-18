import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../guard/permissions.guard';
import { Permissions } from '../guard/permissions.decorator';

@ApiTags('Companies')
@Controller('companies')
@UseGuards(AuthGuard, PermissionGuard)
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Post()
  @Permissions('company.create')
  @ApiOperation({ summary: 'Create a new company' })
  create(@Body() dto: CreateCompanyDto) {
    return this.companiesService.create(dto);
  }

  @Get()
  @Permissions('company.read')
  @ApiOperation({ summary: 'Get all companies with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.companiesService.findAll(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 10,
      search,
    );
  }

  @Get(':id')
  @Permissions('company.read')
  @ApiOperation({ summary: 'Get a company by ID' })
  findOne(@Param('id') id: string) {
    return this.companiesService.findOne(id);
  }

  @Patch(':id')
  @Permissions('company.update')
  @ApiOperation({ summary: 'Update a company' })
  update(@Param('id') id: string, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('company.delete')
  @ApiOperation({ summary: 'Delete a company' })
  remove(@Param('id') id: string) {
    return this.companiesService.remove(id);
  }

  // ---- Owners ----

  @Post(':id/owners')
  @Permissions('owner.create')
  @ApiOperation({ summary: 'Add an owner to a company' })
  addOwner(@Param('id') id: string, @Body() dto: CreateOwnerDto) {
    return this.companiesService.addOwner(id, dto);
  }

  @Patch(':id/owners/:ownerId')
  @Permissions('owner.update')
  @ApiOperation({ summary: 'Update an owner of a company' })
  updateOwner(
    @Param('id') id: string,
    @Param('ownerId') ownerId: string,
    @Body() dto: UpdateOwnerDto,
  ) {
    return this.companiesService.updateOwner(id, ownerId, dto);
  }

  @Delete(':id/owners/:ownerId')
  @Permissions('owner.delete')
  @ApiOperation({ summary: 'Remove an owner from a company' })
  removeOwner(
    @Param('id') id: string,
    @Param('ownerId') ownerId: string,
  ) {
    return this.companiesService.removeOwner(id, ownerId);
  }
}
