import { forwardRef, Module } from "@nestjs/common";
import { UserController } from "./users.controller";
import { UserService } from "./users.service";
import { PrismaModule } from "src/prisma/prisma.module";
import { AuthModule } from "src/auth/auth.module";
import { FindOneUserByEmailProvider } from "./providers/find-one-user-by-email.provider";
import { CreateUserProvider } from "./providers/create-user.provider";

@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule)],
  controllers: [UserController],
  providers: [UserService, FindOneUserByEmailProvider, CreateUserProvider],
  exports: [CreateUserProvider, UserService],
})
export class UserModule {}
