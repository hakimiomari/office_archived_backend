#!/usr/bin/env bash
# Fail the build if Prisma raw SQL APIs are used outside src/tenant/.
#
# All raw queries must go through TenantQueryService so they are guaranteed
# to include a tenant filter (Prisma's tenant extension does NOT run on
# $queryRaw / $executeRaw). See ARCHITECTURE_UPGRADE.md §1.3.
set -eu

# Run from the script's parent directory so paths print relative to the
# backend root.
cd "$(dirname "$0")/.."

# Allowed locations:
#   src/tenant/*           – the only place raw SQL is permitted
#   src/prisma/prisma.service.ts – uses $queryRaw / $executeRaw only in JSDoc
ALLOW_RE='^(src/tenant/|src/prisma/prisma\.service\.ts)'

matches=$(
  grep -rEn '\$queryRaw|\$executeRaw|\$queryRawUnsafe|\$executeRawUnsafe' \
    --include='*.ts' src/ \
  | grep -vE "$ALLOW_RE" \
  || true
)

if [ -n "$matches" ]; then
  echo "ERROR: raw SQL is only allowed inside src/tenant/ (use TenantQueryService)."
  echo "Offending lines:"
  echo "$matches"
  exit 1
fi

echo "OK: no raw SQL outside src/tenant/"
