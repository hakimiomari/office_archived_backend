import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { TenantService } from "../tenant/tenant.service";
import { ChartOfAccountsService } from "../accounting/chart-of-accounts.service";
import {
  CompanyFilterDto,
  CreateCompanyDto,
  UpdateCompanyDto,
} from "./companies.dto";

/**
 * Companies are the tenants. Every CRUD on this model bypasses the
 * tenant-scoped Prisma extension (which doesn't apply to the Company model
 * itself — it's not in TENANT_MODELS) so SUPER_ADMIN sees all of them.
 */
@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenants: TenantService,
    private readonly chart: ChartOfAccountsService,
  ) {}

  // The Company model is not in TENANT_MODELS so the extension passes calls
  // through unchanged. We cast to PrismaClient just for clearer typing.
  private get db() {
    return this.prisma as unknown as PrismaClient;
  }

  async create(dto: CreateCompanyDto) {
    let company;
    try {
      company = await this.db.company.create({ data: dto });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new ConflictException(
          "A company with this name or slug already exists",
        );
      }
      throw e;
    }
    // Seed the standard chart of accounts inside the new tenant's
    // context so every business event afterward has the codes it
    // needs to post journal entries. `seedDefault()` is idempotent,
    // so a follow-up `/accounting/seed` is harmless.
    await this.tenants.runForCompany(company.id, () =>
      this.chart.seedDefault(),
    );
    return company;
  }

  async findAll(filters: CompanyFilterDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;
    const where: Prisma.CompanyWhereInput = filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: "insensitive" } },
            { slug: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      this.db.company.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: {
              users: true,
              items: true,
              warehouses: true,
              sales: true,
              customers: true,
            },
          },
        },
      }),
      this.db.company.count({ where }),
    ]);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
    const c = await this.db.company.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            users: true,
            items: true,
            warehouses: true,
            sales: true,
            purchases: true,
            customers: true,
            employees: true,
          },
        },
      },
    });
    if (!c) throw new NotFoundException(`Company ${id} not found`);
    return c;
  }

  async update(id: number, dto: UpdateCompanyDto) {
    await this.findOne(id);
    try {
      return await this.db.company.update({ where: { id }, data: dto });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new ConflictException("Conflicting name or slug");
      }
      throw e;
    }
  }

  async setActive(id: number, isActive: boolean) {
    await this.findOne(id);
    return this.db.company.update({ where: { id }, data: { isActive } });
  }

  async remove(id: number) {
    await this.findOne(id);
    // Cascade is configured at the schema level — deleting a company removes
    // all its tenant-scoped data. Use with care.
    return this.db.company.delete({ where: { id } });
  }

  /**
   * Cross-tenant stats for the super-admin dashboard. SUPER_ADMIN only —
   * everything aggregated across companies. Bypasses the tenant extension
   * because Company is not a tenant model.
   */
  async stats() {
    const [
      totalCompanies,
      activeCompanies,
      totalUsers,
      totalItems,
      totalWarehouses,
      totalSales,
      totalRevenue,
      totalPurchases,
      recentCompanies,
    ] = await Promise.all([
      this.db.company.count(),
      this.db.company.count({ where: { isActive: true } }),
      this.db.user.count(),
      this.db.item.count(),
      this.db.warehouse.count(),
      this.db.sale.count({ where: { saleStatus: 'COMPLETED' } }),
      this.db.sale.aggregate({
        where: { saleStatus: 'COMPLETED' },
        _sum: { totalAmount: true },
      }),
      this.db.purchase.aggregate({
        where: { status: 'RECEIVED' },
        _sum: { totalAmount: true },
      }),
      this.db.company.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          isActive: true,
          createdAt: true,
          _count: { select: { users: true, items: true, sales: true } },
        },
      }),
    ]);
    return {
      totalCompanies,
      activeCompanies,
      inactiveCompanies: totalCompanies - activeCompanies,
      totalUsers,
      totalItems,
      totalWarehouses,
      totalSales,
      totalRevenue: totalRevenue._sum.totalAmount ?? 0,
      totalPurchases: totalPurchases._sum.totalAmount ?? 0,
      recentCompanies,
    };
  }
}
