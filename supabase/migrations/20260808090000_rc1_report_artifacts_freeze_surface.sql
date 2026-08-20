-- Map public.report_artifacts to the RC1 'generation' freeze surface.
--
-- 20260807120000 attached trg_rc1_operation_freeze to public.report_artifacts -- correct, that
-- table holds authoritative delivery state -- but did not add the matching relation->surface entry.
-- rc1_guard_authoritative_mutation() resolves the surface first and raises
-- 'rc1_operation_frozen:unknown_surface' the moment the mapping is null, BEFORE the normal
-- freeze-state check. The effect is absolute: every insert, update and delete on report_artifacts
-- fails for every caller, in every freeze state, so the supporting register can never be persisted
-- and report generation fails at persist_supporting_register.
--
-- 'generation' is the surface already carried by public.reports, public.report_events,
-- public.report_fulfilments, public.report_generation_runs and the rest of the report-generation
-- state. The supporting register is produced during generation and belongs to a specific report
-- version, so it is governed by exactly the same surface as its parent report -- freezing
-- generation must stop it, and releasing generation must permit it.
--
-- This is the whole product change. The function is reproduced verbatim from its accepted
-- definition (20260801220000_rc1_synthetic_certification_marking.sql) with one `when` clause added
-- next to the other 'generation' relations. Name, signature, return type, IMMUTABLE,
-- SECURITY DEFINER and the empty search_path are unchanged, every existing mapping is unchanged,
-- and CREATE OR REPLACE preserves the existing owner and ACL, so no privilege is broadened. The
-- freeze trigger itself is untouched -- this migration makes the guard work as intended rather than
-- bypassing it.

begin;

create or replace function public.rc1_surface_for_relation(p_schema text, p_table text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select case coalesce(p_schema, '') || '.' || coalesce(p_table, '')
    when 'public.organisations' then 'assessment_start'
    when 'public.respondents' then 'assessment_start'
    when 'public.assessments' then 'assessment_write'
    when 'public.assessment_tokens' then 'assessment_write'
    when 'public.assessment_answers' then 'assessment_write'
    when 'public.exposure_answers' then 'assessment_write'
    when 'public.assessment_events' then 'assessment_write'
    when 'public.score_runs' then 'assessment_score'
    when 'public.score_domain_results' then 'assessment_score'
    when 'public.score_question_traces' then 'assessment_score'
    when 'public.maturity_cap_events' then 'assessment_score'
    when 'public.data_requests' then 'order_create'
    when 'public.orders' then 'order_create'
    when 'public.payment_sessions' then 'payment_status'
    when 'public.payment_automation_records' then 'payment_status'
    when 'public.payment_transition_events' then 'payment_status'
    when 'public.order_events' then 'payment_status'
    when 'public.manual_report_generation_attempts' then 'generation'
    when 'public.report_fulfilments' then 'generation'
    when 'public.report_generation_runs' then 'generation'
    when 'public.report_ai_attempts' then 'generation'
    when 'public.reports' then 'generation'
    when 'public.report_events' then 'generation'
    when 'public.report_quality_diagnostics' then 'generation'
    -- Secondary report artefacts are report-generation state, governed by the same surface as the
    -- report version they belong to.
    when 'public.report_artifacts' then 'generation'
    when 'public.backlog_reconciliation_records' then 'backlog'
    when 'public.manual_report_delivery_attempts' then 'delivery'
    when 'public.report_delivery_authorizations' then 'delivery'
    when 'public.report_delivery_finalizations' then 'delivery'
    when 'public.report_delivery_remediations' then 'delivery'
    when 'public.email_events' then 'delivery'
    when 'public.email_provider_events' then 'resend_webhook'
    when 'public.customer_report_access_tokens' then 'customer_token'
    when 'public.phase14_operational_alerts' then 'operational_alert'
    when 'public.app_settings' then 'activation_control'
    when 'public.phase14_security_gates' then 'activation_control'
    when 'public.phase14_feature_policies' then 'activation_control'
    when 'public.phase14_ai_route_policies' then 'activation_control'
    when 'public.phase14_provider_attestations' then 'activation_control'
    -- RC1 addition: the cleanup audit is an operator control-plane record.
    when 'public.rc1_synthetic_cleanup_audit' then 'activation_control'
    -- RC1 addition: the orphan-remediation audit is the same kind of record.
    when 'public.rc1_orphan_remediation_audit' then 'activation_control'
    -- RC1 addition: the synthetic-marking audit is the same kind of record.
    when 'public.rc1_synthetic_marking_audit' then 'activation_control'
    when 'public.phase14_worker_capabilities' then 'worker'
    when 'public.phase14_worker_operations' then 'worker'
    when 'storage.objects' then 'storage_cleanup'
    when 'phase14_private.runtime_secrets' then 'activation_control'
    else null
  end;
$$;

-- Structural invariant, enforced at apply time and on every replay: nothing may carry the
-- authoritative-mutation trigger without a surface. This is the check whose absence let
-- 20260807120000 ship a table the guard could only ever reject.
do $$
declare
  v_unmapped text;
begin
  select string_agg(n.nspname || '.' || c.relname, ', ' order by n.nspname || '.' || c.relname)
  into v_unmapped
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid = t.tgrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where t.tgname = 'trg_rc1_operation_freeze'
    and not t.tgisinternal
    and public.rc1_surface_for_relation(n.nspname, c.relname) is null;

  if v_unmapped is not null then
    raise exception 'rc1_freeze_surface_unmapped_relations: %', v_unmapped;
  end if;

  if public.rc1_surface_for_relation('public', 'report_artifacts') is distinct from 'generation' then
    raise exception 'rc1_report_artifacts_surface_not_generation';
  end if;
end;
$$;

commit;
