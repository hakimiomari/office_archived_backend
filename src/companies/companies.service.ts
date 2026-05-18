import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Company ----

  async create(dto: CreateCompanyDto) {
    return this.prisma.company.create({ data: dto });
  }

  async findAll(page = 1, limit = 10, search?: string) {
    const skip = (page - 1) * limit;
    const where = search
      ? {
          OR: [
            { licenseNumber: { contains: search, mode: 'insensitive' as const } },
            { TIN: { contains: search, mode: 'insensitive' as const } },
            { address: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.company.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { owners: true, _count: { select: { contracts: true } } },
      }),
      this.prisma.company.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        owners: { orderBy: { createdAt: 'asc' } },
        contracts: { include: { license: true } },
      },
    });
    if (!company) {
      throw new NotFoundException(`Company with id ${id} not found`);
    }
    return company;
  }

  async update(id: string, dto: UpdateCompanyDto) {
    await this.findOne(id);
    return this.prisma.company.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.company.delete({ where: { id } });
  }

  // ---- Owners (nested under a company) ----

  private async ensureCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company with id ${companyId} not found`);
    }
    return company;
  }

  async addOwner(companyId: string, dto: CreateOwnerDto) {
    await this.ensureCompany(companyId);
    return this.prisma.owner.create({
      data: {
        name: dto.name,
        shareAmount: dto.shareAmount,
        companyId,
      },
    });
  }

  async updateOwner(
    companyId: string,
    ownerId: string,
    dto: UpdateOwnerDto,
  ) {
    const owner = await this.prisma.owner.findFirst({
      where: { id: ownerId, companyId },
    });
    if (!owner) {
      throw new NotFoundException(
        `Owner with id ${ownerId} not found for this company`,
      );
    }
    return this.prisma.owner.update({
      where: { id: ownerId },
      data: dto,
    });
  }

  async removeOwner(companyId: string, ownerId: string) {
    const owner = await this.prisma.owner.findFirst({
      where: { id: ownerId, companyId },
    });
    if (!owner) {
      throw new NotFoundException(
        `Owner with id ${ownerId} not found for this company`,
      );
    }
    return this.prisma.owner.delete({ where: { id: ownerId } });
  }
}
