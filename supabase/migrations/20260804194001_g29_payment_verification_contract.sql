-- G29 payment-verification contract correction.
-- The payment transition remains the only write boundary.  Evidence is validated before the
-- payment automation row, transition event, order, timeline, or fulfilment attempt can be written.

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
  v_verifier public.admin_profiles%rowtype;
  v_old_state text;
  v_allowed boolean := false;
  v_prior_valid_source_event boolean := false;
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
     or coalesce(pg_catalog.btrim(p_order_reference), '') = ''
     or coalesce(pg_catalog.btrim(p_idempotency_key), '') = ''
     or coalesce(pg_catalog.btrim(p_technical_reference), '') = ''
     or coalesce(pg_catalog.btrim(p_verification_result), '') = '' then
    raise exception 'payment_transition_invalid_input';
  end if;

  -- Lock/read the order before any insert.  This makes the amount/currency and source checks part
  -- of the same transaction boundary as the transition while keeping duplicate calls harmless.
  select * into v_order
  from public.orders
  where order_reference = p_order_reference
  for update;
  if not found then raise exception 'payment_order_not_found'; end if;

  if p_new_state = 'PAID' then
    if p_amount_cents is distinct from v_order.amount_cents
       or pg_catalog.upper(coalesce(p_currency, '')) <> pg_catalog.upper(coalesce(v_order.currency, '')) then
      raise exception 'payment_paid_amount_or_currency_mismatch';
    end if;

    if p_source = 'manual_admin' then
      if p_verification_result <> 'authorised_manual_confirmation'
         or p_actor_reference is null
         or p_actor_reference !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
        raise exception 'payment_manual_verification_invalid';
      end if;
      select * into v_verifier
      from public.admin_profiles
      where id = p_actor_reference::uuid
        and status = 'active';
      if not found or v_verifier.role not in ('platform_admin', 'finance_admin') then
        raise exception 'payment_manual_verifier_invalid';
      end if;
    elsif p_source = 'stitch_webhook' then
      if p_verification_result <> 'svix_signature_valid'
         or coalesce(pg_catalog.btrim(p_provider_transaction_reference), '') = ''
         or coalesce(pg_catalog.btrim(p_provider_event_reference), '') = ''
         or p_provider_event_at is null then
        raise exception 'payment_stitch_verification_invalid';
      end if;
    elsif p_source = 'system_recovery' then
      if p_verification_result <> 'system_recovery_reconciled' then
        raise exception 'payment_system_recovery_verification_invalid';
      end if;
      select exists (
        select 1
        from public.payment_transition_events prior_event
        where prior_event.order_id = v_order.id
          and prior_event.new_state = 'PAID'
          and prior_event.processing_result = 'applied'
          and (
            (
              prior_event.source = 'manual_admin'
              and prior_event.verification_result = 'authorised_manual_confirmation'
              and prior_event.actor_reference ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              and exists (
                select 1 from public.admin_profiles verifier
                where verifier.id = prior_event.actor_reference::uuid
                  and verifier.status = 'active'
                  and verifier.role in ('platform_admin', 'finance_admin')
              )
            )
            or (
              prior_event.source = 'stitch_webhook'
              and prior_event.verification_result = 'svix_signature_valid'
              and coalesce(pg_catalog.btrim(prior_event.provider_transaction_reference), '') <> ''
              and coalesce(pg_catalog.btrim(prior_event.provider_event_reference), '') <> ''
              and prior_event.provider_event_at is not null
            )
          )
      ) into v_prior_valid_source_event;
      if not v_prior_valid_source_event then
        raise exception 'payment_system_recovery_unverified';
      end if;
    end if;
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
    order_id, order_reference, old_state, new_state, source, actor_reference,
    amount_cents, currency, provider_transaction_reference, provider_event_reference,
    provider_event_at, safe_note, verification_result, idempotency_key,
    technical_reference, payload_sha256
  ) values (
    v_order.id, v_order.order_reference, v_old_state, p_new_state, p_source,
    pg_catalog.left(p_actor_reference, 200), p_amount_cents, pg_catalog.upper(p_currency),
    pg_catalog.left(p_provider_transaction_reference, 300), pg_catalog.left(p_provider_event_reference, 300),
    p_provider_event_at, pg_catalog.left(p_safe_note, 500), pg_catalog.left(p_verification_result, 100),
    pg_catalog.left(p_idempotency_key, 300), pg_catalog.left(p_technical_reference, 200), p_payload_sha256
  ) returning * into v_event;

  update public.payment_automation_records
  set state = p_new_state,
      received_amount_cents = p_amount_cents,
      currency = pg_catalog.upper(p_currency),
      confirmation_source = p_source,
      actor_reference = pg_catalog.left(p_actor_reference, 200),
      provider_transaction_reference = pg_catalog.left(p_provider_transaction_reference, 300),
      provider_event_reference = pg_catalog.left(p_provider_event_reference, 300),
      verification_result = pg_catalog.left(p_verification_result, 100),
      review_reason = case when p_new_state = 'PAYMENT_REVIEW_REQUIRED' then pg_catalog.left(p_safe_note, 500) else null end,
      last_event_at = coalesce(p_provider_event_at, pg_catalog.now()),
      updated_at = pg_catalog.now()
  where order_id = v_order.id;

  update public.orders
  set status = case
        when p_new_state = 'PAID' then 'payment_received'::public.order_status
        when p_new_state in ('CANCELLED', 'REFUNDED') then 'cancelled'::public.order_status
        else 'awaiting_payment'::public.order_status
      end,
      verified_at = case when p_new_state = 'PAID' then pg_catalog.now() else verified_at end,
      verified_by = case
        when p_new_state = 'PAID' and p_source = 'manual_admin' then p_actor_reference::uuid
        else verified_by
      end,
      updated_at = pg_catalog.now()
  where id = v_order.id;

  insert into public.order_events(
    order_id, event_type, previous_status, new_status, note, actor_admin_user_id, metadata_json
  ) values (
    v_order.id, 'payment_transition', v_order.status,
    case
      when p_new_state = 'PAID' then 'payment_received'::public.order_status
      when p_new_state in ('CANCELLED', 'REFUNDED') then 'cancelled'::public.order_status
      else 'awaiting_payment'::public.order_status
    end,
    pg_catalog.left(p_safe_note, 500),
    case when p_source = 'manual_admin' then p_actor_reference::uuid else null end,
    pg_catalog.jsonb_build_object(
      'payment_state', p_new_state, 'source', p_source,
      'verification_result', p_verification_result,
      'provider_event_reference', p_provider_event_reference,
      'technical_reference', p_technical_reference
    )
  );

  if p_new_state = 'PAID' then
    v_job_request_key := 'payment_fulfilment:' || v_order.id::text || ':' || p_idempotency_key;
    begin
      select coalesce(pg_catalog.max(version_number), 0) + 1 into v_job_version
      from public.reports where order_id = v_order.id;

      insert into public.manual_report_generation_attempts(
        request_key, order_id, report_version, trigger_source, requested_by,
        status, retry_count, technical_reference, max_attempts
      ) values (
        v_job_request_key, v_order.id, v_job_version, 'payment_confirmed', null,
        'REPORT_QUEUED', 0, p_technical_reference, 5
      )
      on conflict (request_key) do nothing
      returning id into v_job_id;
    exception when unique_violation then
      v_job_id := null;
    end;

    if v_job_id is not null then
      v_fulfilment_result := 'QUEUED';
      insert into public.order_events(order_id, event_type, note, metadata_json)
      values (
        v_order.id, 'generation_requested', 'Verified payment queued deterministic Phase 1 generation.',
        pg_catalog.jsonb_build_object(
          'attempt_id', v_job_id, 'source', 'payment_confirmed', 'technical_reference', p_technical_reference
        )
      );
    else
      v_fulfilment_result := 'ALREADY_ACTIVE';
    end if;
  end if;

  return pg_catalog.jsonb_build_object(
    'applied', true, 'duplicate', false, 'state', p_new_state,
    'event_id', v_event.id, 'order_id', v_order.id,
    'fulfilment', v_fulfilment_result, 'fulfilment_attempt_id', v_job_id
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
      'applied', false, 'duplicate', true, 'state', v_existing.new_state,
      'event_id', v_existing.id, 'fulfilment_attempt_id', null
    );
  end if;
  raise;
end;
$$;

revoke all on function public.record_payment_transition(
  text, text, text, text, integer, text, text, text, timestamptz, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.record_payment_transition(
  text, text, text, text, integer, text, text, text, timestamptz, text, text, text, text, text
) to service_role;
