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
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Request } from 'express';
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
  @ApiOperation({ summary: 'Create a contract' })
  create(@Body() dto: CreateContractDto, @Req() req: Request) {
    const user = req['user'];
    const userId = user?.sub ? Number(user.sub) : undefined;
    return this.contractsService.create(dto, userId);
  }

  @Get()
  @Permissions('contract.read')
  @ApiOperation({ summary: 'List contracts' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.contractsService.findAll(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 10,
      search,
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
  update(
    @Param('id') id: string,
    @Body() dto: UpdateContractDto,
    @Req() req: Request,
  ) {
    const user = req['user'];
    const userId = user?.sub ? Number(user.sub) : undefined;
    return this.contractsService.update(id, dto, userId);
  }

  @Delete(':id')
  @Permissions('contract.delete')
  @ApiOperation({ summary: 'Delete a contract' })
  remove(@Param('id') id: string) {
    return this.contractsService.remove(id);
  }
}
