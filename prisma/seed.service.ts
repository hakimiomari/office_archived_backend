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
      'license.read', 'contract.read', 'report.view',
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
  }
}
