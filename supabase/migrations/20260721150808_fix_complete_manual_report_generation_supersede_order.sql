-- Fix report_generation_persistence_failed regression: complete_manual_report_generation
-- was inserting the new `reports` row BEFORE superseding the previous live report for the
-- same (assessment_id, report_type). Whenever a prior live report existed, the INSERT
-- collided with the reports_one_current_assessment_type_uidx partial unique index and the
-- whole RPC raised, which the caller surfaced as "The verified PDF could not be linked to
-- the order." This made it impossible to regenerate (V2, V3, ...) a report for any
-- assessment that already had a current report on file.
--
-- Fix: run the supersede UPDATE on the previous report before the INSERT, so the unique
-- index never sees two live rows for the same (assessment_id, report_type) at once.
--
-- This migration mirrors a change already applied directly to the production project
-- (jvjxlphdyzerrhwcgkup) on 2026-07-21, after explicit approval, because the affected
-- object is the report-generation function itself, not locked score-run data. It is
-- written as CREATE OR REPLACE FUNCTION using the exact live production definition, so
-- it is idempotent and safe to replay against any environment already on migration
-- 0023_phase1_manual_fulfilment_recovery.sql (which originally defined this function).

CREATE OR REPLACE FUNCTION public.complete_manual_report_generation(p_attempt_id uuid, p_template_id uuid, p_report_type report_type, p_storage_bucket text, p_storage_path text, p_file_name text, p_mime_type text, p_file_size_bytes bigint, p_checksum text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_attempt public.manual_report_generation_attempts%rowtype;
  v_order public.orders%rowtype;
  v_assessment public.assessments%rowtype;
  v_previous public.reports%rowtype;
  v_report public.reports%rowtype;
  v_reference text;
begin
  select * into v_attempt from public.manual_report_generation_attempts
    where id=p_attempt_id for update;
  if not found or v_attempt.status <> 'REPORT_GENERATING' then
    raise exception 'phase1_generation_attempt_not_active';
  end if;
  if coalesce(p_file_size_bytes,0) <= 0 or p_mime_type <> 'application/pdf'
     or p_checksum !~ '^[0-9a-f]{64}$'
     or coalesce(trim(p_storage_bucket),'') = '' or coalesce(trim(p_storage_path),'') = '' then
    raise exception 'phase1_report_integrity_invalid';
  end if;
  select * into v_order from public.orders where id=v_attempt.order_id;
  select * into v_assessment from public.assessments where id=v_order.assessment_id;
  if p_storage_bucket <> 'generated-reports'
     or position('/' || v_order.id::text || '/v' || v_attempt.report_version::text || '/' in p_storage_path) = 0
     or p_file_name not like '%.pdf' then
    raise exception 'phase1_report_storage_binding_invalid';
  end if;
  select * into v_previous from public.reports where order_id=v_order.id
    and status not in ('superseded','voided') order by version_number desc limit 1 for update;
  v_reference := 'RPT-' || v_assessment.assessment_reference || '-V' || v_attempt.report_version;

  -- Supersede the previous report FIRST so the new insert below never
  -- collides with reports_one_current_assessment_type_uidx (which only
  -- allows one live row per (assessment_id, report_type)).
  if v_previous.id is not null then
    update public.reports set status='superseded',updated_at=now() where id=v_previous.id;
  end if;

  insert into public.reports (
    assessment_id,organisation_id,order_id,score_run_id,template_id,report_type,status,
    report_reference,version_number,storage_bucket,storage_path,checksum,file_name,mime_type,
    file_size_bytes,storage_status,storage_verified_at,generated_by,generated_at,supersedes_report_id
  ) values (
    v_assessment.id,v_assessment.organisation_id,v_order.id,v_assessment.current_score_run_id,
    p_template_id,p_report_type,'generated',v_reference,v_attempt.report_version,p_storage_bucket,
    p_storage_path,p_checksum,p_file_name,p_mime_type,p_file_size_bytes,'VERIFIED',now(),
    v_attempt.requested_by,now(),v_previous.id
  ) returning * into v_report;

  update public.manual_report_generation_attempts
  set status='REPORT_READY',output_report_id=v_report.id,completed_at=now(),updated_at=now(),
      safe_operational_error=null,error_category=null
  where id=v_attempt.id;

  -- Establish the Phase 14 authoritative-mutation context this transaction
  -- needs before touching report_events (see header comment for full context).
  perform set_config('phase14.authoritative_transition', 'authenticated_rpc', true);

  insert into public.report_events(report_id,event_type,from_status,to_status,actor_user_id,note,metadata_json)
  values(v_report.id,case when v_previous.id is null then 'generated' else 'regenerated' end,
    'REPORT_GENERATING','REPORT_READY',v_attempt.requested_by,
    'Private report object stored and integrity verified.',
    jsonb_build_object('attempt_id',v_attempt.id,'technical_reference',v_attempt.technical_reference,
      'retry_count',v_attempt.retry_count,'storage_status','VERIFIED','file_size_bytes',p_file_size_bytes));
  insert into public.order_events(order_id,event_type,actor_admin_user_id,note,metadata_json)
  values
    (v_order.id,'report_stored',v_attempt.requested_by,'Private PDF stored and verified.',
      jsonb_build_object('attempt_id',v_attempt.id,'report_id',v_report.id,'storage_status','VERIFIED',
        'technical_reference',v_attempt.technical_reference,'report_version',v_attempt.report_version)),
    (v_order.id,'generation_succeeded',v_attempt.requested_by,'Report generation completed.',
      jsonb_build_object('attempt_id',v_attempt.id,'report_id',v_report.id,'technical_reference',v_attempt.technical_reference,
        'retry_count',v_attempt.retry_count,'report_version',v_attempt.report_version));
  return jsonb_build_object('attempt',to_jsonb(v_attempt),'report',to_jsonb(v_report),
    'superseded_report_id',v_previous.id);
end;
$function$
;
