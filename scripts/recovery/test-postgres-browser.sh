#!/usr/bin/env bash
set -euo pipefail

# Uses an existing local PostgreSQL installation; never connects to a cloud database.
if ! command -v initdb >/dev/null && [[ -x /opt/homebrew/opt/postgresql@17/bin/initdb ]]; then
  export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
fi
for binary in initdb pg_ctl psql createdb; do command -v "$binary" >/dev/null || { echo "Local PostgreSQL binary required: $binary" >&2; exit 1; }; done

# Disposable replay only. This script never targets a Supabase project.
release_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
replay_root="$(mktemp -d -t mk-essential-retry-pg.XXXXXX)"
data_dir="${replay_root}/data"
log_file="${replay_root}/postgres.log"
replay_port="$(node --input-type=module -e 'import net from "node:net";const s=net.createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close();});')"
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


printf "LOCAL_POSTGRES_READY port=%s database=%s\n" "$replay_port" "$database_name"

cd "${release_root}"
MK_RETRY_POSTGRES_PORT="${replay_port}" node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/recovery/retry-browser-tests.mjs --postgres
