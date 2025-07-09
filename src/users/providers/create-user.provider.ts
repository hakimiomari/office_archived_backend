import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  RequestTimeoutException,
} from "@nestjs/common";
import { CreateUserDto } from "../dto/CreateUserDto.dot";
import { PrismaService } from "src/prisma/prisma.service";
import { HashingProvider } from "src/auth/providers/hashing.provider";
import { AuthService } from "src/auth/auth.service";
import { FindOneUserByEmailProvider } from "./find-one-user-by-email.provider";

@Injectable()
export class CreateUserProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashingProvider: HashingProvider,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    private readonly findOneUserByEmailProvider: FindOneUserByEmailProvider
  ) {}

  public async create(createUserDto: CreateUserDto) {
    let existingUser;
    try {
      existingUser = await this.findOneUserByEmailProvider.findOneUserByEmail(
        createUserDto.email
      );
    } catch (error) {
      throw new RequestTimeoutException(
        "Unable to process your request at the moment. Please try again later.",
        {
          description: "Error connecting to the database",
        }
      );
    }
    if (existingUser) {
      throw new BadRequestException(
        "The user already exists, please check your email"
      );
    }

    const password = await this.hashingProvider.hashPassword(
      createUserDto.password
    );
    const newUser = await this.prisma.user.create({
      data: {
        name: createUserDto.name,
        email: createUserDto.email,
        password: password,
        roles: {
          connect: [{ id: Number(createUserDto.role) }],
        },
      },
    });

    const permissions = [];
    const role = "admin";
    const { access_token, refresh_token } = await this.authService.getTokens(
      newUser.id,
      newUser.email,
      role,
      permissions
    );

    this.authService.updateRefreshToken(newUser.id, refresh_token);

    return {
      access_token,
      refresh_token,
    };
  }
}
