-- RC1 correction: near-real-time automatic post-payment fulfilment.
--
-- This is one forward-only additive migration after the accepted RC1 migration set. It keeps the
-- durable generation and delivery queues as the source of truth and adds only the control-plane
-- state and service-role RPCs required to prefer the exact newly-created payment attempt, release
-- a fully verified report automatically, continue the exact delivery, and retain safe operational
-- evidence. No accepted migration is edited.

begin;

alter table public.manual_report_generation_attempts
  add column if not exists immediate_dispatch_correlation_reference uuid,
  add column if not exists immediate_dispatch_started_at timestamptz,
  add column if not exists immediate_dispatch_completed_at timestamptz,
  add column if not exists immediate_dispatch_outcome text,
  add column if not exists immediate_dispatch_http_status integer,
  add column if not exists immediate_dispatch_error_category text,
  add column if not exists commercial_quality_verified_at timestamptz,
  add column if not exists storage_readback_verified_at timestamptz,
  add column if not exists automatic_released_at timestamptz,
  add column if not exists automatic_delivery_authorization_id uuid
    references public.report_delivery_authorizations(id) on delete restrict;

alter table public.manual_report_generation_attempts
  drop constraint if exists manual_report_generation_attempts_immediate_dispatch_outcome_chk;
alter table public.manual_report_generation_attempts
  add constraint manual_report_generation_attempts_immediate_dispatch_outcome_chk
  check (
    immediate_dispatch_outcome is null
    or immediate_dispatch_outcome in ('started', 'succeeded', 'failed')
  );

alter table public.manual_report_generation_attempts
  drop constraint if exists manual_report_generation_attempts_immediate_dispatch_http_status_chk;
alter table public.manual_report_generation_attempts
  add constraint manual_report_generation_attempts_immediate_dispatch_http_status_chk
  check (
    immediate_dispatch_http_status is null
    or immediate_dispatch_http_status between 100 and 599
  );

create index if not exists manual_report_generation_attempts_automatic_delivery_idx
  on public.manual_report_generation_attempts(automatic_delivery_authorization_id)
  where automatic_delivery_authorization_id is not null;

