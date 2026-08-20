-- RC1: an audited AAL2 control for stamping the synthetic-certification marker.
--
-- Why this exists
-- ---------------
-- Every RC1 cleanup control is scoped by organisations.synthetic_certification_ref: the synthetic
-- journey cleanup removes only rows reachable from an organisation carrying a MKTEST-RC1-
-- reference, and the three immutability-guard allowances (20260731150000, 20260801090000,
-- 20260801140000) each prove provenance back to exactly that column.
--
-- Nothing could set it. 20260730130000 added the column, its CHECK and its index, but no function,
-- route or application path ever writes it, and none of the eleven RC1 control RPCs can. So a
-- certification journey could be run and then never cleaned up, because the marker the cleanup
-- depends on had no authorised way to arrive. The only remaining routes were a direct database
-- edit or service_role, neither of which is audited. That is the gap this closes.
--
-- Design
-- ------
-- The marker is what makes an organisation deletable, so this control is deliberately harder to
-- satisfy than the cleanup it enables. It refuses unless the organisation is provably a
-- brand-new, unused certification journey and not a customer record:
--
--   * platform_admin at AAL2, and a meaningful reason;
--   * the same environment enablement the cleanup uses -- marking data synthetic is meaningless
--     where the synthetic cleanup is not enabled, so the two share one switch rather than adding
--     a third key to the enablement allow-list;
--   * a RELEASED database, enforced by the existing RC1 freeze guard rather than restated here:
--     public.organisations sits on the assessment_start freeze surface, so the update below is
--     already refused while the database is frozen;
--   * the organisation is resolved from the journey's own assessment reference, never from a row
--     id, email address or predicate supplied by the browser;
--   * exactly one organisation matches -- zero or several is a refusal, not a best effort;
--   * its marker is currently null, so an existing reference is never overwritten or relabelled;
--   * it owns exactly one assessment, the one named;
--   * nothing has happened under it yet: no score run, order, report, delivery authorisation,
--     email event, data request or access token. A journey is marked at its start, before any of
--     those exist, so requiring their absence excludes every organisation that has ever been used;
--   * it was created within the last hour, so a real customer organisation from any earlier day
--     can never be reached by this control at all.
--
-- The audit records the reference, fingerprints and the single affected count -- never the
-- organisation name, the respondent, an email address or a row id.
--
-- This is not a data-classification facility. It cannot relabel, clear or move a marker, and it
-- cannot touch an organisation that has done anything.

begin;

