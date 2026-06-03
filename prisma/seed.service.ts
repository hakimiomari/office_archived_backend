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
    // Single-tenant build: there is no Company table and no SUPER_ADMIN
    // tier. The seeded user is the top-level ADMIN that runs the system.
    const password = 'admin';
    const hashPassword = await this.hashingProvider.hashPassword(password);

    const adminUser = await this.prismaService.user.upsert({
      where: { email: 'hakimikamranullah@gmail.com' },
      update: { userRole: 'ADMIN' },
      create: {
        name: 'Kamranullah Hakimi',
        email: 'hakimikamranullah@gmail.com',
        password: hashPassword,
        profile_picture:
          'https://avatars.githubusercontent.com/u/101364769?v=4',
        userRole: 'ADMIN',
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

    // Manager → Manage inventory + sales, no user mgmt
    const managerPerms = [
      'inventory.create', 'inventory.read', 'inventory.update', 'inventory.delete', 'inventory.movement',
      'sale.create', 'sale.read', 'sale.update',
      'customer.create', 'customer.read', 'customer.update',
      'payment.create', 'payment.read',
    ].map((n) => permByName(n)).filter(Boolean);

    await this.prismaService.role.upsert({
      where: { name: 'manager' },
      update: {
        description: 'Manage inventory and sales',
        permissions: { set: managerPerms.map((p) => ({ id: p!.id })) },
      },
      create: {
        name: 'manager',
        description: 'Manage inventory and sales',
        created_by: adminUser.id,
        permissions: { connect: managerPerms.map((p) => ({ id: p!.id })) },
      },
    });

    // Viewer → Read-only
    const viewerPerms = [
      'inventory.read',
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
  }
}
