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
import { LicensesService } from './licenses.service';
import { CreateLicenseDto } from './dto/create-license.dto';
import { UpdateLicenseDto } from './dto/update-license.dto';
import { AuthGuard } from '../auth/guard/auth.guard';
import { Request } from 'express';

@ApiTags('Licenses')
@Controller('licenses')
@UseGuards(AuthGuard)
export class LicensesController {
  constructor(private readonly licensesService: LicensesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new license' })
  create(@Body() dto: CreateLicenseDto, @Req() req: Request) {
    const user = req['user'];
    return this.licensesService.create(dto, String(user.sub));
  }

  @Get()
  @ApiOperation({ summary: 'Get all licenses with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.licensesService.findAll(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 10,
      search,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a license by ID' })
  findOne(@Param('id') id: string) {
    return this.licensesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a license' })
  update(@Param('id') id: string, @Body() dto: UpdateLicenseDto) {
    return this.licensesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a license' })
  remove(@Param('id') id: string) {
    return this.licensesService.remove(id);
  }
}
