import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLicenseDto } from './dto/create-license.dto';
import { UpdateLicenseDto } from './dto/update-license.dto';

@Injectable()
export class LicensesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateLicenseDto, userId: string) {
    return this.prisma.license.create({
      data: {
        ...dto,
        issueDate: new Date(dto.issueDate),
        expiryDate: new Date(dto.expiryDate),
        createdBy: userId,
      },
    });
  }

  async findAll(page = 1, limit = 10, search?: string) {
    const skip = (page - 1) * limit;
    const where = search
      ? {
          OR: [
            { licenseNumber: { contains: search, mode: 'insensitive' as const } },
            { companyName: { contains: search, mode: 'insensitive' as const } },
            { province: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.license.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { contracts: true },
      }),
      this.prisma.license.count({ where }),
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
    const license = await this.prisma.license.findUnique({
      where: { id },
      include: { contracts: true },
    });
    if (!license) {
      throw new NotFoundException(`License with id ${id} not found`);
    }
    return license;
  }

  async update(id: string, dto: UpdateLicenseDto) {
    await this.findOne(id);
    return this.prisma.license.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.issueDate && { issueDate: new Date(dto.issueDate) }),
        ...(dto.expiryDate && { expiryDate: new Date(dto.expiryDate) }),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.license.delete({ where: { id } });
  }
}
