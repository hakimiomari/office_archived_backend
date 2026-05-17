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
import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../guard/permissions.guard';
import { Permissions } from '../guard/permissions.decorator';

@ApiTags('Contracts')
@Controller('contracts')
@UseGuards(AuthGuard, PermissionGuard)
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Post()
  @Permissions('contract.create')
  @ApiOperation({ summary: 'Create a contract linking a company to a license' })
  create(@Body() dto: CreateContractDto) {
    return this.contractsService.create(dto);
  }

  @Get()
  @Permissions('contract.read')
  @ApiOperation({ summary: 'List contracts (optionally filter by company / license)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'companyId', required: false, type: String })
  @ApiQuery({ name: 'licenseId', required: false, type: String })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('companyId') companyId?: string,
    @Query('licenseId') licenseId?: string,
  ) {
    return this.contractsService.findAll(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 10,
      companyId,
      licenseId,
    );
  }

  @Get(':id')
  @Permissions('contract.read')
  @ApiOperation({ summary: 'Get a contract by ID' })
  findOne(@Param('id') id: string) {
    return this.contractsService.findOne(id);
  }

  @Patch(':id')
  @Permissions('contract.update')
  @ApiOperation({ summary: 'Update a contract' })
  update(@Param('id') id: string, @Body() dto: UpdateContractDto) {
    return this.contractsService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('contract.delete')
  @ApiOperation({ summary: 'Delete a contract' })
  remove(@Param('id') id: string) {
    return this.contractsService.remove(id);
  }
}
