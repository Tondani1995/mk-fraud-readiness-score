#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
db_url="${LOCAL_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
evidence_dir="${PHASE1_EVIDENCE_DIR:-$repo_root/tmp/phase1-migration-replay}"
mkdir -p "$evidence_dir"

fingerprint() {
  psql "$db_url" -XAtq --set=ON_ERROR_STOP=1 --command="select current_database()||'|'||current_user||'|'||coalesce(inet_server_addr()::text,'local')||'|'||coalesce(inet_server_port()::text,'local')"
}

run_controller() {
  local action="$1"
  local failure="${2:-0}"
  local target
  target="$(fingerprint)"
  DATABASE_URL="$db_url" \
  PHASE1_ACTION="$action" \
  PHASE1_TARGET_LABEL=disposable-test \
  PHASE1_EXPECTED_TARGET_FINGERPRINT="$target" \
  PHASE1_CONFIRM="APPLY-0023-ONLY:disposable-test:${target}" \
  PHASE1_CONTROLLED_FAILURE="$failure" \
    bash "$repo_root/scripts/apply-phase1-0023-only.sh"
}

reset_0016() {
  supabase db reset --local --yes --version 0016 >/dev/null
  test "$(psql "$db_url" -XAtq -c "select count(*) from supabase_migrations.schema_migrations where version between '0017' and '0023'")" = 0
}

reset_0016
run_controller verify | tee "$evidence_dir/fresh-readiness.txt"
run_controller apply | tee "$evidence_dir/fresh-apply.txt"
psql "$db_url" -XAtq --set=ON_ERROR_STOP=1 <<'SQL' | tee "$evidence_dir/fresh-postconditions.txt"
select (public.phase1_manual_fulfilment_capability()->>'available')::boolean;
select count(*)=1 from supabase_migrations.schema_migrations where version='0023' and name='phase1_manual_fulfilment_recovery';
select count(*)=0 from supabase_migrations.schema_migrations where version between '0017' and '0022';
select to_regclass('public.phase14_security_gates') is null and to_regclass('public.phase14_feature_policies') is null;
SQL
if run_controller apply >"$evidence_dir/duplicate-run.txt" 2>&1; then
  echo 'Duplicate 0023 application unexpectedly succeeded.' >&2
  exit 1
fi
test "$(psql "$db_url" -XAtq -c "select count(*) from supabase_migrations.schema_migrations where version='0023'")" = 1

reset_0016
psql "$db_url" -X --set=ON_ERROR_STOP=1 --file="$repo_root/scripts/phase1-production-history-reproduction.sql" >/dev/null
before_history="$(psql "$db_url" -XAtq -c "select md5(string_agg(version||':'||name,'|' order by version,name)) from supabase_migrations.schema_migrations")"
run_controller apply | tee "$evidence_dir/production-history-apply.txt"
after_history="$(psql "$db_url" -XAtq -c "select md5(string_agg(version||':'||name,'|' order by version,name)) from supabase_migrations.schema_migrations where version<>'0023'")"
test "$before_history" = "$after_history"
test "$(psql "$db_url" -XAtq -c "select value_json->>'nonce' from public.app_settings where setting_key='phase1_history_preservation_fixture'")" = production-compatible

reset_0016
psql "$db_url" -X --set=ON_ERROR_STOP=1 -c "insert into supabase_migrations.schema_migrations(version,name,statements) values('0018','prohibited_phase14_test',array['disposable test'])" >/dev/null
if run_controller verify >"$evidence_dir/prohibited-state.txt" 2>&1; then
  echo 'Prohibited migration state unexpectedly passed readiness.' >&2
  exit 1
fi
test "$(psql "$db_url" -XAtq -c "select to_regclass('public.manual_report_generation_attempts') is null")" = t

reset_0016
if run_controller apply 1 >"$evidence_dir/controlled-failure.txt" 2>&1; then
  echo 'Controlled transactional failure unexpectedly committed.' >&2
  exit 1
fi
psql "$db_url" -XAtq --set=ON_ERROR_STOP=1 <<'SQL' | tee "$evidence_dir/rollback-postconditions.txt"
select count(*)=0 from supabase_migrations.schema_migrations where version='0023';
select to_regclass('public.manual_report_generation_attempts') is null;
select to_regclass('public.manual_report_delivery_attempts') is null;
select to_regprocedure('public.phase1_manual_fulfilment_capability()') is null;
select count(*)=0 from information_schema.columns where table_schema='public' and table_name='reports' and column_name='storage_status';
select count(*)=0 from public.app_settings where setting_key='v2_phase1_manual_fulfilment';
SQL

reset_0016
run_controller apply | tee "$evidence_dir/final-post-schema.txt"
echo 'Phase 1 exact 0023 replay, history, duplicate, prohibited-state and rollback scenarios passed.'
