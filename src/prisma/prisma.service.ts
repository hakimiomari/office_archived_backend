import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { tenantExtension } from '../tenant/tenant-prisma-extension';

/**
 * PrismaService applies a tenant-scoping client extension. Every read/write
 * against tenant models (Item, Warehouse, Sale, …) is automatically scoped
 * to the current request's companyId via AsyncLocalStorage — services don't
 * need to add `where: { companyId }` themselves.
 *
 * Implementation: model accessors AND `$transaction` are forwarded to the
 * extended client so the `tx` callback receives an extended TransactionClient
 * (otherwise queries inside transactions bypass the tenant filter — which is
 * what most of our services do, so this matters a lot).
 *
 * `$queryRaw` / `$executeRaw` bypass extensions by design — those queries
 * still need to inject the companyId filter manually. See `tenantSqlFilter`
 * usage in the report services.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private extended: ReturnType<typeof this.$extends>;

  constructor() {
    super();
    this.extended = this.$extends(tenantExtension());
    // Forward EVERY property access to the extended client. The only
    // exceptions are the wrapper class's own lifecycle hooks and the
    // `extended` storage field. This means every Prisma method —
    // `$transaction`, `$queryRaw`, `$connect`, `item`, etc. — routes
    // through the extended client, so the tenant extension applies
    // consistently inside transactions as well.
    return new Proxy(this, {
      get: (target: any, prop: string | symbol, receiver: any) => {
        if (
          prop === 'onModuleInit' ||
          prop === 'onModuleDestroy' ||
          prop === 'extended' ||
          prop === 'constructor' ||
          typeof prop === 'symbol'
        ) {
          return Reflect.get(target, prop, receiver);
        }
        const ext = (target.extended as any)[prop];
        if (ext === undefined) return Reflect.get(target, prop, receiver);
        // Bind methods so `this` inside them refers to the extended client.
        return typeof ext === 'function' ? ext.bind(target.extended) : ext;
      },
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
