import { ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { GoogleUserInterface } from "../interfaces/google-user.interface";

@Injectable()
export class CrcreateGoogleUserProvider {
  constructor(private readonly prismaService: PrismaService) {}

  public async createGoogleUser(googleUser: GoogleUserInterface) {
    try {
      return await this.prismaService.user.create({
        data: {
          name: googleUser.name,
          email: googleUser.email,
          googleId: googleUser.googleId,
          profile_picture: googleUser.profile_picture,
          roles: {
            connect: [{ name: "user" }],
          },
        },
        include: {
          roles: true,
        },
      });
    } catch (error) {
      throw new ConflictException(error, {
        description: "Could Not Create A New User",
      });
    }
  }
}
