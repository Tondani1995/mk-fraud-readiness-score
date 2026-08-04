-- RC1: correct the synthetic-cleanup Storage handling.
--
-- Defect
-- ------
-- 20260730130000 removed synthetic Storage objects with a direct
-- `delete from storage.objects`. Supabase installs a statement-level guard,
-- storage.protect_delete(), which raises
--
--   42501  Direct deletion from storage tables is not allowed. Use the Storage API instead.
--
-- That guard fires for the statement regardless of how many rows match, so
-- rc1_cleanup_synthetic_certification threw on every invocation -- including when the journey had
-- no reports and therefore no objects at all. The failure surfaced during RC1 certification as an
-- unclassified refusal from the cleanup route.
--
-- Correction
-- ----------
-- SQL is the wrong layer for object removal, so the function no longer attempts it. It now
-- resolves the exact bucket/path pairs backing the synthetic reports and returns them as a count
-- under `storage_objects_pending`, alongside the rows it did delete. The database keeps every
-- authority decision it already owned; byte removal belongs to the Storage API caller.
--
-- This is deliberately not routed through the phase14 storage-cleanup registry: that path depends
-- on the storage_cleanup feature policy and its worker, which are inert by design, and a
-- certification cleanup must not require them to be enabled.
--
-- Everything else in the function is unchanged: the same authority checks, the same MKTEST-RC1-
-- provenance requirement, the same transaction-local score-trace allowance, the same FK-safe
-- ordering and the same fingerprint-only audit record.

begin;

