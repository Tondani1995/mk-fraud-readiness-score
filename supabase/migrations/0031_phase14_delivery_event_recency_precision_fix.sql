-- Phase 14 -- H4 concurrency-determinism fix, discovered while investigating an intermittently
-- flaky test (scripts/phase14-delivery-reconciliation-tests.mjs test #4, "concurrent duplicate
-- webhook never double-applies").
--
-- Root cause (proven by direct instrumentation of a real failing run, not assumed): the "loser"
-- of a genuine two-client race was NEVER the problem -- the unique-violation-catching /
-- SELECT...FOR UPDATE dedup logic in ingest_phase14_provider_webhook and
-- apply_email_provider_event_atomic (0017, 0028) already serialises correctly and never
-- double-applies. The actual bug is in apply_email_provider_event_atomic's recency guard:
--
--   if v_incoming_rank >= v_current_rank
--      and (v_email.delivery_updated_at is null or p_event_created_at >= v_email.delivery_updated_at)
--
-- p_event_created_at is a client-supplied event timestamp with, at best, MILLISECOND precision
-- (Resend's webhook payload's created_at field, and this application's own
-- new Date().toISOString() calls, both truncate to milliseconds). v_email.delivery_updated_at is
-- set from Postgres's own now(), which has MICROSECOND precision. When a webhook's real-world
-- event genuinely happens a few microseconds after delivery_updated_at was last written (the
-- normal, correct, non-stale case), p_event_created_at's millisecond truncation can make it
-- compare as LESS THAN a delivery_updated_at that has non-zero microseconds beyond the truncated
-- millisecond boundary -- even though the event is not actually stale. A concrete traced example
-- from a real failing run: delivery_updated_at = 19:34:20.630181, p_event_created_at (after
-- millisecond truncation) = 19:34:20.630000 -- 181 microseconds "earlier" purely from truncation,
-- causing a rank-increasing, genuinely-current webhook event (reconciliation_required -> sent) to
-- be silently rejected as "stale" and state_updated incorrectly reported as false, even though the
-- event was correctly the authoritative winner of the underlying row-level race.
--
-- This was never a data-integrity bug (the two-client concurrency test's OTHER assertions --
-- final email_events.status = 'sent', provider_message_id correctly bound, no unhandled error --
-- passed in every observed run, including the "failing" ones; the state transition, when it
-- happened, was always applied exactly once, never twice). It was a precision-mismatch bug that
-- could, in production, cause a legitimate webhook event to be silently and incorrectly treated as
-- stale purely due to clock-resolution truncation, which is a real correctness defect independent
-- of concurrency -- concurrent delivery merely made it reliably reproducible in testing because it
-- is the one place delivery_updated_at (DB-set) and p_event_created_at (client-set, millisecond
-- truncated) are captured close enough together in time for the precision gap to matter.
--
-- Fix: truncate the comparison to millisecond precision on both sides. The event-ordering
-- guarantee this check exists for (reject a genuinely older/out-of-order event) is fully preserved
-- -- it operates at the precision the incoming data can actually carry -- while removing spurious
-- rejections caused by comparing against sub-millisecond noise from Postgres's own now() that has
-- no correspondence to any real-world event ordering.
create or replace function public.apply_email_provider_event_atomic(
  p_provider text,
  p_provider_event_id text,
  p_provider_message_id text,
  p_event_type text,
  p_event_created_at timestamptz,
  p_payload_fingerprint text,
  p_payload_json jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email public.email_events%rowtype; v_existing public.email_provider_events%rowtype;
  v_provider_event_id uuid; v_status text; v_current_rank integer; v_incoming_rank integer;
  v_applied boolean := false; v_supported boolean; v_payload jsonb; v_payload_size integer;
begin
  perform public.phase14_require_security('webhook_mutation', array['platform_admin']::public.admin_role[], false, true);
  if length(p_payload_fingerprint) <> 64 or p_payload_fingerprint ~ '[^0-9a-f]' then
    raise exception 'webhook_payload_fingerprint_invalid';
  end if;
  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'type', p_payload_json->>'type', 'created_at', p_payload_json->>'created_at', 'reason', p_payload_json->>'reason'
  ));
  v_payload_size := octet_length(v_payload::text);
  if v_payload_size > 65536 then raise exception 'webhook_minimal_payload_too_large'; end if;
  v_status := case p_event_type
    when 'email.sent' then 'sent' when 'email.delivery_delayed' then 'delivery_delayed'
    when 'email.delivered' then 'delivered' when 'email.failed' then 'delivery_failed'
    when 'email.bounced' then 'bounced' when 'email.suppressed' then 'bounced'
    when 'email.complained' then 'complained' else null end;
  v_supported := v_status is not null;

  select * into v_existing from public.email_provider_events
  where provider = lower(trim(p_provider)) and provider_event_id = p_provider_event_id for update;
  if found then
    if v_existing.payload_fingerprint is distinct from p_payload_fingerprint then
      update public.email_provider_events set processing_error = 'provider_event_payload_conflict', conflict_detected_at = now()
      where id = v_existing.id;
      insert into public.phase14_operational_alerts(alert_key, severity, category, email_event_id, detail_json)
      values ('provider-event-conflict:' || lower(trim(p_provider)) || ':' || p_provider_event_id,
        'critical', 'provider_event_payload_conflict', v_existing.email_event_id,
        jsonb_build_object('provider', lower(trim(p_provider)), 'provider_event_id', p_provider_event_id))
      on conflict (alert_key) do nothing;
      return jsonb_build_object('duplicate', true, 'conflict', true, 'state_updated', false);
    end if;
    return jsonb_build_object('duplicate', true, 'conflict', false, 'state_updated', false);
  end if;

  if p_provider_message_id is not null then
    select * into v_email from public.email_events
    where provider = lower(trim(p_provider)) and provider_message_id = p_provider_message_id
    for update;
  end if;
  insert into public.email_provider_events(
    email_event_id, provider, provider_event_id, provider_message_id, event_type,
    event_created_at, payload_fingerprint, payload_size_bytes, supported_event, payload_json
  ) values (
    v_email.id, lower(trim(p_provider)), p_provider_event_id, p_provider_message_id, p_event_type,
    p_event_created_at, p_payload_fingerprint, v_payload_size, v_supported, v_payload
  ) returning id into v_provider_event_id;
  if not v_supported then
    update public.email_provider_events set processed_at = now(), processing_error = 'verified_unsupported_event' where id = v_provider_event_id;
    return jsonb_build_object('ignored', true, 'reason', 'unsupported_event', 'recorded', true);
  end if;
  if v_email.id is null then
    update public.email_provider_events set processing_error = 'unknown_provider_message', processed_at = now() where id = v_provider_event_id;
    return jsonb_build_object('ignored', true, 'reason', 'unknown_message');
  end if;

  v_current_rank := case v_email.status
    when 'queued' then 10 when 'sending' then 20 when 'provider_acceptance_uncertain' then 25
    when 'reconciliation_required' then 26 when 'sent' then 30 when 'delivery_delayed' then 40
    when 'delivered' then 50 when 'delivery_failed' then 60 when 'bounced' then 60
    when 'complained' then 70 when 'failed_before_provider' then 80 else 0 end;
  v_incoming_rank := case v_status when 'sent' then 30 when 'delivery_delayed' then 40
    when 'delivered' then 50 when 'delivery_failed' then 60 when 'bounced' then 60 when 'complained' then 70 else 0 end;
  -- Precision fix: compare at millisecond granularity on both sides so sub-millisecond noise in
  -- Postgres's own now() (used to set delivery_updated_at elsewhere) can never make a genuinely
  -- current, rank-increasing event compare as "stale" against a millisecond-truncated incoming
  -- timestamp. See this migration's header comment for the concrete traced example.
  if v_incoming_rank >= v_current_rank
     and (v_email.delivery_updated_at is null
          or date_trunc('milliseconds', p_event_created_at) >= date_trunc('milliseconds', v_email.delivery_updated_at)) then
    update public.email_events set status = v_status, provider_event_id = p_provider_event_id,
      delivered_at = case when v_status = 'delivered' then p_event_created_at else delivered_at end,
      delivery_updated_at = p_event_created_at,
      error_message = case when v_status in ('bounced','complained','delivery_failed') then coalesce(v_payload->>'reason', v_status) else null end,
      metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object(
        'last_provider_event_type', p_event_type, 'last_provider_event_created_at', p_event_created_at
      ) where id = v_email.id;
    v_applied := true;
  end if;
  update public.email_provider_events set processed_at = now(), processing_error = null where id = v_provider_event_id;
  return jsonb_build_object('duplicate', false, 'conflict', false, 'state_updated', v_applied, 'status', v_status);
end;
$$;

comment on function public.apply_email_provider_event_atomic(text,text,text,text,timestamptz,text,jsonb) is
  'Phase 14 H4: atomically applies a verified provider delivery event, ranked and recency-guarded '
  'against the current email_events state. Recency comparison truncates to millisecond precision '
  '(migration 0031) to avoid spurious staleness rejections caused by comparing a client-supplied, '
  'millisecond-precision event timestamp against a microsecond-precision database-set timestamp.';
