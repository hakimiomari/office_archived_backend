import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigType } from "@nestjs/config";
import { OAuth2Client } from "google-auth-library";
import googleAuthConfig from "../config/google-auth.config";
import { GoogleTokenDto } from "./dto/google-token.dto";
import { UserService } from "src/users/users.service";

@Injectable()
export class GoogleAuthenticationService implements OnModuleInit {
  private oauthClient: OAuth2Client;

  constructor(
    @Inject(googleAuthConfig.KEY)
    private readonly googleAuthConfigration: ConfigType<
      typeof googleAuthConfig
    >,
    private readonly userService: UserService
  ) {}

  onModuleInit() {
    const { clientID, clientSecret } = this.googleAuthConfigration;
    this.oauthClient = new OAuth2Client(clientID, clientSecret);
  }

  public async authentication(googleTokenDto: GoogleTokenDto) {
    return this.userService.findOneByGoogleId(googleTokenDto);
  }
}
