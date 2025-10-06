import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
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

  public async authentication(
    googleTokenDto: GoogleTokenDto,
    response: Response
  ) {
    const loginTicket = await this.oauthClient.verifyIdToken({
      idToken: googleTokenDto.token,
    });

    const googleId = loginTicket.getPayload()?.sub;
    const email = loginTicket.getPayload()?.email;
    const first_name = loginTicket.getPayload()?.given_name;
    const last_name = loginTicket.getPayload()?.family_name;
    const picture = loginTicket.getPayload()?.picture;

    const user = await this.userService.findOneByGoogleId(googleId);

    if (user) {
      const { access_token, refresh_token } =
        await this.tokenProvider.getTokens(
          user.id,
          user.email,
          user.roles[0].name,
          user.permissions
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
      googleId: googleId ?? "",
      email: email ?? "",
      name: `${first_name} ${last_name}`,
      profile_picture: picture ?? "",
    };
    const permissions = [];
    const newUser = await this.userService.createGoogleUser(userData);

    const { access_token, refresh_token } = await this.tokenProvider.getTokens(
      newUser.id,
      newUser.email,
      newUser.roles[0].name,
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
