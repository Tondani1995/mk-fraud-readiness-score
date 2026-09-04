-- V1.2 Essential direct admin generation.
--
-- This is a forward-only contract. Historical migrations remain immutable and the accepted
-- order-bound RPCs retain their order semantics. The additive assessment-scoped RPCs below are
-- the only database entry point for the direct, post-assessment Essential path.

begin;

-- Every generation attempt is assessment-bound. Existing order attempts are reconstructed from
-- the authoritative order relationship before the column is made mandatory. order_id remains
-- nullable so an assessment-admin attempt cannot be forced through a synthetic order.
alter table public.manual_report_generation_attempts
  add column if not exists assessment_id uuid references public.assessments(id) on delete cascade;

update public.manual_report_generation_attempts m
set assessment_id = o.assessment_id
from public.orders o
where m.order_id = o.id
  and m.assessment_id is null;

do $$
begin
  if exists (
    select 1
    from public.manual_report_generation_attempts
    where assessment_id is null
  ) then
    raise exception 'v12_generation_attempt_assessment_backfill_incomplete';
  end if;
end;
$$;

alter table public.manual_report_generation_attempts
  alter column order_id drop not null,
  alter column assessment_id set not null;

-- The report record itself is already assessment-bound in the canonical schema. Re-state the
-- nullable legacy order context here so the direct path cannot drift back to synthetic-order
-- eligibility if an older environment had a different column constraint.
alter table public.reports
  alter column assessment_id set not null,
  alter column order_id drop not null;

-- Defence in depth for any future service-role writer: an order-bound attempt must point at the
-- same assessment as its order, while an assessment-only attempt must not acquire an order.
create or replace function public.bind_manual_report_generation_attempt_target()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_order_assessment_id uuid;
begin
  if new.assessment_id is null and new.order_id is not null then
    select assessment_id into v_order_assessment_id
    from public.orders
    where id = new.order_id;
    new.assessment_id := v_order_assessment_id;
  end if;

  if new.assessment_id is null then
    raise exception 'v12_generation_attempt_assessment_required';
  end if;

  if new.order_id is not null then
    select assessment_id into v_order_assessment_id
    from public.orders
    where id = new.order_id;
    if v_order_assessment_id is distinct from new.assessment_id then
      raise exception 'v12_generation_attempt_order_assessment_mismatch';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bind_manual_report_generation_attempt_target
  on public.manual_report_generation_attempts;
create trigger trg_bind_manual_report_generation_attempt_target
before insert or update of order_id, assessment_id
on public.manual_report_generation_attempts
for each row execute function public.bind_manual_report_generation_attempt_target();

alter table public.manual_report_generation_attempts
  drop constraint if exists manual_report_generation_attempts_trigger_source_check;
alter table public.manual_report_generation_attempts
  add constraint manual_report_generation_attempts_trigger_source_check
  check (trigger_source in (
    'admin_generate', 'admin_retry', 'admin_regenerate', 'payment_confirmation',
    'payment_confirmed', 'quality_rejected_regenerate',
    'assessment_admin_generate', 'assessment_admin_retry', 'assessment_admin_regenerate'
  ));
alter table public.manual_report_generation_attempts
  drop constraint if exists manual_report_generation_attempts_assessment_only_source_check;
alter table public.manual_report_generation_attempts
  add constraint manual_report_generation_attempts_assessment_only_source_check
  check (
    trigger_source not in ('assessment_admin_generate','assessment_admin_retry','assessment_admin_regenerate')
    or order_id is null
  );

create index if not exists manual_report_generation_assessment_created_idx
  on public.manual_report_generation_attempts(assessment_id, created_at desc);
create unique index if not exists manual_report_generation_one_active_assessment_uidx
  on public.manual_report_generation_attempts(assessment_id)
  where status in ('REPORT_QUEUED','REPORT_GENERATING');

comment on column public.manual_report_generation_attempts.assessment_id is
  'Authoritative assessment target for every generation attempt; order_id is optional legacy context.';
