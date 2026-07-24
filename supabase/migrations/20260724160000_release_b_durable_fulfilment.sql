-- MK Fraud Readiness Platform - Release B: durable fulfilment.
--
-- Follows docs/safe-launch/12-durable-fulfilment-design.md. Extends (does not replace)
-- public.manual_report_generation_attempts with lease/heartbeat/backoff columns and a
-- quality-review gate, per the audit gate outcome in
-- docs/safe-launch/11-release-b-existing-infrastructure-audit.md ("extend, do not
-- resurrect report_generation_claims"). Additive only: the 5 existing status values, the
-- 4 existing trigger_source values (admin_generate/admin_retry/admin_regenerate from 0023,
-- payment_confirmation from 0024) and every existing column/constraint are left untouched.
--
-- IMPORTANT IMPLEMENTATION NOTE -- read before touching this file again:
-- The design doc's "worker execution model" describes claim_next_fulfilment_job() as
-- setting status = 'REPORT_GENERATING' directly. Tracing the actual call graph shows this
-- is not achievable while also satisfying "call the existing generateManualPhase1Report()
-- unmodified": that function performs its OWN claim (via claim_payment_report_generation /
-- claim_manual_report_generation, both from 0023/0024) immediately followed by
-- start_manual_report_generation(), which requires status = 'REPORT_QUEUED' and performs
-- the REPORT_QUEUED -> REPORT_GENERATING transition itself. A job already sitting in
-- REPORT_GENERATING when generateManualPhase1Report() is called would make its internal
-- claim RPC refuse (idempotent_replay / already_active), and would make
-- start_manual_report_generation() raise phase1_generation_attempt_not_queued.
--
-- Resolution implemented here (see design deviation note in the accompanying report):
--   1. claim_next_fulfilment_job() normalises the row to status = 'REPORT_QUEUED' (so
--      RETRY_SCHEDULED rows become claimable by the unmodified start_manual_report_
--      generation()) and enforces single-claim concurrency via lease_expires_at, not via
--      status -- a row is eligible only while its status is REPORT_QUEUED/RETRY_SCHEDULED
--      AND its lease is null or expired. This preserves "second concurrent claim gets
--      nothing" without needing a status value start_manual_report_generation() cannot see.
--   2. claim_payment_report_generation() (0024) is redefined via CREATE OR REPLACE (this
--      file does not edit 0024_phase23_payment_automation.sql) with one additive branch:
--      when its request_key lookup finds a pre-existing row that is REPORT_QUEUED *and*
--      already lease-owned (i.e. a durable job claim_next_fulfilment_job() just claimed),
--      it hands that row back as claimed=true instead of refusing it as a duplicate. Every
--      other branch (the genuine duplicate-click case, where lease_owner is null) is
--      unchanged. The worker always invokes generateManualPhase1Report() with
--      action: 'payment_confirmation' and the claimed row's own request_key, for every
--      trigger_source it may be processing (payment_confirmed, quality_rejected_regenerate,
--      or an admin-queued retry) -- action is a fixed 4-value union in
--      src/lib/reports/phase1-manual-fulfilment.ts that this migration cannot extend, and
--      'payment_confirmation' is the one existing value that requires no human actor.
--   3. submit_for_quality_review() checks status = 'REPORT_READY' (the status
--      complete_manual_report_generation() -- itself unmodified -- actually leaves the row
--      in once generateManualPhase1Report() returns successfully), not REPORT_GENERATING.
-- None of complete_manual_report_generation(), start_manual_report_generation(),
-- fail_manual_report_generation() or render-pdf.ts/assertValidPdf() are edited.

begin;

-- ---------------------------------------------------------------------------
-- 1. Schema: lease/heartbeat/backoff + quality-review columns.
-- ---------------------------------------------------------------------------

alter table public.manual_report_generation_attempts
  add column if not exists lease_owner text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists heartbeat_at timestamptz,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists max_attempts integer not null default 5,
  add column if not exists quality_reviewed_by uuid references public.admin_profiles(id) on delete set null,
  add column if not exists quality_reviewed_at timestamptz,
  add column if not exists quality_review_decision text,
  add column if not exists quality_review_reason text,
  add column if not exists regenerated_from_attempt_id uuid references public.manual_report_generation_attempts(id) on delete set null,
  add column if not exists delivery_queued_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'manual_report_generation_attempts_max_attempts_chk') then
    alter table public.manual_report_generation_attempts add constraint manual_report_generation_attempts_max_attempts_chk
      check (max_attempts > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'manual_report_generation_attempts_quality_decision_chk') then
    alter table public.manual_report_generation_attempts add constraint manual_report_generation_attempts_quality_decision_chk
      check (quality_review_decision is null or quality_review_decision in ('approved', 'rejected'));
  end if;
