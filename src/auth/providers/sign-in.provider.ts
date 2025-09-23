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
@Injectable()
export class SignInProvider {
  constructor(
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    private readonly hashingProvider: HashingProvider,
    private readonly tokenProvider: TokenProvider
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
        user.password
      );
    } catch (error) {
      throw new RequestTimeoutException(error, {
        description: "Could not verify password",
      });
    }
    if (!isEqual) {
      throw new UnauthorizedException("Incorrect password");
    }
    const permissions = user.roles[0].permissions;
    const role = user.roles[0].name;
    const { access_token, refresh_token } = await this.tokenProvider.getTokens(
      user.id,
      user.email,
      role,
      permissions
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
