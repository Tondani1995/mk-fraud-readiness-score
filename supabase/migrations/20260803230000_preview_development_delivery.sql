-- Preview-only development delivery exception.
--
-- These narrowly scoped SECURITY DEFINER facades are callable only by service_role and are
-- intentionally separate from the Phase 14 RPCs. The application gate is exact (Preview,
-- MK_DEVELOPMENT_MODE=enabled, staging project, test provider, and the named allowlist entry),
-- while the database facade additionally binds the operation to the one development recipient.
-- Production must never receive this migration.

begin;

create or replace function public.preview_development_prepare_premium_report_delivery(
  p_report_id uuid,
  p_recipient text,
  p_provider text default 'resend'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_context jsonb;
  v_event public.email_events%rowtype;
  v_auth public.report_delivery_authorizations%rowtype;
  v_attempt integer;
  v_dedupe text;
  v_lease uuid := gen_random_uuid();
begin
  if lower(trim(p_recipient)) <> 'admin@mkfraud.co.za' then
    raise exception 'preview_development_recipient_forbidden';
  end if;
  if lower(trim(coalesce(p_provider, ''))) <> 'resend' then
    raise exception 'preview_development_provider_forbidden';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'preview-development-delivery:' || p_report_id::text || ':' || lower(trim(p_recipient)), 0
    )
  );

  v_context := public.phase14_delivery_entitlement(
    p_report_id, lower(trim(p_recipient)), true, 'email_delivery'
  );

  select * into v_auth
  from public.report_delivery_authorizations
  where report_id = p_report_id
    and recipient_email = lower(trim(p_recipient))
    and status in ('queued','claimed','dispatching','reconciliation_required','retry_scheduled')
  order by authorised_at desc
  limit 1;
  if found then
    select * into v_event from public.email_events where id = v_auth.email_event_id;
    return jsonb_build_object(
      'reused_existing_send', true, 'in_progress', true,
      'authorization_id', v_auth.id, 'email_event_id', v_auth.email_event_id,
      'provider_message_id', v_auth.provider_message_id,
      'provider_request_key', v_event.provider_request_key,
      'recipient', v_auth.recipient_email, 'status', 'in_progress',
      'test_delivery', true, 'claimed', true, 'lease_token', v_auth.lease_token,
      'report_id', v_auth.report_id, 'report_checksum', v_auth.report_checksum
    );
  end if;

  select * into v_event
  from public.email_events
  where report_id = p_report_id
    and recipient_email = lower(trim(p_recipient))
    and notification_type = 'premium_report_pdf'
    and status in ('sent','delivery_delayed','delivered','bounced','complained')
  order by created_at desc
  limit 1;
  if found then
    return jsonb_build_object(
      'reused_existing_send', true, 'email_event_id', v_event.id,
      'provider_message_id', v_event.provider_message_id,
      'recipient', lower(trim(p_recipient)), 'status', v_event.status,
      'test_delivery', true
    );
  end if;

  select count(*) + 1 into v_attempt
  from public.email_events
  where report_id = p_report_id and notification_type = 'premium_report_pdf';
  v_dedupe := 'premium-report-delivery:' || p_report_id::text || ':'
    || lower(trim(p_recipient)) || ':attempt-' || v_attempt::text;

  insert into public.email_events(
    assessment_id, order_id, report_id, recipient_email, template_key, notification_type,
    dedupe_key, provider_request_key, provider_idempotency_key, provider, status,
    attempt_number, metadata_json, send_lease_token, send_lease_expires_at, delivery_updated_at
  ) values (
    (v_context->>'assessment_id')::uuid, (v_context->>'order_id')::uuid, p_report_id,
    lower(trim(p_recipient)), 'premium_report_pdf_v1', 'premium_report_pdf',
    v_dedupe, v_dedupe, v_dedupe, lower(trim(p_provider)), 'sending', v_attempt,
    jsonb_build_object('attachment_checksum', v_context->>'report_checksum',
      'test_delivery', true, 'preview_development_mode', true),
    v_lease, now() + interval '10 minutes', now()
  ) returning * into v_event;

  insert into public.report_delivery_authorizations(
    report_id, report_checksum, recipient_email, order_id, assessment_id, score_run_id,
    security_gate_version, authorised_by, authorised_session_id, worker_capability_id,
    provider, email_event_id, test_delivery, status, lease_token, lease_expires_at,
    dispatch_started_at, updated_at
  ) values (
    p_report_id, v_context->>'report_checksum', lower(trim(p_recipient)),
    (v_context->>'order_id')::uuid, (v_context->>'assessment_id')::uuid,
    (v_context->>'score_run_id')::uuid, null, null, null, null, lower(trim(p_provider)),
    v_event.id, true, 'dispatching', v_lease, now() + interval '10 minutes', now(), now()
  ) returning * into v_auth;

  return jsonb_build_object(
    'reused_existing_send', false, 'authorization_id', v_auth.id,
    'email_event_id', v_event.id, 'provider_request_key', v_event.provider_request_key,
    'recipient', v_auth.recipient_email, 'status', v_auth.status,
    'test_delivery', true, 'claimed', true, 'lease_token', v_auth.lease_token,
    'report_id', v_auth.report_id, 'report_checksum', v_auth.report_checksum
  );
