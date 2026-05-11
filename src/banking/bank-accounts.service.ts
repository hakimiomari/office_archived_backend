import {
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { tenantCreateStrict } from "../tenant/tenant-create";
import {
  CreateBankAccountDto,
  UpdateBankAccountDto,
} from "./banking.dto";

/**
 * Bank accounts that a tenant reconciles against. Each row is one
 * physical/logical account at one financial institution — checking,
 * savings, a specific credit card, a payment processor's holding
 * account, etc.
 *
 * `openingBalance` is the manual starting balance entered when the
 * account is first connected. The running balance is then opening +
 * Σ(CREDIT) − Σ(DEBIT) of all matched BankTransaction rows, computed
 * on demand by the reconciliations service.
 */
@Injectable()
export class BankAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateBankAccountDto) {
    return this.prisma.bankAccount.create({
      data: tenantCreateStrict<Prisma.BankAccountUncheckedCreateInput>({
        ...dto,
      }),
    });
  }

  async findAll() {
    return this.prisma.bankAccount.findMany({
      orderBy: { name: "asc" },
    });
  }

  async findOne(id: number) {
    const account = await this.prisma.bankAccount.findUnique({
      where: { id },
    });
    if (!account)
      throw new NotFoundException(`Bank account ${id} not found`);
    return account;
  }

  async update(id: number, dto: UpdateBankAccountDto) {
    await this.findOne(id);
    return this.prisma.bankAccount.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.bankAccount.delete({ where: { id } });
  }
}
