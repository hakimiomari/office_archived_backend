import {
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  RequestTimeoutException,
  UnauthorizedException,
} from "@nestjs/common";
import { SignInDto } from "../dto/SignInDto.dto";
import { UserService } from "src/users/users.service";
import { HashingProvider } from "./hashing.provider";
import { Response } from "express";
import { TokenProvider } from "./token.provider";
import { AuditService } from "src/tenant/audit.service";
@Injectable()
export class SignInProvider {
  constructor(
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    private readonly hashingProvider: HashingProvider,
    private readonly tokenProvider: TokenProvider,
    private readonly audit: AuditService,
  ) {}

  public async signIn(signInDto: SignInDto, response: Response) {
    const user = await this.userService.findOneByEmail(signInDto.email);
    if (!user) {
      throw new ForbiddenException("Invalid Credentials");
    }
    let isEqual: boolean = false;
    try {
      isEqual = await this.hashingProvider.verifyPassword(
        signInDto.password,
        user.password,
      );
    } catch (error) {
      throw new RequestTimeoutException(error, {
        description: "Could not verify password",
      });
    }
    if (!isEqual) {
      throw new UnauthorizedException("Incorrect password");
    }
    // Collect ALL permissions from ALL roles (deduplicated)
    const allPermissions = user.roles.flatMap((r) => r.permissions);
    const uniquePermissions = [
      ...new Map(allPermissions.map((p) => [p.name, p])).values(),
    ];
    const roles = user.roles.map((r) => r.name);
    const { access_token, refresh_token } = await this.tokenProvider.getTokens(
      user.id,
      user.email,
      roles,
      uniquePermissions,
      user.userRole ?? "USER",
    );
    response.cookie("refresh_token", refresh_token, {
      httpOnly: true,
      secure: false,
      sameSite: "strict",
      maxAge: 1000 * 60 * 60 * 24 * 15,
      path: "/",
    });
    response.cookie("access_token", access_token, {
      httpOnly: false,
      secure: false,
      sameSite: "strict",
      maxAge: 15 * 60 * 1000, // 15 minutes
      path: "/",
    });
    this.audit.log({
      action: "auth.login",
      entity: "User",
      entityId: user.id,
      userId: user.id,
      email: user.email,
      companyId: user.companyId ?? null,
    });
    const userData = {
      id: user.id,
      name: user.name,
      email: user.email,
      profile_picture: user.profile_picture,
    };
    return {
      access_token,
      user: userData,
    };
  }
}
