import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class FindOneByGoogleIdProvider {
  constructor(private prismaService: PrismaService) {}

  public async findOneByGoogleId(googleId: string) {
    return await this.prismaService.user.findUnique({
      where: {
        googleId: googleId,
      },
    });
  }
}
