import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  CreateEquipmentDto,
  UpdateEquipmentDto,
  EquipmentFilterDto,
} from './dto/equipment.dto';
import {
  CreateAssignmentDto,
  UpdateAssignmentDto,
  ReturnAssignmentDto,
  AssignmentFilterDto,
} from './dto/assignment.dto';
import {
  CreateMaintenanceDto,
  UpdateMaintenanceDto,
  MaintenanceFilterDto,
} from './dto/maintenance.dto';

@Injectable()
export class EquipmentService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  //                                EQUIPMENT
  // =========================================================================

  async createEquipment(dto: CreateEquipmentDto, userId?: string) {
    try {
      return await this.prisma.equipment.create({
        data: {
          name: dto.name,
          category: dto.category,
          brand: dto.brand,
          model: dto.model,
          serialNumber: dto.serialNumber,
          purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : null,
          purchasePrice: dto.purchasePrice ?? 0,
          warrantyExpiry: dto.warrantyExpiry
            ? new Date(dto.warrantyExpiry)
            : null,
          status: dto.status,
          condition: dto.condition,
          warehouseId: dto.warehouseId,
          itemId: dto.itemId,
          notes: dto.notes,
          createdBy: userId,
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new BadRequestException(
          `Equipment with serial number "${dto.serialNumber}" already exists`,
        );
      }
      throw err;
    }
  }

  async findAllEquipment(filters: EquipmentFilterDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.EquipmentWhereInput = {};
    const AND: Prisma.EquipmentWhereInput[] = [];

    if (filters.search) {
      AND.push({
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { brand: { contains: filters.search, mode: 'insensitive' } },
          { model: { contains: filters.search, mode: 'insensitive' } },
          { serialNumber: { contains: filters.search, mode: 'insensitive' } },
        ],
      });
    }
    if (filters.category) AND.push({ category: filters.category });
    if (filters.status) AND.push({ status: filters.status });
    if (filters.condition) AND.push({ condition: filters.condition });
    if (filters.warehouseId) AND.push({ warehouseId: filters.warehouseId });

    if (AND.length > 0) where.AND = AND;

    const [data, total] = await Promise.all([
      this.prisma.equipment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          assignments: {
            where: { status: 'ASSIGNED' },
            take: 1,
            orderBy: { assignedDate: 'desc' },
          },
        },
      }),
      this.prisma.equipment.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneEquipment(id: number) {
    const equipment = await this.prisma.equipment.findUnique({
      where: { id },
      include: {
        assignments: {
          orderBy: { assignedDate: 'desc' },
        },
        maintenances: {
          orderBy: { maintenanceDate: 'desc' },
        },
      },
    });
    if (!equipment) throw new NotFoundException(`Equipment ${id} not found`);
    return equipment;
  }

  async updateEquipment(
    id: number,
    dto: UpdateEquipmentDto,
  ) {
    await this.findOneEquipment(id);
    try {
      return await this.prisma.equipment.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.purchaseDate !== undefined && {
            purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : null,
          }),
          ...(dto.warrantyExpiry !== undefined && {
            warrantyExpiry: dto.warrantyExpiry
              ? new Date(dto.warrantyExpiry)
              : null,
          }),
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new BadRequestException(
          `Equipment with serial number "${dto.serialNumber}" already exists`,
        );
      }
      throw err;
    }
  }

  async retireEquipment(id: number) {
    await this.findOneEquipment(id);
    return this.prisma.equipment.update({
      where: { id },
      data: { status: 'RETIRED' },
    });
  }

  async removeEquipment(id: number) {
    await this.findOneEquipment(id);
    return this.prisma.equipment.delete({ where: { id } });
  }

  // =========================================================================
  //                              ASSIGNMENTS
  // =========================================================================

  async createAssignment(dto: CreateAssignmentDto, userId?: string) {
    const equipment = await this.findOneEquipment(dto.equipmentId);

    if (equipment.status === 'RETIRED') {
      throw new BadRequestException('Cannot assign retired equipment');
    }
    if (equipment.status === 'ASSIGNED') {
      throw new BadRequestException(
        'Equipment is already assigned — return it first',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.equipmentAssignment.create({
        data: {
          equipmentId: dto.equipmentId,
          employeeId: dto.employeeId,
          employeeName: dto.employeeName,
          assignedDate: dto.assignedDate ? new Date(dto.assignedDate) : new Date(),
          remarks: dto.remarks,
          createdBy: userId,
        },
      });

      await tx.equipment.update({
        where: { id: dto.equipmentId },
        data: { status: 'ASSIGNED' },
      });

      return assignment;
    });
  }

  async returnAssignment(id: number, dto: ReturnAssignmentDto) {
    const assignment = await this.prisma.equipmentAssignment.findUnique({
      where: { id },
    });
    if (!assignment)
      throw new NotFoundException(`Assignment ${id} not found`);
    if (assignment.status === 'RETURNED') {
      throw new BadRequestException('Assignment is already returned');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.equipmentAssignment.update({
        where: { id },
        data: {
          status: 'RETURNED',
          returnDate: dto.returnDate ? new Date(dto.returnDate) : new Date(),
          remarks: dto.remarks ?? assignment.remarks,
        },
      });

      await tx.equipment.update({
        where: { id: assignment.equipmentId },
        data: { status: 'AVAILABLE' },
      });

      return updated;
    });
  }

  async findAllAssignments(filters: AssignmentFilterDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.EquipmentAssignmentWhereInput = {};
    if (filters.equipmentId) where.equipmentId = filters.equipmentId;
    if (filters.employeeId) where.employeeId = filters.employeeId;
    if (filters.status) where.status = filters.status;

    const [data, total] = await Promise.all([
      this.prisma.equipmentAssignment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { assignedDate: 'desc' },
        include: {
          equipment: {
            select: {
              id: true,
              name: true,
              category: true,
              serialNumber: true,
              brand: true,
              model: true,
            },
          },
        },
      }),
      this.prisma.equipmentAssignment.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async updateAssignment(id: number, dto: UpdateAssignmentDto) {
    const existing = await this.prisma.equipmentAssignment.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException(`Assignment ${id} not found`);
    return this.prisma.equipmentAssignment.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.assignedDate && { assignedDate: new Date(dto.assignedDate) }),
      },
    });
  }

  async removeAssignment(id: number) {
    const existing = await this.prisma.equipmentAssignment.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException(`Assignment ${id} not found`);
    return this.prisma.equipmentAssignment.delete({ where: { id } });
  }

  // =========================================================================
  //                              MAINTENANCE
  // =========================================================================

  async createMaintenance(dto: CreateMaintenanceDto, userId?: string) {
    await this.findOneEquipment(dto.equipmentId);

    return this.prisma.$transaction(async (tx) => {
      const maintenance = await tx.equipmentMaintenance.create({
        data: {
          equipmentId: dto.equipmentId,
          issue: dto.issue,
          cost: dto.cost ?? 0,
          maintenanceDate: dto.maintenanceDate
            ? new Date(dto.maintenanceDate)
            : new Date(),
          completedDate: dto.completedDate
            ? new Date(dto.completedDate)
            : null,
          vendor: dto.vendor,
          status: dto.status,
          notes: dto.notes,
          createdBy: userId,
        },
      });

      if (!dto.status || dto.status === 'PENDING' || dto.status === 'IN_PROGRESS') {
        await tx.equipment.update({
          where: { id: dto.equipmentId },
          data: { status: 'MAINTENANCE' },
        });
      }

      return maintenance;
    });
  }

  async findAllMaintenance(filters: MaintenanceFilterDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.EquipmentMaintenanceWhereInput = {};
    if (filters.equipmentId) where.equipmentId = filters.equipmentId;
    if (filters.status) where.status = filters.status;

    const [data, total] = await Promise.all([
      this.prisma.equipmentMaintenance.findMany({
        where,
        skip,
        take: limit,
        orderBy: { maintenanceDate: 'desc' },
        include: {
          equipment: {
            select: {
              id: true,
              name: true,
              category: true,
              serialNumber: true,
            },
          },
        },
      }),
      this.prisma.equipmentMaintenance.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async updateMaintenance(id: number, dto: UpdateMaintenanceDto) {
    const existing = await this.prisma.equipmentMaintenance.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException(`Maintenance ${id} not found`);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.equipmentMaintenance.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.maintenanceDate && {
            maintenanceDate: new Date(dto.maintenanceDate),
          }),
          ...(dto.completedDate !== undefined && {
            completedDate: dto.completedDate
              ? new Date(dto.completedDate)
              : null,
          }),
        },
      });

      // If completed, flip equipment back to AVAILABLE (unless currently assigned)
      if (dto.status === 'COMPLETED' || dto.status === 'CANCELLED') {
        const equipment = await tx.equipment.findUnique({
          where: { id: existing.equipmentId },
        });
        if (equipment && equipment.status === 'MAINTENANCE') {
          await tx.equipment.update({
            where: { id: existing.equipmentId },
            data: { status: 'AVAILABLE' },
          });
        }
      }

      return updated;
    });
  }

  async removeMaintenance(id: number) {
    const existing = await this.prisma.equipmentMaintenance.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException(`Maintenance ${id} not found`);
    return this.prisma.equipmentMaintenance.delete({ where: { id } });
  }

  // =========================================================================
  //                                REPORTS
  // =========================================================================

  async getSummary() {
    const [
      totalEquipment,
      available,
      assigned,
      maintenance,
      retired,
      byCategory,
      maintenanceCostAgg,
      warrantyExpiringSoon,
    ] = await Promise.all([
      this.prisma.equipment.count(),
      this.prisma.equipment.count({ where: { status: 'AVAILABLE' } }),
      this.prisma.equipment.count({ where: { status: 'ASSIGNED' } }),
      this.prisma.equipment.count({ where: { status: 'MAINTENANCE' } }),
      this.prisma.equipment.count({ where: { status: 'RETIRED' } }),
      this.prisma.equipment.groupBy({
        by: ['category'],
        _count: { id: true },
      }),
      this.prisma.equipmentMaintenance.aggregate({
        _sum: { cost: true },
      }),
      this.prisma.equipment.count({
        where: {
          warrantyExpiry: {
            gte: new Date(),
            lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);

    return {
      totalEquipment,
      available,
      assigned,
      maintenance,
      retired,
      byCategory: byCategory.map((b) => ({
        category: b.category,
        count: b._count.id,
      })),
      totalMaintenanceCost: maintenanceCostAgg._sum.cost ?? 0,
      warrantyExpiringSoon,
    };
  }

  async getWarrantyExpiring(days: number = 30) {
    const futureDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return this.prisma.equipment.findMany({
      where: {
        warrantyExpiry: {
          gte: new Date(),
          lte: futureDate,
        },
      },
      orderBy: { warrantyExpiry: 'asc' },
    });
  }
}
