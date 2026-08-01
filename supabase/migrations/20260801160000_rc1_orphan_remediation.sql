-- RC1: audited staging-only remediation for provider rows that outlived their journey.
--
-- Why this exists
-- ---------------
-- The synthetic-journey cleanup is deliberately scoped: it removes only rows reachable from an
-- organisation carrying a MKTEST-RC1- reference. That is the right boundary, and widening it would
-- turn an audited certification tool into a general-purpose delete.
--
-- Certification nevertheless leaves rows the journey cleanup cannot reach, because a provider
-- callback can arrive for an email event that no longer exists, or for none at all:
--
--   email_events                      with no assessment, order, report or data request
--   email_provider_events             with no email_event, or belonging to such an email_event
--   phase14_provider_attestations     with no delivery authorisation and no surviving email_event
--
-- Those rows reference no business record and can never be attributed to one again, so a final
-- rollback cannot honestly claim zero provider records while they remain. This control removes
-- exactly that set and nothing else.
--
-- Design
-- ------
-- Two phases with a fingerprint-and-count contract between them. Prepare derives the candidate set
-- entirely inside the database and returns counts, a deterministic fingerprint and a
-- classification -- never record ids, provider message ids, recipients or payloads. Execute
-- re-derives the same set and refuses unless the fingerprint and total still match, so a candidate
-- that appeared, vanished or was substituted between the two calls cannot be removed.
--
-- Every refusal is fail-closed: wrong environment, missing enablement, missing AAL2 authority, a
-- candidate that turns out to be linked, a count above the certification-sized bound, a stale
-- fingerprint or a mismatched total all abort before anything is deleted.
--
-- The enablement row is never inserted by this migration, so the control is inert on arrival in
-- every environment, Production included.

begin;

