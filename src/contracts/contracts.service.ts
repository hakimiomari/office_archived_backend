import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';

/**
 * Contract — a mining contract for a named company covering a MineralType.
 * `price` is stored as a free-form string; `registrationNumber` is unique
 * when present.
 */
@Injectable()
export class ContractsService {
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

  async create(dto: CreateContractDto, userId?: number) {
    await this.ensureMineral(dto.mineralTypeId);
    try {
      return await this.prisma.contract.create({
        data: {
          companyName: dto.companyName,
          status: dto.status,
          mieralTypeId: dto.mineralTypeId,
          registrationNumber: dto.registrationNumber,
          price: dto.price,
          mineAddress: dto.mineAddress,
          issueDate: new Date(dto.issueDate),
          expiryDate: new Date(dto.expiryDate),
          createdBy: userId ?? null,
        },
        include: { mineralType: true },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException(
          'A contract with this registration number already exists',
        );
      }
      throw e;
    }
  }

  async findAll(page = 1, limit = 10, search?: string) {
    const skip = (page - 1) * limit;
    const where: Prisma.ContractWhereInput = search
      ? {
          OR: [
            {
              companyName: {
                contains: search,
                mode: 'insensitive' as const,
              },
            },
            {
              registrationNumber: {
                contains: search,
                mode: 'insensitive' as const,
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
      this.prisma.contract.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { mineralType: true },
      }),
      this.prisma.contract.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: { mineralType: true },
    });
    if (!contract) {
      throw new NotFoundException(`Contract with id ${id} not found`);
    }
    return contract;
  }

  async update(id: string, dto: UpdateContractDto, userId?: number) {
    await this.findOne(id);
    if (dto.mineralTypeId) await this.ensureMineral(dto.mineralTypeId);
    try {
      return await this.prisma.contract.update({
        where: { id },
        data: {
          ...(dto.companyName !== undefined && {
            companyName: dto.companyName,
          }),
          ...(dto.status && { status: dto.status }),
          ...(dto.mineralTypeId && { mieralTypeId: dto.mineralTypeId }),
          ...(dto.registrationNumber !== undefined && {
            registrationNumber: dto.registrationNumber,
          }),
          ...(dto.price !== undefined && { price: dto.price }),
          ...(dto.mineAddress !== undefined && {
            mineAddress: dto.mineAddress,
          }),
          ...(dto.issueDate && { issueDate: new Date(dto.issueDate) }),
          ...(dto.expiryDate && { expiryDate: new Date(dto.expiryDate) }),
          updatedBy: userId ?? null,
        },
        include: { mineralType: true },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException(
          'A contract with this registration number already exists',
        );
      }
      throw e;
    }
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.contract.delete({ where: { id } });
    return { message: 'Contract deleted successfully' };
  }
}
