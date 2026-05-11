#!/usr/bin/env bash
# Fail the build if `new PrismaClient(` appears anywhere outside the
# seed entrypoints. All other code paths must use the singleton
# `PrismaService` so the tenant-scoping extension applies. A fresh
# `new PrismaClient()` is the only way to genuinely bypass the
# extension — and bypassing it means cross-tenant leaks. See
# ARCHITECTURE_UPGRADE.md §5.4.
#
# Allowed locations:
#   - prisma/seed.ts          (seed entrypoint, runs once, no req.user)
#   - prisma/seed.service.ts  (seed implementation)
#
# If you need a fresh client for a one-off migration or maintenance
# script, put the script under prisma/ and consider whether it's
# really needed — usually you want PrismaService anyway.
set -eu

cd "$(dirname "$0")/.."

ALLOW_RE='^(prisma/seed\.ts|prisma/seed\.service\.ts)'

matches=$(
  grep -rnE 'new PrismaClient\b' \
    --include='*.ts' src/ prisma/ \
  | grep -vE "$ALLOW_RE" \
  || true
)

if [ -n "$matches" ]; then
  echo "ERROR: 'new PrismaClient' is only allowed in prisma/seed.ts or"
  echo "       prisma/seed.service.ts. Everywhere else, inject PrismaService"
  echo "       so the tenant-scoping extension applies."
  echo "Offending lines:"
  echo "$matches"
  exit 1
fi

echo "OK: no stray PrismaClient instantiations."
