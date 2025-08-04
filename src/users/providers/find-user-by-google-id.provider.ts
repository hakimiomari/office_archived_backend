import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class FindUserByGoogleIdProvider {
  constructor(private readonly prismaService: PrismaService) {}
  public findUserByGoogleId = async (googleId: string) => {
    try {
      const user = await this.prismaService.user.findUnique({
        where: {
          googleId,
        },
      });
      return !!user;
    } catch (error) {
      console.error("Error fetching user:", error);
      return false;
    }
  };
}
