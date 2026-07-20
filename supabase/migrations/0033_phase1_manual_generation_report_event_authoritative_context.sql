-- Phase 1 manual report generation was blocked in production by the Phase 14
-- authoritative-mutation guard trigger added in migration 0017
-- (public.guard_phase14_authoritative_mutation, enforced via
-- public.phase14_shared_row_was_owned). That guard treats any insert into
-- public.report_events with event_type in ('generated','regenerated',
-- 'email_sent','email_test_sent','download_requested') as a Phase 14-owned
-- mutation, and rejects it unless the current transaction has previously
-- called set_config('phase14.authoritative_transition', <allowed-value>, true).
--
-- public.complete_manual_report_generation (migration 0023) is the Phase 1
-- "manual, recoverable" completion RPC that remains the active fulfilment path
-- while Phase 14 automation is disabled. It inserts into report_events with
-- event_type 'generated'/'regenerated' but never established that
-- authoritative context, so every real invocation raised
-- 'phase14_authoritative_rpc_required:report_events:INSERT' inside the
-- function's transaction. The exception aborted the whole transaction
-- (including the reports insert), and the app surfaced this as the generic
-- 'report_persistence_failed' / "The verified PDF could not be linked to the
-- order." error. Confirmed against production Postgres logs and against
-- order MKORD-2026-24VM28YM's two failed manual_report_generation_attempts
-- rows (both GENERATION_FAILED, error_category=report_persistence_failed,
-- output_report_id null, zero rows in public.reports for the order).
--
-- Fix: set the same 'authenticated_rpc' context value already used elsewhere
-- in Phase 14's own authenticated-actor RPCs (see phase14_require_actor) right
-- before the report_events insert. This function is SECURITY DEFINER owned by
-- `postgres`, the same owner as phase14_require_security, so it already
-- satisfies the trigger's current_user ownership check -- the only missing
-- piece was the context value. This is a single added statement; the rest of
-- the function body is reproduced verbatim from the current production
-- definition (verified byte-for-byte via pg_get_functiondef before writing
-- this migration) so no other behaviour changes.
--
-- No trigger/guard function changes are needed or made: the guard's existing
-- allow-list already includes 'authenticated_rpc', so this is additive and
-- carries no change to Phase 14's own security posture.

create or replace function public.complete_manual_report_generation(
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

  if v_previous.id is not null then
    update public.reports set status='superseded',updated_at=now() where id=v_previous.id;
  end if;
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
$$;

revoke all on function public.complete_manual_report_generation(uuid,uuid,public.report_type,text,text,text,text,bigint,text) from public, anon, authenticated;
grant execute on function public.complete_manual_report_generation(uuid,uuid,public.report_type,text,text,text,text,bigint,text) to service_role;
