-- RC1: audited synthetic-certification cleanup.
--
-- Problem this solves
-- -------------------
-- Removing a completed synthetic certification journey was impossible through any sanctioned path.
-- guard_score_trace_write() (0006_phase6_scoring_guards.sql) refuses to delete score_question_traces
-- or maturity_cap_events while the parent score run is 'completed' or locked, and raises
-- 'Parent score run not found.' if the run is deleted first. Because those tables cascade from
-- score_runs, the guard fires *during* the cascade, so no ordering works. RC1 staging cleanup
-- therefore had to fall back to `set session_replication_role = replica`, which disables every
-- trigger and foreign-key check in the session -- far too blunt an instrument to keep.
--
-- This migration adds a narrow, audited, fail-closed alternative and removes the need for that
-- fallback. It does NOT weaken the immutable-score controls for ordinary records: the guard's
-- new allowance requires both an authorised in-transaction marker set only by the cleanup
-- function, and independent proof that the row being deleted belongs to a synthetic journey.
-- A leaked marker alone cannot remove real customer data.
--
-- Deliberate scope limits
-- -----------------------
--   * Only references matching MKTEST-RC1-<yyyymmdd>-<nn> are accepted.
--   * The mechanism is inert unless app_settings holds an explicit enabling row, which this
--     migration does not insert. It is therefore disabled in every environment on arrival, and
--     Production stays disabled unless a separate, deliberate authority is designed for it.
--   * platform_admin plus AAL2 is required, matching the RC1 control plane.
--   * Migration ledger, methodology, products, templates and configuration are never touched.
--
-- This function addresses synthetic certification data only. It is NOT a customer erasure
-- facility: the completed-score immutability conflict for real assessments remains an open
-- Production privacy-design item and is documented as such.

begin;

-- ---------------------------------------------------------------------------
-- 1. Synthetic provenance marker.
-- ---------------------------------------------------------------------------
alter table public.organisations
  add column if not exists synthetic_certification_ref text;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'organisations_synthetic_certification_ref_check'
  ) then
    alter table public.organisations
      add constraint organisations_synthetic_certification_ref_check
      check (
        synthetic_certification_ref is null
        or synthetic_certification_ref ~ '^MKTEST-RC1-[0-9]{8}-[0-9]{2}$'
      );
  end if;
end;
$$;

create index if not exists organisations_synthetic_certification_ref_idx
  on public.organisations (synthetic_certification_ref)
  where synthetic_certification_ref is not null;

comment on column public.organisations.synthetic_certification_ref is
  'Non-null only for synthetic RC1 certification journeys (MKTEST-RC1-<yyyymmdd>-<nn>). Real customer organisations must always be null.';

