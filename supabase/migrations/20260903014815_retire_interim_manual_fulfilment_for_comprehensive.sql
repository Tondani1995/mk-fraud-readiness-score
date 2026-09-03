-- Restore the current automated Comprehensive fulfilment continuation after the interim
-- manual transition. This is a forward correction only: Essential remains on its existing manual
-- boundary, payment remains atomic/idempotent, and no legacy reviewer/engagement dependency is
-- introduced.
--
-- A REPORT_READY recovery claim is allowed only for an exact, still-verified Comprehensive
-- PDF/supporting-register package. The worker skips generation for that recovery and continues
-- through the existing release and secure-delivery chain.

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
  v_product_code text;
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
    select product.product_code into v_product_code
    from public.products product
    where product.id = v_order.product_id;

    -- Comprehensive is the only product on this automated route. Essential retains its
    -- established manual fulfilment behaviour and therefore receives no generation attempt.
    if v_product_code = 'mk_validated_assessment' then
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
          v_order.id, 'generation_requested', 'Verified payment queued Comprehensive fulfilment.',
          pg_catalog.jsonb_build_object(
            'attempt_id', v_job_id, 'source', 'payment_confirmed', 'technical_reference', p_technical_reference
          )
        );
      else
        v_fulfilment_result := 'ALREADY_ACTIVE';
      end if;
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

create or replace function public.claim_exact_fulfilment_job(
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
  v_product public.products%rowtype;
  v_report public.reports%rowtype;
  v_verified_register_count integer;
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

  if v_job.status = 'REPORT_READY' then
    -- A verified package may have committed before its immediate dispatch completed. Claim it
    -- only for Comprehensive, only when the exact PDF/register pair is still intact, and leave
    -- REPORT_READY in place so the existing release gate remains the authoritative transition.
    if (
      v_job.next_attempt_at is not null
      and v_job.next_attempt_at > pg_catalog.now()
    )
    or (
      v_job.lease_expires_at is not null
      and v_job.lease_expires_at > pg_catalog.now()
    ) then
      return null;
    end if;

    select * into v_product
    from public.products
    where id = v_order.product_id
    for share;
    select * into v_report
    from public.reports
    where id = v_job.output_report_id
    for share;
    select count(*) into v_verified_register_count
    from public.report_artifacts
    where report_id = v_job.output_report_id
      and engagement_id is null
      and artefact_type = 'supporting_register'
      and artifact_version = v_job.report_version
      and storage_status = 'VERIFIED'
      and release_state in ('verified', 'released');

    if v_product.product_code is distinct from 'mk_validated_assessment'
       or v_report.id is null
       or v_report.order_id is distinct from v_job.order_id
       or v_report.report_type is distinct from 'mk_validated'
       or v_report.version_number is distinct from v_job.report_version
       or v_report.status is distinct from 'generated'
       or v_report.storage_status is distinct from 'VERIFIED'
       or v_report.storage_verified_at is null
       or coalesce(v_report.file_size_bytes, 0) <= 0
       or v_report.mime_type is distinct from 'application/pdf'
       or coalesce(pg_catalog.btrim(v_report.storage_bucket), '') = ''
       or coalesce(pg_catalog.btrim(v_report.storage_path), '') = ''
       or coalesce(v_report.checksum, '') !~ '^[0-9a-f]{64}$'
       or v_verified_register_count <> 1
       or coalesce(v_job.evidence_checksum, '') !~ '^[0-9a-f]{64}$'
       or v_job.final_validation_json is null
       or pg_catalog.jsonb_typeof(v_job.final_validation_json) <> 'object' then
      return null;
    end if;

    update public.manual_report_generation_attempts
    set lease_owner = p_lease_owner,
        lease_expires_at =
          pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds),
        heartbeat_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    where id = v_job.id
    returning * into v_job;

    insert into public.audit_logs(
      actor_type, entity_table, entity_id, action, after_json
    ) values (
      'system',
      'manual_report_generation_attempts',
      v_job.id,
      'verified_comprehensive_fulfilment_recovered',
      pg_catalog.jsonb_build_object(
        'attempt_id', v_job.id,
        'order_id', v_job.order_id,
        'report_id', v_job.output_report_id,
        'lease_owner', p_lease_owner,
        'lease_expires_at', v_job.lease_expires_at,
        'provider_generation_reused', true
      )
    );

    return pg_catalog.to_jsonb(v_job)
      || pg_catalog.jsonb_build_object(
        'already_generated', true,
        'output_report_id', v_job.output_report_id
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

revoke all on function public.claim_exact_fulfilment_job(uuid, text, integer) from public, anon, authenticated, service_role;
grant execute on function public.claim_exact_fulfilment_job(uuid, text, integer) to service_role;
