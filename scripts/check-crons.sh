#!/usr/bin/env bash
# Fail the build if any file containing a `@Cron(` / `@Interval(` /
# `@Timeout(` decorator doesn't also call `tenants.forEachCompany(` (or
# `tenants.runForCompany(`) inside that file.
#
# Why: scheduled methods run outside an HTTP request, so they have no
# `req.user` and no AsyncLocalStorage tenant context. Bare Prisma calls
# would then return data from EVERY tenant in one execution. Every cron
# must fan out per-tenant via TenantService. See ARCHITECTURE_UPGRADE.md
# §1.1 / §3.4.
#
# A cron can opt out (for genuinely cross-tenant maintenance work) by
# including the magic comment `// cron:cross-tenant-ok` somewhere in the
# same file. Reviewers should flag any new occurrence of that opt-out.
set -eu

cd "$(dirname "$0")/.."

# Find every file under src/ that declares a scheduled method.
mapfile -t cron_files < <(
  grep -rlE '@Cron\(|@Interval\(|@Timeout\(' --include='*.ts' src/ || true
)

if [ "${#cron_files[@]}" -eq 0 ]; then
  echo "OK: no @Cron methods found."
  exit 0
fi

offenders=()
for f in "${cron_files[@]}"; do
  # Opt-out marker (rare, requires reviewer attention).
  if grep -q 'cron:cross-tenant-ok' "$f"; then
    continue
  fi
  if ! grep -qE 'forEachCompany\(|runForCompany\(' "$f"; then
    offenders+=("$f")
  fi
done

if [ "${#offenders[@]}" -gt 0 ]; then
  echo "ERROR: @Cron / @Interval / @Timeout methods must fan out per-tenant via"
  echo "       TenantService.forEachCompany(...) or .runForCompany(...)."
  echo "Offending files:"
  for f in "${offenders[@]}"; do
    echo "  - $f"
    grep -nE '@Cron\(|@Interval\(|@Timeout\(' "$f" | sed 's/^/      /'
  done
  echo ""
  echo "If a job genuinely needs cross-tenant access, add the comment"
  echo "'// cron:cross-tenant-ok' to the file and explain why in code review."
  exit 1
fi

echo "OK: every cron file fans out via TenantService."
