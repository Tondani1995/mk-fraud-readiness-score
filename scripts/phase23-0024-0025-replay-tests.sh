#!/usr/bin/env bash
set -Eeuo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
db_url="${LOCAL_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
evidence_dir="${PHASE23_EVIDENCE_DIR:-$repo_root/tmp/phase23-migration-replay}"
mkdir -p "$evidence_dir"
fingerprint(){ psql "$db_url" -XAtq --set=ON_ERROR_STOP=1 --command="select current_database()||'|'||current_user||'|'||coalesce(inet_server_addr()::text,'local')||'|'||coalesce(inet_server_port()::text,'local')"; }
apply_phase1(){ local target; target="$(fingerprint)"; DATABASE_URL="$db_url" PHASE1_ACTION=apply PHASE1_TARGET_LABEL=disposable-test PHASE1_EXPECTED_TARGET_FINGERPRINT="$target" PHASE1_CONFIRM="APPLY-0023-ONLY:disposable-test:${target}" bash "$repo_root/scripts/apply-phase1-0023-only.sh" >/dev/null; }
run_phase23(){ local action="$1" failure="${2:-0}" target; target="$(fingerprint)"; DATABASE_URL="$db_url" PHASE23_ACTION="$action" PHASE23_TARGET_LABEL=disposable-test PHASE23_EXPECTED_TARGET_FINGERPRINT="$target" PHASE23_CONFIRM="APPLY-0024-0025-ONLY:disposable-test:${target}" PHASE23_CONTROLLED_FAILURE="$failure" bash "$repo_root/scripts/apply-phase23-0024-0025-only.sh"; }
reset_0016(){
  supabase db reset --local --yes --version 0016 >/dev/null
  test "$(psql "$db_url" -XAtq -c "select count(*) from supabase_migrations.schema_migrations where version between '0017' and '0025'")" = 0
  test "$(psql "$db_url" -XAtq -c "select to_regclass('public.order_events') is not null")" = t
}

reset_0016; apply_phase1; run_phase23 verify | tee "$evidence_dir/fresh-readiness.txt"; run_phase23 apply | tee "$evidence_dir/fresh-apply.txt"
psql "$db_url" -XAtq --set=ON_ERROR_STOP=1 <<'SQL' | tee "$evidence_dir/fresh-postconditions.txt"
select (public.payment_automation_capability()->>'available')::boolean;
select (public.assessment_resume_capability()->>'available')::boolean;
select string_agg(version,',' order by version)='0023,0024,0025' from supabase_migrations.schema_migrations where version between '0023' and '0025';
select count(*)=0 from supabase_migrations.schema_migrations where version between '0017' and '0022';
SQL
if run_phase23 apply >"$evidence_dir/duplicate.txt" 2>&1; then echo 'Duplicate apply unexpectedly succeeded.' >&2; exit 1; fi

reset_0016
psql "$db_url" -X --set=ON_ERROR_STOP=1 --file="$repo_root/scripts/phase1-production-history-reproduction.sql" >/dev/null
apply_phase1
before="$(psql "$db_url" -XAtq -c "select md5(string_agg(version||':'||name,'|' order by version,name)) from supabase_migrations.schema_migrations")"
run_phase23 apply | tee "$evidence_dir/history-apply.txt"
after="$(psql "$db_url" -XAtq -c "select md5(string_agg(version||':'||name,'|' order by version,name)) from supabase_migrations.schema_migrations where version not in ('0024','0025')")"
test "$before" = "$after"

reset_0016; apply_phase1
psql "$db_url" -X --set=ON_ERROR_STOP=1 -c "insert into supabase_migrations.schema_migrations(version,name,statements) values('0018','prohibited_phase14_test',array['test'])" >/dev/null
if run_phase23 verify >"$evidence_dir/prohibited.txt" 2>&1; then echo 'Prohibited history unexpectedly passed.' >&2; exit 1; fi

reset_0016; apply_phase1
if run_phase23 apply 1 >"$evidence_dir/rollback.txt" 2>&1; then echo 'Controlled failure unexpectedly committed.' >&2; exit 1; fi
test "$(psql "$db_url" -XAtq -c "select count(*) from supabase_migrations.schema_migrations where version in ('0024','0025')")" = 0
test "$(psql "$db_url" -XAtq -c "select to_regclass('public.payment_automation_records') is null")" = t
test "$(psql "$db_url" -XAtq -c "select count(*) from information_schema.columns where table_schema='public' and table_name='assessments' and column_name='active_domain_key'")" = 0

reset_0016; apply_phase1
psql "$db_url" -X --set=ON_ERROR_STOP=1 -c "create table public.payment_automation_records(id uuid)" >/dev/null
if run_phase23 verify >"$evidence_dir/partial.txt" 2>&1; then echo 'Partial state unexpectedly passed.' >&2; exit 1; fi
reset_0016; apply_phase1; run_phase23 apply >"$evidence_dir/final-post-schema.txt"
echo 'Phase 2-3 exact migrations fresh/history/duplicate/prohibited/rollback/partial replay passed.'