end;
$$;

create or replace function public.preview_development_finalize_premium_report_delivery(
  p_authorization_id uuid,
  p_email_event_id uuid,
  p_provider_message_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth public.report_delivery_authorizations%rowtype;
  v_event public.email_events%rowtype;
  v_existing public.report_delivery_finalizations%rowtype;
  v_context jsonb;
  v_report public.reports%rowtype;
begin
  if coalesce(trim(p_provider_message_id), '') = '' then
    raise exception 'preview_development_provider_message_id_required';
  end if;
  select * into v_auth from public.report_delivery_authorizations
  where id = p_authorization_id for update;
  if not found or v_auth.email_event_id <> p_email_event_id then
    raise exception 'preview_development_delivery_binding_mismatch';
  end if;
  select * into v_existing from public.report_delivery_finalizations
  where authorization_id = p_authorization_id;
  if found then
    if v_existing.email_event_id = p_email_event_id
       and v_existing.provider_message_id = p_provider_message_id then
      return jsonb_build_object('finalized', true, 'idempotent_replay', true,
        'report_id', v_existing.report_id, 'email_event_id', v_existing.email_event_id);
    end if;
    raise exception 'preview_development_finalization_replay_conflict';
  end if;
  if v_auth.status not in ('dispatching','reconciliation_required') or not v_auth.test_delivery then
    raise exception 'preview_development_finalization_state_invalid';
  end if;

  v_context := public.phase14_delivery_entitlement(
    v_auth.report_id, v_auth.recipient_email::text, true, 'email_delivery'
  );
  if v_context->>'report_checksum' <> v_auth.report_checksum then
    raise exception 'preview_development_entitlement_changed';
  end if;
  select * into v_report from public.reports where id = v_auth.report_id for update;
  if not found then raise exception 'preview_development_report_missing'; end if;
  select * into v_event from public.email_events where id = p_email_event_id for update;
  if not found then raise exception 'preview_development_email_missing'; end if;
  update public.email_events
  set status = 'sent', provider = v_auth.provider,
      provider_message_id = p_provider_message_id, sent_at = coalesce(sent_at, now()),
      delivery_updated_at = now(), send_lease_token = null,
      send_lease_expires_at = null, error_message = null
  where id = p_email_event_id and status in ('sending','provider_acceptance_uncertain','reconciliation_required');
  if not found then raise exception 'preview_development_email_cas_failed'; end if;

  insert into public.report_delivery_finalizations(
    authorization_id, email_event_id, report_id, fulfilment_id, provider,
    provider_message_id, finalized_at
  ) values (
    v_auth.id, p_email_event_id, v_report.id, v_report.fulfilment_id,
    v_auth.provider, p_provider_message_id, now()
  );
  insert into public.report_events(report_id, event_type, actor_user_id, note, metadata_json)
  values (v_report.id, 'email_test_sent', null, 'Preview development delivery finalized.',
    jsonb_build_object('authorization_id', v_auth.id, 'email_event_id', p_email_event_id,
      'provider_message_id', p_provider_message_id, 'test_delivery', true,
      'development_mode', true));
  insert into public.audit_logs(actor_type, actor_user_id, assessment_id,
    entity_table, entity_id, action, after_json)
  values ('system', null, v_auth.assessment_id, 'reports', v_report.id,
    'premium_report_preview_development_delivery_finalized',
    jsonb_build_object('authorization_id', v_auth.id, 'email_event_id', p_email_event_id,
      'provider_message_id', p_provider_message_id, 'test_delivery', true));
  update public.report_delivery_authorizations
  set status = 'finalized', provider_message_id = p_provider_message_id,
      finalized_at = now(), lease_token = null, lease_expires_at = null, updated_at = now()
  where id = v_auth.id and status in ('dispatching','reconciliation_required');
  if not found then raise exception 'preview_development_authorization_cas_failed'; end if;
  return jsonb_build_object('finalized', true, 'idempotent_replay', false,
    'report_id', v_report.id, 'email_event_id', p_email_event_id);
end;
$$;

create or replace function public.preview_development_mark_reconciliation_required(
  p_authorization_id uuid,
  p_provider_message_id text default null,
  p_reason text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.report_delivery_authorizations
  set status = 'reconciliation_required', provider_message_id = coalesce(p_provider_message_id, provider_message_id),
      updated_at = now()
  where id = p_authorization_id and status = 'dispatching';
  update public.email_events e
  set status = 'reconciliation_required', error_message = left(coalesce(p_reason, 'Provider acceptance requires reconciliation.'), 1000),
      reconciliation_required_at = now(), delivery_updated_at = now()
  from public.report_delivery_authorizations a
  where a.id = p_authorization_id and e.id = a.email_event_id and e.status = 'sending';
  return true;
end;
$$;

revoke all on function public.preview_development_prepare_premium_report_delivery(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.preview_development_finalize_premium_report_delivery(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.preview_development_mark_reconciliation_required(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.preview_development_prepare_premium_report_delivery(uuid, text, text) to service_role;
grant execute on function public.preview_development_finalize_premium_report_delivery(uuid, uuid, text) to service_role;
grant execute on function public.preview_development_mark_reconciliation_required(uuid, text, text) to service_role;

commit;
