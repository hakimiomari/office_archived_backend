import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tenantStorage, TenantContextData, UserRoleName } from "./tenant-context";

/**
 * Wraps every HTTP request in an AsyncLocalStorage context so the Prisma
 * tenant extension can read the active user without prop-drilling.
 *
 * Reads `req.user` (populated by AuthGuard from the JWT), and optionally
 * `req.query.companyId` for SUPER_ADMINs who want to scope reads/writes to
 * a specific company.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<{
      user?: {
        sub?: number;
        email?: string;
        userRole?: UserRoleName;
        companyId?: number | null;
      };
      query?: Record<string, any>;
    }>();
    const u = req.user;
    if (!u) return next.handle();

    const userRole: UserRoleName = u.userRole ?? "COMPANY_USER";
    const companyId = u.companyId ?? null;

    // SUPER_ADMIN may pass ?companyId=42 to focus a specific tenant. For
    // normal users we ignore the query param so it can't be used to escape
    // their tenant.
    let superAdminFilterCompanyId: number | null | undefined;
    if (userRole === "SUPER_ADMIN") {
      const raw = req.query?.companyId;
      if (raw === undefined || raw === "" || raw === "all") {
        superAdminFilterCompanyId = undefined; // default: see all
      } else {
        const n = Number(raw);
        superAdminFilterCompanyId = Number.isFinite(n) ? n : undefined;
      }
    }

    const ctx: TenantContextData = {
      userId: Number(u.sub ?? 0),
      email: u.email ?? "",
      userRole,
      companyId,
      superAdminFilterCompanyId,
    };

    return new Observable((subscriber) => {
      tenantStorage.run(ctx, () => {
        next
          .handle()
          .subscribe({
            next: (v) => subscriber.next(v),
            error: (e) => subscriber.error(e),
            complete: () => subscriber.complete(),
          });
      });
    });
  }
}
