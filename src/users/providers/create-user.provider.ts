import {
  BadRequestException,
  Injectable,
  RequestTimeoutException,
} from "@nestjs/common";
import { CreateUserDto } from "../dto/CreateUserDto.dot";
import { PrismaService } from "src/prisma/prisma.service";
import { HashingProvider } from "src/auth/providers/hashing.provider";
import { FindOneUserByEmailProvider } from "./find-one-user-by-email.provider";
import { TokenProvider } from "src/auth/providers/token.provider";

@Injectable()
export class CreateUserProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashingProvider: HashingProvider,
    private readonly findOneUserByEmailProvider: FindOneUserByEmailProvider,
    private readonly tokenProvider: TokenProvider,
  ) {}

  public async create(createUserDto: CreateUserDto) {
    let existingUser;
    try {
      existingUser = await this.findOneUserByEmailProvider.isUserExists(
        createUserDto.email,
      );
    } catch (error) {
      throw new RequestTimeoutException(
        "Unable to process your request at the moment. Please try again later.",
        { description: "Error connecting to the database" },
      );
    }
    if (existingUser) {
      throw new BadRequestException(
        "The user already exists, please check your email",
      );
    }

    const password = await this.hashingProvider.hashPassword(
      createUserDto.password,
    );

    // Single-tenant mode: any caller can choose ADMIN or USER. (Multi-
    // tenancy / SUPER_ADMIN scoping was removed; permission gating on the
    // controller is what restricts who may hit this endpoint.)
    const resolvedUserRole: "ADMIN" | "USER" = createUserDto.userRole ?? "USER";

    const newUser = await this.prisma.user.create({
      data: {
        name: createUserDto.name,
        email: createUserDto.email,
        password,
        userRole: resolvedUserRole,
        roles: {
          connect: [{ id: Number(createUserDto.role) }],
        },
      },
    });

    const permissions: any[] = [];
    const role = "admin";
    const { access_token, refresh_token } = await this.tokenProvider.getTokens(
      newUser.id,
      newUser.email,
      role,
      permissions,
      newUser.userRole ?? "USER",
    );

    return { access_token, refresh_token };
  }
}
