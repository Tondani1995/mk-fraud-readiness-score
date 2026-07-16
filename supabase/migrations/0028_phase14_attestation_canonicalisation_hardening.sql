-- Phase 14 launch readiness -- M10 + H4 (webhook correlation half). This migration has two
-- purposes, both touching the same two functions:
--
-- 1. M10: replace raw '|'-delimited HMAC canonicalisation with a
-- deterministic, unambiguous, versioned encoding, matching the TS-side change to
-- src/lib/reports/email/resend-webhook.ts (buildCanonicalAttestationString).
--
-- The two functions below (public.ingest_phase14_provider_webhook,
-- public.record_phase14_provider_lookup_attestation) previously built their canonical string with
-- concat_ws('|', ...). A field value containing '|' (for example inside p_event_type or a future
-- provider payload field) could shift the apparent boundary between two logical fields, so two
-- different logical inputs could -- in principle -- canonicalise to the same string and validate
-- against the same HMAC. This migration replaces that with a length-prefixed encoding
-- ("<byteLength>:<value>", concatenated with no separator, prefixed with a fixed 'v1|<namespace>|'
-- version/namespace tag) via a new phase14_private helper, re-creating both functions with
-- identical signatures (create or replace function; last definition wins, the same pattern already
-- used throughout this migration chain -- see e.g. mark_premium_report_delivery_reconciliation_required
-- vs. its worker facade). This does not modify migration 0017's file bytes/checksum; it overrides
-- the two function bodies via a new, separately versioned migration.
--
-- Field order in both functions below is unchanged from the original concat_ws call (only the
-- joining mechanism changed), so this is a byte-for-byte match for the TS side as long as the two
-- are kept in lockstep -- which is now the explicit contract documented on both sides.
--
-- 2. H4 webhook correlation: public.apply_email_provider_event_atomic (0017) matches an incoming
-- webhook to an email_events row strictly by (provider, provider_message_id). A delivery attempt
-- that lost its HTTP response before capturing a provider_message_id can therefore never be
-- reached by a later webhook through that path alone -- confirmed directly against 0017's source,
-- not assumed. ingest_phase14_provider_webhook below adds the one safe fallback described in its
-- own comment: correlate via the delivery_attempt_ref tag captured at send time, which is a
-- primary key and therefore never ambiguous, and only ever backfill a row that is currently
-- 'reconciliation_required' with no known message id yet.
create or replace function phase14_private.canonical_attestation_field(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select octet_length(coalesce(p_value, ''))::text || ':' || coalesce(p_value, '');
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
declare
  v_canonical text; v_id uuid; v_result jsonb; v_created timestamptz;
  v_authorization_id uuid; v_email_event_id uuid;
  v_tagged_attempt_ref text; v_tagged_authorization_id uuid;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'phase14_service_role_required';
  end if;
  perform public.phase14_require_policy('provider_webhook_ingestion');
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

  -- H4: correlate a "lost response" delivery attempt. apply_email_provider_event_atomic (below)
  -- matches strictly by (provider, provider_message_id) -- which is exactly the field a lost-HTTP
  -- -response attempt never captured, so a plain webhook can never reach that row by message id
  -- alone. Before falling through to the strict match, try the one safe fallback: the
  -- delivery_attempt_ref tag attached at send time (report-delivery-service-core.ts) carries the
  -- report_delivery_authorizations.id for this exact send. authorization_id is a primary key, so
  -- this can only ever resolve to zero or exactly one row -- there is no ambiguous-match case to
  -- reject here, only a present/absent one. The backfill only ever fires for a row that is
  -- currently 'reconciliation_required' with provider_message_id still null (never overwrites an
  -- already-known message id, never touches order/report bindings, never marks a different order
  -- delivered), and the pre-existing email_events_provider_message_uidx unique index still applies
  -- to the UPDATE below -- if this provider_message_id were somehow already bound to a different
  -- row, the constraint aborts the whole transaction rather than silently duplicating a send.
  perform set_config('phase14.authoritative_transition','trusted_provider_attestation',true);
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
      -- Backfill provider_message_id only. delivery_updated_at is deliberately left untouched
      -- here (not bumped to now()) so apply_email_provider_event_atomic's own rank-vs-recency
      -- check below (p_event_created_at >= v_email.delivery_updated_at) is evaluated against the
      -- row's true prior state, not against a timestamp this fallback step just set -- otherwise a
      -- webhook whose own event_created_at is earlier than "now" (the normal case) could be
      -- wrongly treated as stale relative to a delivery_updated_at we ourselves just wrote a
      -- moment ago, and silently fail to apply.
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
    provider_message_id,provider_state,
    event_created_at,payload_sha256,nonce,attested_at,minimal_payload_json
  ) values (
    'webhook',lower(trim(p_provider)),p_provider_event_id,v_authorization_id,v_email_event_id,
    p_provider_message_id,
    p_event_type,v_created,p_payload_sha256,p_nonce,to_timestamp(p_attested_at_epoch),
    jsonb_strip_nulls(jsonb_build_object('type',p_payload_json->>'type',
      'created_at',p_payload_json->>'created_at','reason',p_payload_json->>'reason'))
  ) on conflict (provider,provider_event_id) where attestation_source='webhook'
  do nothing
  returning id into v_id;
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
    -- H4 test #4 (concurrent duplicate webhook): apply_email_provider_event_atomic's own dedup
    -- check (select ... for update, then insert) only serialises against a row that has already
    -- committed. Two genuinely concurrent deliveries of the identical webhook event can both pass
    -- the "not found" check before either commits, then race on
    -- email_provider_events_provider_event_unique; the loser previously surfaced as a raw
    -- unique-violation error (a retryable 500 -- Resend would redeliver, and the redelivery would
    -- then see the winner's committed row and correctly no-op, so no state corruption was ever
    -- possible, but it needlessly cost a bounce through the provider's retry queue). This is the
    -- same idempotent event this function already returns 'duplicate:true' for on a sequential
    -- replay; a concurrent race losing is not a new failure mode, so it gets the same graceful
    -- response instead of propagating the constraint error.
    v_result := jsonb_build_object('duplicate',true,'conflict',false,'state_updated',false,'concurrent',true);
  end;
  return v_result || jsonb_build_object('attestation_id',v_id);
end;
$$;

create or replace function public.record_phase14_provider_lookup_attestation(
  p_provider text,
  p_provider_request_key text,
  p_authorization_id uuid,
  p_email_event_id uuid,
  p_provider_message_id text,
  p_provider_state text,
  p_payload_sha256 text,
  p_payload_json jsonb,
  p_attested_at_epoch bigint,
  p_nonce uuid,
  p_attestation_hmac text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_canonical text; v_id uuid;
  v_auth public.report_delivery_authorizations%rowtype;
  v_event public.email_events%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'phase14_service_role_required';
  end if;
  perform public.phase14_require_policy('manual_delivery');
  if p_provider_state not in ('accepted','not_found','pending','unknown') then
    raise exception 'phase14_provider_attestation_state_invalid';
  end if;
  if p_payload_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'phase14_provider_attestation_payload_invalid'; end if;
  select * into v_auth from public.report_delivery_authorizations
  where id=p_authorization_id for share;
  select * into v_event from public.email_events where id=p_email_event_id for share;
  if v_auth.id is null or v_event.id is null
     or v_auth.email_event_id is distinct from p_email_event_id
     or v_event.provider_request_key is distinct from p_provider_request_key
     or v_auth.provider is distinct from lower(trim(p_provider)) then
    raise exception 'phase14_provider_lookup_binding_invalid';
  end if;
  v_canonical := 'v1|provider_lookup|' ||
    phase14_private.canonical_attestation_field(lower(trim(p_provider))) ||
    phase14_private.canonical_attestation_field(p_provider_request_key) ||
    phase14_private.canonical_attestation_field(p_authorization_id::text) ||
    phase14_private.canonical_attestation_field(p_email_event_id::text) ||
    phase14_private.canonical_attestation_field(coalesce(p_provider_message_id,'')) ||
    phase14_private.canonical_attestation_field(p_provider_state) ||
    phase14_private.canonical_attestation_field(p_payload_sha256) ||
    phase14_private.canonical_attestation_field(p_attested_at_epoch::text) ||
    phase14_private.canonical_attestation_field(p_nonce::text);
  perform phase14_private.verify_hmac(
    'provider_lookup_db_hmac',v_canonical,p_attestation_hmac,p_attested_at_epoch
  );
  insert into public.phase14_provider_attestations(
    attestation_source,provider,provider_request_key,authorization_id,email_event_id,
    provider_message_id,provider_state,
    payload_sha256,nonce,attested_at,minimal_payload_json
  ) values (
    'provider_lookup',lower(trim(p_provider)),p_provider_request_key,p_authorization_id,
    p_email_event_id,p_provider_message_id,
    p_provider_state,p_payload_sha256,p_nonce,to_timestamp(p_attested_at_epoch),
    jsonb_strip_nulls(jsonb_build_object('state',p_payload_json->>'state',
      'detail',left(p_payload_json->>'detail',500)))
  ) returning id into v_id;
  return v_id;
end;
$$;