comment on index public.manual_report_generation_one_active_assessment_uidx is
  'At most one queued or generating report provider claim may exist per assessment.';

-- The direct path is service-role-only. The route performs the authenticated MK role check before
-- calling it, and the RPC repeats service-role enforcement so the database contract cannot be
-- bypassed by a different caller.
create or replace function public.claim_assessment_manual_report_generation(
  p_assessment_reference text,
  p_requested_by uuid,
  p_request_key text,
  p_trigger_source text,
  p_technical_reference text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_assessment public.assessments%rowtype;
  v_score public.score_runs%rowtype;
  v_profile public.admin_profiles%rowtype;
  v_existing public.manual_report_generation_attempts%rowtype;
  v_active public.manual_report_generation_attempts%rowtype;
  v_ready public.reports%rowtype;
  v_attempt public.manual_report_generation_attempts%rowtype;
  v_version integer;
  v_retries integer;
  v_reference text;
  v_expected_prefix text;
  v_expected_file_name text;
  v_expected_storage_path text;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'v12_generation_service_role_required';
  end if;
  if coalesce(trim(p_assessment_reference), '') = ''
     or coalesce(trim(p_request_key), '') = ''
     or coalesce(trim(p_technical_reference), '') = '' then
    raise exception 'v12_generation_request_identity_required';
  end if;
  if p_trigger_source not in (
    'assessment_admin_generate','assessment_admin_retry','assessment_admin_regenerate'
  ) then
    raise exception 'v12_generation_trigger_invalid';
  end if;

  select * into v_profile
  from public.admin_profiles
  where id = p_requested_by and status = 'active';
  if not found or v_profile.role not in ('platform_admin','reviewer','approver') then
    raise exception 'v12_generation_permission_denied';
  end if;
  if p_trigger_source = 'assessment_admin_regenerate'
     and v_profile.role not in ('platform_admin','approver') then
    raise exception 'v12_regeneration_permission_denied';
  end if;

  select * into v_existing
  from public.manual_report_generation_attempts
  where request_key = p_request_key;
  if found then
    return jsonb_build_object('claimed', false, 'reason', 'idempotent_replay', 'attempt', to_jsonb(v_existing));
  end if;

  select * into v_assessment
  from public.assessments
  where assessment_reference = p_assessment_reference
  for update;
  if not found then raise exception 'v12_assessment_not_found'; end if;
  if v_assessment.assessment_mode <> 'adaptive' then
    raise exception 'v12_assessment_mode_required';
  end if;
  if v_assessment.status not in ('scored','snapshot_available','report_requested','under_review','closed')
     or v_assessment.submitted_at is null
     or v_assessment.locked_at is null
     or v_assessment.current_score_run_id is null then
    raise exception 'v12_assessment_incomplete_or_unlocked';
  end if;
  select * into v_score
  from public.score_runs
  where id = v_assessment.current_score_run_id
    and assessment_id = v_assessment.id
    and status = 'completed'
    and locked_at is not null;
  if not found then raise exception 'v12_assessment_score_not_locked'; end if;

  select * into v_active
  from public.manual_report_generation_attempts
  where assessment_id = v_assessment.id
    and status in ('REPORT_QUEUED','REPORT_GENERATING')
  order by created_at desc
  limit 1;
  if found then
    if p_trigger_source in ('assessment_admin_retry','assessment_admin_regenerate')
       and v_active.updated_at < now() - interval '15 minutes' then
      update public.manual_report_generation_attempts
      set status = 'GENERATION_FAILED', completed_at = now(), updated_at = now(),
          error_category = 'generation_stuck_recovered',
          safe_operational_error = 'The previous generation attempt stopped responding and was closed for an authorised retry.'
      where id = v_active.id;
      perform set_config('phase14.authoritative_transition', 'authenticated_rpc', true);
      insert into public.audit_logs(
        actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, after_json
      ) values (
        'admin', p_requested_by, v_assessment.id, 'manual_report_generation_attempts', v_active.id,
        'phase14_assessment_report_generation_stuck_recovered',
        jsonb_build_object('technical_reference', v_active.technical_reference,
          'error_category', 'generation_stuck_recovered', 'retry_count', v_active.retry_count)
      );
    else
      return jsonb_build_object('claimed', false, 'reason', 'already_active', 'attempt', to_jsonb(v_active));
    end if;
  end if;

  -- A valid current Essential report is reusable. Only an explicit regenerate may create a new
  -- version; a normal retry never calls the provider against an already-valid report.
  select * into v_ready
  from public.reports
  where assessment_id = v_assessment.id
    and report_type = 'essential_self_assessment'
    and status in ('generated','under_review','approved','released')
    and storage_status = 'VERIFIED'
    and storage_bucket is not null
    and storage_path is not null
    and coalesce(checksum, '') ~ '^[0-9a-f]{64}$'
    and score_run_id = v_assessment.current_score_run_id
  order by version_number desc
  limit 1;
  if found and p_trigger_source <> 'assessment_admin_regenerate' then
    v_reference := 'RPT-' || replace(v_assessment.assessment_reference, '-COMP-', '-ESS-')
      || '-V' || v_ready.version_number::text;
    v_expected_file_name := regexp_replace(v_reference, '[^A-Za-z0-9._-]', '_', 'g') || '.pdf';
    v_expected_prefix := v_assessment.organisation_id::text || '/' || v_assessment.id::text
      || '/v' || v_ready.version_number::text || '/';
    v_expected_storage_path := v_expected_prefix || regexp_replace(v_reference, '[^A-Za-z0-9._-]', '_', 'g')
      || '-' || left(v_ready.checksum, 16) || '.pdf';
    if v_ready.report_reference = v_reference
       and v_ready.storage_bucket = 'generated-reports'
       and v_ready.storage_path = v_expected_storage_path
       and v_ready.file_name = v_expected_file_name
       and v_ready.mime_type = 'application/pdf'
       and coalesce(v_ready.file_size_bytes, 0) > 0 then
      return jsonb_build_object('claimed', false, 'reason', 'report_exists', 'report', to_jsonb(v_ready));
    end if;
  end if;

  select coalesce(max(version_number), 0) + 1 into v_version
  from public.reports
  where assessment_id = v_assessment.id
    and report_type = 'essential_self_assessment';
  select count(*)::integer into v_retries
  from public.manual_report_generation_attempts
  where assessment_id = v_assessment.id
    and trigger_source in ('assessment_admin_generate','assessment_admin_retry','assessment_admin_regenerate')
    and status = 'GENERATION_FAILED';

  begin
    insert into public.manual_report_generation_attempts(
      request_key, assessment_id, order_id, report_version, trigger_source, requested_by,
      status, retry_count, technical_reference
    ) values (
      p_request_key, v_assessment.id, null, v_version, p_trigger_source, p_requested_by,
      'REPORT_QUEUED', v_retries, p_technical_reference
    ) returning * into v_attempt;
  exception when unique_violation then
    select * into v_active
    from public.manual_report_generation_attempts
    where assessment_id = v_assessment.id
      and status in ('REPORT_QUEUED','REPORT_GENERATING')
    order by created_at desc
    limit 1;
    if found then
      return jsonb_build_object('claimed', false, 'reason', 'already_active', 'attempt', to_jsonb(v_active));
    end if;
    raise;
  end;

  perform set_config('phase14.authoritative_transition', 'authenticated_rpc', true);
  insert into public.audit_logs(
    actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, after_json
  ) values (
    'admin', p_requested_by, v_assessment.id, 'manual_report_generation_attempts', v_attempt.id,
    'phase14_assessment_report_generation_requested',
    jsonb_build_object('trigger_source', p_trigger_source, 'report_version', v_attempt.report_version,
      'technical_reference', p_technical_reference, 'order_id', null)
  );
  return jsonb_build_object('claimed', true, 'reason', 'created', 'attempt', to_jsonb(v_attempt));
end;
$$;

create or replace function public.start_assessment_manual_report_generation(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.manual_report_generation_attempts%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'v12_generation_service_role_required';
  end if;
  update public.manual_report_generation_attempts
  set status = 'REPORT_GENERATING', started_at = coalesce(started_at, now()), updated_at = now()
  where id = p_attempt_id
    and order_id is null
    and trigger_source in ('assessment_admin_generate','assessment_admin_retry','assessment_admin_regenerate')
    and status = 'REPORT_QUEUED'
  returning * into v_attempt;
  if not found then raise exception 'v12_generation_attempt_not_queued'; end if;

  perform set_config('phase14.authoritative_transition', 'authenticated_rpc', true);
  insert into public.audit_logs(
    actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, after_json
  ) values (
    'admin', v_attempt.requested_by, v_attempt.assessment_id, 'manual_report_generation_attempts', v_attempt.id,
    'phase14_assessment_report_generation_started',
    jsonb_build_object('technical_reference', v_attempt.technical_reference,
      'report_version', v_attempt.report_version)
  );
  return to_jsonb(v_attempt);
end;
$$;

create or replace function public.fail_assessment_manual_report_generation(
  p_attempt_id uuid,
  p_error_category text,
  p_safe_message text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.manual_report_generation_attempts%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'v12_generation_service_role_required';
  end if;
  update public.manual_report_generation_attempts
  set status = 'GENERATION_FAILED', completed_at = now(), updated_at = now(),
      error_category = left(coalesce(p_error_category, 'generation_failed'), 80),
      safe_operational_error = left(coalesce(p_safe_message, 'Report generation failed.'), 500)
  where id = p_attempt_id
    and order_id is null
    and trigger_source in ('assessment_admin_generate','assessment_admin_retry','assessment_admin_regenerate')
    and status in ('REPORT_QUEUED','REPORT_GENERATING')
  returning * into v_attempt;
  if not found then return jsonb_build_object('updated', false); end if;

  perform set_config('phase14.authoritative_transition', 'authenticated_rpc', true);
  insert into public.audit_logs(
    actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, after_json
  ) values (
    'admin', v_attempt.requested_by, v_attempt.assessment_id, 'manual_report_generation_attempts', v_attempt.id,
    'phase14_assessment_report_generation_failed',
    jsonb_build_object('technical_reference', v_attempt.technical_reference,
      'error_category', v_attempt.error_category, 'safe_operational_error', v_attempt.safe_operational_error)
  );
  return jsonb_build_object('updated', true, 'attempt', to_jsonb(v_attempt));
end;
$$;

create or replace function public.complete_assessment_manual_report_generation(
  p_attempt_id uuid,
  p_template_id uuid,
  p_report_type public.report_type,
  p_storage_bucket text,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_checksum text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.manual_report_generation_attempts%rowtype;
  v_assessment public.assessments%rowtype;
  v_score public.score_runs%rowtype;
  v_previous public.reports%rowtype;
  v_report public.reports%rowtype;
  v_reference text;
  v_expected_prefix text;
  v_expected_file_name text;
  v_expected_storage_path text;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'v12_generation_service_role_required';
  end if;
  select * into v_attempt
  from public.manual_report_generation_attempts
  where id = p_attempt_id
  for update;
  if not found
     or v_attempt.status <> 'REPORT_GENERATING'
     or v_attempt.order_id is not null
     or v_attempt.trigger_source not in ('assessment_admin_generate','assessment_admin_retry','assessment_admin_regenerate') then
    raise exception 'v12_generation_attempt_not_active';
  end if;
  if p_report_type <> 'essential_self_assessment'
     or coalesce(p_file_size_bytes, 0) <= 0
     or p_mime_type <> 'application/pdf'
     or coalesce(trim(p_file_name), '') !~ '^[A-Za-z0-9._-]+\.pdf$'
     or coalesce(trim(p_storage_bucket), '') <> 'generated-reports'
     or coalesce(trim(p_storage_path), '') = ''
     or position('..' in p_storage_path) > 0
     or coalesce(trim(p_checksum), '') !~ '^[0-9a-f]{64}$' then
    raise exception 'v12_report_integrity_invalid';
  end if;

  select * into v_assessment
  from public.assessments
  where id = v_attempt.assessment_id
  for update;
  if not found
     or v_assessment.assessment_mode <> 'adaptive'
     or v_assessment.status not in ('scored','snapshot_available','report_requested','under_review','closed')
     or v_assessment.submitted_at is null
     or v_assessment.locked_at is null
     or v_assessment.current_score_run_id is null then
    raise exception 'v12_assessment_incomplete_or_unlocked';
  end if;
  select * into v_score
  from public.score_runs
  where id = v_assessment.current_score_run_id
    and assessment_id = v_assessment.id
    and status = 'completed'
    and locked_at is not null;
  if not found then raise exception 'v12_assessment_score_not_locked'; end if;

  if not exists (
    select 1 from public.report_templates
    where id = p_template_id
      and report_type = 'essential_self_assessment'
      and status = 'active'
  ) then
    raise exception 'v12_report_template_invalid';
  end if;

  v_reference := 'RPT-' || replace(v_assessment.assessment_reference, '-COMP-', '-ESS-')
    || '-V' || v_attempt.report_version::text;
  v_expected_file_name := regexp_replace(v_reference, '[^A-Za-z0-9._-]', '_', 'g') || '.pdf';
  v_expected_prefix := v_assessment.organisation_id::text || '/' || v_assessment.id::text
    || '/v' || v_attempt.report_version::text || '/';
  v_expected_storage_path := v_expected_prefix || regexp_replace(v_reference, '[^A-Za-z0-9._-]', '_', 'g')
    || '-' || left(p_checksum, 16) || '.pdf';
  if left(p_storage_path, length(v_expected_prefix)) <> v_expected_prefix
     or p_file_name <> v_expected_file_name
     or p_storage_path <> v_expected_storage_path then
    raise exception 'v12_report_storage_binding_invalid';
  end if;

  select * into v_previous
  from public.reports
  where assessment_id = v_assessment.id
    and report_type = 'essential_self_assessment'
    and status in ('generated','under_review','approved','released')
  order by version_number desc
  limit 1
  for update;
  if v_previous.id is not null then
    update public.reports
    set status = 'superseded', updated_at = now()
    where id = v_previous.id;
  end if;

  insert into public.reports(
    assessment_id, organisation_id, order_id, score_run_id, template_id, report_type, status,
    report_reference, version_number, storage_bucket, storage_path, checksum, file_name, mime_type,
    file_size_bytes, storage_status, storage_verified_at, generated_by, generated_at,
    supersedes_report_id
  ) values (
    v_assessment.id, v_assessment.organisation_id, null, v_score.id, p_template_id,
    'essential_self_assessment', 'generated', v_reference, v_attempt.report_version,
    p_storage_bucket, p_storage_path, p_checksum, p_file_name, p_mime_type, p_file_size_bytes,
    'VERIFIED', now(), v_attempt.requested_by, now(), v_previous.id
  ) returning * into v_report;

  perform set_config('phase14.authoritative_transition', 'authenticated_rpc', true);
  update public.manual_report_generation_attempts
  set status = 'REPORT_READY', output_report_id = v_report.id, completed_at = now(), updated_at = now(),
      safe_operational_error = null, error_category = null
  where id = v_attempt.id
  returning * into v_attempt;

  insert into public.report_events(
    report_id, event_type, from_status, to_status, actor_user_id, note, metadata_json
  ) values (
    v_report.id,
    case when v_previous.id is null then 'generated' else 'regenerated' end,
    'REPORT_GENERATING', 'REPORT_READY', v_attempt.requested_by,
    'Private Essential PDF stored and integrity verified.',
    jsonb_build_object('attempt_id', v_attempt.id, 'technical_reference', v_attempt.technical_reference,
      'storage_status', 'VERIFIED', 'file_size_bytes', p_file_size_bytes, 'order_id', null)
  );
  insert into public.assessment_events(
    assessment_id, organisation_id, respondent_id, order_id, report_id, event_type, dedupe_key, metadata_json
  ) values (
    v_assessment.id, v_assessment.organisation_id, v_assessment.primary_respondent_id, null,
    v_report.id, 'report_generated',
    'assessment:' || v_assessment.id::text || ':report_generated:' || v_report.id::text,
    jsonb_build_object('report_reference', v_report.report_reference, 'report_type', 'essential_self_assessment',
      'version_number', v_report.version_number, 'score_run_id', v_score.id, 'order_id', null)
  );
  insert into public.audit_logs(
    actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, after_json
  ) values (
    'admin', v_attempt.requested_by, v_assessment.id, 'reports', v_report.id,
    'phase14_assessment_report_generated',
    jsonb_build_object('report_reference', v_report.report_reference, 'report_type', 'essential_self_assessment',
      'version_number', v_report.version_number, 'storage_bucket', p_storage_bucket,
      'storage_path', p_storage_path, 'checksum', p_checksum, 'file_size_bytes', p_file_size_bytes,
      'attempt_id', v_attempt.id, 'score_run_id', v_score.id, 'order_id', null)
  );

  return jsonb_build_object('attempt', to_jsonb(v_attempt), 'report', to_jsonb(v_report),
    'superseded_report_id', v_previous.id);
end;
$$;

-- Stalled-lead operational evidence is recorded through a dedicated service-role RPC so the
-- scheduler never performs direct DML against the Phase 14 alert table.
create or replace function public.record_assessment_stalled_lead_alert(
  p_alert_key text,
  p_assessment_id uuid,
  p_email_event_id uuid,
  p_detail_json jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'v12_generation_service_role_required';
  end if;
  if coalesce(trim(p_alert_key), '') = '' or length(p_alert_key) > 300 then
    raise exception 'v12_stalled_alert_key_invalid';
  end if;
  if not exists (select 1 from public.assessments where id = p_assessment_id) then
    raise exception 'v12_stalled_assessment_not_found';
  end if;
  perform set_config('phase14.authoritative_transition', 'operational_alert_rpc', true);
  insert into public.phase14_operational_alerts(
    alert_key, severity, category, email_event_id, detail_json, status
  ) values (
    p_alert_key, 'warning', 'assessment_stalled_lead', p_email_event_id,
    coalesce(p_detail_json, '{}'::jsonb), 'open'
  ) on conflict (alert_key) do update
  set email_event_id = coalesce(excluded.email_event_id, phase14_operational_alerts.email_event_id),
      detail_json = excluded.detail_json
  returning id into v_id;
  return v_id;
end;
$$;

insert into public.app_settings(setting_key, value_json)
values (
  'v12_adaptive_stalled_lead_controls',
  '{"enabled":true,"inactivity_hours":24,"source":"v12_forward_contract"}'::jsonb
)
on conflict (setting_key) do nothing;

revoke all on function public.claim_assessment_manual_report_generation(text,uuid,text,text,text)
  from public, anon, authenticated;
revoke all on function public.start_assessment_manual_report_generation(uuid)
  from public, anon, authenticated;
revoke all on function public.fail_assessment_manual_report_generation(uuid,text,text)
  from public, anon, authenticated;
revoke all on function public.complete_assessment_manual_report_generation(uuid,uuid,public.report_type,text,text,text,text,bigint,text)
  from public, anon, authenticated;
revoke all on function public.record_assessment_stalled_lead_alert(text,uuid,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.claim_assessment_manual_report_generation(text,uuid,text,text,text) to service_role;
grant execute on function public.start_assessment_manual_report_generation(uuid) to service_role;
grant execute on function public.fail_assessment_manual_report_generation(uuid,text,text) to service_role;
grant execute on function public.complete_assessment_manual_report_generation(uuid,uuid,public.report_type,text,text,text,text,bigint,text) to service_role;
grant execute on function public.record_assessment_stalled_lead_alert(text,uuid,uuid,jsonb) to service_role;

commit;
