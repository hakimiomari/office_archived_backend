import { PrismaService } from "../../dist/prisma/prisma.service";
import { Injectable } from "@nestjs/common";

@Injectable()
export class SeedService {
  constructor(private readonly prismaService: PrismaService) {}

  async seed() {
    const permissions = [
      { name: "creat:users", group_name: "users", label: "Create User" },
      { name: "update:users", group_name: "users", label: "Update User" },
      { name: "delete:users", group_name: "users", label: "Delete User" },
      { name: "read:users", group_name: "users", label: "Read User" },
    ];

    for (const perm of permissions) {
      await this.prismaService.permission.upsert({
        where: { name: perm.name },
        update: {},
        create: {
          name: perm.name,
          group_name: perm.group_name,
          label: perm.label,
          createdAt: new Date(),
        },
      });
    }

    const adminPermissions = await this.prismaService.permission.findMany();
    await this.prismaService.role.upsert({
      where: { name: "admin" },
      update: {},
      create: {
        name: "admin",
        permissions: {
          connect: adminPermissions.map((perm) => ({ id: perm.id })),
        },
        createdBy: 1,
        created_at: new Date(),
      },
    });

    const userPermissions = await this.prismaService.permission.findMany({
      where: { name: { in: ["read:users"] } },
    });

    await this.prismaService.role.upsert({
      where: { name: "user" },
      update: {},
      create: {
        name: "user",
        permissions: {
          connect: userPermissions.map((perm) => ({ id: perm.id })),
        },
        createdBy: 1,
        created_at: new Date(),
      },
    });
  }
}
