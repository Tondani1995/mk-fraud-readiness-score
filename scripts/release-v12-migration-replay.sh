#!/usr/bin/env bash
set -euo pipefail

# Disposable replay only. This script never targets a Supabase project.
release_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
replay_root="$(mktemp -d -t mk-v12-migration-replay.XXXXXX)"
data_dir="${replay_root}/data"
log_file="${replay_root}/postgres.log"
replay_port="$((56000 + ($$ % 1000)))"
database_name="mk_v12_replay"

cleanup() {
  pg_ctl -D "${data_dir}" -m fast -w stop >/dev/null 2>&1 || true
  rm -rf -- "${replay_root}"
}
trap cleanup EXIT INT TERM

initdb -D "${data_dir}" -U postgres --auth=trust >/dev/null
pg_ctl -D "${data_dir}" -o "-p ${replay_port}" -l "${log_file}" -w start >/dev/null
createdb -h 127.0.0.1 -p "${replay_port}" -U postgres "${database_name}"

psql_args=(-X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "${replay_port}" -U postgres -d "${database_name}")

psql "${psql_args[@]}" <<'SQL'
create schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema public;
create schema auth;
create schema storage;
create schema vault;
create schema supabase_migrations;
create or replace function auth.jwt() returns jsonb
language sql stable
as $function$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb
$function$;
create or replace function auth.uid() returns uuid
language sql stable
as $function$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$function$;
create or replace function auth.role() returns text
language sql stable
as $function$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), current_user::text)
$function$;
create table auth.users (
  id uuid primary key default extensions.gen_random_uuid(),
  email text
);
create table auth.sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  not_after timestamptz
);
create table vault.decrypted_secrets (
  id uuid primary key default extensions.gen_random_uuid(),
  name text,
  description text,
  decrypted_secret text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create schema cron;
create schema net;
create table cron.job (
  jobid bigint generated always as identity primary key,
  jobname text not null unique,
  schedule text not null,
  command text not null,
  active boolean not null default true
);
create or replace function cron.schedule(p_job_name text, p_schedule text, p_command text)
returns bigint
language plpgsql
as $function$
declare
  v_job_id bigint;
begin
  insert into cron.job(jobname, schedule, command)
  values (p_job_name, p_schedule, p_command)
  returning jobid into v_job_id;
  return v_job_id;
end;
$function$;
create or replace function net.http_get(
  url text,
  params jsonb default null,
  headers jsonb default null,
  timeout_milliseconds integer default 1000
) returns bigint
language sql
as $function$ select 1::bigint $function$;
insert into vault.decrypted_secrets(name, decrypted_secret)
values ('v12_stalled_lead_cron_secret', 'scheduler-test-secret-never-in-command-256-bit');
create or replace function vault.create_secret(text, text, text, uuid)
returns uuid
language plpgsql
security definer
set search_path = vault, public, extensions
as $function$
declare
  secret_id uuid;
begin
  insert into vault.decrypted_secrets(name, description, decrypted_secret)
  values ($2, $3, $1)
  returning id into secret_id;
  return secret_id;
end;
$function$;
create table storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  owner_id text,
  public boolean not null default false,
  avif_autodetection boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table storage.objects (
  id uuid primary key default extensions.gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  owner_id text,
  metadata jsonb,
  user_metadata jsonb,
  path_tokens text[],
  version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_accessed_at timestamptz
);
alter table storage.objects enable row level security;
do $function$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    create role supabase_admin nologin superuser;
  end if;
end
$function$;
grant anon, authenticated, service_role to postgres;
alter database mk_v12_replay set search_path = public, extensions;
create schema replay;
create table replay.replay_log (
  ordinal integer primary key,
  version text not null unique,
  name text not null,
  applied_at timestamptz not null default clock_timestamp()
);
SQL

migration_files=("${release_root}"/supabase/migrations/*.sql)
canonical_reconstructed_migration_count=121
forward_migration_count=13
expected_migrations="$((canonical_reconstructed_migration_count + forward_migration_count))"
expected_last_file="${migration_files[$((expected_migrations - 1))]##*/}"
expected_last_version="${expected_last_file%%_*}"
if [[ "${#migration_files[@]}" != "${expected_migrations}" ]]; then
  printf 'FAIL: expected exactly %s migration files (%s reconstructed plus %s forward), got %s\n' \
    "${expected_migrations}" "${canonical_reconstructed_migration_count}" "${forward_migration_count}" "${#migration_files[@]}" >&2
  exit 1
fi

ordinal=0
for migration_file in "${migration_files[@]}"; do
  migration_name="${migration_file##*/}"
  migration_version="${migration_name%%_*}"
  migration_label="${migration_name#*_}"
  migration_label="${migration_label%.sql}"
  ordinal="$((ordinal + 1))"
  printf 'replay %03d %s\n' "${ordinal}" "${migration_name}"
  if [[ "${migration_name}" == "20260831181553_v12_stalled_lead_supabase_scheduler.sql" ]]; then
    # Embedded/local Postgres does not include Supabase-managed pg_cron or pg_net. The production
    # migration installs them; this disposable replay replaces only those two install statements
    # and exercises the stored scheduler command against the local cron/net stubs.
    psql "${psql_args[@]}" \
      --file=<(sed \
        -e '/^[[:space:]]*create extension if not exists pg_cron with schema pg_catalog;[[:space:]]*$/d' \
        -e '/^[[:space:]]*create extension if not exists pg_net;[[:space:]]*$/d' \
        "${migration_file}") >/dev/null
  else
    psql "${psql_args[@]}" --file="${migration_file}" >/dev/null
  fi

  # The historical V1.2 activation migration registers the candidate through a controlled RPC
  # rather than inserting its data as migration SQL. Reproduce that accepted activation seam in
  # the disposable replay so the new correction migration is proven against the actual historical
  # 0-based response-scale rows before it runs. This never targets canonical Staging.
  if [[ "${migration_version}" == "20260821090000" ]]; then
    v12_graph_json="$(<"${release_root}/docs/adaptive-assessment/adaptive-graph-v1-2-candidate.json")"
    psql "${psql_args[@]}" \
      --command="select public.publish_adaptive_graph_version('MFRS-V1.1-ADAPTIVE-DRAFT-20260804');" \
      >/dev/null
    psql "${psql_args[@]}" \
      --command="select public.register_adaptive_staging_candidate(\$v12_graph_json\$${v12_graph_json}\$v12_graph_json\$::jsonb);" \
      >/dev/null
    initial_v12_scale="$(psql "${psql_args[@]}" -At --command="
      select string_agg(display_order::text, ',' order by response_value)
      from public.response_scale
      where methodology_version_id = (
        select methodology_version_id
        from public.adaptive_graph_versions
        where graph_version = 'MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821'
      )")"
    if [[ "${initial_v12_scale}" != "0,1,2,3,4,5" ]]; then
      printf 'FAIL: historical V1.2 activation did not create the expected 0-based response-scale rows; got %s\n' \
        "${initial_v12_scale}" >&2
      exit 1
    fi
    printf 'PASS: historical V1.2 activation created the expected 0-based response-scale rows.\n'
  fi
  psql "${psql_args[@]}" \
    --command="insert into replay.replay_log(ordinal, version, name) values (${ordinal}, '${migration_version}', '${migration_label}')" \
    >/dev/null
done

scheduler_job_contract="$(psql "${psql_args[@]}" -At --command="
  select count(*)::text || '|' || coalesce(string_agg(schedule, ',' order by jobid), '') || '|' ||
         coalesce(string_agg(case when command like '%v12_stalled_lead_cron_secret%' and command like '%decrypted_secret%' and command not like '%scheduler-test-secret-never-in-command-256-bit%' then 'vault' else 'invalid' end, ',' order by jobid), '')
  from cron.job
  where jobname = 'v12-stalled-lead-monitor'")"
if [[ "${scheduler_job_contract}" != "1|0 * * * *|vault" ]]; then
  printf 'FAIL: stalled-lead Supabase scheduler contract is not exactly one hourly Vault-backed job; got %s\n' \
    "${scheduler_job_contract}" >&2
  exit 1
fi
printf 'PASS: exactly one hourly stalled-lead scheduler uses a runtime Vault lookup with no plaintext secret.\n'

final_v12_scale_rows="$(psql "${psql_args[@]}" -At --command="
  select coalesce(
    json_agg(
      json_build_object(
        'response_value', rs.response_value,
        'label', rs.label,
        'operational_meaning', rs.operational_meaning,
        'normalised_score', rs.normalised_score,
        'display_order', rs.display_order
      ) order by rs.response_value
    ),
    '[]'::json
  )
  from public.response_scale rs
  where rs.methodology_version_id = (
    select ag.methodology_version_id
    from public.adaptive_graph_versions ag
    where ag.graph_version = 'MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821'
  )")"
node --experimental-strip-types \
  --experimental-loader="${release_root}/scripts/lib/ts-relative-resolve-loader.mjs" \
  --input-type=module \
  --eval="
    import { validateOfficialResponseLabels } from '${release_root}/src/lib/reports/response-labels.ts';
    validateOfficialResponseLabels(JSON.parse(process.argv[1]));
    console.log('PASS: final replayed V1.2 response scale passes validateOfficialResponseLabels().');
  " \
  "${final_v12_scale_rows}"

expected_tables=(
  admin_profiles organisations respondents assessments assessment_tokens assessment_answers
  assessment_navigation_states assessment_answer_history adaptive_graph_versions
  adaptive_activation_policies adaptive_gateway_answers adaptive_control_responses score_runs
  score_domain_results score_question_traces reports report_templates report_content_blocks
  report_fulfilments manual_report_generation_attempts report_artifacts phase14_operational_alerts
  email_events
)

for table_name in "${expected_tables[@]}"; do
  exists="$(psql "${psql_args[@]}" -At --command="select (to_regclass('public.${table_name}') is not null)::int")"
  if [[ "${exists}" != "1" ]]; then
    printf 'FAIL: expected public.%s after replay\n' "${table_name}" >&2
    exit 1
  fi
done

printf '\nADAPTIVE_BINDING_DB_TESTS_BEGIN\n'
psql "${psql_args[@]}" <<'SQL'
do $$
declare
  v_policy public.adaptive_activation_policies%rowtype;
  v_result jsonb;
begin
  select * into v_policy
  from public.adaptive_activation_policies
  where policy_key = 'customer_start';
  if v_policy.environment <> 'preview'
     or v_policy.supabase_project <> 'iszihmmbgsfefawqmnwo'
     or v_policy.enabled is not false then
    raise exception 'rc2_replay_preview_policy_not_disabled_or_canonical';
  end if;

  select public.set_adaptive_activation(
    'preview', 'iszihmmbgsfefawqmnwo', true, repeat('a', 40), 'RC2 replay Preview binding test'
  ) into v_result;
  if (v_result->>'enabled')::boolean is not true
     or v_result->>'environment' <> 'preview'
     or v_result->>'supabase_project' <> 'iszihmmbgsfefawqmnwo'
     or v_result->>'activation_sha' <> repeat('a', 40) then
    raise exception 'rc2_replay_preview_activation_result_invalid';
  end if;
  select public.set_adaptive_activation(
    'preview', 'iszihmmbgsfefawqmnwo', false, repeat('a', 40), 'RC2 replay Preview disable test'
  ) into v_result;

  select public.set_adaptive_activation(
    'production', 'iszihmmbgsfefawqmnwo', true, repeat('b', 40), 'RC2 replay Production promotion test'
  ) into v_result;
  if (v_result->>'enabled')::boolean is not true
     or v_result->>'environment' <> 'production'
     or v_result->>'supabase_project' <> 'iszihmmbgsfefawqmnwo'
     or v_result->>'activation_sha' <> repeat('b', 40) then
    raise exception 'rc2_replay_production_activation_result_invalid';
  end if;
  select public.set_adaptive_activation(
    'production', 'iszihmmbgsfefawqmnwo', false, repeat('b', 40), 'RC2 replay Production disable test'
  ) into v_result;

  perform set_config('phase14.authoritative_transition', 'policy_approval', true);
  update public.adaptive_activation_policies
  set environment = 'preview', supabase_project = 'iszihmmbgsfefawqmnwo', enabled = false,
      activation_sha = null, activated_at = null, activated_by = null
  where policy_key = 'customer_start';
end;
$$;
SQL
printf 'PASS: Preview activation and deliberate Production promotion RPC bindings passed.\n'
printf 'PASS: replay policy was restored to disabled Preview identity.\n'
printf 'ADAPTIVE_BINDING_DB_TESTS_END\n'

printf '\nSCHEMA_INVENTORY_BEGIN\n'
psql "${psql_args[@]}" -At --file="${release_root}/scripts/release-v12-schema-inventory.sql"
printf 'SCHEMA_INVENTORY_END\n'
printf 'GRANT_DISTRIBUTION_BEGIN\n'
psql "${psql_args[@]}" -At --command="
  select 'table' as object_kind,
         case when x.grantee=0 then 'PUBLIC' else r.rolname end as grantee,
         x.privilege_type, count(*)::int
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
  left join pg_roles r on r.oid=x.grantee
  where n.nspname in ('public','phase14_private')
    and c.relkind in ('r','p','v','m','f')
    and (x.grantee=0 or r.rolname in ('anon','authenticated','service_role'))
  group by 1,2,3
  union all
  select 'function',
         case when x.grantee=0 then 'PUBLIC' else r.rolname end,
         x.privilege_type, count(*)::int
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
  left join pg_roles r on r.oid=x.grantee
  where n.nspname in ('public','phase14_private')
    and (x.grantee=0 or r.rolname in ('anon','authenticated','service_role'))
  group by 1,2,3
  order by 1,2,3"
printf 'GRANT_DISTRIBUTION_END\n'
printf 'FUNCTION_DEFINITION_ROWS_BEGIN\n'
psql "${psql_args[@]}" -At --command="
  select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         p.prosecdef,
         md5(pg_get_functiondef(p.oid))
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','phase14_private')
    and not exists (
      select 1 from pg_depend d
      where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e'
    )
  order by 1"
printf 'FUNCTION_DEFINITION_ROWS_END\n'

replay_count="$(psql "${psql_args[@]}" -At --command='select count(*) from replay.replay_log')"
distinct_count="$(psql "${psql_args[@]}" -At --command='select count(distinct version) from replay.replay_log')"
last_version="$(psql "${psql_args[@]}" -At --command='select version from replay.replay_log order by ordinal desc limit 1')"
if [[ "${replay_count}" != "${expected_migrations}" || "${distinct_count}" != "${expected_migrations}" ]]; then
  printf 'FAIL: replay log is not exact-once (rows=%s distinct_versions=%s)\n' "${replay_count}" "${distinct_count}" >&2
  exit 1
fi
if [[ "${last_version}" != "${expected_last_version}" ]]; then
  printf 'FAIL: replay did not reach canonical tail; got %s\n' "${last_version}" >&2
  exit 1
fi

printf '\nPASS: %s/%s migrations replayed in deterministic filename order (%s reconstructed plus %s forward).\n' \
  "${replay_count}" "${expected_migrations}" "${canonical_reconstructed_migration_count}" "${forward_migration_count}"
printf 'PASS: exact-once log has %s rows and %s distinct versions.\n' "${replay_count}" "${distinct_count}"
printf 'PASS: assessment/adaptive/graph/score/report/admin structures exist.\n'
printf 'PASS: replay tail is %s.\n' "${last_version}"
