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
import { MineralTypesService } from './mineral-types.service';
import { CreateMineralTypeDto } from './dto/create-mineral-type.dto';
import { UpdateMineralTypeDto } from './dto/update-mineral-type.dto';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../guard/permissions.guard';
import { Permissions } from '../guard/permissions.decorator';

@ApiTags('Mineral Types')
@Controller('mineral-types')
@UseGuards(AuthGuard, PermissionGuard)
export class MineralTypesController {
  constructor(private readonly mineralTypesService: MineralTypesService) {}

  @Post()
  @Permissions('mineraltype.create')
  @ApiOperation({ summary: 'Create a mineral type' })
  create(@Body() dto: CreateMineralTypeDto) {
    return this.mineralTypesService.create(dto);
  }

  @Get()
  @Permissions('mineraltype.read')
  @ApiOperation({ summary: 'List mineral types' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.mineralTypesService.findAll(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 100,
      search,
    );
  }

  @Get(':id')
  @Permissions('mineraltype.read')
  @ApiOperation({ summary: 'Get a mineral type by ID' })
  findOne(@Param('id') id: string) {
    return this.mineralTypesService.findOne(id);
  }

  @Patch(':id')
  @Permissions('mineraltype.update')
  @ApiOperation({ summary: 'Update a mineral type' })
  update(@Param('id') id: string, @Body() dto: UpdateMineralTypeDto) {
    return this.mineralTypesService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('mineraltype.delete')
  @ApiOperation({ summary: 'Delete a mineral type' })
  remove(@Param('id') id: string) {
    return this.mineralTypesService.remove(id);
  }
}
