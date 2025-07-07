import {
  Injectable,
  RequestTimeoutException,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class FindOneUserByEmailProvider {
  constructor(private readonly prismaService: PrismaService) {}

  public async findOneUserByEmail(email: string) {
    let user;
    try {
      user = await this.prismaService.user.findUnique({
        where: {
          email: email,
        },
        include: {
          roles: {
            include: {
              permissions: true,
            },
          },
        },
      });
    } catch (error) {
      throw new RequestTimeoutException(error, {
        description: "Could not fetch the user",
      });
    }

    if (!user) {
      throw new UnauthorizedException("User does not exist");
    }

    return user;
  }
}
