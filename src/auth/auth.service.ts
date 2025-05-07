import { ConflictException, Injectable } from '@nestjs/common';
import { LoginDto } from './dto/LoginDto.dto';
import { CreateUserDto } from './dto/CreateUserDto.dot';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';

interface Tokens {
  access_token: string;
  refresh_token: string;
}

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService) {}

  async login(dto: LoginDto) {
    return dto;
  }

  async register(dto: CreateUserDto) {
    const user = await this.getUserByEmail(dto.email);
    if (user) {
      throw new ConflictException('User already exists');
    }

    const password = await this.hashedPassword(dto.password);
    const newUser = await this.prisma.users.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: password,
      },
    });

    return newUser;
  }

  async getUserByEmail(email: string) {
    return await this.prisma.users.findUnique({
      where: {
        email: email,
      },
    });
  }

  async hashedPassword(password: string) {
    return await bcrypt.hash(password, 10);
  }

  async getTokens(userId: number, email: string): Promise<Tokens> {
    const { access_token, refresh_token } = await Promise.all([]);
    return { access_token, refresh_token };
  }
}
