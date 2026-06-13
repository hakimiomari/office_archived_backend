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
      // Inventory Management
      { name: 'inventory.create', group_name: 'inventory', label: 'Create Inventory' },
      { name: 'inventory.read', group_name: 'inventory', label: 'Read Inventory' },
      { name: 'inventory.update', group_name: 'inventory', label: 'Update Inventory' },
      { name: 'inventory.delete', group_name: 'inventory', label: 'Delete Inventory' },
      { name: 'inventory.movement', group_name: 'inventory', label: 'Perform Stock Movements' },
      // Employee / HR Management
      { name: 'employee.create', group_name: 'employee', label: 'Create Employee' },
      { name: 'employee.read', group_name: 'employee', label: 'Read Employee' },
      { name: 'employee.update', group_name: 'employee', label: 'Update Employee' },
      { name: 'employee.delete', group_name: 'employee', label: 'Delete Employee' },
      { name: 'department.create', group_name: 'employee', label: 'Create Department' },
      { name: 'department.read', group_name: 'employee', label: 'Read Department' },
      { name: 'department.update', group_name: 'employee', label: 'Update Department' },
      { name: 'department.delete', group_name: 'employee', label: 'Delete Department' },
      // Sales / Billing
      { name: 'sale.create', group_name: 'sales', label: 'Create Sale' },
      { name: 'sale.read', group_name: 'sales', label: 'Read Sale' },
      { name: 'sale.update', group_name: 'sales', label: 'Update Sale' },
      { name: 'sale.delete', group_name: 'sales', label: 'Delete Sale' },
      { name: 'customer.create', group_name: 'sales', label: 'Create Customer' },
      { name: 'customer.read', group_name: 'sales', label: 'Read Customer' },
      { name: 'customer.update', group_name: 'sales', label: 'Update Customer' },
      { name: 'customer.delete', group_name: 'sales', label: 'Delete Customer' },
      { name: 'payment.create', group_name: 'sales', label: 'Record Payment' },
      { name: 'payment.read', group_name: 'sales', label: 'Read Payments' },
      { name: 'payment.delete', group_name: 'sales', label: 'Delete Payment' },
      // Subscription / Plan-change request review
      // Granting `plan_request.review` lets a non-super-admin staff
      // account approve or reject company upgrade requests from
      // /admin/plan-requests. SUPER_ADMIN bypasses this check.
      { name: 'plan_request.review', group_name: 'subscriptions', label: 'Review Plan Change Requests' },
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

    // ─── 2. CREATE SUPER ADMIN USER ───
    // The seeded admin is the system-wide SUPER_ADMIN: no companyId, full
    // access to every tenant, and the only one allowed to create companies.
    // The `update` block here is critical: if this user already existed
    // (e.g. from a previous seed run before multi-tenancy was added), we
    // promote them to SUPER_ADMIN now.
    const password = 'admin';
    const hashPassword = await this.hashingProvider.hashPassword(password);

    const adminUser = await this.prismaService.user.upsert({
      where: { email: 'hakimikamranullah@gmail.com' },
      update: {
        userRole: 'SUPER_ADMIN',
        companyId: null,
      } as any,
      create: {
        name: 'Kamranullah Hakimi',
        email: 'hakimikamranullah@gmail.com',
        password: hashPassword,
        profile_picture:
          'https://avatars.githubusercontent.com/u/101364769?v=4',
        userRole: 'SUPER_ADMIN',
        companyId: null,
      } as any,
    });
    console.log('✅ Super admin user seeded');

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

    // Manager → Manage inventory + employees + sales, no user mgmt
    const managerPerms = [
      'inventory.create', 'inventory.read', 'inventory.update', 'inventory.delete', 'inventory.movement',
      'employee.create', 'employee.read', 'employee.update',
      'department.create', 'department.read', 'department.update',
      'sale.create', 'sale.read', 'sale.update',
      'customer.create', 'customer.read', 'customer.update',
      'payment.create', 'payment.read',
    ].map((n) => permByName(n)).filter(Boolean);

    await this.prismaService.role.upsert({
      where: { name: 'manager' },
      update: {
        description: 'Manage inventory and employees',
        permissions: { set: managerPerms.map((p) => ({ id: p!.id })) },
      },
      create: {
        name: 'manager',
        description: 'Manage inventory and employees',
        created_by: adminUser.id,
        permissions: { connect: managerPerms.map((p) => ({ id: p!.id })) },
      },
    });

    // Viewer → Read-only
    const viewerPerms = [
      'inventory.read', 'employee.read', 'department.read',
      'sale.read', 'customer.read', 'payment.read',
    ].map((n) => permByName(n)).filter(Boolean);

    await this.prismaService.role.upsert({
      where: { name: 'viewer' },
      update: {
        description: 'Read-only access',
        permissions: { set: viewerPerms.map((p) => ({ id: p!.id })) },
      },
      create: {
        name: 'viewer',
        description: 'Read-only access',
        created_by: adminUser.id,
        permissions: { connect: viewerPerms.map((p) => ({ id: p!.id })) },
      },
    });

    console.log('✅ Roles seeded (admin, manager, viewer)');

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

    // ─── 5. SUBSCRIPTION PLANS ───
    await this.seedPlans();
    console.log('✅ Subscription plans seeded (basic, premium, pro)');
  }

  /**
   * Idempotent plan + plan-module + plan-feature + plan-limit upserts.
   * Re-running the seed is safe and brings every plan back to the
   * codified shape — manual edits in /admin/plans will be reverted.
   * The migration's backfill block does the same on first deploy.
   */
  async seedPlans() {
    const PLAN_DEFS: Array<{
      slug: string;
      name: string;
      description: string;
      sortOrder: number;
      modules: string[];
      features: string[];
      limit: {
        maxUsers: number | null;
        maxWarehouses: number | null;
        maxItems: number | null;
        maxEmployees: number | null;
        storageGb: number | null;
      };
    }> = [
      {
        slug: 'basic',
        name: 'Basic',
        description: 'Core inventory + sales + employees',
        sortOrder: 0,
        modules: [
          'INVENTORY',
          'SALES',
          'EMPLOYEES',
          'CATEGORIES',
          'USERS',
          'ROLES',
        ],
        features: [],
        limit: {
          maxUsers: 5,
          maxWarehouses: 1,
          maxItems: 500,
          maxEmployees: 10,
          storageGb: 1,
        },
      },
      {
        slug: 'premium',
        name: 'Premium',
        description: 'Adds alerts + stock counts + key reports',
        sortOrder: 1,
        modules: [
          'INVENTORY',
          'SALES',
          'EMPLOYEES',
          'CATEGORIES',
          'ALERTS',
          'STOCK_COUNTS',
          'USERS',
          'ROLES',
        ],
        features: [
          'INVENTORY_REPORTS',
          'SALES_PDF_EXPORT',
          'CUSTOMER_STATEMENT_PDF',
        ],
        limit: {
          maxUsers: 25,
          maxWarehouses: 5,
          maxItems: 5000,
          maxEmployees: 50,
          storageGb: 10,
        },
      },
      {
        slug: 'pro',
        name: 'Pro',
        description: 'All modules + accounting + banking + audit logs',
        sortOrder: 2,
        modules: [
          'INVENTORY',
          'SALES',
          'EMPLOYEES',
          'CATEGORIES',
          'ALERTS',
          'STOCK_COUNTS',
          'ACCOUNTING',
          'BANKING',
          'USERS',
          'ROLES',
        ],
        features: [
          'INVENTORY_REPORTS',
          'INVENTORY_PROFIT_REPORT',
          'SALES_PDF_EXPORT',
          'CUSTOMER_STATEMENT_PDF',
          'ACCOUNTING_LEDGER',
          'ACCOUNTING_JOURNALS',
          'BANK_RECONCILIATION',
          'AUDIT_LOGS',
        ],
        limit: {
          maxUsers: null,
          maxWarehouses: null,
          maxItems: null,
          maxEmployees: null,
          storageGb: null,
        },
      },
    ];

    for (const def of PLAN_DEFS) {
      const plan = await this.prismaService.plan.upsert({
        where: { slug: def.slug },
        update: {
          name: def.name,
          description: def.description,
          sortOrder: def.sortOrder,
          isActive: true,
        },
        create: {
          slug: def.slug,
          name: def.name,
          description: def.description,
          sortOrder: def.sortOrder,
          isActive: true,
        },
      });

      // Replace the module set in-place (delete + recreate) so removing
      // a module from the codified list also removes it from the DB.
      await this.prismaService.planModule.deleteMany({
        where: { planId: plan.id },
      });
      if (def.modules.length > 0) {
        await this.prismaService.planModule.createMany({
          data: def.modules.map((m) => ({
            planId: plan.id,
            moduleCode: m as any,
          })),
          skipDuplicates: true,
        });
      }

      await this.prismaService.planFeature.deleteMany({
        where: { planId: plan.id },
      });
      if (def.features.length > 0) {
        await this.prismaService.planFeature.createMany({
          data: def.features.map((f) => ({
            planId: plan.id,
            featureCode: f as any,
          })),
          skipDuplicates: true,
        });
      }

      await this.prismaService.planLimit.upsert({
        where: { planId: plan.id },
        update: def.limit,
        create: { planId: plan.id, ...def.limit },
      });
    }
  }
}
