import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateKpiDto, UpdateKpiDto, KpiFilterDto } from './dto/kpi.dto';
import {
  CreateContractsSummaryDto,
  UpdateContractsSummaryDto,
} from './dto/contracts-summary.dto';
import {
  CreateTravelDto,
  UpdateTravelDto,
  TravelFilterDto,
} from './dto/travel.dto';

@Injectable()
export class ExecutiveService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  //                                   KPIs
  // =========================================================================

  async upsertKpi(dto: CreateKpiDto, userId?: string) {
    return this.prisma.dashboardKpi.upsert({
      where: { key_year: { key: dto.key, year: dto.year } },
      create: { ...dto, createdBy: userId, updatedBy: userId },
      update: {
        value: dto.value,
        category: dto.category,
        label: dto.label,
        description: dto.description,
        updatedBy: userId,
      },
    });
  }

  async createKpi(dto: CreateKpiDto, userId?: string) {
    try {
      return await this.prisma.dashboardKpi.create({
        data: { ...dto, createdBy: userId, updatedBy: userId },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new BadRequestException(
          `KPI "${dto.key}" for year ${dto.year} already exists — use update or upsert`,
        );
      }
      throw err;
    }
  }

  async findAllKpis(filters: KpiFilterDto) {
    const where: Prisma.DashboardKpiWhereInput = {};
    if (filters.year) where.year = filters.year;
    if (filters.category) where.category = filters.category;
    return this.prisma.dashboardKpi.findMany({
      where,
      orderBy: [{ year: 'desc' }, { category: 'asc' }, { key: 'asc' }],
    });
  }

  async findOneKpi(id: number) {
    const kpi = await this.prisma.dashboardKpi.findUnique({ where: { id } });
    if (!kpi) throw new NotFoundException(`KPI ${id} not found`);
    return kpi;
  }

  async updateKpi(id: number, dto: UpdateKpiDto, userId?: string) {
    await this.findOneKpi(id);
    return this.prisma.dashboardKpi.update({
      where: { id },
      data: { ...dto, updatedBy: userId },
    });
  }

  async removeKpi(id: number) {
    await this.findOneKpi(id);
    return this.prisma.dashboardKpi.delete({ where: { id } });
  }

  // =========================================================================
  //                            CONTRACTS SUMMARY
  // =========================================================================

  async upsertContractsSummary(
    dto: CreateContractsSummaryDto,
    userId?: string,
  ) {
    return this.prisma.contractsSummary.upsert({
      where: { year: dto.year },
      create: {
        year: dto.year,
        totalContracts: dto.totalContracts ?? 0,
        activeContracts: dto.activeContracts ?? 0,
        suspendedContracts: dto.suspendedContracts ?? 0,
        cancelledContracts: dto.cancelledContracts ?? 0,
        notes: dto.notes,
        createdBy: userId,
        updatedBy: userId,
      },
      update: {
        totalContracts: dto.totalContracts,
        activeContracts: dto.activeContracts,
        suspendedContracts: dto.suspendedContracts,
        cancelledContracts: dto.cancelledContracts,
        notes: dto.notes,
        updatedBy: userId,
      },
    });
  }

  async findAllContractsSummaries() {
    return this.prisma.contractsSummary.findMany({
      orderBy: { year: 'desc' },
    });
  }

  async findOneContractsSummary(year: number) {
    return this.prisma.contractsSummary.findUnique({ where: { year } });
  }

  async updateContractsSummary(
    id: number,
    dto: UpdateContractsSummaryDto,
    userId?: string,
  ) {
    const existing = await this.prisma.contractsSummary.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException(`ContractsSummary ${id} not found`);
    return this.prisma.contractsSummary.update({
      where: { id },
      data: { ...dto, updatedBy: userId },
    });
  }

  async removeContractsSummary(id: number) {
    const existing = await this.prisma.contractsSummary.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException(`ContractsSummary ${id} not found`);
    return this.prisma.contractsSummary.delete({ where: { id } });
  }

  // =========================================================================
  //                            MINISTER TRAVELS
  // =========================================================================

  async createTravel(dto: CreateTravelDto, userId?: string) {
    return this.prisma.ministerTravel.create({
      data: {
        type: dto.type,
        destination: dto.destination,
        purpose: dto.purpose,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        cost: dto.cost ?? 0,
        createdBy: userId,
      },
    });
  }

  async findAllTravels(filters: TravelFilterDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.MinisterTravelWhereInput = {};
    const AND: Prisma.MinisterTravelWhereInput[] = [];

    if (filters.search) {
      AND.push({
        OR: [
          { destination: { contains: filters.search, mode: 'insensitive' } },
          { purpose: { contains: filters.search, mode: 'insensitive' } },
        ],
      });
    }
    if (filters.type) AND.push({ type: filters.type });
    if (filters.year) {
      AND.push({
        startDate: {
          gte: new Date(`${filters.year}-01-01`),
          lt: new Date(`${filters.year + 1}-01-01`),
        },
      });
    }

    if (AND.length > 0) where.AND = AND;

    const [data, total] = await Promise.all([
      this.prisma.ministerTravel.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startDate: 'desc' },
      }),
      this.prisma.ministerTravel.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneTravel(id: number) {
    const travel = await this.prisma.ministerTravel.findUnique({
      where: { id },
    });
    if (!travel) throw new NotFoundException(`Travel ${id} not found`);
    return travel;
  }

  async updateTravel(id: number, dto: UpdateTravelDto) {
    await this.findOneTravel(id);
    return this.prisma.ministerTravel.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.startDate && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate !== undefined && {
          endDate: dto.endDate ? new Date(dto.endDate) : null,
        }),
      },
    });
  }

  async removeTravel(id: number) {
    await this.findOneTravel(id);
    return this.prisma.ministerTravel.delete({ where: { id } });
  }

  // =========================================================================
  //                             DASHBOARD / REPORTS
  // =========================================================================

  /** Core executive dashboard data — combines manual KPIs + calculated metrics */
  async getDashboard(year?: number) {
    const currentYear = year ?? new Date().getFullYear();
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
    const yearStart = new Date(`${currentYear}-01-01`);
    const yearEnd = new Date(`${currentYear + 1}-01-01`);

    const [
      kpis,
      contractsSummary,
      travels,
      domesticTravels,
      internationalTravels,
      travelCostSum,
      recentTravels,
      allYearsSummary,
    ] = await Promise.all([
      this.prisma.dashboardKpi.findMany({
        where: { year: currentYear },
        orderBy: { key: 'asc' },
      }),
      this.prisma.contractsSummary.findUnique({ where: { year: currentYear } }),
      this.prisma.ministerTravel.count({
        where: { startDate: { gte: yearStart, lt: yearEnd } },
      }),
      this.prisma.ministerTravel.count({
        where: {
          type: 'DOMESTIC',
          startDate: { gte: yearStart, lt: yearEnd },
        },
      }),
      this.prisma.ministerTravel.count({
        where: {
          type: 'INTERNATIONAL',
          startDate: { gte: yearStart, lt: yearEnd },
        },
      }),
      this.prisma.ministerTravel.aggregate({
        where: { startDate: { gte: yearStart, lt: yearEnd } },
        _sum: { cost: true },
      }),
      this.prisma.ministerTravel.findMany({
        orderBy: { startDate: 'desc' },
        take: 10,
      }),
      this.prisma.contractsSummary.findMany({
        orderBy: { year: 'asc' },
        take: 10,
      }),
    ]);

    // Helper to find a KPI value by key
    const kpiValue = (key: string): number | null => {
      const k = kpis.find((k) => k.key === key);
      return k ? k.value : null;
    };

    const totalRevenue = kpiValue('totalRevenue');
    const totalExpenses = kpiValue('totalExpenses');
    const netProfit =
      totalRevenue !== null && totalExpenses !== null
        ? totalRevenue - totalExpenses
        : null;

    return {
      year: currentYear,
      financial: {
        totalRevenue,
        totalExpenses,
        netProfit,
      },
      contracts: contractsSummary ?? {
        year: currentYear,
        totalContracts: 0,
        activeContracts: 0,
        suspendedContracts: 0,
        cancelledContracts: 0,
      },
      travel: {
        total: travels,
        domestic: domesticTravels,
        international: internationalTravels,
        totalCost: travelCostSum._sum.cost ?? 0,
      },
      recentTravels,
      contractsYearlyTrend: allYearsSummary,
      kpis,
    };
  }

  /** Revenue/expense trend across multiple years */
  async getRevenueTrend() {
    const rows = await this.prisma.dashboardKpi.findMany({
      where: { key: { in: ['totalRevenue', 'totalExpenses'] } },
      orderBy: [{ year: 'asc' }, { key: 'asc' }],
    });
    const byYear = new Map<
      number,
      { year: number; revenue: number; expenses: number }
    >();
    for (const row of rows) {
      if (!byYear.has(row.year)) {
        byYear.set(row.year, { year: row.year, revenue: 0, expenses: 0 });
      }
      const entry = byYear.get(row.year)!;
      if (row.key === 'totalRevenue') entry.revenue = row.value;
      if (row.key === 'totalExpenses') entry.expenses = row.value;
    }
    return Array.from(byYear.values()).sort((a, b) => a.year - b.year);
  }
}
