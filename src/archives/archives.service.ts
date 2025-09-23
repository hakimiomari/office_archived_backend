import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class ArchivesService {
  constructor(private readonly prismaService: PrismaService) {}

  async getAll() {
    return await this.prismaService.archives.findMany();
  }
}