create or replace function public.rc1_cleanup_synthetic_certification(
  p_reference text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_reason_fingerprint text;
  v_enabled boolean;
  v_org_ids uuid[];
  v_assessment_ids uuid[];
  v_order_ids uuid[];
  v_report_ids uuid[];
  v_authorization_ids uuid[];
  v_counts jsonb := '{}'::jsonb;
  v_deleted integer;
  v_pending integer;
  v_freeze_epoch bigint;
begin
  v_actor := public.rc1_require_platform_admin(true);

  if p_reference is null or p_reference !~ '^MKTEST-RC1-[0-9]{8}-[0-9]{2}$' then
    raise exception 'rc1_synthetic_cleanup:reference_not_synthetic';
  end if;
  if pg_catalog.char_length(v_reason) < 10 or pg_catalog.char_length(v_reason) > 500 then
    raise exception 'rc1_synthetic_cleanup:meaningful_reason_required';
  end if;

  select coalesce((s.value_json->>'enabled')::boolean, false) into v_enabled
  from public.app_settings s
  where s.setting_key = 'rc1_synthetic_certification_cleanup';
  if not coalesce(v_enabled, false) then
    raise exception 'rc1_synthetic_cleanup:not_enabled_in_this_environment';
  end if;

  v_reason_fingerprint := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_reason, 'UTF8'), 'sha256'), 'hex'
  );

  select pg_catalog.array_agg(o.id) into v_org_ids
  from public.organisations o
  where o.synthetic_certification_ref = p_reference;

  if v_org_ids is null or pg_catalog.array_length(v_org_ids, 1) is null then
    insert into public.rc1_synthetic_cleanup_audit (
      synthetic_reference, reason_fingerprint, actor_fingerprint, freeze_epoch, deleted_counts
    ) values (
      p_reference, v_reason_fingerprint, v_actor->>'actor_fingerprint', null,
      jsonb_build_object('organisations', 0, 'already_clean', true)
    );
    return jsonb_build_object('reference', p_reference, 'already_clean', true, 'deleted', '{}'::jsonb);
  end if;

  select pg_catalog.array_agg(a.id) into v_assessment_ids
  from public.assessments a where a.organisation_id = any(v_org_ids);
  v_assessment_ids := coalesce(v_assessment_ids, array[]::uuid[]);

  select pg_catalog.array_agg(o.id) into v_order_ids
  from public.orders o where o.assessment_id = any(v_assessment_ids);
  v_order_ids := coalesce(v_order_ids, array[]::uuid[]);

  select pg_catalog.array_agg(r.id) into v_report_ids
  from public.reports r where r.assessment_id = any(v_assessment_ids);
  v_report_ids := coalesce(v_report_ids, array[]::uuid[]);

  perform pg_catalog.set_config('rc1.synthetic_cleanup_ref', p_reference, true);

  -- Storage objects are reported, never deleted here: storage.protect_delete() rejects direct
  -- deletion, and the Storage API is the supported removal path.
  select pg_catalog.count(*) into v_pending
  from storage.objects so
  join public.reports r
    on so.bucket_id = r.storage_bucket and so.name = r.storage_path
  where r.id = any(v_report_ids);
  v_counts := v_counts || jsonb_build_object('storage_objects_pending', coalesce(v_pending, 0));

  delete from public.customer_report_access_tokens t where t.report_id = any(v_report_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('customer_report_access_tokens', v_deleted);

  delete from public.email_provider_events e
  where e.email_event_id in (select id from public.email_events where assessment_id = any(v_assessment_ids));
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('email_provider_events', v_deleted);

  select pg_catalog.array_agg(d.id) into v_authorization_ids
  from public.report_delivery_authorizations d where d.assessment_id = any(v_assessment_ids);
  v_authorization_ids := coalesce(v_authorization_ids, array[]::uuid[]);

  delete from public.report_delivery_finalizations f where f.authorization_id = any(v_authorization_ids);
  delete from public.phase14_provider_attestation_consumptions c where c.authorization_id = any(v_authorization_ids);
  delete from public.phase14_provider_attestations a where a.authorization_id = any(v_authorization_ids);

  delete from public.manual_report_delivery_attempts d where d.order_id = any(v_order_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('manual_report_delivery_attempts', v_deleted);

  delete from public.report_quality_diagnostics q
  where q.attempt_id in (select id from public.manual_report_generation_attempts where order_id = any(v_order_ids));
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('report_quality_diagnostics', v_deleted);

  delete from public.manual_report_generation_attempts g where g.order_id = any(v_order_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('manual_report_generation_attempts', v_deleted);

  delete from public.report_delivery_authorizations d where d.id = any(v_authorization_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('report_delivery_authorizations', v_deleted);

  delete from public.email_events e where e.assessment_id = any(v_assessment_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('email_events', v_deleted);

  delete from public.report_generation_claims c where c.assessment_id = any(v_assessment_ids);
  delete from public.report_events re where re.report_id = any(v_report_ids);
  delete from public.reports r where r.id = any(v_report_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('reports', v_deleted);

  delete from public.report_fulfilments f where f.assessment_id = any(v_assessment_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('report_fulfilments', v_deleted);

  delete from public.score_question_traces t
  where t.score_run_id in (select id from public.score_runs where assessment_id = any(v_assessment_ids));
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('score_question_traces', v_deleted);

  delete from public.maturity_cap_events m
  where m.score_run_id in (select id from public.score_runs where assessment_id = any(v_assessment_ids));
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('maturity_cap_events', v_deleted);

  delete from public.score_domain_results d
  where d.score_run_id in (select id from public.score_runs where assessment_id = any(v_assessment_ids));

  update public.assessments set current_score_run_id = null where id = any(v_assessment_ids);

  delete from public.score_runs s where s.assessment_id = any(v_assessment_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('score_runs', v_deleted);

  delete from public.payment_transition_events p where p.order_id = any(v_order_ids);
  delete from public.payment_automation_records p where p.order_id = any(v_order_ids);
  delete from public.payment_sessions p where p.order_id = any(v_order_ids);
  delete from public.order_events o where o.order_id = any(v_order_ids);
  delete from public.orders o where o.id = any(v_order_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('orders', v_deleted);

  delete from public.data_requests d where d.assessment_id = any(v_assessment_ids);
  delete from public.assessment_answers a where a.assessment_id = any(v_assessment_ids);
  delete from public.exposure_answers e where e.assessment_id = any(v_assessment_ids);
  delete from public.assessment_tokens t where t.assessment_id = any(v_assessment_ids);
  delete from public.assessment_events e where e.assessment_id = any(v_assessment_ids);
  delete from public.assessment_resume_events e where e.assessment_id = any(v_assessment_ids);
  delete from public.audit_logs l where l.assessment_id = any(v_assessment_ids);

  delete from public.assessments a where a.id = any(v_assessment_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('assessments', v_deleted);

  delete from public.respondents r where r.organisation_id = any(v_org_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('respondents', v_deleted);

  delete from public.organisations o where o.id = any(v_org_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('organisations', v_deleted);

  begin
    select freeze_epoch into v_freeze_epoch
    from public.rc1_operation_freeze_state where singleton = true;
  exception when others then
    v_freeze_epoch := null;
  end;

  insert into public.rc1_synthetic_cleanup_audit (
    synthetic_reference, reason_fingerprint, actor_fingerprint, freeze_epoch, deleted_counts
  ) values (
    p_reference, v_reason_fingerprint, v_actor->>'actor_fingerprint', v_freeze_epoch, v_counts
  );

  return jsonb_build_object('reference', p_reference, 'already_clean', false, 'deleted', v_counts);
end;
$$;

revoke all on function public.rc1_cleanup_synthetic_certification(text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.rc1_cleanup_synthetic_certification(text,text) to authenticated;

comment on function public.rc1_cleanup_synthetic_certification(text,text) is
  'Audited removal of a single MKTEST-RC1- synthetic certification journey. Requires platform_admin at AAL2 and an explicit app_settings enablement row; refuses any non-synthetic reference. Reports Storage objects as pending rather than deleting them, because storage.protect_delete() requires the Storage API. Not a customer erasure facility.';

commit;
