import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLicenseDto } from './dto/create-license.dto';
import { UpdateLicenseDto } from './dto/update-license.dto';

/**
 * MiningLicense — a license held by a Company for a specific MineralType.
 * Mapped to the `licenses` table.
 */
@Injectable()
export class LicensesService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureRefs(companyId?: string, mineralTypeId?: string) {
    if (companyId) {
      const company = await this.prisma.company.findUnique({
        where: { id: companyId },
      });
      if (!company)
        throw new NotFoundException(`Company with id ${companyId} not found`);
    }
    if (mineralTypeId) {
      const mineral = await this.prisma.mineralType.findUnique({
        where: { id: mineralTypeId },
      });
      if (!mineral)
        throw new NotFoundException(
          `Mineral type with id ${mineralTypeId} not found`,
        );
    }
  }

  async create(dto: CreateLicenseDto, userId?: number) {
    await this.ensureRefs(dto.companyId, dto.mineralTypeId);
    return this.prisma.miningLicense.create({
      data: {
        companyId: dto.companyId,
        mieralTypeId: dto.mineralTypeId,
        licenseType: dto.licenseType,
        status: dto.status,
        issueDate: new Date(dto.issueDate),
        expiryDate: new Date(dto.expiryDate),
        mineAddress: dto.mineAddress,
        createdBy: userId ?? null,
      },
      include: { company: true, mineralType: true },
    });
  }

  async findAll(page = 1, limit = 10, search?: string) {
    const skip = (page - 1) * limit;
    const where = search
      ? {
          OR: [
            {
              mineAddress: {
                contains: search,
                mode: 'insensitive' as const,
              },
            },
            {
              company: {
                name: { contains: search, mode: 'insensitive' as const },
              },
            },
            {
              mineralType: {
                name: { contains: search, mode: 'insensitive' as const },
              },
            },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.miningLicense.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { company: true, mineralType: true },
      }),
      this.prisma.miningLicense.count({ where }),
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
    const license = await this.prisma.miningLicense.findUnique({
      where: { id },
      include: { company: true, mineralType: true },
    });
    if (!license) {
      throw new NotFoundException(`License with id ${id} not found`);
    }
    return license;
  }

  async update(id: string, dto: UpdateLicenseDto, userId?: number) {
    await this.findOne(id);
    await this.ensureRefs(dto.companyId, dto.mineralTypeId);
    return this.prisma.miningLicense.update({
      where: { id },
      data: {
        ...(dto.companyId && { companyId: dto.companyId }),
        ...(dto.mineralTypeId && { mieralTypeId: dto.mineralTypeId }),
        ...(dto.licenseType && { licenseType: dto.licenseType }),
        ...(dto.status && { status: dto.status }),
        ...(dto.issueDate && { issueDate: new Date(dto.issueDate) }),
        ...(dto.expiryDate && { expiryDate: new Date(dto.expiryDate) }),
        ...(dto.mineAddress !== undefined && {
          mineAddress: dto.mineAddress,
        }),
        updatedBy: userId ?? null,
      },
      include: { company: true, mineralType: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.miningLicense.delete({ where: { id } });
  }
}
