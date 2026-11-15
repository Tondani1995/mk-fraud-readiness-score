-- Decision DR-12, resolved by the owner on 14 November 2026: the shared "generation_started" order event no longer says
-- "Deterministic report generation started." That note is false for revised reports, which are AI-written. It now reads
-- "Report generation started.", which is true for every generation path.
--
-- Only the note text changes. The function body, signature, security definer, search path, event type, metadata and
-- grants are otherwise identical to 0023_phase1_manual_fulfilment_recovery.sql. Events already recorded are history
-- and are not rewritten.
create or replace function public.start_manual_report_generation(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_attempt public.manual_report_generation_attempts%rowtype;
begin
  update public.manual_report_generation_attempts
  set status='REPORT_GENERATING',started_at=coalesce(started_at,now()),updated_at=now()
  where id=p_attempt_id and status='REPORT_QUEUED'
  returning * into v_attempt;
  if not found then raise exception 'phase1_generation_attempt_not_queued'; end if;
  insert into public.order_events(order_id,event_type,actor_admin_user_id,note,metadata_json)
  values(v_attempt.order_id,'generation_started',v_attempt.requested_by,'Report generation started.',
    jsonb_build_object('attempt_id',v_attempt.id,'technical_reference',v_attempt.technical_reference,
      'retry_count',v_attempt.retry_count,'report_version',v_attempt.report_version));
  return to_jsonb(v_attempt);
end;
$$;

revoke all on function public.start_manual_report_generation(uuid) from public, anon, authenticated;
grant execute on function public.start_manual_report_generation(uuid) to service_role;
