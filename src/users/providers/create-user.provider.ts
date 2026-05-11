import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  RequestTimeoutException,
} from "@nestjs/common";
import { CreateUserDto } from "../dto/CreateUserDto.dot";
import { PrismaService } from "src/prisma/prisma.service";
import { HashingProvider } from "src/auth/providers/hashing.provider";
import { FindOneUserByEmailProvider } from "./find-one-user-by-email.provider";
import { TokenProvider } from "src/auth/providers/token.provider";
import { getTenantContext, isSuperAdmin } from "src/tenant/tenant-context";
@Injectable()
export class CreateUserProvider {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hashingProvider: HashingProvider,
    private readonly findOneUserByEmailProvider: FindOneUserByEmailProvider,
    private readonly tokenProvider: TokenProvider
  ) {}

  public async create(createUserDto: CreateUserDto) {
    let existingUser;
    try {
      existingUser = await this.findOneUserByEmailProvider.isUserExists(
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

    // Tenancy enforcement (server-side):
    //  - SUPER_ADMIN may pick any userRole + any companyId (including null
    //    for SUPER_ADMIN-on-SUPER_ADMIN). Their input is trusted.
    //  - Anyone else can only create COMPANY_USER inside their own company.
    //    Any client-provided userRole / companyId is ignored.
    const ctx = getTenantContext();
    const dtoUserRole = createUserDto.userRole;
    const dtoCompanyId = createUserDto.companyId;

    let resolvedUserRole: "SUPER_ADMIN" | "COMPANY_ADMIN" | "COMPANY_USER";
    let resolvedCompanyId: number | null;
    if (isSuperAdmin()) {
      resolvedUserRole = dtoUserRole ?? "COMPANY_USER";
      resolvedCompanyId =
        resolvedUserRole === "SUPER_ADMIN" ? null : (dtoCompanyId ?? null);
      if (resolvedUserRole !== "SUPER_ADMIN" && resolvedCompanyId == null) {
        throw new BadRequestException(
          "companyId is required for non-SUPER_ADMIN users",
        );
      }
    } else {
      // Hard cap for tenant admins: never escalate, never cross-tenant.
      resolvedUserRole = "COMPANY_USER";
      resolvedCompanyId = ctx?.companyId ?? null;
      if (resolvedCompanyId == null) {
        throw new ForbiddenException(
          "Only SUPER_ADMIN can create users without a company",
        );
      }
    }

    const newUser = await this.prisma.user.create({
      data: {
        name: createUserDto.name,
        email: createUserDto.email,
        password: password,
        userRole: resolvedUserRole,
        companyId: resolvedCompanyId,
        roles: {
          connect: [{ id: Number(createUserDto.role) }],
        },
      },
    });

    const permissions = [];
    const role = "admin";
    const { access_token, refresh_token } = await this.tokenProvider.getTokens(
      newUser.id,
      newUser.email,
      role,
      permissions,
      newUser.userRole ?? "COMPANY_USER",
      newUser.companyId ?? null,
    );

    return {
      access_token,
      refresh_token,
    };
  }
}
