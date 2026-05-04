import { Inject, Injectable, OnModuleInit, BadRequestException } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { OAuth2Client } from "google-auth-library";
import googleAuthConfig from "../config/google-auth.config";
import { GoogleTokenDto } from "./dto/google-token.dto";
import { UserService } from "src/users/users.service";
import { TokenProvider } from "../providers/token.provider";
import { Response } from "express";

@Injectable()
export class GoogleAuthenticationService implements OnModuleInit {
  private oauthClient: OAuth2Client;

  constructor(
    @Inject(googleAuthConfig.KEY)
    private readonly googleAuthConfigration: ConfigType<
      typeof googleAuthConfig
    >,
    private readonly userService: UserService,
    private readonly tokenProvider: TokenProvider
  ) {}

  onModuleInit() {
    const { clientID, clientSecret } = this.googleAuthConfigration;
    this.oauthClient = new OAuth2Client(clientID, clientSecret);
  }

  private async getGoogleUserInfo(
    googleTokenDto: GoogleTokenDto
  ): Promise<{
    googleId: string;
    email: string;
    first_name: string;
    last_name: string;
    picture: string;
  }> {
    // Try ID token first (from GoogleLogin component / One Tap)
    if (googleTokenDto.token.includes(".")) {
      try {
        const loginTicket = await this.oauthClient.verifyIdToken({
          idToken: googleTokenDto.token,
        });
        const payload = loginTicket.getPayload();
        return {
          googleId: payload?.sub ?? "",
          email: payload?.email ?? "",
          first_name: payload?.given_name ?? "",
          last_name: payload?.family_name ?? "",
          picture: payload?.picture ?? "",
        };
      } catch {}
    }

    // Fall back to access token (from useGoogleLogin)
    try {
      const res = await fetch(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        {
          headers: { Authorization: `Bearer ${googleTokenDto.token}` },
        }
      );
      if (!res.ok) throw new Error("Failed to fetch user info");
      const data = await res.json();
      return {
        googleId: data.sub ?? "",
        email: data.email ?? "",
        first_name: data.given_name ?? "",
        last_name: data.family_name ?? "",
        picture: data.picture ?? "",
      };
    } catch {
      throw new BadRequestException("Invalid Google token");
    }
  }

  public async authentication(
    googleTokenDto: GoogleTokenDto,
    response: Response
  ) {
    const { googleId, email, first_name, last_name, picture } =
      await this.getGoogleUserInfo(googleTokenDto);

    const user = await this.userService.findOneByGoogleId(googleId);

    if (user) {
      // Extract permissions from all roles
      const allPermissions = user.roles.flatMap((r: any) => r.permissions || []);
      const uniquePermissions = [
        ...new Map(allPermissions.map((p: any) => [p.name, p])).values(),
      ];
      const roleNames = user.roles.map((r: any) => r.name);

      const { access_token, refresh_token } =
        await this.tokenProvider.getTokens(
          user.id,
          user.email,
          roleNames,
          uniquePermissions,
          (user as any).userRole ?? "COMPANY_USER",
          (user as any).companyId ?? null,
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

      return { access_token, user };
    }

    const userData = {
      googleId: googleId,
      email: email,
      name: `${first_name} ${last_name}`,
      profile_picture: picture,
    };
    const newUser = await this.userService.createGoogleUser(userData);

    // Fetch the newly created user with role permissions
    const createdUser = await this.userService.findOneByGoogleId(newUser.googleId);
    const newPermissions = createdUser?.roles.flatMap((r: any) => r.permissions || []) ?? [];
    const uniqueNewPermissions = [
      ...new Map(newPermissions.map((p: any) => [p.name, p])).values(),
    ];
    const newRoleNames = createdUser?.roles.map((r: any) => r.name) ?? ["user"];

    const { access_token, refresh_token } = await this.tokenProvider.getTokens(
      newUser.id,
      newUser.email,
      newRoleNames,
      uniqueNewPermissions,
      (createdUser as any)?.userRole ?? "COMPANY_USER",
      (createdUser as any)?.companyId ?? null,
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
    const data = {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      profile_picture: newUser.profile_picture,
    };
    return {
      access_token,
      user: data,
    };
  }
}
