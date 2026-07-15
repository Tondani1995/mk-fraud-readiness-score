#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
migration="$repo_root/supabase/migrations/0023_phase1_manual_fulfilment_recovery.sql"
controller="$repo_root/scripts/phase1-0023-only-controller.sql"
checksum_file="$repo_root/scripts/phase1-0023.sha256"

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${PHASE1_ACTION:?PHASE1_ACTION must be verify or apply}"
: "${PHASE1_TARGET_LABEL:?PHASE1_TARGET_LABEL is required}"
: "${PHASE1_EXPECTED_TARGET_FINGERPRINT:?PHASE1_EXPECTED_TARGET_FINGERPRINT is required}"

case "$PHASE1_ACTION" in verify|apply) ;; *) echo 'PHASE1_ACTION must be verify or apply.' >&2; exit 2 ;; esac

actual_target="$(psql "$DATABASE_URL" -XAtq --set=ON_ERROR_STOP=1 --command="select current_database()||'|'||current_user||'|'||coalesce(inet_server_addr()::text,'local')||'|'||coalesce(inet_server_port()::text,'local')")"
if [[ "$actual_target" != "$PHASE1_EXPECTED_TARGET_FINGERPRINT" ]]; then
  echo 'Target fingerprint mismatch; no migration SQL was executed.' >&2
  exit 3
fi

psql "$DATABASE_URL" -X --set=ON_ERROR_STOP=1 --single-transaction \
  --set=phase1_readiness_only=1 \
  --file="$controller"

if [[ "$PHASE1_ACTION" == verify ]]; then
  echo "Phase 1 0023 readiness verified for $PHASE1_TARGET_LABEL; no changes were made."
  exit 0
fi

: "${PHASE1_CONFIRM:?PHASE1_CONFIRM is required for apply}"
expected_confirmation="APPLY-0023-ONLY:${PHASE1_TARGET_LABEL}:${actual_target}"
if [[ "$PHASE1_CONFIRM" != "$expected_confirmation" ]]; then
  echo 'Exact target confirmation mismatch; no migration SQL was executed.' >&2
  exit 4
fi

if command -v sha256sum >/dev/null 2>&1; then
  actual_hash="$(sha256sum "$migration" | awk '{print $1}')"
else
  actual_hash="$(shasum -a 256 "$migration" | awk '{print $1}')"
fi
expected_hash="$(awk '{print $1}' "$checksum_file")"
if [[ "$actual_hash" != "$expected_hash" ]]; then
  echo 'Migration checksum mismatch; exact reviewed 0023 SQL was not executed.' >&2
  exit 5
fi

controlled_failure="${PHASE1_CONTROLLED_FAILURE:-0}"
if [[ "$controlled_failure" != 0 && "$PHASE1_TARGET_LABEL" != disposable-test ]]; then
  echo 'The controlled rollback test is restricted to disposable-test targets.' >&2
  exit 6
fi

psql "$DATABASE_URL" -X --set=ON_ERROR_STOP=1 --single-transaction \
  --set=phase1_readiness_only=0 \
  --set=phase1_controlled_failure="$controlled_failure" \
  --set=phase1_migration_sha256="$actual_hash" \
  --file="$controller"

echo "Exact Phase 1 migration 0023 committed for $PHASE1_TARGET_LABEL."
