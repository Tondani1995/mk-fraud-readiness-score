-- Phase 14 launch readiness -- H2: admin recovery path for a stuck workflow-start
-- reconciliation.
--
-- Independent verification of the workflow-start state machine introduced in migration 0017
-- (public.claim_premium_report_workflow_start / phase14_private.claim_workflow_start /
-- phase14_private.mark_workflow_start_uncertain / phase14_private.settle_workflow_start,
-- dispatched exclusively through public.execute_phase14_worker_step) confirmed the core
-- concurrency guarantee holds: an application that loses the HTTP response from the durable
-- workflow platform's start() call after marking the phase14_workflow_start_outbox row
-- 'acceptance_uncertain' can NEVER cause a second automatic workflow run for the same
-- fulfilment. This is enforced redundantly at three layers -- (1) phase14_worker_capabilities
-- has a unique index on (capability_type, operation_key) and authorize_phase14_worker_operation
-- refuses to issue a second capability while one is still 'authorised' or 'leased' for that key,
-- (2) phase14_workflow_start_outbox has unique(capability_id) and unique(operation_key), and
-- phase14_private.claim_workflow_start returns claimed:false with reconciliation_required:true
-- for any outbox row already in 'acceptance_uncertain' or 'reconciliation_required', and
-- (3) report_fulfilments_one_active_order_uidx allows only one non-terminal fulfilment per order.
-- Every one of these layers was verified by direct behavioural test (see
-- scripts/phase14-workflow-start-reconciliation-tests.mjs) against a from-scratch replay of the
-- real migration chain (0001-0017, 0023), not against documentation claims.
--
-- The gap this migration closes: once a phase14_workflow_start_outbox row reaches
-- 'acceptance_uncertain' or 'reconciliation_required', NOTHING in the application can resolve
-- it. phase14_private.settle_workflow_start is only reachable through
-- public.execute_phase14_worker_step, which requires a valid HMAC worker attestation tied to an
-- actively leased capability -- by design, no human admin session can produce that attestation,
-- and phase14_private itself has `revoke all ... from public,anon,authenticated,service_role`
-- applied at the end of 0017, so there is no direct call path either, worker-attested or
-- otherwise, for a person. recover_phase14_worker_capability_lease() only transfers the lease to
-- a new execution id; the caller still has to complete the same attested worker-step chain
-- afterwards, which is exactly the chain a human cannot perform. The result: a lost-response
-- fulfilment stays stuck until its capability lease naturally expires and something worker-side
-- retries it -- and nothing in the current codebase does that retry automatically either. This
-- migration adds the one thing genuinely missing: a role-gated, non-worker-attested, fully
-- audited escape hatch that lets a platform_admin/reviewer/approver resolve a stuck outbox row
-- after checking external evidence (the durable workflow platform's own dashboard/logs), mirroring
-- the existing admin_terminal_phase14_generation_publication pattern (same
-- phase14_require_security gate, same "manual" provenance tag, same underlying core logic reused
-- rather than duplicated).

-- Uses action = 'workflow_start_reconciliation' when calling phase14_require_security(). That
-- action is intentionally NOT added to phase14_require_security's p_action -> v_policy_key case
-- statement (it falls through the existing "else null" arm), so it carries no additional
-- automatic_fulfilment/manual_delivery/etc. policy dependency beyond the base role + AAL2 check
-- already enforced by phase14_require_actor. This is deliberate: it is a break-glass path for
-- state left behind by the autonomous engine, and must keep working to clean that state up even
-- if the feature policy that caused it has since been disabled.
create or replace function public.admin_resolve_premium_report_workflow_start_reconciliation(
  p_outbox_id uuid,
  p_resolution text,
  p_confirmed_run_id text default null,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_out public.phase14_workflow_start_outbox%rowtype;
  v_fulfilment public.report_fulfilments%rowtype;
begin
  v_actor := public.phase14_require_security(
    'workflow_start_reconciliation', array['platform_admin', 'reviewer', 'approver']::public.admin_role[], true, false
  );
  if p_resolution not in ('confirmed_started', 'confirmed_not_started') then
    raise exception 'phase14_workflow_start_resolution_invalid';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'phase14_workflow_start_resolution_reason_required';
  end if;

  select * into v_out from public.phase14_workflow_start_outbox where id = p_outbox_id for update;
  if not found then raise exception 'phase14_workflow_start_outbox_missing'; end if;
  if v_out.status not in ('acceptance_uncertain', 'reconciliation_required') then
    raise exception 'phase14_workflow_start_not_awaiting_reconciliation';
  end if;

  select * into v_fulfilment from public.report_fulfilments where id = v_out.fulfilment_id for update;
  if not found then raise exception 'phase14_fulfilment_missing'; end if;

  perform set_config('phase14.authoritative_transition', 'authenticated_rpc', true);

  if p_resolution = 'confirmed_started' then
    if coalesce(trim(p_confirmed_run_id), '') = '' then
      raise exception 'phase14_workflow_start_confirmed_run_id_required';
    end if;
    update public.phase14_workflow_start_outbox
    set status = 'started',
        run_id = p_confirmed_run_id,
        accepted_at = clock_timestamp(),
        last_error = null,
        reconciliation_status = 'resolved',
        lease_expires_at = null,
        updated_at = clock_timestamp()
    where id = v_out.id
    returning * into v_out;
    update public.report_fulfilments
    set workflow_start_status = 'started',
        workflow_run_id = p_confirmed_run_id,
        workflow_started_at = coalesce(workflow_started_at, clock_timestamp()),
        workflow_start_error = null,
        updated_at = clock_timestamp()
    where id = v_out.fulfilment_id;
  else
    update public.phase14_workflow_start_outbox
    set status = 'cancelled',
        reconciliation_status = 'resolved',
        lease_expires_at = null,
        last_error = left(coalesce(v_out.last_error, '') || ' | admin confirmed not started: ' || p_reason, 2000),
        updated_at = clock_timestamp()
    where id = v_out.id
    returning * into v_out;
    -- Leaving workflow_start_status='starting' would permanently block a fresh capability from
    -- being authorised for this operation_key (authorize_phase14_worker_operation only refuses
    -- while status is 'authorised'/'leased', but the *outbox* uniqueness on operation_key would
    -- still collide with a stale row). Marking the fulfilment 'failed' here is consistent with
    -- how every other terminal abandonment path in this file records an admin-visible failure
    -- reason and leaves the order eligible for a clean 'admin_retry' fulfilment.
    update public.report_fulfilments
    set workflow_start_status = 'failed',
        workflow_start_error = left('Admin confirmed the external workflow did not start: ' || p_reason, 2000),
        last_error_code = 'workflow_start_admin_cancelled',
        last_error_message = p_reason,
        status = 'failed',
        failed_at = coalesce(failed_at, clock_timestamp()),
        updated_at = clock_timestamp()
    where id = v_out.fulfilment_id;
    update public.phase14_worker_capabilities
    set status = 'expired', updated_at = clock_timestamp()
    where id = v_out.capability_id and status in ('authorised', 'leased');
  end if;

  insert into public.audit_logs(
    actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, after_json
  ) values (
    'admin', (v_actor ->> 'user_id')::uuid, v_fulfilment.assessment_id,
    'phase14_workflow_start_outbox', v_out.id,
    'phase14_workflow_start_reconciliation_resolved',
    jsonb_build_object(
      'resolution', p_resolution, 'reason', p_reason, 'run_id', v_out.run_id,
      'outbox_status', v_out.status, 'fulfilment_id', v_out.fulfilment_id,
      'entry', 'manual'
    )
  );

  return jsonb_build_object(
    'outbox_id', v_out.id, 'status', v_out.status, 'run_id', v_out.run_id,
    'fulfilment_id', v_out.fulfilment_id, 'reconciliation_status', v_out.reconciliation_status
  );
end;
$$;

revoke all on function public.admin_resolve_premium_report_workflow_start_reconciliation(uuid, text, text, text)
  from public, anon, service_role;
grant execute on function public.admin_resolve_premium_report_workflow_start_reconciliation(uuid, text, text, text)
  to authenticated;

-- Read-side companion: joins the outbox to its fulfilment/order so an admin surface has enough
-- context to decide a resolution without needing raw table access. The outbox table's own RLS
-- policy (phase14_workflow_start_outbox_admin_select) already permits direct admin reads; this
-- is a convenience projection, not a new grant of visibility.
create or replace function public.admin_list_premium_report_workflow_start_reconciliations()
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare v_actor jsonb; v_rows jsonb;
begin
  v_actor := public.phase14_require_security(
    'workflow_start_reconciliation', array['platform_admin', 'reviewer', 'approver', 'read_only_admin']::public.admin_role[], true, false
  );
  select coalesce(jsonb_agg(row_data order by row_data ->> 'updated_at' asc), '[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'outbox_id', o.id, 'fulfilment_id', o.fulfilment_id, 'order_id', f.order_id,
      'status', o.status, 'reconciliation_status', o.reconciliation_status,
      'attempt_number', o.attempt_number, 'last_error', o.last_error,
      'requested_at', o.requested_at, 'lease_expires_at', o.lease_expires_at,
      'updated_at', o.updated_at
    ) as row_data
    from public.phase14_workflow_start_outbox o
    join public.report_fulfilments f on f.id = o.fulfilment_id
    where o.status in ('acceptance_uncertain', 'reconciliation_required')
  ) rows;
  return v_rows;
end;
$$;

revoke all on function public.admin_list_premium_report_workflow_start_reconciliations()
  from public, anon, service_role;
grant execute on function public.admin_list_premium_report_workflow_start_reconciliations()
  to authenticated;
