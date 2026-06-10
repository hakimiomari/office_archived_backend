import {
  ConflictException,
  Injectable,
  Logger,
} from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { Response } from "express";
import { PrismaService } from "src/prisma/prisma.service";
import { TenantService } from "src/tenant/tenant.service";
import { ChartOfAccountsService } from "src/accounting/chart-of-accounts.service";
import { AuditService } from "src/tenant/audit.service";
import { HashingProvider } from "./hashing.provider";
import { TokenProvider } from "./token.provider";
import { RegisterDto } from "../dto/RegisterDto.dto";

/**
 * Public self-signup flow. Creates:
 *   1. A new Company (the tenant root).
 *   2. The standard chart of accounts (inside that tenant's context).
 *   3. An auto-assigned Basic CompanySubscription (PERPETUAL,
 *      no end date — matches what `companies.service.create` does
 *      for SUPER_ADMIN-initiated creates).
 *   4. The first User as COMPANY_ADMIN of that tenant, holding the
 *      seeded `admin` role (so they immediately get every permission).
 *   5. Issues access + refresh cookies + an `auth.login` audit row.
 *
 * The whole sequence runs OUTSIDE a tenant request context (we're
 * before AuthGuard), so we go through the raw Prisma client for the
 * Company + User writes and only enter tenant context for the
 * subscription + chart seed (which expect it).
 *
 * Slug collisions, email collisions, and company-name collisions all
 * surface as 409 Conflict with a precise message.
 */
@Injectable()
export class RegisterProvider {
  private readonly logger = new Logger("RegisterProvider");

  constructor(
    private readonly prisma: PrismaService,
    private readonly hashing: HashingProvider,
    private readonly tokens: TokenProvider,
    private readonly tenants: TenantService,
    private readonly chart: ChartOfAccountsService,
    private readonly audit: AuditService,
  ) {}

  // The Company + User models are NOT in TENANT_MODELS, so the
  // extension passes calls through unchanged. We cast to PrismaClient
  // just for clearer typing on the raw paths.
  private get raw() {
    return this.prisma as unknown as PrismaClient;
  }

  public async register(dto: RegisterDto, response: Response) {
    const slug = this.deriveSlug(dto.companySlug ?? dto.companyName);

    // Pre-flight uniqueness so we return tidy 409s instead of a generic
    // P2002 surface. We still catch P2002 at the create call in case
    // of a race between the check and the insert.
    const [byName, bySlug, byEmail] = await Promise.all([
      this.raw.company.findFirst({ where: { name: dto.companyName } }),
      this.raw.company.findFirst({ where: { slug } }),
      this.raw.user.findFirst({ where: { email: dto.email.toLowerCase() } }),
    ]);
    if (byName) {
      throw new ConflictException("A company with that name already exists");
    }
    if (bySlug) {
      throw new ConflictException("A company with that URL slug already exists");
    }
    if (byEmail) {
      throw new ConflictException("An account with that email already exists");
    }

    // 1) Create the company row.
    let company;
    try {
      company = await this.raw.company.create({
        data: {
          name: dto.companyName,
          slug,
          isActive: true,
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new ConflictException(
          "A company with this name or slug already exists",
        );
      }
      throw err;
    }

    // 2) Chart of accounts + 3) Basic subscription — both inside the
    // new tenant's runForCompany context so the Prisma extension's
    // companyId injection / soft-delete / audit emit all see the
    // right tenant id.
    await this.tenants.runForCompany(company.id, async () => {
      await this.chart.seedDefault();

      const basic = await this.raw.plan.findUnique({
        where: { slug: "basic" },
      });
      if (!basic) {
        // Should be impossible after `npx prisma db seed`, but fail
        // loudly so misconfigured envs don't silently produce
        // half-provisioned tenants.
        throw new Error(
          "Basic plan missing — run `npx prisma db seed` so signup can complete",
        );
      }
      await this.prisma.companySubscription.create({
        data: {
          planId: basic.id,
          startDate: new Date(),
          status: "ACTIVE",
          billingCycle: "PERPETUAL",
          autoRenew: true,
        },
      } as any);
    });

    // 4) First admin user. Connect them to the seeded global `admin`
    // role so they hold every permission. Fall back to creating with
    // no role if the seed wasn't run (the user can still log in; an
    // admin can grant roles later).
    const adminRole = await this.raw.role.findUnique({
      where: { name: "admin" },
    });

    const passwordHash = await this.hashing.hashPassword(dto.password);

    let user;
    try {
      user = await this.raw.user.create({
        data: {
          name: dto.name,
          email: dto.email.toLowerCase(),
          password: passwordHash,
          userRole: "COMPANY_ADMIN",
          companyId: company.id,
          ...(adminRole
            ? { roles: { connect: [{ id: adminRole.id }] } }
            : {}),
        },
        include: {
          roles: { include: { permissions: true } },
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        throw new ConflictException(
          "An account with that email already exists",
        );
      }
      throw err;
    }

    // 5) Issue cookies + audit, mirroring the sign-in flow exactly so
    // the front-end's existing axios interceptor + UserContext
    // bootstrap work unchanged.
    const allPermissions = (user.roles ?? []).flatMap((r: any) =>
      r.permissions ?? [],
    );
    const uniquePermissions = [
      ...new Map(allPermissions.map((p: any) => [p.name, p])).values(),
    ];
    const roleNames = (user.roles ?? []).map((r: any) => r.name);

    const { access_token, refresh_token } = await this.tokens.getTokens(
      user.id,
      user.email,
      roleNames,
      uniquePermissions,
      user.userRole ?? "COMPANY_ADMIN",
      user.companyId ?? null,
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
      maxAge: 15 * 60 * 1000,
      path: "/",
    });

    this.audit.log({
      action: "auth.register",
      entity: "Company",
      entityId: company.id,
      userId: user.id,
      email: user.email,
      companyId: company.id,
    });

    return {
      access_token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        profile_picture: user.profile_picture,
        userRole: user.userRole,
        companyId: user.companyId,
      },
      company: {
        id: company.id,
        name: company.name,
        slug: company.slug,
      },
    };
  }

  /**
   * Lowercase ascii-safe slug derived from `input`. Strips diacritics,
   * collapses runs of non-alphanumeric chars to a single hyphen, trims
   * hyphens from the edges. Idempotent on already-valid slugs.
   */
  private deriveSlug(input: string): string {
    return (
      input
        .toLowerCase()
        .normalize("NFKD")
        // Combining diacritical marks (U+0300..U+036F). Written with
        // explicit code-point escapes so this file is safe to copy
        // through editors that strip standalone combining chars.
        .replace(/[\u0300-\u036F]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "company"
    );
  }
}
