#!/usr/bin/env bash
# Fail the build if a Prisma model from schema.prisma is neither in
# `TENANT_MODELS` (the auto-scoping set in
# src/tenant/tenant-prisma-extension.ts) nor in the explicit non-tenant
# allowlist below.
#
# Why: when someone adds a new business model and forgets to add it to
# TENANT_MODELS, the Prisma tenant extension silently leaves queries
# unscoped — every tenant sees every row. This check is the build-time
# guard against that class of mistake. See ARCHITECTURE_UPGRADE.md §5.4.
#
# If you are intentionally adding a NON-tenant model (auth-related,
# global config, cross-tenant admin), add its name to
# NON_TENANT_MODELS below AND explain why in code review.
set -eu

cd "$(dirname "$0")/.."

# Models that legitimately do NOT live inside a tenant. Every entry
# here is a deliberate decision:
#  - User:        auth subject; nullable companyId for SUPER_ADMIN.
#  - Role / Permission: global permission system shared across tenants.
#  - Company:     the tenant root itself; CRUD'd by SUPER_ADMIN.
#  - AuditLog:    cross-tenant by design so SUPER_ADMINs can audit.
NON_TENANT_MODELS=(
  "User"
  "Role"
  "Permission"
  "Company"
  "AuditLog"
)

# Extract every model name from the schema.
mapfile -t schema_models < <(
  grep -oE '^model [A-Z][a-zA-Z]+' prisma/schema.prisma | awk '{print $2}' | sort -u
)

# Extract TENANT_MODELS contents from the extension file. We look at
# the literal between `const TENANT_MODELS = new Set([` and the
# closing `]);`.
mapfile -t tenant_models < <(
  awk '
    /^const TENANT_MODELS = new Set\(\[/ { capture=1; next }
    capture && /^\]\);/                  { exit }
    capture                              { print }
  ' src/tenant/tenant-prisma-extension.ts \
  | grep -oE '"[A-Z][a-zA-Z]+"' \
  | tr -d '"' \
  | sort -u
)

# Build the union of classified models (tenant + non-tenant).
classified=$(
  {
    printf '%s\n' "${tenant_models[@]}"
    printf '%s\n' "${NON_TENANT_MODELS[@]}"
  } | sort -u
)

# Find schema models that are NOT classified.
unclassified=()
for m in "${schema_models[@]}"; do
  if ! grep -qx "$m" <<< "$classified"; then
    unclassified+=("$m")
  fi
done

# Find tenant_models entries that no longer exist in the schema (stale).
stale_tenant=()
for m in "${tenant_models[@]}"; do
  if ! printf '%s\n' "${schema_models[@]}" | grep -qx "$m"; then
    stale_tenant+=("$m")
  fi
done

# Find non-tenant allowlist entries that no longer exist in the schema.
stale_non_tenant=()
for m in "${NON_TENANT_MODELS[@]}"; do
  if ! printf '%s\n' "${schema_models[@]}" | grep -qx "$m"; then
    stale_non_tenant+=("$m")
  fi
done

failed=0

if [ "${#unclassified[@]}" -gt 0 ]; then
  echo "ERROR: unclassified Prisma model(s) in schema.prisma:"
  for m in "${unclassified[@]}"; do
    echo "  - $m"
  done
  echo ""
  echo "Add the model to:"
  echo "  - TENANT_MODELS in src/tenant/tenant-prisma-extension.ts (per-tenant data)"
  echo "  - OR NON_TENANT_MODELS in scripts/check-tenant-models.sh (global / cross-tenant)"
  failed=1
fi

if [ "${#stale_tenant[@]}" -gt 0 ]; then
  echo "ERROR: TENANT_MODELS references model(s) not in the schema:"
  for m in "${stale_tenant[@]}"; do
    echo "  - $m"
  done
  failed=1
fi

if [ "${#stale_non_tenant[@]}" -gt 0 ]; then
  echo "ERROR: NON_TENANT_MODELS allowlist references model(s) not in the schema:"
  for m in "${stale_non_tenant[@]}"; do
    echo "  - $m"
  done
  failed=1
fi

if [ "$failed" -eq 1 ]; then
  exit 1
fi

echo "OK: all ${#schema_models[@]} schema models classified (${#tenant_models[@]} tenant, ${#NON_TENANT_MODELS[@]} non-tenant)."