-- ---------------------------------------------------------------------------
-- 2. Audit trail (non-sensitive).
-- ---------------------------------------------------------------------------
create table if not exists public.rc1_synthetic_cleanup_audit (
  id uuid primary key default gen_random_uuid(),
  synthetic_reference text not null,
  reason_fingerprint text not null,
  actor_fingerprint text not null,
  freeze_epoch bigint,
  deleted_counts jsonb not null,
  executed_at timestamptz not null default now(),
  constraint rc1_synthetic_cleanup_audit_reference_check
    check (synthetic_reference ~ '^MKTEST-RC1-[0-9]{8}-[0-9]{2}$'),
  constraint rc1_synthetic_cleanup_audit_reason_fingerprint_check
    check (reason_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint rc1_synthetic_cleanup_audit_actor_fingerprint_check
    check (actor_fingerprint ~ '^[0-9a-f]{64}$')
);

comment on table public.rc1_synthetic_cleanup_audit is
  'Audit of synthetic certification cleanups. Stores fingerprints and row counts only -- never the reason text, operator identity, customer data or report content.';

alter table public.rc1_synthetic_cleanup_audit enable row level security;
revoke all on table public.rc1_synthetic_cleanup_audit from public, anon, authenticated;
grant select, insert on table public.rc1_synthetic_cleanup_audit to service_role;

-- ---------------------------------------------------------------------------
-- 3. Register both RC1 relations on freeze surfaces.
-- ---------------------------------------------------------------------------
-- rc1_install_new_relation_guards attaches the freeze guard to every new table, and that guard
-- raises 'unknown_surface' for an unmapped relation, so a new table is unwritable until mapped.
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
    when 'public.phase14_worker_capabilities' then 'worker'
    when 'public.phase14_worker_operations' then 'worker'
    when 'storage.objects' then 'storage_cleanup'
    when 'phase14_private.runtime_secrets' then 'activation_control'
    else null
  end;
$$;

revoke all on function public.rc1_surface_for_relation(text,text)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Narrow, provenance-checked allowance in the score-trace immutability guard.
-- ---------------------------------------------------------------------------
-- The original behaviour is preserved exactly for every ordinary record. The only new path is a
-- DELETE that is simultaneously (a) inside a transaction the cleanup function marked, and (b)
-- provably attached to an organisation carrying a synthetic certification reference. Both
-- conditions are required, so setting the marker by hand cannot reach real data.
create or replace function public.guard_score_trace_write()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  parent_status public.score_run_status;
  parent_locked_at timestamptz;
  v_cleanup_ref text;
  v_synthetic_ref text;
begin
  select status, locked_at into parent_status, parent_locked_at
  from public.score_runs
  where id = coalesce(new.score_run_id, old.score_run_id);

  if parent_status is null then
    raise exception 'Parent score run not found.';
  end if;

  if tg_op = 'DELETE' then
    v_cleanup_ref := pg_catalog.current_setting('rc1.synthetic_cleanup_ref', true);
    if v_cleanup_ref is not null and v_cleanup_ref <> '' then
      select o.synthetic_certification_ref into v_synthetic_ref
      from public.score_runs sr
      join public.assessments a on a.id = sr.assessment_id
      join public.organisations o on o.id = a.organisation_id
      where sr.id = old.score_run_id;

      if v_synthetic_ref is not null and v_synthetic_ref = v_cleanup_ref then
        return old;
      end if;
    end if;
  end if;

  if parent_status = 'completed' or parent_locked_at is not null then
    raise exception 'Score traces and cap events cannot be changed after score run completion.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. The audited cleanup itself.
-- ---------------------------------------------------------------------------
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
  v_freeze_epoch bigint;
begin
  -- Authority: platform admin at AAL2, exactly as the RC1 control plane requires.
  v_actor := public.rc1_require_platform_admin(true);

  if p_reference is null or p_reference !~ '^MKTEST-RC1-[0-9]{8}-[0-9]{2}$' then
    raise exception 'rc1_synthetic_cleanup:reference_not_synthetic';
  end if;
  if pg_catalog.char_length(v_reason) < 10 or pg_catalog.char_length(v_reason) > 500 then
    raise exception 'rc1_synthetic_cleanup:meaningful_reason_required';
  end if;

  -- Fail closed unless this environment has been explicitly enabled. The migration never inserts
  -- this row, so the mechanism is inert on arrival everywhere, Production included.
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

  -- Exact successful retry: a completed cleanup leaves nothing to resolve, and repeating it is a
  -- recorded no-op rather than an error.
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

  -- Authorise the score-trace guard for this transaction only. Transaction-local (is_local = true)
  -- so it cannot leak into another statement or session.
  perform pg_catalog.set_config('rc1.synthetic_cleanup_ref', p_reference, true);

  -- Storage objects backing synthetic reports, then the tokens that grant access to them.
  delete from storage.objects so
  using public.reports r
  where r.id = any(v_report_ids)
    and so.bucket_id = r.storage_bucket
    and so.name = r.storage_path;
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('storage_objects', v_deleted);

  delete from public.customer_report_access_tokens t where t.report_id = any(v_report_ids);
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('customer_report_access_tokens', v_deleted);

  delete from public.email_provider_events e
  where e.email_event_id in (select id from public.email_events where assessment_id = any(v_assessment_ids));
  get diagnostics v_deleted = row_count;
  v_counts := v_counts || jsonb_build_object('email_provider_events', v_deleted);

  -- report_delivery_authorizations is referenced with ON DELETE RESTRICT by delivery
  -- finalizations, provider attestations and their consumptions, and by the generation attempt's
  -- automatic_delivery_authorization_id. All of those must go first or the authorization delete
  -- below fails on a foreign-key restriction.
  select pg_catalog.array_agg(d.id) into v_authorization_ids
  from public.report_delivery_authorizations d where d.assessment_id = any(v_assessment_ids);
  v_authorization_ids := coalesce(v_authorization_ids, array[]::uuid[]);

  delete from public.report_delivery_finalizations f where f.authorization_id = any(v_authorization_ids);
  delete from public.phase14_provider_attestation_consumptions c where c.authorization_id = any(v_authorization_ids);
  delete from public.phase14_provider_attestations a where a.authorization_id = any(v_authorization_ids);

  delete from public.manual_report_delivery_attempts d
  where d.order_id = any(v_order_ids);
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

  -- Score closure. The traces and cap events are removed first, while their parent run still
  -- exists, so the guard can prove synthetic provenance before allowing each delete.
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
  'Audited removal of a single MKTEST-RC1- synthetic certification journey. Requires platform_admin at AAL2 and an explicit app_settings enablement row; refuses any non-synthetic reference. Not a customer erasure facility.';

commit;