end $$;

-- Additive: keep every existing status value, add the four Release B values.
alter table public.manual_report_generation_attempts
  drop constraint if exists manual_report_generation_attempts_status_check;
alter table public.manual_report_generation_attempts
  add constraint manual_report_generation_attempts_status_check
  check (status in (
    'NOT_REQUESTED', 'REPORT_QUEUED', 'REPORT_GENERATING', 'REPORT_READY', 'GENERATION_FAILED',
    'AWAITING_QUALITY_REVIEW', 'DELIVERY_QUEUED', 'RETRY_SCHEDULED', 'MANUAL_REVIEW_REQUIRED'
  ));

-- Additive: keep every existing trigger_source value (0023's original three plus 0024's
-- payment_confirmation), add the two Release B values.
alter table public.manual_report_generation_attempts
  drop constraint if exists manual_report_generation_attempts_trigger_source_check;
alter table public.manual_report_generation_attempts
  add constraint manual_report_generation_attempts_trigger_source_check
  check (trigger_source in (
    'admin_generate', 'admin_retry', 'admin_regenerate', 'payment_confirmation',
    'payment_confirmed', 'quality_rejected_regenerate'
  ));

create index if not exists manual_report_generation_attempts_status_next_attempt_idx
  on public.manual_report_generation_attempts(status, next_attempt_at);
create index if not exists manual_report_generation_attempts_lease_expiry_idx
  on public.manual_report_generation_attempts(lease_expires_at)
  where status = 'REPORT_GENERATING';

-- ---------------------------------------------------------------------------
-- 2. Worker RPCs (service_role only -- called by the internal worker route, which is
--    itself Bearer-token authenticated, not per-user).
-- ---------------------------------------------------------------------------