-- Return the exact attempt created inside the already-atomic payment transition. The signature is
-- unchanged; duplicate transitions remain no-ops and never return a newly-dispatchable attempt.
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
set search_path = ''
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
  if p_new_state not in (
       'PAYMENT_PENDING', 'PAYMENT_PROCESSING', 'PAID', 'PAYMENT_FAILED',
       'PAYMENT_REVIEW_REQUIRED', 'REFUNDED', 'CANCELLED'
     )
     or p_source not in ('manual_admin', 'stitch_webhook', 'system_recovery')
     or coalesce(pg_catalog.btrim(p_idempotency_key), '') = ''
     or coalesce(pg_catalog.btrim(p_technical_reference), '') = '' then
    raise exception 'payment_transition_invalid_input';
  end if;

  select * into v_existing
  from public.payment_transition_events
  where idempotency_key = p_idempotency_key;
  if found then
    return pg_catalog.jsonb_build_object(
      'applied', false,
      'duplicate', true,
      'state', v_existing.new_state,
      'event_id', v_existing.id,
      'fulfilment_attempt_id', null
    );
  end if;

  select * into v_order
  from public.orders
  where order_reference = p_order_reference
  for update;
  if not found then raise exception 'payment_order_not_found'; end if;

  insert into public.payment_automation_records(
    order_id, state, expected_amount_cents, currency
  ) values (
    v_order.id,
    case
      when v_order.status::text = 'payment_received' then 'PAID'
      when v_order.status::text in ('cancelled', 'expired') then 'CANCELLED'
      else 'PAYMENT_PENDING'
    end,
    v_order.amount_cents,
    v_order.currency
  )
  on conflict(order_id) do nothing;

  select * into v_record
  from public.payment_automation_records
  where order_id = v_order.id
  for update;
  v_old_state := v_record.state;

  if v_old_state = p_new_state then
    select * into v_existing
    from public.payment_transition_events
    where order_id = v_order.id and new_state = p_new_state
    order by created_at desc
    limit 1;
    return pg_catalog.jsonb_build_object(
      'applied', false,
      'duplicate', true,
      'state', p_new_state,
      'event_id', v_existing.id,
      'fulfilment_attempt_id', null
    );
  elsif v_old_state = 'PAYMENT_PENDING'
        and p_new_state in (
          'PAYMENT_PROCESSING', 'PAID', 'PAYMENT_FAILED',
          'PAYMENT_REVIEW_REQUIRED', 'CANCELLED'
        ) then
    v_allowed := true;
  elsif v_old_state = 'PAYMENT_PROCESSING'
        and p_new_state in (
          'PAID', 'PAYMENT_FAILED', 'PAYMENT_REVIEW_REQUIRED', 'CANCELLED'
        ) then
    v_allowed := true;
  elsif v_old_state = 'PAYMENT_FAILED'
        and p_new_state in (
          'PAYMENT_PROCESSING', 'PAYMENT_REVIEW_REQUIRED', 'CANCELLED'
        ) then
    v_allowed := true;
  elsif v_old_state = 'PAYMENT_REVIEW_REQUIRED'
        and p_new_state in (
          'PAYMENT_PROCESSING', 'PAID', 'PAYMENT_FAILED', 'REFUNDED', 'CANCELLED'
        ) then
    v_allowed := true;
  elsif v_old_state = 'PAID'
        and p_new_state in ('PAYMENT_REVIEW_REQUIRED', 'REFUNDED') then
    v_allowed := true;
  end if;
  if not v_allowed then
    raise exception 'payment_transition_not_allowed:%->%', v_old_state, p_new_state;
  end if;

  insert into public.payment_transition_events(
    order_id,
    order_reference,
    old_state,
    new_state,
    source,
    actor_reference,
    amount_cents,
    currency,
    provider_transaction_reference,
    provider_event_reference,
    provider_event_at,
    safe_note,
    verification_result,
    idempotency_key,
    technical_reference,
    payload_sha256
  ) values (
    v_order.id,
    v_order.order_reference,
    v_old_state,
    p_new_state,
    p_source,
    pg_catalog.left(p_actor_reference, 200),
    p_amount_cents,
    pg_catalog.upper(p_currency),
    pg_catalog.left(p_provider_transaction_reference, 300),
    pg_catalog.left(p_provider_event_reference, 300),
    p_provider_event_at,
    pg_catalog.left(p_safe_note, 500),
    pg_catalog.left(p_verification_result, 100),
    pg_catalog.left(p_idempotency_key, 300),
    pg_catalog.left(p_technical_reference, 200),
    p_payload_sha256
  )
  returning * into v_event;

  update public.payment_automation_records
  set state = p_new_state,
      received_amount_cents = p_amount_cents,
      currency = pg_catalog.upper(p_currency),
      confirmation_source = p_source,
      actor_reference = pg_catalog.left(p_actor_reference, 200),
      provider_transaction_reference = pg_catalog.left(
        p_provider_transaction_reference,
        300
      ),
      provider_event_reference = pg_catalog.left(p_provider_event_reference, 300),
      verification_result = pg_catalog.left(p_verification_result, 100),
      review_reason = case
        when p_new_state = 'PAYMENT_REVIEW_REQUIRED'
          then pg_catalog.left(p_safe_note, 500)
        else null
      end,
      last_event_at = coalesce(p_provider_event_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
  where order_id = v_order.id;

  update public.orders
  set status = case
        when p_new_state = 'PAID' then 'payment_received'::public.order_status
        when p_new_state in ('CANCELLED', 'REFUNDED')
          then 'cancelled'::public.order_status
        else 'awaiting_payment'::public.order_status
      end,
      verified_at = case
        when p_new_state = 'PAID' then pg_catalog.now()
        else verified_at
      end,
      verified_by = case
        when p_new_state = 'PAID'
             and p_source = 'manual_admin'
             and p_actor_reference ~* '^[0-9a-f-]{36}$'
          then p_actor_reference::uuid
        else verified_by
      end,
      updated_at = pg_catalog.now()
  where id = v_order.id;

  insert into public.order_events(
    order_id,
    event_type,
    previous_status,
    new_status,
    note,
    actor_admin_user_id,
    metadata_json
  ) values (
    v_order.id,
    'payment_transition',
    v_order.status,
    case
      when p_new_state = 'PAID' then 'payment_received'::public.order_status
      when p_new_state in ('CANCELLED', 'REFUNDED')
        then 'cancelled'::public.order_status
      else 'awaiting_payment'::public.order_status
    end,
    pg_catalog.left(p_safe_note, 500),
    case
      when p_source = 'manual_admin'
           and p_actor_reference ~* '^[0-9a-f-]{36}$'
        then p_actor_reference::uuid
      else null
    end,
    pg_catalog.jsonb_build_object(
      'payment_state', p_new_state,
      'source', p_source,
      'verification_result', p_verification_result,
      'provider_event_reference', p_provider_event_reference,
      'technical_reference', p_technical_reference
    )
  );

  if p_new_state = 'PAID' then
    v_job_request_key :=
      'payment_fulfilment:' || v_order.id::text || ':' || p_idempotency_key;
    begin
      select coalesce(pg_catalog.max(version_number), 0) + 1
      into v_job_version
      from public.reports
      where order_id = v_order.id;

      insert into public.manual_report_generation_attempts(
        request_key,
        order_id,
        report_version,
        trigger_source,
        requested_by,
        status,
        retry_count,
        technical_reference,
        max_attempts
      ) values (
        v_job_request_key,
        v_order.id,
        v_job_version,
        'payment_confirmed',
        null,
        'REPORT_QUEUED',
        0,
        p_technical_reference,
        5
      )
      on conflict (request_key) do nothing
      returning id into v_job_id;
    exception when unique_violation then
      v_job_id := null;
    end;

    if v_job_id is not null then
      v_fulfilment_result := 'QUEUED';
      insert into public.order_events(
        order_id, event_type, note, metadata_json
      ) values (
        v_order.id,
        'generation_requested',
        'Verified payment queued deterministic Phase 1 generation.',
        pg_catalog.jsonb_build_object(
          'attempt_id', v_job_id,
          'source', 'payment_confirmed',
          'technical_reference', p_technical_reference
        )
      );
    else
      v_fulfilment_result := 'ALREADY_ACTIVE';
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'applied', true,
    'duplicate', false,
    'state', p_new_state,
    'event_id', v_event.id,
    'order_id', v_order.id,
    'fulfilment', v_fulfilment_result,
    'fulfilment_attempt_id', v_job_id
  );
