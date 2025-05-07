import { Body, Controller, Post } from '@nestjs/common';
import { CreateUserDto } from './dto/CreateUserDto.dot';
import { LoginDto } from './dto/LoginDto.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('register')
  async register(@Body() dto: CreateUserDto) {
    return this.authService.register(dto);
  }
}