create or replace function public.claim_next_fulfilment_job(
  p_lease_owner text,
  p_lease_seconds integer default 300
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.manual_report_generation_attempts%rowtype;
begin
  if coalesce(trim(p_lease_owner), '') = '' then
    raise exception 'fulfilment_lease_owner_required';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 3600 then
    raise exception 'fulfilment_lease_seconds_out_of_range';
  end if;

  select * into v_job
  from public.manual_report_generation_attempts
  where status in ('REPORT_QUEUED', 'RETRY_SCHEDULED')
    and (next_attempt_at is null or next_attempt_at <= now())
    and (lease_expires_at is null or lease_expires_at <= now())
  order by requested_at asc
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.manual_report_generation_attempts
  set status = 'REPORT_QUEUED',
      lease_owner = p_lease_owner,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      heartbeat_at = now(),
      started_at = coalesce(started_at, now()),
      next_attempt_at = null,
      updated_at = now()
  where id = v_job.id
  returning * into v_job;

  insert into public.audit_logs(actor_type, entity_table, entity_id, action, after_json)
  values ('system', 'manual_report_generation_attempts', v_job.id, 'fulfilment_job_claimed', to_jsonb(v_job));

  return to_jsonb(v_job);
end;
$$;

create or replace function public.fail_fulfilment_job(
  p_attempt_id uuid,
  p_lease_owner text,
  p_error_category text,
  p_safe_operational_error text,
  p_technical_reference text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.manual_report_generation_attempts%rowtype;
  v_after public.manual_report_generation_attempts%rowtype;
  v_next_status text;
  v_retry integer;
begin
  select * into v_before from public.manual_report_generation_attempts where id = p_attempt_id for update;
  if not found then
    raise exception 'fulfilment_job_not_found';
  end if;
  if v_before.lease_owner is null or v_before.lease_owner <> p_lease_owner then
    raise exception 'fulfilment_lease_not_held';
  end if;

  v_retry := v_before.retry_count + 1;
  v_next_status := case when v_retry < v_before.max_attempts then 'RETRY_SCHEDULED' else 'MANUAL_REVIEW_REQUIRED' end;

  update public.manual_report_generation_attempts
  set status = v_next_status,
      retry_count = v_retry,
      error_category = left(coalesce(p_error_category, 'generation_failed'), 80),
      safe_operational_error = left(coalesce(p_safe_operational_error, 'Report generation failed.'), 500),
      technical_reference = coalesce(nullif(trim(p_technical_reference), ''), technical_reference),
      next_attempt_at = case when v_next_status = 'RETRY_SCHEDULED'
        then now() + make_interval(secs => least(3600, 30 * (2 ^ least(v_retry, 7))::integer))
        else null end,
      lease_owner = null, lease_expires_at = null, heartbeat_at = null,
      completed_at = case when v_next_status = 'MANUAL_REVIEW_REQUIRED' then now() else completed_at end,
      updated_at = now()
  where id = p_attempt_id
  returning * into v_after;

  insert into public.audit_logs(actor_type, entity_table, entity_id, action, before_json, after_json)
  values ('system', 'manual_report_generation_attempts', v_after.id, 'fulfilment_job_failed', to_jsonb(v_before), to_jsonb(v_after));

  return to_jsonb(v_after);
end;
$$;

create or replace function public.submit_for_quality_review(
  p_attempt_id uuid,
  p_lease_owner text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.manual_report_generation_attempts%rowtype;
  v_after public.manual_report_generation_attempts%rowtype;
begin
  select * into v_before from public.manual_report_generation_attempts where id = p_attempt_id for update;
  if not found then
    raise exception 'fulfilment_job_not_found';
  end if;
  if v_before.lease_owner is null or v_before.lease_owner <> p_lease_owner then
    raise exception 'fulfilment_lease_not_held';
  end if;
  -- See header note: complete_manual_report_generation() (unmodified, 0023/20260721150808)
  -- leaves the row at REPORT_READY, not REPORT_GENERATING, once the PDF is verified+linked.
  if v_before.status <> 'REPORT_READY' or v_before.output_report_id is null then
    raise exception 'fulfilment_job_not_ready_for_review';
  end if;

  update public.manual_report_generation_attempts
  set status = 'AWAITING_QUALITY_REVIEW',
      completed_at = coalesce(completed_at, now()),
      lease_owner = null, lease_expires_at = null, heartbeat_at = null,
      updated_at = now()
  where id = p_attempt_id
  returning * into v_after;

  insert into public.audit_logs(actor_type, entity_table, entity_id, action, before_json, after_json)
  values ('system', 'manual_report_generation_attempts', v_after.id, 'quality_review_submitted', to_jsonb(v_before), to_jsonb(v_after));

  return to_jsonb(v_after);
end;
$$;

create or replace function public.recover_expired_fulfilment_leases()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.manual_report_generation_attempts%rowtype;
  v_count integer := 0;
begin
  for v_row in
    select * from public.manual_report_generation_attempts
    where status = 'REPORT_GENERATING' and lease_expires_at is not null and lease_expires_at < now()
    for update skip locked
  loop
    update public.manual_report_generation_attempts
    set status = 'RETRY_SCHEDULED',
        next_attempt_at = now(),
        lease_owner = null, lease_expires_at = null, heartbeat_at = null,
        updated_at = now()
    where id = v_row.id;

    insert into public.audit_logs(actor_type, entity_table, entity_id, action, before_json)
    values ('system', 'manual_report_generation_attempts', v_row.id, 'fulfilment_lease_recovered', to_jsonb(v_row));

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.claim_next_fulfilment_job(text, integer) from public, anon, authenticated;
grant execute on function public.claim_next_fulfilment_job(text, integer) to service_role;

revoke all on function public.fail_fulfilment_job(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.fail_fulfilment_job(uuid, text, text, text, text) to service_role;

revoke all on function public.submit_for_quality_review(uuid, text) from public, anon, authenticated;
grant execute on function public.submit_for_quality_review(uuid, text) to service_role;

revoke all on function public.recover_expired_fulfilment_leases() from public, anon, authenticated;
grant execute on function public.recover_expired_fulfilment_leases() to service_role;

-- ---------------------------------------------------------------------------
-- 3. Admin RPCs (authenticated, actor/role re-checked inside the function body).
-- ---------------------------------------------------------------------------

create or replace function public.approve_quality_review(
  p_attempt_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor public.admin_profiles%rowtype;
  v_note text := trim(coalesce(p_reason, ''));
  v_before public.manual_report_generation_attempts%rowtype;
  v_after public.manual_report_generation_attempts%rowtype;
begin
  if v_actor_id is null then
    raise exception 'fulfilment_quality_review_no_session';
  end if;
  select * into v_actor from public.admin_profiles where id = v_actor_id and status = 'active';
  if not found or v_actor.role not in ('platform_admin', 'reviewer', 'approver') then
    raise exception 'fulfilment_quality_review_role_forbidden';
  end if;
  if length(v_note) < 5 then
    raise exception 'fulfilment_quality_review_reason_too_short';
  end if;

  select * into v_before from public.manual_report_generation_attempts where id = p_attempt_id for update;
  if not found or v_before.status <> 'AWAITING_QUALITY_REVIEW' then
    raise exception 'fulfilment_quality_review_invalid_state';
  end if;

  update public.manual_report_generation_attempts
  set status = 'DELIVERY_QUEUED',
      quality_reviewed_by = v_actor_id,
      quality_reviewed_at = now(),
      quality_review_decision = 'approved',
      quality_review_reason = v_note,
      delivery_queued_at = now(),
      updated_at = now()
  where id = p_attempt_id
  returning * into v_after;

  insert into public.audit_logs(actor_type, actor_user_id, entity_table, entity_id, action, before_json, after_json)
  values ('admin', v_actor_id, 'manual_report_generation_attempts', v_after.id, 'quality_review_approved', to_jsonb(v_before), to_jsonb(v_after));

  return to_jsonb(v_after);
end;
$$;

create or replace function public.reject_quality_review(
  p_attempt_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor public.admin_profiles%rowtype;
  v_note text := trim(coalesce(p_reason, ''));
  v_before public.manual_report_generation_attempts%rowtype;
  v_after public.manual_report_generation_attempts%rowtype;
  v_new public.manual_report_generation_attempts%rowtype;
  v_version integer;
  v_request_key text;
begin
  if v_actor_id is null then
    raise exception 'fulfilment_quality_review_no_session';
  end if;
  select * into v_actor from public.admin_profiles where id = v_actor_id and status = 'active';
  if not found or v_actor.role not in ('platform_admin', 'reviewer', 'approver') then
    raise exception 'fulfilment_quality_review_role_forbidden';
  end if;
  if length(v_note) < 5 then
    raise exception 'fulfilment_quality_review_reason_too_short';
  end if;

  select * into v_before from public.manual_report_generation_attempts where id = p_attempt_id for update;
  if not found or v_before.status <> 'AWAITING_QUALITY_REVIEW' then
    raise exception 'fulfilment_quality_review_invalid_state';
  end if;

  update public.manual_report_generation_attempts
  set status = 'GENERATION_FAILED',
      quality_reviewed_by = v_actor_id,
      quality_reviewed_at = now(),
      quality_review_decision = 'rejected',
      quality_review_reason = v_note,
      updated_at = now()
  where id = p_attempt_id
  returning * into v_after;

  select coalesce(max(version_number), 0) + 1 into v_version
  from public.reports where order_id = v_before.order_id;

  v_request_key := 'quality_rejected_regenerate:' || v_before.id::text || ':' || gen_random_uuid()::text;

  insert into public.manual_report_generation_attempts (
    request_key, order_id, report_version, trigger_source, requested_by, status,
    retry_count, technical_reference, regenerated_from_attempt_id
  ) values (
    v_request_key, v_before.order_id, v_version, 'quality_rejected_regenerate', v_actor_id, 'REPORT_QUEUED',
    0, 'qc-regen:' || gen_random_uuid()::text, v_before.id
  ) returning * into v_new;

  insert into public.audit_logs(actor_type, actor_user_id, entity_table, entity_id, action, before_json, after_json)
  values
    ('admin', v_actor_id, 'manual_report_generation_attempts', v_after.id, 'quality_review_rejected', to_jsonb(v_before), to_jsonb(v_after)),
    ('admin', v_actor_id, 'manual_report_generation_attempts', v_new.id, 'fulfilment_job_requeued', null, to_jsonb(v_new));

  return jsonb_build_object('rejected_attempt', to_jsonb(v_after), 'regenerated_attempt', to_jsonb(v_new));
end;
$$;

create or replace function public.retry_fulfilment_job(
  p_attempt_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor public.admin_profiles%rowtype;
  v_before public.manual_report_generation_attempts%rowtype;
  v_after public.manual_report_generation_attempts%rowtype;
begin
  if v_actor_id is null then
    raise exception 'fulfilment_retry_no_session';
  end if;
  select * into v_actor from public.admin_profiles where id = v_actor_id and status = 'active';
  if not found or v_actor.role not in ('platform_admin', 'finance_admin') then
    raise exception 'fulfilment_retry_role_forbidden';
  end if;

  select * into v_before from public.manual_report_generation_attempts where id = p_attempt_id for update;
  if not found or v_before.status not in ('MANUAL_REVIEW_REQUIRED', 'GENERATION_FAILED') then
    raise exception 'fulfilment_retry_invalid_state';
  end if;

  update public.manual_report_generation_attempts
  set status = 'REPORT_QUEUED',
      retry_count = 0,
      lease_owner = null, lease_expires_at = null, heartbeat_at = null,
      next_attempt_at = null,
      error_category = null, safe_operational_error = null,
      updated_at = now()
  where id = p_attempt_id
  returning * into v_after;

  insert into public.audit_logs(actor_type, actor_user_id, entity_table, entity_id, action, before_json, after_json)
  values ('admin', v_actor_id, 'manual_report_generation_attempts', v_after.id, 'fulfilment_job_retried', to_jsonb(v_before), to_jsonb(v_after));

  return to_jsonb(v_after);
end;
$$;

create or replace function public.recover_fulfilment_job(
  p_attempt_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor public.admin_profiles%rowtype;
  v_before public.manual_report_generation_attempts%rowtype;
  v_after public.manual_report_generation_attempts%rowtype;
begin
  if v_actor_id is null then
    raise exception 'fulfilment_recover_no_session';
  end if;
  select * into v_actor from public.admin_profiles where id = v_actor_id and status = 'active';
  if not found or v_actor.role not in ('platform_admin', 'finance_admin') then
    raise exception 'fulfilment_recover_role_forbidden';
  end if;

  select * into v_before from public.manual_report_generation_attempts where id = p_attempt_id for update;
  if not found or v_before.status <> 'REPORT_GENERATING' then
    raise exception 'fulfilment_recover_invalid_state';
  end if;

  update public.manual_report_generation_attempts
  set status = 'RETRY_SCHEDULED',
      next_attempt_at = now(),
      lease_owner = null, lease_expires_at = null, heartbeat_at = null,
      updated_at = now()
  where id = p_attempt_id
  returning * into v_after;

  insert into public.audit_logs(actor_type, actor_user_id, entity_table, entity_id, action, before_json, after_json)
  values ('admin', v_actor_id, 'manual_report_generation_attempts', v_after.id, 'fulfilment_job_admin_recovered', to_jsonb(v_before), to_jsonb(v_after));

  return to_jsonb(v_after);
end;
$$;

revoke all on function public.approve_quality_review(uuid, text) from public, anon, authenticated;
grant execute on function public.approve_quality_review(uuid, text) to authenticated;

revoke all on function public.reject_quality_review(uuid, text) from public, anon, authenticated;
grant execute on function public.reject_quality_review(uuid, text) to authenticated;

revoke all on function public.retry_fulfilment_job(uuid) from public, anon, authenticated;
grant execute on function public.retry_fulfilment_job(uuid) to authenticated;

revoke all on function public.recover_fulfilment_job(uuid) from public, anon, authenticated;
grant execute on function public.recover_fulfilment_job(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Redefine claim_payment_report_generation (0024) via CREATE OR REPLACE.
--    0024_phase23_payment_automation.sql is not edited. Full existing body reproduced
--    faithfully; the only new logic is the additive branch marked below.
-- ---------------------------------------------------------------------------

create or replace function public.claim_payment_report_generation(
  p_order_reference text, p_request_key text, p_technical_reference text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order public.orders%rowtype;
  v_assessment public.assessments%rowtype;
  v_score public.score_runs%rowtype;
  v_payment public.payment_automation_records%rowtype;
  v_existing public.manual_report_generation_attempts%rowtype;
  v_active public.manual_report_generation_attempts%rowtype;
  v_ready public.reports%rowtype;
  v_attempt public.manual_report_generation_attempts%rowtype;
  v_version integer;
begin
  select * into v_existing from public.manual_report_generation_attempts where request_key = p_request_key;
  if found then
    -- Release B additive branch: a durable fulfilment job that claim_next_fulfilment_job()
    -- has already leased (queued by the extended record_payment_transition(), or requeued
    -- by retry_fulfilment_job() / reject_quality_review()) is not a duplicate submission --
    -- it is the same job the worker is now executing. Hand it back as claimed=true so
    -- generateManualPhase1Report() proceeds to start_manual_report_generation() on this row,
    -- instead of refusing it as a double-submit. A row with lease_owner null (the original,
    -- pre-Release-B case: a genuine duplicate admin/webhook request) falls through to the
    -- unchanged idempotent_replay behaviour below.
    if v_existing.status = 'REPORT_QUEUED' and v_existing.lease_owner is not null then
      return jsonb_build_object('claimed', true, 'reason', 'worker_lease_resumed', 'attempt', to_jsonb(v_existing));
    end if;
    return jsonb_build_object('claimed', false, 'reason', 'idempotent_replay', 'attempt', to_jsonb(v_existing));
  end if;
  select * into v_order from public.orders where order_reference = p_order_reference for update;
  if not found then raise exception 'phase1_order_not_found'; end if;
  select * into v_payment from public.payment_automation_records where order_id = v_order.id;
  if not found or v_payment.state <> 'PAID' or v_order.status::text <> 'payment_received' then raise exception 'phase1_order_not_eligible'; end if;
  select * into v_assessment from public.assessments where id = v_order.assessment_id;
  if not found or v_assessment.current_score_run_id is null or v_assessment.status not in ('scored', 'snapshot_available', 'report_requested', 'under_review', 'closed') then raise exception 'phase1_assessment_incomplete'; end if;
  select * into v_score from public.score_runs where id = v_assessment.current_score_run_id and status = 'completed';
  if not found or v_score.locked_at is null then raise exception 'phase1_assessment_incomplete'; end if;
  select * into v_active from public.manual_report_generation_attempts
    where order_id = v_order.id and status in ('REPORT_QUEUED', 'REPORT_GENERATING') limit 1;
  if found then return jsonb_build_object('claimed', false, 'reason', 'already_active', 'attempt', to_jsonb(v_active)); end if;
  select * into v_ready from public.reports where order_id = v_order.id and storage_status = 'VERIFIED'
    and status not in ('superseded', 'voided') order by version_number desc limit 1;
  if found then return jsonb_build_object('claimed', false, 'reason', 'report_exists', 'report', to_jsonb(v_ready)); end if;
  select coalesce(max(version_number), 0) + 1 into v_version from public.reports where order_id = v_order.id;
  insert into public.manual_report_generation_attempts(
    request_key, order_id, report_version, trigger_source, requested_by, status, retry_count, technical_reference
  ) values (p_request_key, v_order.id, v_version, 'payment_confirmation', null, 'REPORT_QUEUED', 0, p_technical_reference)
  returning * into v_attempt;
  insert into public.order_events(order_id, event_type, note, metadata_json)
  values (v_order.id, 'generation_requested', 'Verified payment queued deterministic Phase 1 generation.',
    jsonb_build_object('attempt_id', v_attempt.id, 'source', 'payment_confirmation', 'technical_reference', p_technical_reference));
  return jsonb_build_object('claimed', true, 'reason', 'claimed', 'attempt', to_jsonb(v_attempt));
end $$;

-- Signature is unchanged from 0024, so the existing grant below is sufficient, but it is
-- repeated here for clarity and to be safe against grant drift.
revoke all on function public.claim_payment_report_generation(text, text, text) from public, anon, authenticated;
grant execute on function public.claim_payment_report_generation(text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Redefine record_payment_transition (0024) via CREATE OR REPLACE.
--    0024_phase23_payment_automation.sql is not edited. Full existing body reproduced
--    faithfully; the only new logic is the additive block marked below, which folds
--    fulfilment job-row creation into the same transaction as the payment state
--    transition (closes the Q6 atomicity gap in the audit).
-- ---------------------------------------------------------------------------

create or replace function public.record_payment_transition(
  p_order_reference text,
  p_new_state text,
  p_source text,
  p_actor_reference text,
  p_amount_cents integer,
  p_currency text,
  p_provider_transaction_reference text,
  p_provider_event_reference text,
  p_provider_event_at timestamptz,
  p_safe_note text,
  p_verification_result text,
  p_idempotency_key text,
  p_technical_reference text,
  p_payload_sha256 text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_record public.payment_automation_records%rowtype;
  v_existing public.payment_transition_events%rowtype;
  v_old_state text;
  v_allowed boolean := false;
  v_event public.payment_transition_events%rowtype;
  v_job_id uuid;
  v_job_version integer;
  v_job_request_key text;
  v_fulfilment_result text := 'not_requested';
begin
  if p_new_state not in ('PAYMENT_PENDING', 'PAYMENT_PROCESSING', 'PAID', 'PAYMENT_FAILED', 'PAYMENT_REVIEW_REQUIRED', 'REFUNDED', 'CANCELLED')
     or p_source not in ('manual_admin', 'stitch_webhook', 'system_recovery')
     or coalesce(trim(p_idempotency_key), '') = ''
     or coalesce(trim(p_technical_reference), '') = '' then
    raise exception 'payment_transition_invalid_input';
  end if;

  select * into v_existing from public.payment_transition_events where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('applied', false, 'duplicate', true, 'state', v_existing.new_state, 'event_id', v_existing.id);
  end if;

  select * into v_order from public.orders where order_reference = p_order_reference for update;
  if not found then raise exception 'payment_order_not_found'; end if;

  insert into public.payment_automation_records(order_id, state, expected_amount_cents, currency)
  values (v_order.id,
    case when v_order.status::text = 'payment_received' then 'PAID'
         when v_order.status::text in ('cancelled', 'expired') then 'CANCELLED'
         else 'PAYMENT_PENDING' end,
    v_order.amount_cents, v_order.currency)
  on conflict(order_id) do nothing;

  select * into v_record from public.payment_automation_records where order_id = v_order.id for update;
  v_old_state := v_record.state;

  if v_old_state = p_new_state then
    select * into v_existing from public.payment_transition_events
      where order_id = v_order.id and new_state = p_new_state order by created_at desc limit 1;
    return jsonb_build_object('applied', false, 'duplicate', true, 'state', p_new_state, 'event_id', v_existing.id);
  elsif v_old_state = 'PAYMENT_PENDING' and p_new_state in ('PAYMENT_PROCESSING', 'PAID', 'PAYMENT_FAILED', 'PAYMENT_REVIEW_REQUIRED', 'CANCELLED') then v_allowed := true;
  elsif v_old_state = 'PAYMENT_PROCESSING' and p_new_state in ('PAID', 'PAYMENT_FAILED', 'PAYMENT_REVIEW_REQUIRED', 'CANCELLED') then v_allowed := true;
  elsif v_old_state = 'PAYMENT_FAILED' and p_new_state in ('PAYMENT_PROCESSING', 'PAYMENT_REVIEW_REQUIRED', 'CANCELLED') then v_allowed := true;
  elsif v_old_state = 'PAYMENT_REVIEW_REQUIRED' and p_new_state in ('PAYMENT_PROCESSING', 'PAID', 'PAYMENT_FAILED', 'REFUNDED', 'CANCELLED') then v_allowed := true;
  elsif v_old_state = 'PAID' and p_new_state in ('PAYMENT_REVIEW_REQUIRED', 'REFUNDED') then v_allowed := true;
  end if;
  if not v_allowed then raise exception 'payment_transition_not_allowed:%->%', v_old_state, p_new_state; end if;

  insert into public.payment_transition_events(
    order_id, order_reference, old_state, new_state, source, actor_reference, amount_cents, currency,
    provider_transaction_reference, provider_event_reference, provider_event_at, safe_note,
    verification_result, idempotency_key, technical_reference, payload_sha256
  ) values (
    v_order.id, v_order.order_reference, v_old_state, p_new_state, p_source, left(p_actor_reference, 200), p_amount_cents, upper(p_currency),
    left(p_provider_transaction_reference, 300), left(p_provider_event_reference, 300), p_provider_event_at, left(p_safe_note, 500),
    left(p_verification_result, 100), left(p_idempotency_key, 300), left(p_technical_reference, 200), p_payload_sha256
  ) returning * into v_event;

  update public.payment_automation_records set
    state = p_new_state,
    received_amount_cents = p_amount_cents,
    currency = upper(p_currency),
    confirmation_source = p_source,
    actor_reference = left(p_actor_reference, 200),
    provider_transaction_reference = left(p_provider_transaction_reference, 300),
    provider_event_reference = left(p_provider_event_reference, 300),
    verification_result = left(p_verification_result, 100),
    review_reason = case when p_new_state = 'PAYMENT_REVIEW_REQUIRED' then left(p_safe_note, 500) else null end,
    last_event_at = coalesce(p_provider_event_at, now()), updated_at = now()
  where order_id = v_order.id;

  update public.orders set
    status = case
      when p_new_state = 'PAID' then 'payment_received'::public.order_status
      when p_new_state in ('CANCELLED', 'REFUNDED') then 'cancelled'::public.order_status
      else 'awaiting_payment'::public.order_status end,
    verified_at = case when p_new_state = 'PAID' then now() else verified_at end,
    verified_by = case when p_new_state = 'PAID' and p_source = 'manual_admin' and p_actor_reference ~* '^[0-9a-f-]{36}$'
      then p_actor_reference::uuid else verified_by end,
    updated_at = now()
  where id = v_order.id;

  insert into public.order_events(order_id, event_type, previous_status, new_status, note, actor_admin_user_id, metadata_json)
  values (v_order.id, 'payment_transition', v_order.status,
    case when p_new_state = 'PAID' then 'payment_received'::public.order_status
         when p_new_state in ('CANCELLED', 'REFUNDED') then 'cancelled'::public.order_status
         else 'awaiting_payment'::public.order_status end,
    left(p_safe_note, 500),
    case when p_source = 'manual_admin' and p_actor_reference ~* '^[0-9a-f-]{36}$' then p_actor_reference::uuid else null end,
    jsonb_build_object('payment_state', p_new_state, 'source', p_source, 'verification_result', p_verification_result,
      'provider_event_reference', p_provider_event_reference, 'technical_reference', p_technical_reference));

  -- Release B: close the Q6 atomicity gap (docs/safe-launch/11-...-audit.md) by queuing the
  -- durable fulfilment job in the same transaction as the payment state transition, instead
  -- of relying on a second, separate round-trip from application code. request_key is
  -- deterministic from (order_id, idempotency_key), so a retried/duplicate payment
  -- confirmation cannot create a second job -- the unique_violation on request_key is caught
  -- and treated as "already queued", not as a failure of the payment transition itself. A
  -- unique_violation on the pre-existing one-active-per-order index (a different attempt is
  -- already REPORT_QUEUED/REPORT_GENERATING for this order) is likewise not fatal to the
  -- payment transition -- the payment has already been recorded correctly above; only the
  -- new job insert is rolled back to its savepoint.
  if p_new_state = 'PAID' then
    v_job_request_key := 'payment_fulfilment:' || v_order.id::text || ':' || p_idempotency_key;
    begin
      select coalesce(max(version_number), 0) + 1 into v_job_version from public.reports where order_id = v_order.id;
      insert into public.manual_report_generation_attempts(
        request_key, order_id, report_version, trigger_source, requested_by, status, retry_count, technical_reference, max_attempts
      ) values (
        v_job_request_key, v_order.id, v_job_version, 'payment_confirmed', null, 'REPORT_QUEUED', 0, p_technical_reference, 5
      )
      on conflict (request_key) do nothing
      returning id into v_job_id;
    exception when unique_violation then
      v_job_id := null;
    end;
    if v_job_id is not null then
      v_fulfilment_result := 'QUEUED';
      insert into public.order_events(order_id, event_type, note, metadata_json)
      values (v_order.id, 'generation_requested', 'Verified payment queued deterministic Phase 1 generation.',
        jsonb_build_object('attempt_id', v_job_id, 'source', 'payment_confirmed', 'technical_reference', p_technical_reference));
    else
      v_fulfilment_result := 'ALREADY_ACTIVE';
    end if;
  end if;

  return jsonb_build_object('applied', true, 'duplicate', false, 'state', p_new_state, 'event_id', v_event.id, 'order_id', v_order.id, 'fulfilment', v_fulfilment_result);
exception when unique_violation then
  select * into v_existing from public.payment_transition_events
    where idempotency_key = p_idempotency_key
       or (provider_event_reference is not null and provider_event_reference = p_provider_event_reference and source = p_source)
    order by created_at limit 1;
  if found then return jsonb_build_object('applied', false, 'duplicate', true, 'state', v_existing.new_state, 'event_id', v_existing.id); end if;
  raise;
end $$;

-- Signature is unchanged from 0024, so the existing grant below is sufficient, but it is
-- repeated here for clarity and to be safe against grant drift.
revoke all on function public.record_payment_transition(text, text, text, text, integer, text, text, text, timestamptz, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_payment_transition(text, text, text, text, integer, text, text, text, timestamptz, text, text, text, text, text) to service_role;

commit;
