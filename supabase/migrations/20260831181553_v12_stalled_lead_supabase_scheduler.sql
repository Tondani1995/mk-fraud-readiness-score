-- V1.2: Supabase Cron is the sole scheduler for the stalled-lead monitor.
-- The bearer value is resolved from Vault when the job runs; it is never stored in this
-- migration or in cron.job.command.

begin;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

-- The application never schedules jobs or calls pg_net directly. Keep both managed-extension
-- surfaces private to the database scheduling authority; the cron worker itself runs as postgres.
revoke all on schema cron from public, anon, authenticated;
revoke all on schema net from public, anon, authenticated;
do $$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
      from pg_catalog.pg_proc as p
      join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
     where n.nspname in ('cron', 'net')
  loop
    execute pg_catalog.format(
      'revoke all on function %s from public, anon, authenticated',
      v_function
    );
  end loop;
end;
$$;

do $$
declare
  v_job_count integer;
  v_job_id bigint;
  v_command text := $cron_command$
select net.http_get(
  url := 'https://www.mkfraud.co.za/score/api/internal/adaptive-stalled-leads',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'v12_stalled_lead_cron_secret'
      limit 1
    )
  ),
  timeout_milliseconds := 60000
);
$cron_command$;
  v_secret_count integer;
  v_valid_secret_count integer;
begin
  if pg_catalog.to_regclass('vault.decrypted_secrets') is null then
    raise exception 'v12_stalled_lead_scheduler:vault_unavailable';
  end if;

  select count(*)::integer
    into v_secret_count
    from vault.decrypted_secrets
   where name = 'v12_stalled_lead_cron_secret';
  select count(*)::integer
    into v_valid_secret_count
    from vault.decrypted_secrets
   where name = 'v12_stalled_lead_cron_secret'
     and pg_catalog.char_length(decrypted_secret) >= 43;
  if v_secret_count <> 1 or v_valid_secret_count <> 1 then
    raise exception 'v12_stalled_lead_scheduler:cron_secret_missing_or_ambiguous';
  end if;

  select count(*)::integer
    into v_job_count
    from cron.job
   where jobname = 'v12-stalled-lead-monitor';

  if v_job_count > 1 then
    raise exception 'v12_stalled_lead_scheduler:duplicate_job_name';
  elsif v_job_count = 1 then
    if not exists (
      select 1
        from cron.job
       where jobname = 'v12-stalled-lead-monitor'
         and schedule = '0 * * * *'
         and command = v_command
         and active is true
    ) then
      raise exception 'v12_stalled_lead_scheduler:existing_job_contract_mismatch';
    end if;
    return;
  end if;

  select cron.schedule(
    'v12-stalled-lead-monitor',
    '0 * * * *',
    v_command
  ) into v_job_id;

  if not exists (
    select 1
      from cron.job
     where jobid = v_job_id
       and jobname = 'v12-stalled-lead-monitor'
       and schedule = '0 * * * *'
       and command = v_command
       and active is true
  ) then
    raise exception 'v12_stalled_lead_scheduler:job_contract_not_created';
  end if;
end;
$$;

commit;