exception when unique_violation then
  select * into v_existing
  from public.payment_transition_events
  where idempotency_key = p_idempotency_key
     or (
       provider_event_reference is not null
       and provider_event_reference = p_provider_event_reference
       and source = p_source
     )
  order by created_at
  limit 1;
  if found then
    return pg_catalog.jsonb_build_object(
      'applied', false,
      'duplicate', true,
      'state', v_existing.new_state,
      'event_id', v_existing.id,
      'fulfilment_attempt_id', null
    );
  end if;
  raise;
end;
$$;

-- Persist only technical dispatch evidence. A failed HTTP dispatch never changes payment state or
-- the durable attempt's queue/retry state.
create function public.record_fulfilment_dispatch_result(
  p_attempt_id uuid,
  p_correlation_reference uuid,
  p_outcome text,
  p_http_status integer default null,
  p_error_category text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.manual_report_generation_attempts%rowtype;
  v_after public.manual_report_generation_attempts%rowtype;
begin
  perform public.rc1_require_operation_open('worker');
  if p_attempt_id is null
     or p_correlation_reference is null
     or p_outcome not in ('started', 'succeeded', 'failed')
     or (
       p_http_status is not null
       and (p_http_status < 100 or p_http_status > 599)
     )
     or (
       p_error_category is not null
       and pg_catalog.char_length(p_error_category) > 80
     ) then
    raise exception 'fulfilment_dispatch_evidence_invalid';
  end if;

  select * into v_before
  from public.manual_report_generation_attempts
  where id = p_attempt_id
  for update;
  if not found then raise exception 'fulfilment_job_not_found'; end if;
  if v_before.immediate_dispatch_correlation_reference is not null
     and v_before.immediate_dispatch_correlation_reference
       <> p_correlation_reference then
    raise exception 'fulfilment_dispatch_correlation_mismatch';
  end if;

  update public.manual_report_generation_attempts
  set immediate_dispatch_correlation_reference = p_correlation_reference,
      immediate_dispatch_started_at = case
        when p_outcome = 'started'
          then coalesce(immediate_dispatch_started_at, pg_catalog.clock_timestamp())
        else immediate_dispatch_started_at
      end,
      immediate_dispatch_completed_at = case
        when p_outcome in ('succeeded', 'failed')
          then pg_catalog.clock_timestamp()
        else immediate_dispatch_completed_at
      end,
      immediate_dispatch_outcome = p_outcome,
      immediate_dispatch_http_status = p_http_status,
      immediate_dispatch_error_category = pg_catalog.left(
        p_error_category,
        80
      ),
      updated_at = pg_catalog.now()
  where id = p_attempt_id
  returning * into v_after;

  insert into public.audit_logs(
    actor_type, entity_table, entity_id, action, after_json
  ) values (
    'system',
    'manual_report_generation_attempts',
    v_after.id,
    'immediate_fulfilment_dispatch_' || p_outcome,
    pg_catalog.jsonb_build_object(
      'correlation_reference', p_correlation_reference,
      'outcome', p_outcome,
      'http_status', p_http_status,
      'error_category', pg_catalog.left(p_error_category, 80)
    )
  );

  return pg_catalog.jsonb_build_object(
    'attempt_id', v_after.id,
    'correlation_reference', p_correlation_reference,
    'outcome', p_outcome
  );
end;
$$;

-- The immediate route may claim only the supplied attempt. Payment/order linkage is verified under
-- the same row lock; an already released attempt is returned as an idempotent replay so the caller
-- can continue only its exact delivery authorization.
create function public.claim_exact_fulfilment_job(
  p_attempt_id uuid,
  p_lease_owner text,
  p_lease_seconds integer default 300
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.manual_report_generation_attempts%rowtype;
  v_order public.orders%rowtype;
  v_payment public.payment_automation_records%rowtype;
begin
  perform public.rc1_require_operation_open('worker');
  if p_attempt_id is null
     or coalesce(pg_catalog.btrim(p_lease_owner), '') = '' then
    raise exception 'fulfilment_exact_claim_input_invalid';
  end if;
  if p_lease_seconds is null
     or p_lease_seconds < 30
     or p_lease_seconds > 3600 then
    raise exception 'fulfilment_lease_seconds_out_of_range';
  end if;

  select * into v_job
  from public.manual_report_generation_attempts
  where id = p_attempt_id
  for update;
  if not found then raise exception 'fulfilment_exact_attempt_not_found'; end if;

  select * into v_order
  from public.orders
  where id = v_job.order_id
  for share;
  select * into v_payment
  from public.payment_automation_records
  where order_id = v_job.order_id
  for share;
  if not found
     or v_order.id is distinct from v_job.order_id
     or v_order.status::text <> 'payment_received'
     or v_payment.state <> 'PAID' then
    raise exception 'fulfilment_exact_attempt_order_ineligible';
  end if;

  if v_job.status = 'DELIVERY_QUEUED'
     and v_job.automatic_delivery_authorization_id is not null then
    return pg_catalog.jsonb_build_object(
      'id', v_job.id,
      'order_id', v_job.order_id,
      'already_complete', true,
      'automatic_delivery_authorization_id',
        v_job.automatic_delivery_authorization_id
    );
  end if;

  if v_job.status not in ('REPORT_QUEUED', 'RETRY_SCHEDULED')
     or (
       v_job.next_attempt_at is not null
       and v_job.next_attempt_at > pg_catalog.now()
     )
     or (
       v_job.lease_expires_at is not null
       and v_job.lease_expires_at > pg_catalog.now()
     ) then
    return null;
  end if;

  update public.manual_report_generation_attempts
  set status = 'REPORT_QUEUED',
      lease_owner = p_lease_owner,
      lease_expires_at =
        pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds),
      heartbeat_at = pg_catalog.now(),
      started_at = coalesce(started_at, pg_catalog.now()),
      next_attempt_at = null,
      updated_at = pg_catalog.now()
  where id = v_job.id
  returning * into v_job;

  insert into public.audit_logs(
    actor_type, entity_table, entity_id, action, after_json
  ) values (
    'system',
    'manual_report_generation_attempts',
    v_job.id,
    'exact_fulfilment_job_claimed',
    pg_catalog.jsonb_build_object(
      'attempt_id', v_job.id,
      'order_id', v_job.order_id,
      'lease_owner', p_lease_owner,
      'lease_expires_at', v_job.lease_expires_at
    )
  );

  return pg_catalog.to_jsonb(v_job);
end;
$$;

-- Safe, deduplicated exception evidence shared by generation/release and delivery failures. It
-- never stores provider errors, SQL text, recipient data, access tokens, URLs, or report content.
create function public.record_automatic_fulfilment_exception(
  p_attempt_id uuid,
  p_authorization_id uuid,
  p_stage text,
  p_category text,
  p_technical_reference text,
  p_required_action text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.manual_report_generation_attempts%rowtype;
  v_authorization public.report_delivery_authorizations%rowtype;
  v_order_id uuid;
  v_report_id uuid;
  v_alert public.phase14_operational_alerts%rowtype;
  v_stage text := pg_catalog.left(
    coalesce(nullif(pg_catalog.btrim(p_stage), ''), 'unknown'),
    80
  );
  v_category text := pg_catalog.left(
    coalesce(nullif(pg_catalog.btrim(p_category), ''), 'fulfilment_exception'),
    80
  );
  v_reference text := pg_catalog.left(
    coalesce(nullif(pg_catalog.btrim(p_technical_reference), ''), 'not-recorded'),
    200
  );
  v_action text := pg_catalog.left(
    coalesce(
      nullif(pg_catalog.btrim(p_required_action), ''),
      'Review the order and choose an authorised recovery action.'
    ),
    300
  );
  v_key text;
begin
  perform public.rc1_require_operation_open('operational_alert');
  if p_attempt_id is null and p_authorization_id is null then
    raise exception 'automatic_fulfilment_exception_reference_required';
  end if;

  if p_attempt_id is not null then
    select * into v_attempt
    from public.manual_report_generation_attempts
    where id = p_attempt_id
    for update;
    if not found then raise exception 'fulfilment_job_not_found'; end if;
    v_order_id := v_attempt.order_id;
    v_report_id := v_attempt.output_report_id;

    if v_attempt.status = 'REPORT_READY' then
      update public.manual_report_generation_attempts
      set status = 'AWAITING_QUALITY_REVIEW',
          completed_at = coalesce(completed_at, pg_catalog.now()),
          lease_owner = null,
          lease_expires_at = null,
          heartbeat_at = null,
          error_category = v_category,
          safe_operational_error = v_action,
          updated_at = pg_catalog.now()
      where id = v_attempt.id
      returning * into v_attempt;
    end if;
  end if;

  if p_authorization_id is not null then
    select * into v_authorization
    from public.report_delivery_authorizations
    where id = p_authorization_id
    for share;
    if not found then raise exception 'delivery_authorization_not_found'; end if;
    if v_order_id is not null
       and v_order_id is distinct from v_authorization.order_id then
      raise exception 'automatic_fulfilment_exception_binding_mismatch';
    end if;
    v_order_id := v_authorization.order_id;
    v_report_id := v_authorization.report_id;
  end if;

  v_key :=
    'automatic-fulfilment:' ||
    coalesce(p_attempt_id::text, p_authorization_id::text) || ':' ||
    v_stage || ':' || v_category;

  insert into public.phase14_operational_alerts(
    alert_key, severity, category, report_id, email_event_id, detail_json
  ) values (
    v_key,
    case
      when v_category in (
        'recipient_required',
        'commercial_quality_failed',
        'delivery_reconciliation_required'
      ) then 'critical'
      else 'warning'
    end,
    v_category,
    v_report_id,
    case
      when p_authorization_id is not null
        then v_authorization.email_event_id
      else null
    end,
    pg_catalog.jsonb_build_object(
      'order_id', v_order_id,
      'attempt_id', p_attempt_id,
      'authorization_id', p_authorization_id,
      'stage', v_stage,
      'technical_reference', v_reference,
      'required_action', v_action
    )
  )
  on conflict (alert_key) do update
  set severity = excluded.severity,
      status = 'open',
      detail_json = excluded.detail_json
  returning * into v_alert;

  insert into public.audit_logs(
    actor_type, entity_table, entity_id, action, after_json
  ) values (
    'system',
    'phase14_operational_alerts',
    v_alert.id,
    'automatic_fulfilment_exception_recorded',
    pg_catalog.jsonb_build_object(
      'order_id', v_order_id,
      'attempt_id', p_attempt_id,
      'authorization_id', p_authorization_id,
      'stage', v_stage,
      'category', v_category,
      'technical_reference', v_reference,
      'required_action', v_action
    )
  );

  return pg_catalog.jsonb_build_object(
    'alert_id', v_alert.id,
    'order_id', v_order_id,
    'report_id', v_report_id,
    'attempt_id', p_attempt_id,
    'authorization_id', p_authorization_id,
    'stage', v_stage,
    'category', v_category,
    'technical_reference', v_reference,
    'required_action', v_action,
    'attempt_status', v_attempt.status
  );
end;
$$;

-- Fail-closed automatic release. Successful generation is only the entry condition: this RPC
-- independently locks and verifies payment, score, current-report, Storage, recipient and
-- suppression state before atomically releasing and creating one email event + authorization.
create function public.automatic_release_completed_fulfilment(
  p_attempt_id uuid,
  p_report_id uuid,
  p_lease_owner text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.manual_report_generation_attempts%rowtype;
  v_report public.reports%rowtype;
  v_order public.orders%rowtype;
  v_payment public.payment_automation_records%rowtype;
  v_assessment public.assessments%rowtype;
  v_score public.score_runs%rowtype;
  v_entitlement jsonb;
  v_event public.email_events%rowtype;
  v_authorization public.report_delivery_authorizations%rowtype;
  v_current_count bigint;
  v_exception_category text;
  v_exception_action text;
  v_exception jsonb;
  v_dedupe_key text;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  perform public.rc1_require_operation_open('quality_review');
  if p_attempt_id is null
     or p_report_id is null
     or coalesce(pg_catalog.btrim(p_lease_owner), '') = '' then
    raise exception 'automatic_release_input_invalid';
  end if;

  select * into v_attempt
  from public.manual_report_generation_attempts
  where id = p_attempt_id
  for update;
  if not found then raise exception 'fulfilment_job_not_found'; end if;

  if v_attempt.status = 'DELIVERY_QUEUED'
     and v_attempt.automatic_delivery_authorization_id is not null then
    return pg_catalog.jsonb_build_object(
      'released', true,
      'idempotent_replay', true,
      'attempt_id', v_attempt.id,
      'report_id', v_attempt.output_report_id,
      'order_id', v_attempt.order_id,
      'delivery_authorization_id',
        v_attempt.automatic_delivery_authorization_id
    );
  end if;

  if v_attempt.lease_owner is null
     or v_attempt.lease_owner <> p_lease_owner
     or v_attempt.lease_expires_at is null
     or v_attempt.lease_expires_at <= pg_catalog.now()
     or v_attempt.status <> 'REPORT_READY'
     or v_attempt.output_report_id is distinct from p_report_id then
    raise exception 'automatic_release_worker_attempt_invalid';
  end if;

  select * into v_report
  from public.reports
  where id = p_report_id
  for update;
  select * into v_order
  from public.orders
  where id = v_attempt.order_id
  for update;
  select * into v_payment
  from public.payment_automation_records
  where order_id = v_attempt.order_id
  for share;
  select * into v_assessment
  from public.assessments
  where id = v_order.assessment_id
  for share;
  select * into v_score
  from public.score_runs
  where id = v_assessment.current_score_run_id
  for share;

  if v_report.id is null
     or v_report.order_id is distinct from v_attempt.order_id
     or v_report.assessment_id is distinct from v_order.assessment_id
     or v_report.score_run_id is distinct from v_assessment.current_score_run_id then
    v_exception_category := 'report_relationship_invalid';
    v_exception_action :=
      'Inspect the attempt/report/order binding before any manual release.';
  elsif v_payment.order_id is null
        or v_payment.state <> 'PAID'
        or v_order.status::text <> 'payment_received'
        or v_order.verified_at is null
        or v_order.verified_by is null then
    v_exception_category := 'verified_payment_required';
    v_exception_action :=
      'Reconcile the verified payment record before fulfilment continues.';
  elsif v_assessment.id is null
        or v_assessment.current_score_run_id is null
        or v_score.id is null
        or v_score.status::text <> 'completed'
        or v_score.locked_at is null
        or v_score.input_hash !~ '^[0-9a-f]{64}$' then
    v_exception_category := 'locked_score_required';
    v_exception_action :=
      'Complete and lock the authoritative score before report release.';
  elsif v_report.status <> 'generated'
        or v_report.storage_status <> 'VERIFIED'
        or v_report.storage_verified_at is null
        or v_report.mime_type <> 'application/pdf'
        or coalesce(v_report.file_size_bytes, 0) <= 0
        or v_report.checksum !~ '^[0-9a-f]{64}$'
        or coalesce(pg_catalog.btrim(v_report.storage_bucket), '') = ''
        or coalesce(pg_catalog.btrim(v_report.storage_path), '') = '' then
    v_exception_category := 'pdf_storage_verification_required';
    v_exception_action :=
      'Inspect PDF and private Storage integrity evidence before release.';
  elsif coalesce(v_attempt.evidence_checksum, '') !~ '^[0-9a-f]{64}$'
        or v_attempt.final_validation_json is null
        or pg_catalog.jsonb_typeof(v_attempt.final_validation_json) <> 'object' then
    v_exception_category := 'commercial_quality_evidence_missing';
    v_exception_action :=
      'Review the commercial-quality validation evidence before release.';
  elsif v_order.customer_email is null
        or coalesce(pg_catalog.btrim(v_order.customer_email::text), '') = '' then
    v_exception_category := 'recipient_required';
    v_exception_action :=
      'Add and independently verify the delivery recipient, then use the authorised recovery control.';
  elsif exists (
    select 1
    from public.email_events e
    where e.order_id = v_order.id
      and e.recipient_email = v_order.customer_email
      and e.status in ('bounced', 'complained')
  ) then
    v_exception_category := 'delivery_suppressed';
    v_exception_action :=
      'Resolve the prior bounce or complaint before any authorised resend.';
  else
    select pg_catalog.count(*) into v_current_count
    from public.reports r
    where r.assessment_id = v_report.assessment_id
      and r.report_type = v_report.report_type
      and r.status not in ('draft', 'superseded', 'voided');

    if v_current_count <> 1 then
      v_exception_category := 'duplicate_current_report';
      v_exception_action :=
        'Reconcile current report versions before any release.';
    else
      begin
        v_entitlement := public.phase14_delivery_entitlement(
          v_report.id,
          v_order.customer_email::text,
          false,
          'email_delivery'
        );
      exception when others then
        v_entitlement := null;
      end;
      if v_entitlement is null
         or (v_entitlement->>'report_id')::uuid is distinct from v_report.id
         or (v_entitlement->>'order_id')::uuid is distinct from v_order.id
         or (v_entitlement->>'score_run_id')::uuid is distinct from v_score.id
         or v_entitlement->>'report_checksum' is distinct from v_report.checksum
         or v_entitlement->>'recipient'
            is distinct from pg_catalog.lower(
              pg_catalog.btrim(v_order.customer_email::text)
            ) then
        v_exception_category := 'delivery_entitlement_failed';
        v_exception_action :=
          'Review payment, product, report, Storage and recipient entitlement before release.';
      end if;
    end if;
  end if;

  if v_exception_category is not null then
    v_exception := public.record_automatic_fulfilment_exception(
      v_attempt.id,
      null,
      'automatic_quality_release',
      v_exception_category,
      coalesce(v_attempt.technical_reference, v_attempt.id::text),
      v_exception_action
    );
    return v_exception || pg_catalog.jsonb_build_object(
      'released', false,
      'delivery_authorization_id', null
    );
  end if;

  v_dedupe_key :=
    'report_ready:auto:' ||
    v_report.id::text || ':' ||
    pg_catalog.lower(pg_catalog.btrim(v_order.customer_email::text));

  select * into v_event
  from public.email_events
  where dedupe_key = v_dedupe_key
  for update;
  if not found then
    insert into public.email_events(
      order_id,
      report_id,
      recipient_email,
      template_key,
      notification_type,
      status,
      provider_mode,
      provider,
      dedupe_key,
      metadata_json
    ) values (
      v_order.id,
      v_report.id,
      v_order.customer_email,
      'report_ready',
      'report_ready',
      'QUEUED',
      'disabled',
      'resend',
      v_dedupe_key,
      pg_catalog.jsonb_build_object(
        'attempt_id', v_attempt.id,
        'release_mode', 'automatic_after_verified_payment'
      )
    )
    returning * into v_event;
  end if;

  select * into v_authorization
  from public.report_delivery_authorizations
  where email_event_id = v_event.id
  for update;
  if not found then
    insert into public.report_delivery_authorizations(
      report_id,
      report_checksum,
      recipient_email,
      order_id,
      assessment_id,
      score_run_id,
      security_gate_version,
      authorised_by,
      provider,
      email_event_id,
      status
    ) values (
      v_report.id,
      v_report.checksum,
      v_order.customer_email,
      v_order.id,
      v_report.assessment_id,
      v_report.score_run_id,
      null,
      v_order.verified_by,
      'resend',
      v_event.id,
      'queued'
    )
    returning * into v_authorization;
  end if;

  if v_authorization.report_id is distinct from v_report.id
     or v_authorization.order_id is distinct from v_order.id
     or v_authorization.recipient_email is distinct from v_order.customer_email
     or v_authorization.email_event_id is distinct from v_event.id then
    raise exception 'automatic_release_delivery_binding_conflict';
  end if;

  update public.reports
  set status = 'released',
      released_at = coalesce(released_at, v_now),
      updated_at = v_now
  where id = v_report.id;

  update public.manual_report_generation_attempts
  set status = 'DELIVERY_QUEUED',
      quality_reviewed_at = v_now,
      quality_review_decision = 'approved',
      quality_review_reason =
        'Automatic release after all RC1 commercial, Storage, entitlement and recipient gates passed.',
      commercial_quality_verified_at = v_now,
      storage_readback_verified_at = v_now,
      automatic_released_at = v_now,
      automatic_delivery_authorization_id = v_authorization.id,
      delivery_queued_at = v_now,
      completed_at = coalesce(completed_at, v_now),
      lease_owner = null,
      lease_expires_at = null,
      heartbeat_at = null,
      updated_at = v_now
  where id = v_attempt.id
  returning * into v_attempt;

  perform pg_catalog.set_config(
    'phase14.authoritative_transition',
    'worker_rpc',
    true
  );
  insert into public.audit_logs(
    actor_type, entity_table, entity_id, action, after_json
  ) values (
    'system',
    'manual_report_generation_attempts',
    v_attempt.id,
    'automatic_quality_release_approved',
    pg_catalog.jsonb_build_object(
      'attempt_id', v_attempt.id,
      'order_id', v_order.id,
      'report_id', v_report.id,
      'delivery_authorization_id', v_authorization.id,
      'email_event_id', v_event.id,
      'commercial_quality_verified_at',
        v_attempt.commercial_quality_verified_at,
      'storage_readback_verified_at',
        v_attempt.storage_readback_verified_at
    )
  );

  return pg_catalog.jsonb_build_object(
    'released', true,
    'idempotent_replay', false,
    'attempt_id', v_attempt.id,
    'order_id', v_order.id,
    'report_id', v_report.id,
    'delivery_authorization_id', v_authorization.id,
    'email_event_id', v_event.id
  );
end;
$$;

-- Exact immediate continuation cannot drift to a different authorization. Scheduled recovery keeps
-- using claim_next_delivery(); both paths hand the same claimed shape to the shared application
-- delivery processor.
create function public.claim_exact_delivery(
  p_authorization_id uuid,
  p_expected_order_id uuid,
  p_lease_owner text,
  p_lease_seconds integer default 300
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.report_delivery_authorizations%rowtype;
begin
  perform public.rc1_require_operation_open('delivery');
  if p_authorization_id is null
     or p_expected_order_id is null
     or coalesce(pg_catalog.btrim(p_lease_owner), '') = '' then
    raise exception 'delivery_exact_claim_input_invalid';
  end if;
  if p_lease_seconds is null
     or p_lease_seconds < 30
     or p_lease_seconds > 3600 then
    raise exception 'delivery_lease_seconds_out_of_range';
  end if;

  select * into v_row
  from public.report_delivery_authorizations
  where id = p_authorization_id
  for update;
  if not found then raise exception 'delivery_authorization_not_found'; end if;
  if v_row.order_id is distinct from p_expected_order_id then
    raise exception 'delivery_exact_order_mismatch';
  end if;

  if v_row.status = 'finalized' then
    return null;
  end if;
  if v_row.status not in ('queued', 'retry_scheduled')
     or (
       v_row.next_attempt_at is not null
       and v_row.next_attempt_at > pg_catalog.now()
     )
     or (
       v_row.lease_expires_at is not null
       and v_row.lease_expires_at > pg_catalog.now()
     ) then
    return null;
  end if;

  update public.report_delivery_authorizations
  set status = 'claimed',
      lease_token = extensions.gen_random_uuid(),
      lease_expires_at =
        pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds),
      claimed_at = pg_catalog.now(),
      next_attempt_at = null,
      updated_at = pg_catalog.now()
  where id = v_row.id
  returning * into v_row;

  perform pg_catalog.set_config(
    'phase14.authoritative_transition',
    'worker_rpc',
    true
  );
  insert into public.audit_logs(
    actor_type, entity_table, entity_id, action, after_json
  ) values (
    'system',
    'report_delivery_authorizations',
    v_row.id,
    'exact_delivery_job_claimed',
    pg_catalog.jsonb_build_object(
      'authorization_id', v_row.id,
      'order_id', v_row.order_id,
      'report_id', v_row.report_id,
      'lease_expires_at', v_row.lease_expires_at
    )
  );

  return pg_catalog.to_jsonb(v_row);
end;
$$;

-- Provider acceptance with a failed final database write is never blindly retried. It is held for
-- reconciliation so no second customer send can occur until an authorised operator resolves it.
create function public.mark_delivery_reconciliation_required(
  p_authorization_id uuid,
  p_lease_token uuid,
  p_provider_message_id text,
  p_technical_reference text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.report_delivery_authorizations%rowtype;
  v_after public.report_delivery_authorizations%rowtype;
begin
  perform public.rc1_require_operation_open('delivery');
  select * into v_before
  from public.report_delivery_authorizations
  where id = p_authorization_id
  for update;
  if not found then raise exception 'delivery_authorization_not_found'; end if;
  if v_before.status <> 'dispatching'
     or v_before.lease_token is null
     or v_before.lease_token <> p_lease_token
     or coalesce(pg_catalog.btrim(p_provider_message_id), '') = '' then
    raise exception 'delivery_reconciliation_binding_invalid';
  end if;

  update public.report_delivery_authorizations
  set status = 'reconciliation_required',
      provider_message_id = pg_catalog.left(p_provider_message_id, 300),
      lease_token = null,
      lease_expires_at = null,
      updated_at = pg_catalog.now()
  where id = v_before.id
  returning * into v_after;

  update public.email_events
  set status = 'provider_acceptance_uncertain',
      provider_message_id = pg_catalog.left(p_provider_message_id, 300),
      error_message =
        'Provider accepted the message but final delivery persistence requires reconciliation.',
      updated_at = pg_catalog.now()
  where id = v_after.email_event_id;

  perform pg_catalog.set_config(
    'phase14.authoritative_transition',
    'worker_rpc',
    true
  );
  insert into public.audit_logs(
    actor_type, entity_table, entity_id, action, before_json, after_json
  ) values (
    'system',
    'report_delivery_authorizations',
    v_after.id,
    'delivery_reconciliation_required',
    pg_catalog.jsonb_build_object(
      'status', v_before.status,
      'authorization_id', v_before.id
    ),
    pg_catalog.jsonb_build_object(
      'status', v_after.status,
      'authorization_id', v_after.id,
      'technical_reference', pg_catalog.left(p_technical_reference, 200)
    )
  );

  return pg_catalog.to_jsonb(v_after);
end;
$$;

revoke all on function public.record_payment_transition(
  text,text,text,text,integer,text,text,text,timestamptz,text,text,text,text,text
) from public, anon, authenticated, service_role;
grant execute on function public.record_payment_transition(
  text,text,text,text,integer,text,text,text,timestamptz,text,text,text,text,text
) to service_role;

revoke all on function public.record_fulfilment_dispatch_result(
  uuid,uuid,text,integer,text
) from public, anon, authenticated, service_role;
grant execute on function public.record_fulfilment_dispatch_result(
  uuid,uuid,text,integer,text
) to service_role;

revoke all on function public.claim_exact_fulfilment_job(
  uuid,text,integer
) from public, anon, authenticated, service_role;
grant execute on function public.claim_exact_fulfilment_job(
  uuid,text,integer
) to service_role;

revoke all on function public.record_automatic_fulfilment_exception(
  uuid,uuid,text,text,text,text
) from public, anon, authenticated, service_role;
grant execute on function public.record_automatic_fulfilment_exception(
  uuid,uuid,text,text,text,text
) to service_role;

revoke all on function public.automatic_release_completed_fulfilment(
  uuid,uuid,text
) from public, anon, authenticated, service_role;
grant execute on function public.automatic_release_completed_fulfilment(
  uuid,uuid,text
) to service_role;

revoke all on function public.claim_exact_delivery(
  uuid,uuid,text,integer
) from public, anon, authenticated, service_role;
grant execute on function public.claim_exact_delivery(
  uuid,uuid,text,integer
) to service_role;

revoke all on function public.mark_delivery_reconciliation_required(
  uuid,uuid,text,text
) from public, anon, authenticated, service_role;
grant execute on function public.mark_delivery_reconciliation_required(
  uuid,uuid,text,text
) to service_role;

commit;
