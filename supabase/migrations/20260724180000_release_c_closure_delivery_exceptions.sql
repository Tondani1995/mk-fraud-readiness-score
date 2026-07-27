-- Release C closure cycle. Three independent, additive fixes found during Release C's own
-- end-of-cycle review (docs/safe-launch/09-release-evidence.md):
--
-- 1. Missing-recipient handling: approve_quality_review() (redefined again below, full existing
--    Release C body reproduced faithfully) already skips creating a delivery job when
--    orders.customer_email is null, and already writes an audit_logs entry for it -- but that
--    was only a log line, not a visible, correctable, owned exception. This migration adds: a
--    'delivery_recipient_required' order_events row (queryable by the admin UI), a
--    'delivery_exception' field on approve_quality_review()'s own return value (so the calling
--    TS code can fire exactly one internal MK alert, deduped like every other notification in
--    this codebase -- no alert loop), and a new admin RPC,
--    correct_delivery_recipient_and_queue(), that lets an authorised operator supply the
--    correct address and create the (previously-skipped) delivery job for the *existing*
--    released report, with no regeneration.
--
-- 2. Bounce/complaint owned exceptions + complaint/permanent-bounce resend suppression:
--    apply_email_provider_event_atomic() (redefined again below, full existing 0031 body
--    reproduced faithfully) already updates email_events.status on a bounce/complaint webhook
--    event, but never created anything an admin would actually see, and nothing prevented an
--    admin from reissuing a fresh link to an address that had already bounced permanently or
--    complained. This migration adds: an order_events row and a phase14_operational_alerts row
--    (the existing "MK operational exception" mechanism, previously only used for the
--    provider-event-conflict case) on every bounce/complaint, and a resend-suppression check in
--    reissue_customer_report_access_token() (signature extended with a trailing
--    p_override_suppression boolean default false, per Postgres's own rule that CREATE OR
--    REPLACE can only extend a function's parameter list with defaulted trailing parameters, or
--    the parameter list must match exactly -- adding one here means the old 5-parameter overload
--    is explicitly dropped first so there is only ever one, current implementation, not two that
--    could silently diverge).
--
-- 3. Status-vocabulary rank fix: apply_email_provider_event_atomic()'s ordering/staleness rank
--    check (v_current_rank) only recognised the older lowercase Phase14 status vocabulary
--    (queued/sending/sent/delivered/...). Release C's own mark_delivery_dispatch_started()/
--    finalize_delivery()/fail_delivery() write a different, uppercase vocabulary
--    (PROVIDER_REQUEST_STARTED/PROVIDER_ACCEPTED/RETRY_SCHEDULED/FAILED_TERMINAL). A row still in
--    one of those uppercase statuses when its first webhook event arrived was silently treated as
--    rank 0 (lowest) -- confirmed harmless in the current flow (the first webhook always has a
--    higher rank than 0 and always correctly applies) by the live webhook re-verification in the
--    prior work cycle, but fragile. Fixed here by adding the Release C statuses to the same rank
--    ladder, at the position matching their real meaning, rather than leaving them unrecognised.
--
-- Item 1 from this closure cycle's brief (unifying the admin delivery-state/queue display across
-- report_delivery_authorizations and the legacy manual_report_delivery_attempts table) is
-- deliberately NOT part of this migration -- it is being implemented independently in a separate
-- work session against this same branch, to avoid two divergent implementations of the same
-- display logic. This migration only touches the data model those two efforts both read from,
-- additively, in ways that do not depend on how that display logic ends up being written.

