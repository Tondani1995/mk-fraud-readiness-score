-- RC1: audited parking of a queued or retry-scheduled fulfilment attempt.
--
-- claim_next_fulfilment_job() selects any attempt in REPORT_QUEUED or RETRY_SCHEDULED whose
-- next_attempt_at has passed. A failed certification attempt therefore stays eligible indefinitely
-- and will run again the moment a worker executes in a released window, producing an unintended
-- second generation. Until now the only route to a terminal state was exhausting max_attempts:
-- reject_quality_review() creates a NEW queued attempt, and retry/recover make an attempt more
-- runnable, not less. There was no way to stand one down deliberately.
--
-- This adds that control. It parks the attempt at MANUAL_REVIEW_REQUIRED -- a status
-- claim_next_fulfilment_job() does not select -- clears next_attempt_at, and records who did it and
-- why. The attempt row and every prior piece of evidence are preserved; nothing is deleted.
--
-- Authority mirrors the other RC1 control-plane functions: platform admin at AAL2, checked by
-- rc1_require_platform_admin(true). Execute is granted to authenticated only, never to anon or
-- service_role, so there is no service-role path even if a route were changed carelessly.

begin;

create or replace function public.rc1_park_fulfilment_attempt(
  p_attempt_id uuid,
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
  v_attempt public.manual_report_generation_attempts%rowtype;
  v_existing_event uuid;
begin
  v_actor := public.rc1_require_platform_admin(true);

  if p_attempt_id is null then
    raise exception 'rc1_park_attempt:attempt_required';
  end if;
  if pg_catalog.char_length(v_reason) < 10 or pg_catalog.char_length(v_reason) > 500 then
    raise exception 'rc1_park_attempt:meaningful_reason_required';
  end if;

  select * into v_attempt
  from public.manual_report_generation_attempts
  where id = p_attempt_id
  for update;

  if not found then
    raise exception 'rc1_park_attempt:attempt_not_found';
  end if;

  -- Idempotent: an attempt already parked returns its existing state without a second event.
  if v_attempt.status = 'MANUAL_REVIEW_REQUIRED' and v_attempt.next_attempt_at is null then
    return pg_catalog.jsonb_build_object(
      'attempt_id', v_attempt.id,
      'status', v_attempt.status,
      'already_parked', true,
      'claimable', false
    );
  end if;

  -- A published attempt must never be reopened or restated.
  if v_attempt.output_report_id is not null then
    raise exception 'rc1_park_attempt:attempt_already_published';
  end if;

  -- An attempt a worker currently holds must not be pulled out from under it.
  if v_attempt.lease_owner is not null
     and v_attempt.lease_expires_at is not null
     and v_attempt.lease_expires_at > pg_catalog.now() then
    raise exception 'rc1_park_attempt:attempt_actively_claimed';
  end if;

  -- Fail closed on every other state: only a genuinely queued or retry-scheduled attempt is
  -- eligible. COMPLETED, GENERATION_FAILED, AWAITING_QUALITY_REVIEW and the rest are refused.
  if v_attempt.status not in ('REPORT_QUEUED', 'RETRY_SCHEDULED') then
    raise exception 'rc1_park_attempt:attempt_not_parkable';
  end if;

  update public.manual_report_generation_attempts
  set status = 'MANUAL_REVIEW_REQUIRED',
      next_attempt_at = null,
      lease_owner = null,
      lease_expires_at = null,
      quality_review_reason = left(v_reason, 500),
      quality_reviewed_by = pg_catalog.nullif(v_actor->>'user_id', '')::uuid,
      quality_reviewed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  where id = p_attempt_id;

  -- Exactly one audit event per parking action. Guarded so a concurrent caller cannot double it.
  select id into v_existing_event
  from public.order_events
  where order_id = v_attempt.order_id
    and event_type = 'fulfilment_attempt_parked'
    and metadata_json->>'attempt_id' = p_attempt_id::text
  limit 1;

  if v_existing_event is null then
    insert into public.order_events(order_id, event_type, note, metadata_json)
    values (
      v_attempt.order_id,
      'fulfilment_attempt_parked',
      'A queued report generation attempt was stood down for manual review and can no longer be claimed automatically.',
      pg_catalog.jsonb_build_object(
        'attempt_id', p_attempt_id,
        'previous_status', v_attempt.status,
        'new_status', 'MANUAL_REVIEW_REQUIRED',
        'actor_fingerprint', v_actor->>'actor_fingerprint',
        'reason_fingerprint', pg_catalog.encode(
          extensions.digest(pg_catalog.convert_to(v_reason, 'UTF8'), 'sha256'), 'hex'),
        'parked_at', pg_catalog.now()
      )
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'attempt_id', p_attempt_id,
    'status', 'MANUAL_REVIEW_REQUIRED',
    'already_parked', false,
    'claimable', false,
    'previous_status', v_attempt.status
  );
end;
$$;

revoke all on function public.rc1_park_fulfilment_attempt(uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.rc1_park_fulfilment_attempt(uuid,text) to authenticated;

comment on function public.rc1_park_fulfilment_attempt(uuid,text) is
  'Audited stand-down of a non-running REPORT_QUEUED or RETRY_SCHEDULED fulfilment attempt to MANUAL_REVIEW_REQUIRED, clearing next_attempt_at so claim_next_fulfilment_job cannot select it. Preserves the attempt and all prior evidence; idempotent; refuses actively claimed, published or otherwise-stated attempts.';

commit;