-- ---------------------------------------------------------------------------
-- 1. Audit. Counts and fingerprints only.
-- ---------------------------------------------------------------------------
create table if not exists public.rc1_orphan_remediation_audit (
  id uuid primary key default gen_random_uuid(),
  reason_fingerprint text not null,
  actor_fingerprint text not null,
  freeze_epoch bigint,
  candidate_fingerprint text not null,
  candidate_total integer not null,
  deleted_counts jsonb not null,
  executed_at timestamptz not null default now(),
  constraint rc1_orphan_remediation_audit_reason_fingerprint_check
    check (reason_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint rc1_orphan_remediation_audit_actor_fingerprint_check
    check (actor_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint rc1_orphan_remediation_audit_candidate_fingerprint_check
    check (candidate_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint rc1_orphan_remediation_audit_total_check
    check (candidate_total >= 0)
);

alter table public.rc1_orphan_remediation_audit enable row level security;
revoke all on table public.rc1_orphan_remediation_audit from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Candidate derivation.
--
-- The single definition of "orphan", used by both phases so they cannot drift. It returns ids, so
-- it is revoked from every API role: only the two SECURITY DEFINER entry points below may call it,
-- and neither of them returns an id to a caller.
-- ---------------------------------------------------------------------------
create or replace function public.rc1_orphan_remediation_candidates()
returns table(relation text, record_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with orphan_email_events as (
    select e.id
    from public.email_events e
    where e.assessment_id is null
      and e.order_id is null
      and e.report_id is null
      and e.data_request_id is null
  ),
  orphan_provider_events as (
    select pe.id
    from public.email_provider_events pe
    where pe.email_event_id is null
       or not exists (select 1 from public.email_events e where e.id = pe.email_event_id)
       or pe.email_event_id in (select id from orphan_email_events)
  ),
  orphan_attestations as (
    select a.id
    from public.phase14_provider_attestations a
    where (a.authorization_id is null
           or not exists (select 1 from public.report_delivery_authorizations d where d.id = a.authorization_id))
      and (a.email_event_id is null
           or not exists (select 1 from public.email_events e where e.id = a.email_event_id)
           or a.email_event_id in (select id from orphan_email_events))
  ),
  orphan_consumptions as (
    select c.attestation_id as id
    from public.phase14_provider_attestation_consumptions c
    where c.attestation_id in (select id from orphan_attestations)
  )
  select 'email_events'::text, id from orphan_email_events
  union all select 'email_provider_events'::text, id from orphan_provider_events
  union all select 'phase14_provider_attestations'::text, id from orphan_attestations
  union all select 'phase14_provider_attestation_consumptions'::text, id from orphan_consumptions
$$;

revoke all on function public.rc1_orphan_remediation_candidates()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Prepare. Measures; changes nothing.
-- ---------------------------------------------------------------------------
create or replace function public.rc1_prepare_orphan_remediation()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Certification leaves a handful of rows. The bound is a structural assertion that this is
  -- residue from a controlled window, not a bulk delete.
  c_candidate_limit constant integer := 50;
  v_enabled boolean;
  v_state text;
  v_counts jsonb;
  v_total integer;
  v_fingerprint text;
  v_linked integer;
begin
  perform public.rc1_require_platform_admin(true);

  select coalesce((s.value_json->>'enabled')::boolean, false) into v_enabled
  from public.app_settings s where s.setting_key = 'rc1_orphan_remediation';
  if not coalesce(v_enabled, false) then
    raise exception 'rc1_orphan_remediation:not_enabled_in_this_environment';
  end if;

  select state into v_state from public.rc1_operation_freeze_state where singleton = true;
  if coalesce(v_state, '') <> 'RELEASED' then
    raise exception 'rc1_orphan_remediation:database_not_released';
  end if;

  select
    coalesce(pg_catalog.jsonb_object_agg(relation, n), '{}'::jsonb),
    coalesce(pg_catalog.sum(n)::integer, 0)
  into v_counts, v_total
  from (
    select relation, pg_catalog.count(*)::integer as n
    from public.rc1_orphan_remediation_candidates() group by relation
  ) grouped;

  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        coalesce(pg_catalog.string_agg(relation || ':' || record_id::text, E'\n' order by relation, record_id), ''),
        'UTF8'), 'sha256'), 'hex')
  into v_fingerprint
  from public.rc1_orphan_remediation_candidates();

  -- Defence in depth: no candidate may retain a link to a surviving business or delivery record.
  select pg_catalog.count(*)::integer into v_linked
  from public.rc1_orphan_remediation_candidates() c
  where (c.relation = 'email_events' and exists (
           select 1 from public.email_events e
           where e.id = c.record_id
             and (e.assessment_id is not null or e.order_id is not null
                  or e.report_id is not null or e.data_request_id is not null)))
     or (c.relation = 'email_provider_events' and exists (
           select 1 from public.email_provider_events pe
           join public.email_events e on e.id = pe.email_event_id
           where pe.id = c.record_id
             and (e.assessment_id is not null or e.order_id is not null
                  or e.report_id is not null or e.data_request_id is not null)))
     or (c.relation = 'phase14_provider_attestations' and exists (
           select 1 from public.phase14_provider_attestations a
           where a.id = c.record_id
             and (exists (select 1 from public.report_delivery_authorizations d where d.id = a.authorization_id)
                  or exists (select 1 from public.email_events e
                             where e.id = a.email_event_id
                               and (e.assessment_id is not null or e.order_id is not null
                                    or e.report_id is not null or e.data_request_id is not null)))));
  if v_linked > 0 then
    raise exception 'rc1_orphan_remediation:candidate_still_linked';
  end if;

  if v_total > c_candidate_limit then
    raise exception 'rc1_orphan_remediation:candidate_limit_exceeded';
  end if;

  return jsonb_build_object(
    'counts', v_counts,
    'total', v_total,
    'fingerprint', v_fingerprint,
    'limit', c_candidate_limit,
    'classification', case when v_total = 0 then 'already_clean' else 'removable_orphans' end
  );
end;
$$;

revoke all on function public.rc1_prepare_orphan_remediation()
  from public, anon, authenticated, service_role;
grant execute on function public.rc1_prepare_orphan_remediation() to authenticated;

comment on function public.rc1_prepare_orphan_remediation() is
  'Measures provider rows that reference no surviving business record. Requires platform_admin at AAL2, explicit environment enablement and a RELEASED database. Returns counts, a deterministic fingerprint and a classification only -- never record ids, provider message ids, recipients or payloads. Removes nothing.';

-- ---------------------------------------------------------------------------
-- 4. Execute. Re-derives, re-proves, then removes.
-- ---------------------------------------------------------------------------
create or replace function public.rc1_execute_orphan_remediation(
  p_reason text,
  p_expected_fingerprint text,
  p_expected_total integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_candidate_limit constant integer := 50;
  v_actor jsonb;
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_reason_fingerprint text;
  v_enabled boolean;
  v_state text;
  v_total integer;
  v_fingerprint text;
  v_linked integer;
  v_freeze_epoch bigint;
  v_deleted integer;
  v_counts jsonb := '{}'::jsonb;
  v_email_ids uuid[];
  v_provider_ids uuid[];
  v_attestation_ids uuid[];
begin
  v_actor := public.rc1_require_platform_admin(true);

  if pg_catalog.char_length(v_reason) < 10 or pg_catalog.char_length(v_reason) > 500 then
    raise exception 'rc1_orphan_remediation:meaningful_reason_required';
  end if;
  if p_expected_fingerprint is null or p_expected_fingerprint !~ '^[0-9a-f]{64}$'
     or p_expected_total is null or p_expected_total < 0 then
    raise exception 'rc1_orphan_remediation:expected_result_required';
  end if;

  select coalesce((s.value_json->>'enabled')::boolean, false) into v_enabled
  from public.app_settings s where s.setting_key = 'rc1_orphan_remediation';
  if not coalesce(v_enabled, false) then
    raise exception 'rc1_orphan_remediation:not_enabled_in_this_environment';
  end if;

  select state into v_state from public.rc1_operation_freeze_state where singleton = true;
  if coalesce(v_state, '') <> 'RELEASED' then
    raise exception 'rc1_orphan_remediation:database_not_released';
  end if;

  -- Re-derive rather than trusting what prepare reported.
  select pg_catalog.count(*)::integer into v_total from public.rc1_orphan_remediation_candidates();
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        coalesce(pg_catalog.string_agg(relation || ':' || record_id::text, E'\n' order by relation, record_id), ''),
        'UTF8'), 'sha256'), 'hex')
  into v_fingerprint
  from public.rc1_orphan_remediation_candidates();

  if v_total <> p_expected_total then
    raise exception 'rc1_orphan_remediation:candidate_total_mismatch';
  end if;
  if v_fingerprint <> p_expected_fingerprint then
    raise exception 'rc1_orphan_remediation:candidate_fingerprint_mismatch';
  end if;
  if v_total > c_candidate_limit then
    raise exception 'rc1_orphan_remediation:candidate_limit_exceeded';
  end if;

  select pg_catalog.count(*)::integer into v_linked
  from public.rc1_orphan_remediation_candidates() c
  where (c.relation = 'email_events' and exists (
           select 1 from public.email_events e
           where e.id = c.record_id
             and (e.assessment_id is not null or e.order_id is not null
                  or e.report_id is not null or e.data_request_id is not null)))
     or (c.relation = 'email_provider_events' and exists (
           select 1 from public.email_provider_events pe
           join public.email_events e on e.id = pe.email_event_id
           where pe.id = c.record_id
             and (e.assessment_id is not null or e.order_id is not null
                  or e.report_id is not null or e.data_request_id is not null)))
     or (c.relation = 'phase14_provider_attestations' and exists (
           select 1 from public.phase14_provider_attestations a
           where a.id = c.record_id
             and (exists (select 1 from public.report_delivery_authorizations d where d.id = a.authorization_id)
                  or exists (select 1 from public.email_events e
                             where e.id = a.email_event_id
                               and (e.assessment_id is not null or e.order_id is not null
                                    or e.report_id is not null or e.data_request_id is not null)))));
  if v_linked > 0 then
    raise exception 'rc1_orphan_remediation:candidate_still_linked';
  end if;

  v_reason_fingerprint := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_reason, 'UTF8'), 'sha256'), 'hex');

  begin
    select freeze_epoch into v_freeze_epoch
    from public.rc1_operation_freeze_state where singleton = true;
  exception when others then
    v_freeze_epoch := null;
  end;

  -- Retry safety: an already-clean environment records the attempt and changes nothing.
  if v_total = 0 then
    insert into public.rc1_orphan_remediation_audit (
      reason_fingerprint, actor_fingerprint, freeze_epoch,
      candidate_fingerprint, candidate_total, deleted_counts
    ) values (
      v_reason_fingerprint, v_actor->>'actor_fingerprint', v_freeze_epoch,
      v_fingerprint, 0, jsonb_build_object('already_clean', true)
    );
    return jsonb_build_object('already_clean', true, 'total', 0, 'deleted', '{}'::jsonb);
  end if;

  select pg_catalog.array_agg(record_id) into v_email_ids
  from public.rc1_orphan_remediation_candidates() where relation = 'email_events';
  select pg_catalog.array_agg(record_id) into v_provider_ids
  from public.rc1_orphan_remediation_candidates() where relation = 'email_provider_events';
  select pg_catalog.array_agg(record_id) into v_attestation_ids
  from public.rc1_orphan_remediation_candidates() where relation = 'phase14_provider_attestations';
  v_email_ids := coalesce(v_email_ids, array[]::uuid[]);
  v_provider_ids := coalesce(v_provider_ids, array[]::uuid[]);
  v_attestation_ids := coalesce(v_attestation_ids, array[]::uuid[]);

  -- Dependency-safe order, in this single transaction: consumptions reference attestations,
  -- attestations and provider events reference email events.
  delete from public.phase14_provider_attestation_consumptions c
  where c.attestation_id = any(v_attestation_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('phase14_provider_attestation_consumptions', v_deleted);

  delete from public.phase14_provider_attestations a where a.id = any(v_attestation_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('phase14_provider_attestations', v_deleted);

  delete from public.email_provider_events pe where pe.id = any(v_provider_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('email_provider_events', v_deleted);

  delete from public.email_events e where e.id = any(v_email_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('email_events', v_deleted);

  insert into public.rc1_orphan_remediation_audit (
    reason_fingerprint, actor_fingerprint, freeze_epoch,
    candidate_fingerprint, candidate_total, deleted_counts
  ) values (
    v_reason_fingerprint, v_actor->>'actor_fingerprint', v_freeze_epoch,
    v_fingerprint, v_total, v_counts
  );

  return jsonb_build_object('already_clean', false, 'total', v_total, 'deleted', v_counts);
end;
$$;

revoke all on function public.rc1_execute_orphan_remediation(text,text,integer)
  from public, anon, authenticated, service_role;
grant execute on function public.rc1_execute_orphan_remediation(text,text,integer) to authenticated;

comment on function public.rc1_execute_orphan_remediation(text,text,integer) is
  'Removes provider rows that reference no surviving business record, after re-deriving the candidate set and proving it still matches the fingerprint and total returned by rc1_prepare_orphan_remediation. Requires platform_admin at AAL2, explicit environment enablement and a RELEASED database. Refuses on any linked candidate, count above the certification-sized bound, stale fingerprint or mismatched total. Audits counts and fingerprints only. Not a customer erasure facility.';

-- ---------------------------------------------------------------------------
-- 5. Freeze surface registration.
--
-- The real signature takes (p_schema, p_table). Defining a one-argument variant here would have
-- created a silent overload and left the function the guards actually call untouched, so the
-- accepted definition is reproduced verbatim with exactly one line added for the new audit table.
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
    when 'public.phase14_worker_capabilities' then 'worker'
    when 'public.phase14_worker_operations' then 'worker'
    when 'storage.objects' then 'storage_cleanup'
    when 'phase14_private.runtime_secrets' then 'activation_control'
    else null
  end;
$$;

commit;