-- ---------------------------------------------------------------------------
-- 1. Audit. Reference, fingerprints and a count only.
-- ---------------------------------------------------------------------------
create table if not exists public.rc1_synthetic_marking_audit (
  id uuid primary key default gen_random_uuid(),
  synthetic_reference text not null,
  reason_fingerprint text not null,
  actor_fingerprint text not null,
  freeze_epoch bigint,
  marked_count integer not null,
  marked_at timestamptz not null default now(),
  constraint rc1_synthetic_marking_audit_reference_check
    check (synthetic_reference ~ '^MKTEST-RC1-[0-9]{8}-[0-9]{2}$'),
  constraint rc1_synthetic_marking_audit_reason_fingerprint_check
    check (reason_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint rc1_synthetic_marking_audit_actor_fingerprint_check
    check (actor_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint rc1_synthetic_marking_audit_count_check
    check (marked_count = 1)
);

comment on table public.rc1_synthetic_marking_audit is
  'Audit of synthetic-certification markings. Stores the MKTEST-RC1 reference, fingerprints and a count only -- never the organisation name, respondent, email address or any row id.';

alter table public.rc1_synthetic_marking_audit enable row level security;
revoke all on table public.rc1_synthetic_marking_audit from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The control.
-- ---------------------------------------------------------------------------
create or replace function public.rc1_mark_synthetic_certification_organisation(
  p_assessment_reference text,
  p_synthetic_reference text,
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
  v_assessment_ref text := pg_catalog.btrim(coalesce(p_assessment_reference, ''));
  v_reason_fingerprint text;
  v_enabled boolean;
  v_state text;
  v_freeze_epoch bigint;
  v_organisation_id uuid;
  v_assessment_count integer;
  v_blocking integer;
  v_created_at timestamptz;
  v_marked integer;
begin
  v_actor := public.rc1_require_platform_admin(true);

  if pg_catalog.char_length(v_reason) < 10 or pg_catalog.char_length(v_reason) > 500 then
    raise exception 'rc1_synthetic_marking:meaningful_reason_required';
  end if;
  if p_synthetic_reference is null
     or p_synthetic_reference !~ '^MKTEST-RC1-[0-9]{8}-[0-9]{2}$' then
    raise exception 'rc1_synthetic_marking:synthetic_reference_invalid';
  end if;
  if v_assessment_ref = '' or pg_catalog.char_length(v_assessment_ref) > 100 then
    raise exception 'rc1_synthetic_marking:assessment_reference_required';
  end if;

  -- Marking data synthetic is meaningless where the synthetic cleanup is not enabled, so the two
  -- share one environment switch. Inert on arrival in every environment, Production included.
  select coalesce((s.value_json->>'enabled')::boolean, false) into v_enabled
  from public.app_settings s where s.setting_key = 'rc1_synthetic_certification_cleanup';
  if not coalesce(v_enabled, false) then
    raise exception 'rc1_synthetic_marking:not_enabled_in_this_environment';
  end if;

  select state into v_state from public.rc1_operation_freeze_state where singleton = true;
  if coalesce(v_state, '') <> 'RELEASED' then
    raise exception 'rc1_synthetic_marking:database_not_released';
  end if;

  -- Resolved from the journey's own reference, never from a browser-supplied id or predicate.
  select a.organisation_id into v_organisation_id
  from public.assessments a
  where a.assessment_reference = v_assessment_ref;
  if v_organisation_id is null then
    raise exception 'rc1_synthetic_marking:assessment_not_found';
  end if;

  -- An existing marker is never overwritten, cleared or relabelled.
  select o.created_at into v_created_at
  from public.organisations o
  where o.id = v_organisation_id and o.synthetic_certification_ref is null;
  if v_created_at is null then
    raise exception 'rc1_synthetic_marking:organisation_already_marked_or_missing';
  end if;

  -- A real customer organisation from any earlier day is unreachable by this control.
  if v_created_at < pg_catalog.now() - interval '1 hour' then
    raise exception 'rc1_synthetic_marking:organisation_not_recent';
  end if;

  -- The organisation must own exactly one assessment: the one named.
  select pg_catalog.count(*)::integer into v_assessment_count
  from public.assessments a where a.organisation_id = v_organisation_id;
  if v_assessment_count <> 1 then
    raise exception 'rc1_synthetic_marking:organisation_has_other_assessments';
  end if;

  -- Nothing may have happened under it yet. A journey is marked at its start, so the presence of
  -- any of these means this is not a fresh certification journey.
  select
    (select pg_catalog.count(*) from public.score_runs r
       join public.assessments a on a.id = r.assessment_id
       where a.organisation_id = v_organisation_id)
  + (select pg_catalog.count(*) from public.orders o
       join public.assessments a on a.id = o.assessment_id
       where a.organisation_id = v_organisation_id)
  + (select pg_catalog.count(*) from public.reports rp
       join public.assessments a on a.id = rp.assessment_id
       where a.organisation_id = v_organisation_id)
  + (select pg_catalog.count(*) from public.report_delivery_authorizations d
       join public.assessments a on a.id = d.assessment_id
       where a.organisation_id = v_organisation_id)
  + (select pg_catalog.count(*) from public.email_events e
       join public.assessments a on a.id = e.assessment_id
       where a.organisation_id = v_organisation_id)
  -- A data request carries both links, so either one counts as use.
  + (select pg_catalog.count(*) from public.data_requests dr
       where dr.organisation_id = v_organisation_id
          or dr.assessment_id in (
               select a.id from public.assessments a where a.organisation_id = v_organisation_id))
  -- An access token has no assessment column; it reaches the organisation through its order.
  + (select pg_catalog.count(*) from public.customer_report_access_tokens t
       join public.orders o2 on o2.id = t.order_id
       join public.assessments a on a.id = o2.assessment_id
       where a.organisation_id = v_organisation_id)
  into v_blocking;
  if v_blocking > 0 then
    raise exception 'rc1_synthetic_marking:organisation_already_in_use';
  end if;

  v_reason_fingerprint := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_reason, 'UTF8'), 'sha256'), 'hex');

  begin
    select freeze_epoch into v_freeze_epoch
    from public.rc1_operation_freeze_state where singleton = true;
  exception when others then
    v_freeze_epoch := null;
  end;

  -- organisations sits on the assessment_start freeze surface, so the RC1 guard refuses this write
  -- while the database is frozen. The null check is restated here so a concurrent marking cannot
  -- slip between the read above and this update.
  update public.organisations o
  set synthetic_certification_ref = p_synthetic_reference
  where o.id = v_organisation_id and o.synthetic_certification_ref is null;
  get diagnostics v_marked = row_count;
  if v_marked <> 1 then
    raise exception 'rc1_synthetic_marking:marking_did_not_apply_exactly_once';
  end if;

  insert into public.rc1_synthetic_marking_audit (
    synthetic_reference, reason_fingerprint, actor_fingerprint, freeze_epoch, marked_count
  ) values (
    p_synthetic_reference, v_reason_fingerprint, v_actor->>'actor_fingerprint', v_freeze_epoch, v_marked
  );

  return jsonb_build_object(
    'synthetic_reference', p_synthetic_reference,
    'marked', v_marked,
    'freeze_epoch', v_freeze_epoch
  );
end;
$$;

revoke all on function public.rc1_mark_synthetic_certification_organisation(text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.rc1_mark_synthetic_certification_organisation(text,text,text) to authenticated;

comment on function public.rc1_mark_synthetic_certification_organisation(text,text,text) is
  'Stamps organisations.synthetic_certification_ref on exactly one brand-new certification organisation, resolved from the journey''s own assessment reference. Requires platform_admin at AAL2, a meaningful reason, the synthetic-cleanup environment enablement and a RELEASED database. Refuses unless the organisation is unmarked, created within the last hour, owns exactly that one assessment and has no score run, order, report, delivery authorisation, email event, data request or access token. Never overwrites, clears or relabels an existing marker. Audits the reference, fingerprints and a count only.';

-- ---------------------------------------------------------------------------
-- 3. Freeze surface registration.
--
-- The real signature takes (p_schema, p_table). A one-argument variant would create a silent
-- overload and leave the function the guards actually call untouched, so the accepted definition is
-- reproduced verbatim with exactly one line added for the new audit table.
-- ---------------------------------------------------------------------------
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

commit;
