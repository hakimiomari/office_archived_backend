import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { randomBytes } from "crypto";
import { tenantStorage, TenantContextData, UserRoleName } from "./tenant-context";
import { TenantLogger } from "./tenant-logger";
import { AuditService } from "./audit.service";

/**
 * Wraps every HTTP request in an AsyncLocalStorage context so the Prisma
 * tenant extension can read the active user without prop-drilling.
 *
 * Reads `req.user` (populated by AuthGuard from the JWT), and optionally the
 * `X-Tenant-Company-Id` request header for SUPER_ADMINs who want to scope
 * reads/writes to a specific company. The header is ignored for everyone
 * else — tenant scoping is a server-trusted decision; the client only
 * signals.
 *
 * Also generates a short request id (or honors `X-Request-Id` from the
 * client), stores it in the tenant context, and echoes it back via
 * `X-Request-Id` on the response so logs can be correlated end-to-end
 * across services and tabs.
 */
const TENANT_HEADER = "x-tenant-company-id";
const REQUEST_ID_HEADER = "x-request-id";
const SHOW_DELETED_HEADER = "x-show-deleted";

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  private readonly logger = new TenantLogger("TenantScope");

  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const http = context.switchToHttp();
    const req = http.getRequest<{
      user?: {
        sub?: number;
        email?: string;
        userRole?: UserRoleName;
        companyId?: number | null;
      };
      headers?: Record<string, any>;
      method?: string;
      originalUrl?: string;
      url?: string;
      requestId?: string;
    }>();
    const res = http.getResponse<{
      setHeader?: (name: string, value: string) => void;
    }>();
    const u = req.user;
    if (!u) return next.handle();

    const userRole: UserRoleName = u.userRole ?? "COMPANY_USER";
    const companyId = u.companyId ?? null;

    // SUPER_ADMIN may send `X-Tenant-Company-Id: 42` to scope a specific
    // tenant. For non-SUPER_ADMIN users we ignore the header completely so
    // it can never be used to escape their tenant.
    let superAdminFilterCompanyId: number | null | undefined;
    // `X-Show-Deleted: 1` lets a SUPER_ADMIN see soft-deleted rows. Same
    // server-trusted gating: non-SUPER_ADMIN requests can never see deleted
    // rows even if the header is present.
    let showDeleted = false;
    if (userRole === "SUPER_ADMIN") {
      const raw = req.headers?.[TENANT_HEADER];
      const value = Array.isArray(raw) ? raw[0] : raw;
      if (value === undefined || value === "" || value === "all") {
        superAdminFilterCompanyId = undefined; // default: see all
      } else {
        const n = Number(value);
        superAdminFilterCompanyId = Number.isFinite(n) ? n : undefined;
      }
      const rawShow = req.headers?.[SHOW_DELETED_HEADER];
      const showValue = Array.isArray(rawShow) ? rawShow[0] : rawShow;
      showDeleted = showValue === "1" || showValue === "true";
    }

    // Request id: honor a client-provided id if it looks safe, otherwise
    // generate a short hex token. Echoed on response so clients can paste
    // it into bug reports.
    const incomingId = req.headers?.[REQUEST_ID_HEADER];
    const incomingValue = Array.isArray(incomingId) ? incomingId[0] : incomingId;
    const requestId =
      typeof incomingValue === "string" &&
      /^[A-Za-z0-9_-]{6,64}$/.test(incomingValue)
        ? incomingValue
        : randomBytes(4).toString("hex");
    req.requestId = requestId;
    res.setHeader?.("X-Request-Id", requestId);

    const ctx: TenantContextData = {
      userId: Number(u.sub ?? 0),
      email: u.email ?? "",
      userRole,
      companyId,
      superAdminFilterCompanyId,
      requestId,
      showDeleted,
    };

    return new Observable((subscriber) => {
      tenantStorage.run(ctx, () => {
        // Persist a SUPER_ADMIN scope-change audit row whenever a request
        // explicitly targets a tenant. Cheap enough to emit per request;
        // future work could de-dupe by tracking "last seen scope" per
        // user in-memory and only logging on transitions.
        if (superAdminFilterCompanyId != null) {
          this.logger.warn(
            `super_admin_scope userId=${u.sub ?? "?"} email=${u.email ?? "?"} ` +
              `${req.method ?? ""} ${req.originalUrl ?? req.url ?? ""}`,
          );
          this.audit.log({
            action: "tenant.scope",
            entity: "Company",
            entityId: superAdminFilterCompanyId,
            companyId: superAdminFilterCompanyId,
            notes: `SUPER_ADMIN scoped to companyId=${superAdminFilterCompanyId} for ${req.method ?? ""} ${req.originalUrl ?? req.url ?? ""}`,
          });
        }
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
