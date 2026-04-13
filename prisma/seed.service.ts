import { Injectable } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { HashingProvider } from '../src/auth/providers/hashing.provider';

@Injectable()
export class SeedService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly hashingProvider: HashingProvider,
  ) {}

  async seed() {
    // ─── 1. PERMISSIONS (module.action format) ───
    const permissions = [
      // License
      { name: 'license.create', group_name: 'license', label: 'Create License' },
      { name: 'license.read', group_name: 'license', label: 'Read License' },
      { name: 'license.update', group_name: 'license', label: 'Update License' },
      { name: 'license.delete', group_name: 'license', label: 'Delete License' },
      // Contract
      { name: 'contract.upload', group_name: 'contract', label: 'Upload Contract' },
      { name: 'contract.read', group_name: 'contract', label: 'Read Contract' },
      { name: 'contract.delete', group_name: 'contract', label: 'Delete Contract' },
      // Report
      { name: 'report.view', group_name: 'report', label: 'View Reports' },
      { name: 'report.export', group_name: 'report', label: 'Export Reports' },
      // User Management
      { name: 'user.create', group_name: 'user', label: 'Create User' },
      { name: 'user.read', group_name: 'user', label: 'Read User' },
      { name: 'user.update', group_name: 'user', label: 'Update User' },
      { name: 'user.delete', group_name: 'user', label: 'Delete User' },
      // Role Management
      { name: 'role.create', group_name: 'role', label: 'Create Role' },
      { name: 'role.read', group_name: 'role', label: 'Read Role' },
      { name: 'role.update', group_name: 'role', label: 'Update Role' },
      { name: 'role.delete', group_name: 'role', label: 'Delete Role' },
      // Tender Management
      { name: 'tender.create', group_name: 'tender', label: 'Create Tender' },
      { name: 'tender.read', group_name: 'tender', label: 'Read Tender' },
      { name: 'tender.update', group_name: 'tender', label: 'Update Tender' },
      { name: 'tender.delete', group_name: 'tender', label: 'Delete Tender' },
      // Inventory Management
      { name: 'inventory.create', group_name: 'inventory', label: 'Create Inventory' },
      { name: 'inventory.read', group_name: 'inventory', label: 'Read Inventory' },
      { name: 'inventory.update', group_name: 'inventory', label: 'Update Inventory' },
      { name: 'inventory.delete', group_name: 'inventory', label: 'Delete Inventory' },
      { name: 'inventory.movement', group_name: 'inventory', label: 'Perform Stock Movements' },
      // Executive Dashboard
      { name: 'executive.create', group_name: 'executive', label: 'Create Executive KPIs' },
      { name: 'executive.read', group_name: 'executive', label: 'Read Executive Dashboard' },
      { name: 'executive.update', group_name: 'executive', label: 'Update Executive KPIs' },
      { name: 'executive.delete', group_name: 'executive', label: 'Delete Executive KPIs' },
      // Equipment Management
      { name: 'equipment.create', group_name: 'equipment', label: 'Create Equipment' },
      { name: 'equipment.read', group_name: 'equipment', label: 'Read Equipment' },
      { name: 'equipment.update', group_name: 'equipment', label: 'Update Equipment' },
      { name: 'equipment.delete', group_name: 'equipment', label: 'Delete Equipment' },
      { name: 'equipment.assign', group_name: 'equipment', label: 'Assign Equipment' },
      { name: 'equipment.maintenance', group_name: 'equipment', label: 'Manage Equipment Maintenance' },
      // Employee / HR Management
      { name: 'employee.create', group_name: 'employee', label: 'Create Employee' },
      { name: 'employee.read', group_name: 'employee', label: 'Read Employee' },
      { name: 'employee.update', group_name: 'employee', label: 'Update Employee' },
      { name: 'employee.delete', group_name: 'employee', label: 'Delete Employee' },
      { name: 'department.create', group_name: 'employee', label: 'Create Department' },
      { name: 'department.read', group_name: 'employee', label: 'Read Department' },
      { name: 'department.update', group_name: 'employee', label: 'Update Department' },
      { name: 'department.delete', group_name: 'employee', label: 'Delete Department' },
    ];

    for (const perm of permissions) {
      await this.prismaService.permission.upsert({
        where: { name: perm.name },
        update: { group_name: perm.group_name, label: perm.label },
        create: {
          name: perm.name,
          group_name: perm.group_name,
          label: perm.label,
        },
      });
    }
    console.log('✅ Permissions seeded');

    // ─── 2. CREATE ADMIN USER ───
    const password = 'admin';
    const hashPassword = await this.hashingProvider.hashPassword(password);

    const adminUser = await this.prismaService.user.upsert({
      where: { email: 'hakimikamranullah@gmail.com' },
      update: {},
      create: {
        name: 'Kamranullah Hakimi',
        email: 'hakimikamranullah@gmail.com',
        password: hashPassword,
        profile_picture:
          'https://avatars.githubusercontent.com/u/101364769?v=4',
      },
    });
    console.log('✅ Admin user seeded');

    // ─── 3. ROLES ───
    const allPermissions = await this.prismaService.permission.findMany();
    const permByName = (name: string) => allPermissions.find((p) => p.name === name);

    // Admin → Full access
    await this.prismaService.role.upsert({
      where: { name: 'admin' },
      update: {
        description: 'Full system access',
        permissions: { set: allPermissions.map((p) => ({ id: p.id })) },
      },
      create: {
        name: 'admin',
        description: 'Full system access',
        created_by: adminUser.id,
        permissions: { connect: allPermissions.map((p) => ({ id: p.id })) },
      },
    });

    // Manager → Manage licenses, upload contracts, view reports, no user mgmt
    const managerPerms = [
      'license.create', 'license.read', 'license.update', 'license.delete',
      'contract.upload', 'contract.read', 'contract.delete',
      'report.view', 'report.export',
      'tender.create', 'tender.read', 'tender.update', 'tender.delete',
      'inventory.create', 'inventory.read', 'inventory.update', 'inventory.delete', 'inventory.movement',
      'executive.read', 'executive.create', 'executive.update',
      'equipment.create', 'equipment.read', 'equipment.update', 'equipment.assign', 'equipment.maintenance',
      'employee.create', 'employee.read', 'employee.update',
      'department.create', 'department.read', 'department.update',
    ].map((n) => permByName(n)).filter(Boolean);

    await this.prismaService.role.upsert({
      where: { name: 'manager' },
      update: {
        description: 'Manage licenses, contracts, and reports',
        permissions: { set: managerPerms.map((p) => ({ id: p!.id })) },
      },
      create: {
        name: 'manager',
        description: 'Manage licenses, contracts, and reports',
        created_by: adminUser.id,
        permissions: { connect: managerPerms.map((p) => ({ id: p!.id })) },
      },
    });

    // Viewer → Read-only
    const viewerPerms = [
      'license.read', 'contract.read', 'report.view', 'tender.read', 'inventory.read',
      'executive.read', 'equipment.read', 'employee.read', 'department.read',
    ].map((n) => permByName(n)).filter(Boolean);

    await this.prismaService.role.upsert({
      where: { name: 'viewer' },
      update: {
        description: 'Read-only access to licenses and reports',
        permissions: { set: viewerPerms.map((p) => ({ id: p!.id })) },
      },
      create: {
        name: 'viewer',
        description: 'Read-only access to licenses and reports',
        created_by: adminUser.id,
        permissions: { connect: viewerPerms.map((p) => ({ id: p!.id })) },
      },
    });

    // Data Entry → Create licenses, no delete, no reports
    const dataEntryPerms = [
      'license.create', 'license.read', 'license.update',
      'contract.upload', 'contract.read',
    ].map((n) => permByName(n)).filter(Boolean);

    await this.prismaService.role.upsert({
      where: { name: 'data_entry' },
      update: {
        description: 'Create and update licenses, no delete or report access',
        permissions: { set: dataEntryPerms.map((p) => ({ id: p!.id })) },
      },
      create: {
        name: 'data_entry',
        description: 'Create and update licenses, no delete or report access',
        created_by: adminUser.id,
        permissions: { connect: dataEntryPerms.map((p) => ({ id: p!.id })) },
      },
    });

    console.log('✅ Roles seeded (admin, manager, viewer, data_entry)');

    // ─── 4. ASSIGN ADMIN ROLE TO ADMIN USER ───
    const adminRole = await this.prismaService.role.findUnique({
      where: { name: 'admin' },
    });
    if (adminRole) {
      await this.prismaService.user.update({
        where: { id: adminUser.id },
        data: { roles: { connect: [{ id: adminRole.id }] } },
      });
    }

    console.log('✅ Admin user assigned admin role');

    // ─── 5. EXECUTIVE DASHBOARD SAMPLE DATA ───
    await this.seedExecutiveData(adminUser.id);
  }

  /** Seed sample data for the Executive Dashboard module (idempotent) */
  private async seedExecutiveData(adminUserId: number) {
    const currentYear = new Date().getFullYear();
    const years = [currentYear - 2, currentYear - 1, currentYear];

    // ─── KPIs ───
    const kpis = [
      // Prior year - 2
      { key: 'totalRevenue', year: years[0], value: 8500000, category: 'FINANCIAL', label: 'Total Revenue' },
      { key: 'totalExpenses', year: years[0], value: 6200000, category: 'FINANCIAL', label: 'Total Expenses' },
      { key: 'royaltyIncome', year: years[0], value: 2100000, category: 'FINANCIAL', label: 'Royalty Income' },
      { key: 'activeProjects', year: years[0], value: 18, category: 'OPERATIONAL', label: 'Active Projects' },

      // Prior year - 1
      { key: 'totalRevenue', year: years[1], value: 11200000, category: 'FINANCIAL', label: 'Total Revenue' },
      { key: 'totalExpenses', year: years[1], value: 7800000, category: 'FINANCIAL', label: 'Total Expenses' },
      { key: 'royaltyIncome', year: years[1], value: 3050000, category: 'FINANCIAL', label: 'Royalty Income' },
      { key: 'activeProjects', year: years[1], value: 22, category: 'OPERATIONAL', label: 'Active Projects' },

      // Current year
      { key: 'totalRevenue', year: years[2], value: 13750000, category: 'FINANCIAL', label: 'Total Revenue' },
      { key: 'totalExpenses', year: years[2], value: 9250000, category: 'FINANCIAL', label: 'Total Expenses' },
      { key: 'royaltyIncome', year: years[2], value: 4120000, category: 'FINANCIAL', label: 'Royalty Income' },
      { key: 'activeProjects', year: years[2], value: 27, category: 'OPERATIONAL', label: 'Active Projects' },
      { key: 'exportValue', year: years[2], value: 5600000, category: 'FINANCIAL', label: 'Mineral Export Value' },
    ];

    const adminIdStr = String(adminUserId);
    for (const kpi of kpis) {
      await this.prismaService.dashboardKpi.upsert({
        where: { key_year: { key: kpi.key, year: kpi.year } },
        update: {
          value: kpi.value,
          category: kpi.category as any,
          label: kpi.label,
          updatedBy: adminIdStr,
        },
        create: {
          key: kpi.key,
          year: kpi.year,
          value: kpi.value,
          category: kpi.category as any,
          label: kpi.label,
          createdBy: adminIdStr,
          updatedBy: adminIdStr,
        },
      });
    }
    console.log(`✅ Seeded ${kpis.length} executive KPIs`);

    // ─── CONTRACTS SUMMARY ───
    const contractsSummaries = [
      {
        year: years[0],
        totalContracts: 42,
        activeContracts: 28,
        suspendedContracts: 8,
        cancelledContracts: 6,
        notes: 'Initial baseline year — several legacy contracts wound down.',
      },
      {
        year: years[1],
        totalContracts: 58,
        activeContracts: 41,
        suspendedContracts: 10,
        cancelledContracts: 7,
        notes: 'Growth year following investment reforms.',
      },
      {
        year: years[2],
        totalContracts: 74,
        activeContracts: 54,
        suspendedContracts: 12,
        cancelledContracts: 8,
        notes: 'Record-high active contracts due to renewed licenses.',
      },
    ];

    for (const cs of contractsSummaries) {
      await this.prismaService.contractsSummary.upsert({
        where: { year: cs.year },
        update: {
          totalContracts: cs.totalContracts,
          activeContracts: cs.activeContracts,
          suspendedContracts: cs.suspendedContracts,
          cancelledContracts: cs.cancelledContracts,
          notes: cs.notes,
          updatedBy: adminIdStr,
        },
        create: {
          ...cs,
          createdBy: adminIdStr,
          updatedBy: adminIdStr,
        },
      });
    }
    console.log(`✅ Seeded ${contractsSummaries.length} contracts summaries`);

    // ─── MINISTER TRAVELS ───
    // Only insert if there are none yet — otherwise we'd duplicate on every seed
    const existingTravelCount = await this.prismaService.ministerTravel.count();
    if (existingTravelCount === 0) {
      const thisYear = years[2];
      const travels = [
        {
          type: 'DOMESTIC' as const,
          destination: 'Herat — Mining sites inspection',
          purpose: 'Quarterly inspection of active mining operations in western provinces.',
          startDate: new Date(`${thisYear}-01-12`),
          endDate: new Date(`${thisYear}-01-15`),
          cost: 12500,
        },
        {
          type: 'INTERNATIONAL' as const,
          destination: 'Dubai, UAE — Investment conference',
          purpose: 'Attend the Afghanistan mining investment conference and bilateral meetings.',
          startDate: new Date(`${thisYear}-02-03`),
          endDate: new Date(`${thisYear}-02-07`),
          cost: 48750,
        },
        {
          type: 'DOMESTIC' as const,
          destination: 'Kandahar — Coal mine site visit',
          purpose: 'Review production status and community engagement programs.',
          startDate: new Date(`${thisYear}-03-18`),
          endDate: new Date(`${thisYear}-03-20`),
          cost: 9800,
        },
        {
          type: 'INTERNATIONAL' as const,
          destination: 'Ashgabat, Turkmenistan — TAPI pipeline meeting',
          purpose: 'TAPI gas pipeline progress review with regional partners.',
          startDate: new Date(`${thisYear}-04-05`),
          endDate: new Date(`${thisYear}-04-09`),
          cost: 62300,
        },
        {
          type: 'DOMESTIC' as const,
          destination: 'Badakhshan — Emerald mine inspection',
          purpose: 'Audit of the Panjshir emerald extraction operations.',
          startDate: new Date(`${thisYear}-05-22`),
          endDate: new Date(`${thisYear}-05-26`),
          cost: 15400,
        },
        {
          type: 'INTERNATIONAL' as const,
          destination: 'Toronto, Canada — PDAC conference',
          purpose: 'Prospectors and Developers Association of Canada annual conference.',
          startDate: new Date(`${thisYear}-06-02`),
          endDate: new Date(`${thisYear}-06-09`),
          cost: 95200,
        },
        {
          type: 'DOMESTIC' as const,
          destination: 'Nangarhar — Talc mine licensing',
          purpose: 'Site inspection for new small-scale talc mining licenses.',
          startDate: new Date(`${thisYear}-07-14`),
          endDate: new Date(`${thisYear}-07-15`),
          cost: 6200,
        },
        {
          type: 'INTERNATIONAL' as const,
          destination: 'Tehran, Iran — Bilateral mining agreement',
          purpose: 'Negotiate cross-border mining cooperation framework.',
          startDate: new Date(`${thisYear}-08-11`),
          endDate: new Date(`${thisYear}-08-14`),
          cost: 31500,
        },
        {
          type: 'DOMESTIC' as const,
          destination: 'Balkh — Cement plant opening',
          purpose: 'Official inauguration of new cement production facility.',
          startDate: new Date(`${thisYear}-09-08`),
          endDate: new Date(`${thisYear}-09-09`),
          cost: 7800,
        },
        {
          type: 'INTERNATIONAL' as const,
          destination: 'Doha, Qatar — Energy summit',
          purpose: 'Afghanistan energy and mineral resources summit.',
          startDate: new Date(`${thisYear}-10-20`),
          endDate: new Date(`${thisYear}-10-24`),
          cost: 54100,
        },
      ];

      await this.prismaService.ministerTravel.createMany({
        data: travels.map((t) => ({ ...t, createdBy: adminIdStr })),
      });
      console.log(`✅ Seeded ${travels.length} minister travels`);
    } else {
      console.log(
        `ℹ️ Skipped minister travels seed — ${existingTravelCount} already exist`,
      );
    }
  }
}
