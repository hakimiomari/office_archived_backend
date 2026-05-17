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
 * Contracts are the relationship record linking a Company to a License
 * (one contract per company+license pair — enforced by the
 * `@@unique([companyId, licenseId])` constraint in the schema). They
 * carry the contract type, status, an optional human reference number,
 * and an optional active period.
 */
@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureRefs(companyId: string, licenseId: string) {
    const [company, license] = await Promise.all([
      this.prisma.company.findUnique({ where: { id: companyId } }),
      this.prisma.license.findUnique({ where: { id: licenseId } }),
    ]);
    if (!company)
      throw new NotFoundException(`Company with id ${companyId} not found`);
    if (!license)
      throw new NotFoundException(`License with id ${licenseId} not found`);
  }

  async create(dto: CreateContractDto) {
    await this.ensureRefs(dto.companyId, dto.licenseId);
    try {
      return await this.prisma.contract.create({
        data: {
          companyId: dto.companyId,
          licenseId: dto.licenseId,
          contractType: dto.contractType,
          status: dto.status,
          contractNumber: dto.contractNumber,
          startDate: dto.startDate ? new Date(dto.startDate) : null,
          endDate: dto.endDate ? new Date(dto.endDate) : null,
        },
        include: { company: true, license: true },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException(
          'A contract already exists for this company and license',
        );
      }
      throw e;
    }
  }

  async findAll(
    page = 1,
    limit = 10,
    companyId?: string,
    licenseId?: string,
  ) {
    const skip = (page - 1) * limit;
    const where: Prisma.ContractWhereInput = {};
    if (companyId) where.companyId = companyId;
    if (licenseId) where.licenseId = licenseId;

    const [data, total] = await Promise.all([
      this.prisma.contract.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { company: true, license: true },
      }),
      this.prisma.contract.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findByLicense(licenseId: string) {
    return this.prisma.contract.findMany({
      where: { licenseId },
      orderBy: { createdAt: 'desc' },
      include: { company: true },
    });
  }

  async findOne(id: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: { company: true, license: true },
    });
    if (!contract) {
      throw new NotFoundException(`Contract with id ${id} not found`);
    }
    return contract;
  }

  async update(id: string, dto: UpdateContractDto) {
    await this.findOne(id);
    if (dto.companyId && dto.licenseId) {
      await this.ensureRefs(dto.companyId, dto.licenseId);
    }
    try {
      return await this.prisma.contract.update({
        where: { id },
        data: {
          ...(dto.companyId && { companyId: dto.companyId }),
          ...(dto.licenseId && { licenseId: dto.licenseId }),
          ...(dto.contractType && { contractType: dto.contractType }),
          ...(dto.status && { status: dto.status }),
          ...(dto.contractNumber !== undefined && {
            contractNumber: dto.contractNumber,
          }),
          ...(dto.startDate !== undefined && {
            startDate: dto.startDate ? new Date(dto.startDate) : null,
          }),
          ...(dto.endDate !== undefined && {
            endDate: dto.endDate ? new Date(dto.endDate) : null,
          }),
        },
        include: { company: true, license: true },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException(
          'A contract already exists for this company and license',
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
