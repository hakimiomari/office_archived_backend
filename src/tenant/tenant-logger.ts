import { Logger } from "@nestjs/common";

/**
 * Single-tenant shim — thin wrapper around Nest's Logger so the previous
 * `new TenantLogger('Scope')` call sites keep working.
 */
export class TenantLogger {
  private readonly logger: Logger;
  constructor(context: string) {
    this.logger = new Logger(context);
  }
  log(msg: any) {
    this.logger.log(msg);
  }
  warn(msg: any) {
    this.logger.warn(msg);
  }
  error(msg: any) {
    this.logger.error(msg);
  }
  debug(msg: any) {
    this.logger.debug?.(msg);
  }
}
