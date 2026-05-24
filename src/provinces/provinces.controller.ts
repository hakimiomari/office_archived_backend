import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/guard/auth.guard';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Reference-data endpoint: list all seeded Provinces.
 * Used by frontend pickers (e.g. the auctions form/filter). No specific
 * permission required beyond being authenticated — provinces are public
 * reference data.
 */
@ApiTags('Provinces')
@ApiBearerAuth()
@Controller('provinces')
@UseGuards(AuthGuard)
export class ProvincesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List all provinces' })
  findAll() {
    return this.prisma.province.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }
}
