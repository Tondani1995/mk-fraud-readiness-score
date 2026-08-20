-- G23 correction: allow the existing atomic provider-event state machine to run from the
-- exact Preview development ingestion path after signed database attestation. Production keeps
-- the existing webhook_mutation security gate and the state machine remains single-sourced.

begin;

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
  v_preview_context boolean :=
    lower(trim(coalesce(p_provider, ''))) = 'resend'
    and current_setting('phase14.authoritative_transition', true) = 'preview_development_rpc'
    and current_setting('phase14.preview_webhook_ingestion', true) = 'resend'
    and coalesce(auth.jwt()->>'role', '') = 'service_role';
begin
  if not v_preview_context then
    perform public.phase14_require_security('webhook_mutation', array['platform_admin']::public.admin_role[], false, true);
  end if;
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
      ) on conflict (alert_key) do nothing;
    end if;
  end if;
  update public.email_provider_events set processed_at = now(), processing_error = null where id = v_provider_event_id;
  return jsonb_build_object('duplicate', false, 'conflict', false, 'state_updated', v_applied, 'status', v_status);
end;
$$;

create or replace function public.preview_development_ingest_phase14_provider_webhook(
  p_provider text,
  p_provider_event_id text,
  p_provider_message_id text,
  p_event_type text,
  p_event_created_at text,
  p_payload_sha256 text,
  p_payload_json jsonb,
  p_attested_at_epoch bigint,
  p_nonce uuid,
  p_attestation_hmac text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'phase14_service_role_required';
  end if;
  if lower(trim(coalesce(p_provider,''))) <> 'resend' then
    raise exception 'preview_development_provider_forbidden';
  end if;
  perform set_config('phase14.authoritative_transition', 'preview_development_rpc', true);
  perform set_config('phase14.preview_webhook_ingestion', 'resend', true);
  return phase14_private.ingest_phase14_provider_webhook_core(
    p_provider,p_provider_event_id,p_provider_message_id,p_event_type,p_event_created_at,
    p_payload_sha256,p_payload_json,p_attested_at_epoch,p_nonce,p_attestation_hmac,
    'preview_development_rpc'
  );
end;
$$;

revoke all on function public.apply_email_provider_event_atomic(text,text,text,text,timestamptz,text,jsonb) from public, anon, authenticated;
grant execute on function public.apply_email_provider_event_atomic(text,text,text,text,timestamptz,text,jsonb) to service_role;
revoke all on function public.preview_development_ingest_phase14_provider_webhook(text,text,text,text,text,text,jsonb,bigint,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.preview_development_ingest_phase14_provider_webhook(text,text,text,text,text,text,jsonb,bigint,uuid,text) to service_role;

commit;
