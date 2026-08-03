-- G23: allow the exact Preview development webhook path to ingest signed Resend callbacks while
-- the rest of the Staging application remains under its normal RC1 controls. Production keeps
-- the existing public policy gate; this migration is applied to Staging only.

begin;

-- One private implementation is shared by the Production-gated facade and the exact Preview
-- development facade. The only behavioural difference is the authoritative transition context;
-- signature, attestation, binding, fallback correlation, idempotency, ordering and audit logic
-- remain one implementation.
create or replace function phase14_private.ingest_phase14_provider_webhook_core(
  p_provider text,
  p_provider_event_id text,
  p_provider_message_id text,
  p_event_type text,
  p_event_created_at text,
  p_payload_sha256 text,
  p_payload_json jsonb,
  p_attested_at_epoch bigint,
  p_nonce uuid,
  p_attestation_hmac text,
  p_transition_context text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_canonical text; v_id uuid; v_result jsonb; v_created timestamptz;
  v_authorization_id uuid; v_email_event_id uuid;
  v_tagged_attempt_ref text; v_tagged_authorization_id uuid;
begin
  if p_transition_context not in ('trusted_provider_attestation','preview_development_rpc') then
    raise exception 'phase14_provider_webhook_transition_context_invalid';
  end if;
  if p_payload_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'webhook_payload_fingerprint_invalid'; end if;
  v_created := p_event_created_at::timestamptz;
  v_canonical := 'v1|webhook|' ||
    phase14_private.canonical_attestation_field(lower(trim(p_provider))) ||
    phase14_private.canonical_attestation_field(p_provider_event_id) ||
    phase14_private.canonical_attestation_field(coalesce(p_provider_message_id,'')) ||
    phase14_private.canonical_attestation_field(p_event_type) ||
    phase14_private.canonical_attestation_field(p_event_created_at) ||
    phase14_private.canonical_attestation_field(p_payload_sha256) ||
    phase14_private.canonical_attestation_field(p_attested_at_epoch::text) ||
    phase14_private.canonical_attestation_field(p_nonce::text);
  perform phase14_private.verify_hmac(
    'provider_webhook_db_hmac',v_canonical,p_attestation_hmac,p_attested_at_epoch
  );

  perform set_config('phase14.authoritative_transition', p_transition_context, true);

  -- Correlate a lost-response attempt from the send-time delivery_attempt_ref tag before the
  -- strict provider-message lookup. The authorization id is a primary key, and this fallback
  -- only backfills a reconciliation_required row with no known provider message id.
  if p_provider_message_id is not null then
    v_tagged_attempt_ref := (
      select elem->>'value' from jsonb_array_elements(coalesce(p_payload_json->'data'->'tags', '[]'::jsonb)) elem
      where elem->>'name' = 'delivery_attempt_ref' limit 1
    );
    if v_tagged_attempt_ref is not null and v_tagged_attempt_ref ~ '^[0-9a-f]{32}$' then
      v_tagged_authorization_id := (
        substring(v_tagged_attempt_ref,1,8) || '-' || substring(v_tagged_attempt_ref,9,4) || '-' ||
        substring(v_tagged_attempt_ref,13,4) || '-' || substring(v_tagged_attempt_ref,17,4) || '-' ||
        substring(v_tagged_attempt_ref,21,12)
      )::uuid;
      update public.email_events e
      set provider_message_id = p_provider_message_id
      from public.report_delivery_authorizations a
      where a.id = v_tagged_authorization_id
        and a.email_event_id = e.id
        and a.provider = lower(trim(p_provider))
        and e.provider = lower(trim(p_provider))
        and e.status = 'reconciliation_required'
        and e.provider_message_id is null;
    end if;
  end if;

  select e.id,a.id into v_email_event_id,v_authorization_id
  from public.email_events e
  left join public.report_delivery_authorizations a on a.email_event_id=e.id
  where e.provider=lower(trim(p_provider))
    and e.provider_message_id=p_provider_message_id
  order by e.created_at desc limit 1;

  insert into public.phase14_provider_attestations(
    attestation_source,provider,provider_event_id,authorization_id,email_event_id,
    provider_message_id,provider_state,event_created_at,payload_sha256,nonce,attested_at,
    minimal_payload_json
  ) values (
    'webhook',lower(trim(p_provider)),p_provider_event_id,v_authorization_id,v_email_event_id,
    p_provider_message_id,p_event_type,v_created,p_payload_sha256,p_nonce,
    to_timestamp(p_attested_at_epoch),
    jsonb_strip_nulls(jsonb_build_object('type',p_payload_json->>'type',
      'created_at',p_payload_json->>'created_at','reason',p_payload_json->>'reason'))
  ) on conflict (provider,provider_event_id) where attestation_source='webhook'
  do nothing returning id into v_id;

  if v_id is null then
    select id into v_id from public.phase14_provider_attestations
    where attestation_source='webhook' and provider=lower(trim(p_provider))
      and provider_event_id=p_provider_event_id
      and provider_message_id is not distinct from p_provider_message_id
      and provider_state=p_event_type and event_created_at=v_created
      and payload_sha256=p_payload_sha256;
    if v_id is null then raise exception 'phase14_webhook_replay_mismatch'; end if;
  end if;

  begin
    v_result := public.apply_email_provider_event_atomic(
      p_provider,p_provider_event_id,p_provider_message_id,p_event_type,v_created,
      p_payload_sha256,p_payload_json
    );
  exception when unique_violation then
    v_result := jsonb_build_object('duplicate',true,'conflict',false,'state_updated',false,'concurrent',true);
  end;
  return v_result || jsonb_build_object('attestation_id',v_id);
end;
$$;

create or replace function public.ingest_phase14_provider_webhook(
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
  perform public.phase14_require_policy('provider_webhook_ingestion');
  return phase14_private.ingest_phase14_provider_webhook_core(
    p_provider,p_provider_event_id,p_provider_message_id,p_event_type,p_event_created_at,
    p_payload_sha256,p_payload_json,p_attested_at_epoch,p_nonce,p_attestation_hmac,
    'trusted_provider_attestation'
  );
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
  return phase14_private.ingest_phase14_provider_webhook_core(
    p_provider,p_provider_event_id,p_provider_message_id,p_event_type,p_event_created_at,
    p_payload_sha256,p_payload_json,p_attested_at_epoch,p_nonce,p_attestation_hmac,
    'preview_development_rpc'
  );
end;
$$;

revoke all on function phase14_private.ingest_phase14_provider_webhook_core(text,text,text,text,text,text,jsonb,bigint,uuid,text,text) from public, anon, authenticated, service_role;
revoke all on function public.ingest_phase14_provider_webhook(text,text,text,text,text,text,jsonb,bigint,uuid,text) from public, anon, authenticated, service_role;
revoke all on function public.preview_development_ingest_phase14_provider_webhook(text,text,text,text,text,text,jsonb,bigint,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.ingest_phase14_provider_webhook(text,text,text,text,text,text,jsonb,bigint,uuid,text) to service_role;
grant execute on function public.preview_development_ingest_phase14_provider_webhook(text,text,text,text,text,text,jsonb,bigint,uuid,text) to service_role;

commit;
