-- Production monitor scheduler, deliberately separate from the additive observability schema.
-- Apply only after the monitoring code has been promoted and its exact Production deployment has
-- been rebound to adaptive customer_start. It reuses the existing Supabase pg_cron/pg_net
-- capability and the already-provisioned internal scheduler secret; it creates no new project.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net')
     and not exists (select 1 from cron.job where jobname = 'production-incident-monitor') then
    perform cron.schedule(
      'production-incident-monitor',
      '*/15 * * * *',
      $job$
select net.http_get(
  url := 'https://www.mkfraud.co.za/score/api/internal/production-monitor?daily=0',
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
$job$
    );
  end if;
end $$