-- ---------------------------------------------------------------------------
-- 1. apply_email_provider_event_atomic(): status-vocabulary rank fix + bounce/complaint owned
--    exceptions. Full existing body from 0031_phase14_delivery_event_recency_precision_fix.sql
--    reproduced faithfully; additive changes marked inline.
-- ---------------------------------------------------------------------------

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
  -- Release C closure: 'email.bounced.transient' is a synthetic event_type the webhook route
  -- (src/app/score/api/webhooks/resend/route.ts) sends instead of the raw 'email.bounced' when
  -- the provider's own payload marks the bounce as transient/soft (data.bounce.type). It maps to
  -- the existing 'delivery_delayed' status -- the same status a real delay event produces -- so a
  -- temporary bounce stays retry-eligible via the existing admin reissue path, while a permanent
  -- (or type-undetermined, treated conservatively as permanent) bounce still maps to 'bounced'
  -- and is subject to the resend-suppression check added to reissue_customer_report_access_token()
  -- below. No new status value was introduced for this -- 'delivery_delayed' already had exactly
  -- the right retry-eligible semantics.
  v_status := case p_event_type
    when 'email.sent' then 'sent' when 'email.delivery_delayed' then 'delivery_delayed'
    when 'email.bounced.transient' then 'delivery_delayed'
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

  -- Release C closure: recognise Release C's own uppercase status vocabulary in the rank ladder
  -- (see this migration's header comment, "Status-vocabulary rank fix"). Positioned to match
  -- their real meaning relative to the pre-existing lowercase values.
  v_current_rank := case v_email.status
    when 'queued' then 10 when 'sending' then 20 when 'provider_acceptance_uncertain' then 25
    when 'reconciliation_required' then 26 when 'sent' then 30 when 'delivery_delayed' then 40
    when 'delivered' then 50 when 'delivery_failed' then 60 when 'bounced' then 60
    when 'complained' then 70 when 'failed_before_provider' then 80
    when 'PROVIDER_REQUEST_STARTED' then 20 when 'RETRY_SCHEDULED' then 26
    when 'PROVIDER_ACCEPTED' then 30 when 'FAILED_TERMINAL' then 80 else 0 end;
  v_incoming_rank := case v_status when 'sent' then 30 when 'delivery_delayed' then 40
    when 'delivered' then 50 when 'delivery_failed' then 60 when 'bounced' then 60 when 'complained' then 70 else 0 end;
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

    -- Release C closure: bounce/complaint owned exceptions. Every prior email_events update in
    -- this function was invisible to an admin unless they thought to query the table directly --
    -- these two writes make a permanent bounce or complaint show up in the same order activity
    -- timeline every other order event already appears in, and in the same
    -- phase14_operational_alerts table already used for the provider-event-conflict case above
    -- (open/acknowledged/resolved lifecycle, admin-readable). alert_key is derived from
    -- (email_event_id, status) so a duplicate/replayed event of the same outcome for the same
    -- email never creates a second alert (no alert loop) -- the on conflict do nothing here plays
    -- exactly the same role the identical clause already plays a few lines above.
    if v_status in ('bounced', 'complained') and v_email.order_id is not null then
      insert into public.order_events(order_id, event_type, note, metadata_json)
      values (
        v_email.order_id,
        case when v_status = 'complained' then 'delivery_complaint' else 'delivery_bounced' end,
        case when v_status = 'complained'
          then 'The recipient marked this report-ready email as spam. Resending is blocked pending an authorised override.'
          else 'The report-ready email permanently bounced. Resending to this address is blocked pending a corrected recipient or an authorised override.' end,
        jsonb_build_object('email_event_id', v_email.id, 'provider_event_type', p_event_type, 'reason', v_payload->>'reason')
      );
      insert into public.phase14_operational_alerts(alert_key, severity, category, email_event_id, detail_json)
      values (
        'delivery-' || v_status || ':' || v_email.id::text,
        case when v_status = 'complained' then 'critical' else 'warning' end,
        case when v_status = 'complained' then 'delivery_complaint' else 'delivery_permanent_bounce' end,
        v_email.id,
        jsonb_build_object('order_id', v_email.order_id, 'report_id', v_email.report_id, 'provider_event_type', p_event_type)
      )
      on conflict (alert_key) do nothing;
    end if;
  end if;
  update public.email_provider_events set processed_at = now(), processing_error = null where id = v_provider_event_id;
  return jsonb_build_object('duplicate', false, 'conflict', false, 'state_updated', v_applied, 'status', v_status);
end;
$$;

revoke all on function public.apply_email_provider_event_atomic(
  text, text, text, text, timestamptz, text, jsonb
) from public, anon, authenticated;
grant execute on function public.apply_email_provider_event_atomic(
  text, text, text, text, timestamptz, text, jsonb
) to service_role;

-- ---------------------------------------------------------------------------
-- 2. approve_quality_review(): missing-recipient exception is now visible and correctable, not
--    only logged. Full existing body from 20260724170000_release_c_email_secure_delivery.sql
--    reproduced faithfully; additive changes marked inline.
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
  v_report public.reports%rowtype;
  v_order public.orders%rowtype;
  v_now timestamptz := now();
  v_event public.email_events%rowtype;
  v_auth public.report_delivery_authorizations%rowtype;
  v_delivery_exception text := null;
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
      quality_reviewed_at = v_now,
      quality_review_decision = 'approved',
      quality_review_reason = v_note,
      delivery_queued_at = v_now,
      updated_at = v_now
  where id = p_attempt_id
  returning * into v_after;

  -- Release C addition: release the report and create the delivery authorization atomically
  -- with the approval itself. Closes the reports.status='released' gap identified in
  -- docs/safe-launch/14-release-c-existing-delivery-audit.md.
  select * into v_report from public.reports where id = v_after.output_report_id;
  if found then
    select * into v_order from public.orders where id = v_report.order_id;

    update public.reports
    set status = 'released', released_at = coalesce(released_at, v_now), updated_at = v_now
    where id = v_report.id;

    -- orders.customer_email is nullable; email_events.recipient_email is not. A legacy/malformed
    -- order with no email on file must not abort the whole approval -- the report is still
    -- correctly released, but no delivery job is created, and this is recorded plainly in the
    -- audit trail so an admin can add the missing address and queue delivery manually (a known,
    -- explicitly documented gap -- see docs/safe-launch/16-email-and-secure-delivery-runbook.md).
    if v_order.customer_email is not null then
      insert into public.email_events(
        order_id, report_id, recipient_email, template_key, notification_type, status,
        provider_mode, provider, dedupe_key, metadata_json
      ) values (
        v_report.order_id, v_report.id, v_order.customer_email, 'report_ready', 'report_ready', 'QUEUED',
        'disabled', 'resend',
        'report_ready:' || v_report.id::text || ':' || v_order.customer_email::text,
        jsonb_build_object('attempt_id', v_after.id, 'approved_by', v_actor_id)
      )
      on conflict (dedupe_key) where dedupe_key is not null do nothing
      returning * into v_event;

      if v_event.id is not null then
        insert into public.report_delivery_authorizations(
          report_id, report_checksum, recipient_email, order_id, assessment_id, score_run_id,
          security_gate_version, authorised_by, provider, email_event_id, status
        ) values (
          v_report.id, v_report.checksum, v_order.customer_email, v_report.order_id, v_report.assessment_id,
          (select current_score_run_id from public.assessments where id = v_report.assessment_id),
          null, v_actor_id, 'resend', v_event.id, 'queued'
        );
      end if;
    else
      -- Release C closure addition: was audit_logs-only before. Now also a visible,
      -- admin-orderable order_events row (the "owned delivery exception" this closure cycle
      -- requires) and a flag on this function's own return value so the calling TS code
      -- (fulfilment-service.ts's approveQualityReview()) can fire exactly one deduped internal
      -- MK alert. correct_delivery_recipient_and_queue() (below) is how an operator resolves it.
      v_delivery_exception := 'recipient_required';
      insert into public.order_events(order_id, event_type, note, metadata_json)
      values (
        v_report.order_id, 'delivery_recipient_required',
        'The report was approved and released, but no delivery could be queued because this order has no customer email on file. Use "Correct recipient and queue delivery" to resolve.',
        jsonb_build_object('report_id', v_report.id, 'attempt_id', v_after.id)
      );
      insert into public.audit_logs(actor_type, actor_user_id, entity_table, entity_id, action, after_json)
      values ('system', null, 'orders', v_report.order_id, 'delivery_not_queued_missing_recipient_email',
        jsonb_build_object('report_id', v_report.id, 'attempt_id', v_after.id));
    end if;
  end if;

  insert into public.audit_logs(actor_type, actor_user_id, entity_table, entity_id, action, before_json, after_json)
  values ('admin', v_actor_id, 'manual_report_generation_attempts', v_after.id, 'quality_review_approved', to_jsonb(v_before), to_jsonb(v_after));

  return to_jsonb(v_after) || jsonb_build_object('delivery_exception', v_delivery_exception);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. correct_delivery_recipient_and_queue(): resolves a 'recipient_required' exception. Updates
--    the order's customer_email (audited), then creates exactly the email_events/
--    report_delivery_authorizations pair approve_quality_review() would have created had the
--    email been present at approval time -- no report regeneration, matching the closure brief's
--    explicit requirement.
-- ---------------------------------------------------------------------------

create or replace function public.correct_delivery_recipient_and_queue(
  p_order_id uuid,
  p_new_recipient_email text,
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
  v_new_email public.citext := trim(coalesce(p_new_recipient_email, ''))::public.citext;
  v_order public.orders%rowtype;
  v_report public.reports%rowtype;
  v_old_email public.citext;
  v_event public.email_events%rowtype;
  v_auth public.report_delivery_authorizations%rowtype;
begin
  if v_actor_id is null then raise exception 'delivery_recipient_correction_no_session'; end if;
  select * into v_actor from public.admin_profiles where id = v_actor_id and status = 'active';
  if not found or v_actor.role not in ('platform_admin', 'reviewer', 'approver') then
    raise exception 'delivery_recipient_correction_role_forbidden';
  end if;
  if length(v_note) < 5 then raise exception 'delivery_recipient_correction_reason_too_short'; end if;
  if v_new_email::text !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'delivery_recipient_correction_invalid_email';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'delivery_recipient_correction_order_not_found'; end if;

  -- Only the latest released report with no existing delivery authorization is eligible -- this
  -- is deliberately narrow (matches approve_quality_review()'s own happy-path scope exactly, one
  -- report version, no ambiguity about which report an admin meant).
  select r.* into v_report from public.reports r
  where r.order_id = p_order_id and r.status = 'released'
    and not exists (select 1 from public.report_delivery_authorizations a where a.report_id = r.id)
  order by r.version_number desc limit 1;
  if not found then raise exception 'delivery_recipient_correction_no_pending_delivery'; end if;

  v_old_email := v_order.customer_email;
  update public.orders set customer_email = v_new_email, updated_at = now() where id = p_order_id;

  insert into public.email_events(
    order_id, report_id, recipient_email, template_key, notification_type, status,
    provider_mode, provider, dedupe_key, metadata_json
  ) values (
    p_order_id, v_report.id, v_new_email, 'report_ready', 'report_ready', 'QUEUED',
    'disabled', 'resend',
    'report_ready:' || v_report.id::text || ':' || v_new_email::text,
    jsonb_build_object('corrected_by', v_actor_id, 'reason', v_note)
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing
  returning * into v_event;

  if v_event.id is null then
    raise exception 'delivery_recipient_correction_already_queued';
  end if;

  insert into public.report_delivery_authorizations(
    report_id, report_checksum, recipient_email, order_id, assessment_id, score_run_id,
    security_gate_version, authorised_by, provider, email_event_id, status
  ) values (
    v_report.id, v_report.checksum, v_new_email, p_order_id, v_report.assessment_id,
    (select current_score_run_id from public.assessments where id = v_report.assessment_id),
    null, v_actor_id, 'resend', v_event.id, 'queued'
  ) returning * into v_auth;

  insert into public.order_events(order_id, event_type, note, metadata_json)
  values (
    p_order_id, 'delivery_recipient_corrected', v_note,
    jsonb_build_object('report_id', v_report.id, 'previous_email', v_old_email, 'new_email', v_new_email, 'corrected_by', v_actor_id)
  );
  insert into public.audit_logs(actor_type, actor_user_id, entity_table, entity_id, action, before_json, after_json)
  values ('admin', v_actor_id, 'orders', p_order_id, 'delivery_recipient_corrected',
    jsonb_build_object('customer_email', v_old_email), jsonb_build_object('customer_email', v_new_email, 'authorization_id', v_auth.id));

  return to_jsonb(v_auth);
end;
$$;

revoke all on function public.correct_delivery_recipient_and_queue(uuid, text, text) from public, anon, authenticated;
grant execute on function public.correct_delivery_recipient_and_queue(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. reissue_customer_report_access_token(): resend suppression after a permanent bounce or
--    complaint. Signature extended with a trailing p_override_suppression boolean default false
--    -- the old 5-parameter version is dropped first so there is only ever one implementation
--    (see this migration's header comment for why CREATE OR REPLACE alone can't safely do this).
--    Full existing body reproduced faithfully; additive changes marked inline.
-- ---------------------------------------------------------------------------

drop function if exists public.reissue_customer_report_access_token(uuid, uuid, text, text, integer);

create or replace function public.reissue_customer_report_access_token(
  p_order_id uuid,
  p_report_id uuid,
  p_recipient_email text,
  p_reason text,
  p_ttl_seconds integer default 604800,
  p_override_suppression boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor public.admin_profiles%rowtype;
  v_note text := trim(coalesce(p_reason, ''));
  v_report public.reports%rowtype;
  v_raw_token text;
  v_token_hash text;
  v_new public.customer_report_access_tokens%rowtype;
  v_event public.email_events%rowtype;
  v_suppressing_status text;
begin
  if v_actor_id is null then raise exception 'access_token_no_session'; end if;
  select * into v_actor from public.admin_profiles where id = v_actor_id and status = 'active';
  if not found or v_actor.role not in ('platform_admin', 'reviewer', 'approver') then
    raise exception 'access_token_role_forbidden';
  end if;
  if length(v_note) < 5 then raise exception 'access_token_reason_too_short'; end if;
  if p_ttl_seconds is null or p_ttl_seconds < 3600 or p_ttl_seconds > 2592000 then
    raise exception 'access_token_ttl_out_of_range';
  end if;

  select * into v_report from public.reports where id = p_report_id and order_id = p_order_id for update;
  if not found then raise exception 'access_token_report_order_mismatch'; end if;

  -- Release C closure addition: a permanent bounce or complaint against this exact report+
  -- recipient blocks a further automatic-feeling resend by default. p_override_suppression=true
  -- is the "explicit authorised intervention" the closure brief requires -- the reason text is
  -- still recorded either way, so an override is always attributable to who chose it and why.
  if not p_override_suppression then
    select status into v_suppressing_status from public.email_events
    where report_id = p_report_id and recipient_email = p_recipient_email::public.citext
      and status in ('bounced', 'complained')
    order by delivery_updated_at desc nulls last, created_at desc limit 1;
    if v_suppressing_status is not null then
      raise exception 'access_token_reissue_blocked_prior_%', v_suppressing_status;
    end if;
  end if;

  -- Revoke any existing active token for this report+recipient first (the partial unique index
  -- would otherwise reject the new insert), in the same transaction as issuing the new one.
  update public.customer_report_access_tokens
  set revoked_at = now(), revoked_reason = 'Superseded by reissue: ' || v_note, updated_at = now()
  where report_id = p_report_id and recipient_email = p_recipient_email::public.citext and revoked_at is null;

  v_raw_token := encode(extensions.gen_random_bytes(32), 'base64');
  v_raw_token := replace(replace(replace(v_raw_token, '+', '-'), '/', '_'), '=', '');
  v_token_hash := encode(extensions.digest(convert_to(v_raw_token, 'UTF8'), 'sha256'), 'hex');

  insert into public.customer_report_access_tokens(
    order_id, report_id, recipient_email, token_hash, expires_at, issued_by
  ) values (
    p_order_id, p_report_id, p_recipient_email::public.citext, v_token_hash,
    now() + make_interval(secs => p_ttl_seconds), v_actor_id
  ) returning * into v_new;

  insert into public.email_events(
    order_id, report_id, recipient_email, template_key, notification_type, status,
    provider_mode, dedupe_key, metadata_json
  ) values (
    p_order_id, p_report_id, p_recipient_email::public.citext, 'report_ready_reissue', 'report_ready_reissue', 'CREATED',
    'disabled', 'report_ready_reissue:' || v_new.id::text,
    jsonb_build_object('reason', v_note, 'token_id', v_new.id, 'override_suppression', p_override_suppression, 'suppressed_status', v_suppressing_status)
  ) returning * into v_event;

  insert into public.audit_logs(actor_type, actor_user_id, entity_table, entity_id, action, after_json)
  values ('admin', v_actor_id, 'customer_report_access_tokens', v_new.id, 'access_token_reissued',
    jsonb_build_object('order_id', p_order_id, 'report_id', p_report_id, 'reason', v_note, 'email_event_id', v_event.id, 'override_suppression', p_override_suppression));

  return jsonb_build_object('token', v_raw_token, 'token_id', v_new.id, 'expires_at', v_new.expires_at, 'email_event_id', v_event.id);
end;
$$;

revoke all on function public.reissue_customer_report_access_token(uuid, uuid, text, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.reissue_customer_report_access_token(uuid, uuid, text, text, integer, boolean) to authenticated;
