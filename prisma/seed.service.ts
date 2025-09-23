import { Injectable } from "@nestjs/common";
import { PrismaService } from "../src/prisma/prisma.service";
import { HashingProvider } from "../src/auth/providers/hashing.provider";

@Injectable()
export class SeedService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly hashingProvider: HashingProvider
  ) {}

  async seed() {
    const permissions = [
      { name: "creat:users", group_name: "users", label: "Create User" },
      { name: "update:users", group_name: "users", label: "Update User" },
      { name: "delete:users", group_name: "users", label: "Delete User" },
      { name: "read:users", group_name: "users", label: "Read User" },
    ];
    const password = "admin";
    const hashPassword = await this.hashingProvider.hashPassword(password);

    await this.prismaService.user.upsert({
      where: { email: "admin@admin.com" },
      update: {},
      create: {
        name: "Kamranullah Hakimi",
        email: "hakimikamranullah@gmail.com",
        password: hashPassword,
        profile_picture:
          "https://avatars.githubusercontent.com/u/101364769?v=4",
        created_at: new Date(),
      },
    });

    console.log("user created");

    for (const perm of permissions) {
      await this.prismaService.permission.upsert({
        where: { name: perm.name },
        update: {},
        create: {
          name: perm.name,
          group_name: perm.group_name,
          label: perm.label,
          created_at: new Date(),
        },
      });
    }

    console.log("permissions created");

    const adminPermissions = await this.prismaService.permission.findMany();
    await this.prismaService.role.upsert({
      where: { name: "admin" },
      update: {},
      create: {
        name: "admin",
        permissions: {
          connect: adminPermissions.map((perm) => ({ id: perm.id })),
        },
        created_by: 1,
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
        created_by: 1,
        created_at: new Date(),
      },
    });

    console.log("roles created");

    await this.prismaService.user.update({
      where: { email: "hakimikamranullah@gmail.com" },
      data: {
        roles: {
          connect: [{ id: 1 }, { id: 2 }],
        },
      },
    });
  }
}
