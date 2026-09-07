-- A repeated Production monitor condition is a new incident after the prior alert has resolved.
-- Reset per-incident timing, counters and notification state on reopen so separate outages are not
-- stitched into one multi-day incident and each recovery remains independently notifiable.

create or replace function public.record_production_monitor_alert(
  p_alert_key text,
  p_priority text,
  p_category text,
  p_route text,
  p_stage text,
  p_error_category text,
  p_deployment_sha text,
  p_safe_reference text,
  p_detail jsonb,
  p_now timestamptz default now()
) returns public.phase14_operational_alerts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alert public.phase14_operational_alerts;
begin
  if coalesce(p_alert_key, '') !~ '^[A-Za-z0-9._:-]{1,160}$' then raise exception 'production_monitor_alert_key_invalid'; end if;
  if p_priority not in ('P1','P2','P3') then raise exception 'production_monitor_alert_priority_invalid'; end if;
  if coalesce(p_category, '') !~ '^[A-Za-z0-9._:-]{1,100}$' then raise exception 'production_monitor_alert_category_invalid'; end if;
  if p_route is not null and length(p_route) > 200 then raise exception 'production_monitor_alert_route_invalid'; end if;
  if p_stage is not null and length(p_stage) > 100 then raise exception 'production_monitor_alert_stage_invalid'; end if;
  if p_error_category is not null and length(p_error_category) > 120 then raise exception 'production_monitor_alert_error_category_invalid'; end if;
  if p_deployment_sha is not null and p_deployment_sha !~ '^[0-9a-f]{40}$' then raise exception 'production_monitor_alert_sha_invalid'; end if;
  if p_safe_reference is not null and p_safe_reference !~ '^[A-Za-z0-9._:-]{1,120}$' then raise exception 'production_monitor_alert_reference_invalid'; end if;
  if jsonb_typeof(coalesce(p_detail, '{}'::jsonb)) <> 'object' then raise exception 'production_monitor_alert_detail_invalid'; end if;

  insert into public.phase14_operational_alerts(
    alert_key, severity, category, detail_json, status,
    monitoring_priority, source, route, stage, error_category, deployment_sha,
    safe_reference, first_detected_at, last_seen_at, occurrence_count
  ) values (
    p_alert_key,
    case when p_priority = 'P1' then 'critical' else 'warning' end,
    p_category,
    coalesce(p_detail, '{}'::jsonb),
    'open',
    p_priority,
    'production_monitor',
    nullif(p_route, ''),
    nullif(p_stage, ''),
    nullif(p_error_category, ''),
    nullif(p_deployment_sha, ''),
    nullif(p_safe_reference, ''),
    coalesce(p_now, now()),
    coalesce(p_now, now()),
    1
  )
  on conflict (alert_key) do update set
    severity = excluded.severity,
    category = excluded.category,
    detail_json = excluded.detail_json,
    status = 'open',
    resolved_at = null,
    monitoring_priority = excluded.monitoring_priority,
    source = 'production_monitor',
    route = excluded.route,
    stage = excluded.stage,
    error_category = excluded.error_category,
    deployment_sha = excluded.deployment_sha,
    safe_reference = excluded.safe_reference,
    first_detected_at = case
      when public.phase14_operational_alerts.status = 'resolved' then coalesce(p_now, now())
      else public.phase14_operational_alerts.first_detected_at
    end,
    last_seen_at = coalesce(p_now, now()),
    occurrence_count = case
      when public.phase14_operational_alerts.status = 'resolved' then 1
      else public.phase14_operational_alerts.occurrence_count + 1
    end,
    reminder_count = case
      when public.phase14_operational_alerts.status = 'resolved' then 0
      else public.phase14_operational_alerts.reminder_count
    end,
    last_notified_at = case
      when public.phase14_operational_alerts.status = 'resolved' then null
      else public.phase14_operational_alerts.last_notified_at
    end,
    last_recovery_notified_at = case
      when public.phase14_operational_alerts.status = 'resolved' then null
      else public.phase14_operational_alerts.last_recovery_notified_at
    end,
    cooldown_until = case
      when public.phase14_operational_alerts.status = 'resolved' then null
      else public.phase14_operational_alerts.cooldown_until
    end,
    acknowledged_at = case
      when public.phase14_operational_alerts.status = 'resolved' then null
      else public.phase14_operational_alerts.acknowledged_at
    end,
    acknowledged_by = case
      when public.phase14_operational_alerts.status = 'resolved' then null
      else public.phase14_operational_alerts.acknowledged_by
    end,
    resolved_by = case
      when public.phase14_operational_alerts.status = 'resolved' then null
      else public.phase14_operational_alerts.resolved_by
    end,
    last_status_changed_at = case
      when public.phase14_operational_alerts.status = 'resolved' then coalesce(p_now, now())
      else public.phase14_operational_alerts.last_status_changed_at
    end;

  select * into v_alert from public.phase14_operational_alerts where alert_key = p_alert_key;
  return v_alert;
end;
$$;

revoke all on function public.record_production_monitor_alert(text,text,text,text,text,text,text,text,jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.record_production_monitor_alert(text,text,text,text,text,text,text,text,jsonb,timestamptz) to service_role;

comment on function public.record_production_monitor_alert(text,text,text,text,text,text,text,text,jsonb,timestamptz) is
  'Records one Production monitor incident observation. Reopening a resolved alert starts a fresh incident lifecycle, resetting per-incident timestamps, counters and notification state.';
