import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { OAuth2Client } from "google-auth-library";
import googleAuthConfig from "../config/google-auth.config";
import { GoogleTokenDto } from "./dto/google-token.dto";
import { UserService } from "src/users/users.service";
import { TokenProvider } from "../providers/token.provider";

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

  public async authentication(googleTokenDto: GoogleTokenDto) {
    const loginTicket = await this.oauthClient.verifyIdToken({
      idToken: googleTokenDto.token,
    });

    const googleId = loginTicket.getPayload()?.sub;

    const user = await this.userService.findOneByGoogleId(googleId);

    if (user) {
      const { access_token, refresh_token } =
        await this.tokenProvider.getTokens(
          user.id,
          user.email,
          user.roles[0].name,
          user.permissions
        );
      return { access_token };
    }
  }
}
