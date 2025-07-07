import * as bcrypt from "bcrypt";
import { Injectable } from "@nestjs/common";
import { HashingProvider } from "./hashing.provider";

@Injectable()
export class BcryptProvider implements HashingProvider {
  public async hashPassword(data: string | Buffer): Promise<string> {
    // Generate a salt and hash the password
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(data, salt);
  }
  verifyPassword(data: string | Buffer, hash: string): Promise<boolean> {
    return bcrypt.compare(data, hash);
  }
}
