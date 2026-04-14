import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  CreateEmployeeDto,
  UpdateEmployeeDto,
  EmployeeFilterDto,
} from './dto/employee.dto';
import {
  CreateDepartmentDto,
  UpdateDepartmentDto,
  DepartmentFilterDto,
} from './dto/department.dto';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  //                                EMPLOYEES
  // =========================================================================

  async createEmployee(dto: CreateEmployeeDto, userId?: string) {
    try {
      return await this.prisma.employee.create({
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          phone: dto.phone,
          departmentId: dto.departmentId,
          designation: dto.designation,
          hireDate: dto.hireDate ? new Date(dto.hireDate) : null,
          status: dto.status,
          profilePicture: dto.profilePicture,
          address: dto.address,
          notes: dto.notes,
          createdBy: userId,
        },
        include: { department: true },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new BadRequestException(
          `Employee with email "${dto.email}" already exists`,
        );
      }
      throw err;
    }
  }

  async findAllEmployees(filters: EmployeeFilterDto) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.EmployeeWhereInput = {};
    const AND: Prisma.EmployeeWhereInput[] = [];

    if (filters.search) {
      AND.push({
        OR: [
          { firstName: { contains: filters.search, mode: 'insensitive' } },
          { lastName: { contains: filters.search, mode: 'insensitive' } },
          { email: { contains: filters.search, mode: 'insensitive' } },
          { designation: { contains: filters.search, mode: 'insensitive' } },
        ],
      });
    }
    if (filters.status) AND.push({ status: filters.status });
    if (filters.departmentId) AND.push({ departmentId: filters.departmentId });

    if (AND.length > 0) where.AND = AND;

    const [data, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { department: true },
      }),
      this.prisma.employee.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneEmployee(id: number) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: { department: true },
    });
    if (!employee) throw new NotFoundException(`Employee ${id} not found`);
    return employee;
  }

  async updateEmployee(id: number, dto: UpdateEmployeeDto) {
    await this.findOneEmployee(id);
    try {
      return await this.prisma.employee.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.hireDate !== undefined && {
            hireDate: dto.hireDate ? new Date(dto.hireDate) : null,
          }),
        },
        include: { department: true },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new BadRequestException(
          `Employee with email "${dto.email}" already exists`,
        );
      }
      throw err;
    }
  }

  async removeEmployee(id: number) {
    await this.findOneEmployee(id);
    return this.prisma.employee.delete({ where: { id } });
  }

  // =========================================================================
  //                               DEPARTMENTS
  // =========================================================================

  async createDepartment(dto: CreateDepartmentDto) {
    try {
      return await this.prisma.department.create({
        data: {
          name: dto.name,
          description: dto.description,
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new BadRequestException(
          `Department "${dto.name}" already exists`,
        );
      }
      throw err;
    }
  }

  async findAllDepartments(filters: DepartmentFilterDto = {}) {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 10;
    const skip = (page - 1) * limit;

    const where: Prisma.DepartmentWhereInput = filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' } },
            {
              description: {
                contains: filters.search,
                mode: 'insensitive',
              },
            },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.department.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: { _count: { select: { employees: true } } },
      }),
      this.prisma.department.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOneDepartment(id: number) {
    const dept = await this.prisma.department.findUnique({
      where: { id },
      include: { _count: { select: { employees: true } } },
    });
    if (!dept) throw new NotFoundException(`Department ${id} not found`);
    return dept;
  }

  async updateDepartment(id: number, dto: UpdateDepartmentDto) {
    await this.findOneDepartment(id);
    try {
      return await this.prisma.department.update({
        where: { id },
        data: dto,
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new BadRequestException(
          `Department "${dto.name}" already exists`,
        );
      }
      throw err;
    }
  }

  async removeDepartment(id: number) {
    const dept = await this.findOneDepartment(id);
    if (dept._count.employees > 0) {
      throw new BadRequestException(
        `Cannot delete department "${dept.name}" — it has ${dept._count.employees} employees assigned`,
      );
    }
    return this.prisma.department.delete({ where: { id } });
  }

  // =========================================================================
  //                                 REPORTS
  // =========================================================================

  async getSummary() {
    const [
      totalEmployees,
      activeEmployees,
      inactiveEmployees,
      onLeave,
      totalDepartments,
      byDepartment,
    ] = await Promise.all([
      this.prisma.employee.count(),
      this.prisma.employee.count({ where: { status: 'ACTIVE' } }),
      this.prisma.employee.count({ where: { status: 'INACTIVE' } }),
      this.prisma.employee.count({ where: { status: 'ON_LEAVE' } }),
      this.prisma.department.count(),
      this.prisma.employee.groupBy({
        by: ['departmentId'],
        _count: { id: true },
      }),
    ]);

    // Resolve department names
    const departments = await this.prisma.department.findMany();
    const deptMap = new Map(departments.map((d) => [d.id, d.name]));

    const byDepartmentResolved = byDepartment.map((row) => ({
      departmentId: row.departmentId,
      departmentName: row.departmentId
        ? deptMap.get(row.departmentId) ?? 'Unknown'
        : 'Unassigned',
      count: row._count.id,
    }));

    return {
      totalEmployees,
      activeEmployees,
      inactiveEmployees,
      onLeave,
      totalDepartments,
      byDepartment: byDepartmentResolved,
    };
  }
}
