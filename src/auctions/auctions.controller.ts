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
import { AuctionsService } from './auctions.service';
import { CreateAuctionDto } from './dto/create-auction.dto';
import { UpdateAuctionDto } from './dto/update-auction.dto';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PermissionGuard } from '../guard/permissions.guard';
import { Permissions } from '../guard/permissions.decorator';

@ApiTags('Auctions')
@Controller('auctions')
@UseGuards(AuthGuard, PermissionGuard)
export class AuctionsController {
  constructor(private readonly auctionsService: AuctionsService) {}

  @Post()
  @Permissions('auction.create')
  @ApiOperation({ summary: 'Create an auction' })
  create(@Body() dto: CreateAuctionDto) {
    return this.auctionsService.create(dto);
  }

  @Get()
  @Permissions('auction.read')
  @ApiOperation({ summary: 'List auctions' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'mineralTypeId', required: false, type: String })
  @ApiQuery({ name: 'provinceId', required: false, type: Number })
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('mineralTypeId') mineralTypeId?: string,
    @Query('provinceId') provinceId?: string,
  ) {
    return this.auctionsService.findAll(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 10,
      search,
      mineralTypeId,
      provinceId ? parseInt(provinceId) : undefined,
    );
  }

  @Get('summary')
  @Permissions('auction.read')
  @ApiOperation({ summary: 'Auction summary for the dashboard' })
  summary() {
    return this.auctionsService.summary();
  }

  @Get(':id')
  @Permissions('auction.read')
  @ApiOperation({ summary: 'Get an auction by ID' })
  findOne(@Param('id') id: string) {
    return this.auctionsService.findOne(id);
  }

  @Patch(':id')
  @Permissions('auction.update')
  @ApiOperation({ summary: 'Update an auction' })
  update(@Param('id') id: string, @Body() dto: UpdateAuctionDto) {
    return this.auctionsService.update(id, dto);
  }

  @Delete(':id')
  @Permissions('auction.delete')
  @ApiOperation({ summary: 'Delete an auction' })
  remove(@Param('id') id: string) {
    return this.auctionsService.remove(id);
  }
}
