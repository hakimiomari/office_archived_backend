import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateAuctionDto } from "./dto/create-auction.dto";
import { UpdateAuctionDto } from "./dto/update-auction.dto";

@Injectable()
export class AuctionsService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureMineral(mineralTypeId: string) {
    const mineral = await this.prisma.mineralType.findUnique({
      where: { id: mineralTypeId },
    });
    if (!mineral)
      throw new NotFoundException(
        `Mineral type with id ${mineralTypeId} not found`,
      );
  }

  async create(dto: CreateAuctionDto) {
    await this.ensureMineral(dto.mineralTypeId);
    return this.prisma.auction.create({
      data: {
        mieralTypeId: dto.mineralTypeId,
        round: dto.round,
        mass: dto.mass,
        unit: dto.unit,
        unitPrice: dto.unitPrice,
        priceCurrency: dto.priceCurrency,
        royalty: dto.royalty,
        auctionDate: new Date(dto.auctionDate),
        provinceId: dto.provinceId ?? null,
      },
      include: { mineralType: true, province: true },
    });
  }

  async findAll(
    page = 1,
    limit = 10,
    search?: string,
    mineralTypeId?: string,
    provinceId?: number,
  ) {
    const skip = (page - 1) * limit;
    const where: Prisma.AuctionWhereInput = {};
    if (mineralTypeId) where.mieralTypeId = mineralTypeId;
    if (provinceId) where.provinceId = provinceId;
    if (search) {
      where.OR = [
        { round: { contains: search, mode: "insensitive" as const } },
        {
          mineralType: {
            name: { contains: search, mode: "insensitive" as const },
          },
        },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.auction.findMany({
        where,
        skip,
        take: limit,
        orderBy: { id: "desc" },
        include: { mineralType: true, province: true },
      }),
      this.prisma.auction.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const auction = await this.prisma.auction.findUnique({
      where: { id },
      include: { mineralType: true, province: true },
    });
    if (!auction) {
      throw new NotFoundException(`Auction with id ${id} not found`);
    }
    return auction;
  }

  async update(id: string, dto: UpdateAuctionDto) {
    await this.findOne(id);
    if (dto.mineralTypeId) await this.ensureMineral(dto.mineralTypeId);
    return this.prisma.auction.update({
      where: { id },
      data: {
        ...(dto.mineralTypeId && { mieralTypeId: dto.mineralTypeId }),
        ...(dto.round !== undefined && { round: dto.round }),
        ...(dto.mass !== undefined && { mass: dto.mass }),
        ...(dto.unit && { unit: dto.unit }),
        ...(dto.unitPrice !== undefined && { unitPrice: dto.unitPrice }),
        ...(dto.priceCurrency && { priceCurrency: dto.priceCurrency }),
        ...(dto.royalty !== undefined && { royalty: dto.royalty }),
        ...(dto.auctionDate && {
          auctionDate: new Date(dto.auctionDate),
        }),
        ...(dto.provinceId !== undefined && {
          provinceId: dto.provinceId ?? null,
        }),
      },
      include: { mineralType: true, province: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.auction.delete({ where: { id } });
    return { message: "Auction deleted successfully" };
  }

  /** Lightweight stats for the dashboard. */
  async summary() {
    const [total, byMineralGroup, rows] = await Promise.all([
      this.prisma.auction.count(),
      this.prisma.auction.groupBy({
        by: ["mieralTypeId"],
        _count: { id: true },
        orderBy: { _count: { id: "desc" } },
        take: 10,
      }),
      // `mass` and `unitPrice` are stored as strings; sum in JS so we can
      // coerce safely and bucket by currency (AFN/USD can't be summed
      // together meaningfully).
      this.prisma.auction.findMany({
        select: {
          mass: true,
          unitPrice: true,
          priceCurrency: true,
          royalty: true,
        },
      }),
    ]);

    const minerals = await this.prisma.mineralType.findMany({
      where: { id: { in: byMineralGroup.map((m) => m.mieralTypeId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(minerals.map((m) => [m.id, m.name]));

    // Per-currency totals — bucketed because AFN and USD can't be added.
    //   total   = sum of (mass * unitPrice)
    //   royalty = sum of (mass * unitPrice * royalty / 100)  [skips null royalty]
    const totals = new Map<string, number>();
    const royalties = new Map<string, number>();
    for (const r of rows) {
      const mass = parseFloat(r.mass);
      const price = parseFloat(r.unitPrice);
      if (!Number.isFinite(mass) || !Number.isFinite(price)) continue;
      const cur = r.priceCurrency ?? "AFN";
      const line = mass * price;
      totals.set(cur, (totals.get(cur) ?? 0) + line);
      if (r.royalty != null) {
        royalties.set(
          cur,
          (royalties.get(cur) ?? 0) + line * (r.royalty / 100),
        );
      }
    }
    const totalsByCurrency = Array.from(totals.entries()).map(
      ([currency, total]) => ({ currency, total }),
    );
    const royaltyByCurrency = Array.from(royalties.entries()).map(
      ([currency, royalty]) => ({ currency, royalty }),
    );

    return {
      total,
      byMineral: byMineralGroup.map((m) => ({
        mineral: nameById.get(m.mieralTypeId) ?? m.mieralTypeId,
        count: m._count.id,
      })),
      totalsByCurrency,
      royaltyByCurrency,
    };
  }
}
