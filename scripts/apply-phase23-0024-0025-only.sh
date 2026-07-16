#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
payment_migration="$repo_root/supabase/migrations/0024_phase23_payment_automation.sql"
resume_migration="$repo_root/supabase/migrations/0025_phase23_assessment_resume.sql"
controller="$repo_root/scripts/phase23-0024-0025-only-controller.sql"
checksum_file="$repo_root/scripts/phase23-0024-0025.sha256"

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${PHASE23_ACTION:?PHASE23_ACTION must be verify or apply}"
: "${PHASE23_TARGET_LABEL:?PHASE23_TARGET_LABEL is required}"
: "${PHASE23_EXPECTED_TARGET_FINGERPRINT:?PHASE23_EXPECTED_TARGET_FINGERPRINT is required}"
case "$PHASE23_ACTION" in verify|apply) ;; *) echo 'PHASE23_ACTION must be verify or apply.' >&2; exit 2 ;; esac

actual_target="$(psql "$DATABASE_URL" -XAtq --set=ON_ERROR_STOP=1 --command="select current_database()||'|'||current_user||'|'||coalesce(inet_server_addr()::text,'local')||'|'||coalesce(inet_server_port()::text,'local')")"
if [[ "$actual_target" != "$PHASE23_EXPECTED_TARGET_FINGERPRINT" ]]; then echo 'Target fingerprint mismatch; no migration SQL was executed.' >&2; exit 3; fi

psql "$DATABASE_URL" -X --set=ON_ERROR_STOP=1 --single-transaction --set=phase23_readiness_only=1 --file="$controller"
if [[ "$PHASE23_ACTION" == verify ]]; then echo "Phase 2-3 migration readiness verified for $PHASE23_TARGET_LABEL; no changes were made."; exit 0; fi

: "${PHASE23_CONFIRM:?PHASE23_CONFIRM is required for apply}"
expected_confirmation="APPLY-0024-0025-ONLY:${PHASE23_TARGET_LABEL}:${actual_target}"
if [[ "$PHASE23_CONFIRM" != "$expected_confirmation" ]]; then echo 'Exact target confirmation mismatch; no migration SQL was executed.' >&2; exit 4; fi

hash_command=(shasum -a 256)
if command -v sha256sum >/dev/null 2>&1; then hash_command=(sha256sum); fi
payment_hash="$(${hash_command[@]} "$payment_migration" | awk '{print $1}')"
resume_hash="$(${hash_command[@]} "$resume_migration" | awk '{print $1}')"
expected_payment_hash="$(awk '$2 ~ /0024_/ {print $1}' "$checksum_file")"
expected_resume_hash="$(awk '$2 ~ /0025_/ {print $1}' "$checksum_file")"
if [[ "$payment_hash" != "$expected_payment_hash" || "$resume_hash" != "$expected_resume_hash" ]]; then echo 'Migration checksum mismatch; reviewed SQL was not executed.' >&2; exit 5; fi

controlled_failure="${PHASE23_CONTROLLED_FAILURE:-0}"
if [[ "$controlled_failure" != 0 && "$PHASE23_TARGET_LABEL" != disposable-test ]]; then echo 'Controlled failure is restricted to disposable-test.' >&2; exit 6; fi

psql "$DATABASE_URL" -X --set=ON_ERROR_STOP=1 --single-transaction \
  --set=phase23_readiness_only=0 --set=phase23_controlled_failure="$controlled_failure" \
  --set=phase23_payment_sha256="$payment_hash" --set=phase23_resume_sha256="$resume_hash" \
  --file="$controller"
echo "Exact Phase 2-3 migrations 0024 and 0025 committed for $PHASE23_TARGET_LABEL."
