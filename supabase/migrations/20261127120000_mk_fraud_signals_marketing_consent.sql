-- MK Fraud Signals: consent evidence, reconciled subscription state and marketing provider events.
--
-- Authority: Supabase is authoritative for consent EVIDENCE and integration event history. Resend is
-- authoritative for operational preferences and suppression; Attio for organisation restrictions.
-- Everything here lives in a private schema reachable only through the SECURITY DEFINER functions
-- at the end, which are executable by service_role alone. No anon or authenticated access.
--
-- Invariants enforced in this file:
--   * consent events are append-only (no UPDATE, no DELETE, ever);
--   * a confirmation token is single-use, expires, and only the newest token for a person works;
--   * a provider event is applied at most once (keyed by the provider's svix-id);
--   * suppression and withdrawal are sticky: provider events can only make a person LESS
--     reachable, and only a confirmed consent newer than a withdrawal can lift it;
--   * nothing in this file ever sets status = 'subscribed' except a confirmed consent with a
--     'clear' organisation-restriction decision.

create schema if not exists marketing;
revoke all on schema marketing from public;
revoke all on schema marketing from anon, authenticated;
grant usage on schema marketing to service_role;

create table marketing.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  email_hash text not null unique,
  status text not null default 'pending_confirmation'
    check (status in ('pending_confirmation', 'subscribed', 'unsubscribed', 'suppressed', 'held', 'erased')),
  hold_reason text
    check (hold_reason is null or hold_reason in (
      'restricted_organisation', 'ambiguous_organisation', 'restriction_check_unavailable',
      'provider_state_conflict', 'provider_resubscribe_without_fresh_consent', 'contact_quota', 'manual_review')),
  suppression_reason text
    check (suppression_reason is null or suppression_reason in ('hard_bounce', 'complaint', 'provider_suppression', 'manual')),
  consent_confirmed_at timestamptz,
  current_consent_event_id uuid,
  unsubscribed_at timestamptz,
  suppressed_at timestamptz,
  restriction_decision text not null default 'unchecked'
    check (restriction_decision in ('clear', 'restricted', 'ambiguous', 'unchecked')),
  restriction_checked_at timestamptz,
  restriction_evidence jsonb not null default '{}'::jsonb,
  resend_contact_id text,
  sync_status text not null default 'not_synced'
    check (sync_status in ('not_synced', 'pending', 'synced', 'failed', 'conflict')),
  sync_attempts integer not null default 0,
  last_sync_error text,
  last_synced_at timestamptz,
  last_engagement_at timestamptz,
  state_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscribed_requires_consent check (status <> 'subscribed' or (consent_confirmed_at is not null and restriction_decision = 'clear')),
  constraint suppressed_requires_reason check (status <> 'suppressed' or suppression_reason is not null),
  constraint held_requires_reason check (status <> 'held' or hold_reason is not null),
  constraint erased_has_no_email check (status <> 'erased' or email is null)
);

create table marketing.newsletter_consent_events (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references marketing.newsletter_subscribers(id),
  event_type text not null check (event_type in (
    'subscription_requested', 'resubscription_requested', 'confirmed', 'withdrawn', 'topic_opt_out',
    'suppressed', 'held', 'released', 'erased', 'provider_resubscribe_signal', 'duplicate_request')),
  permission text,
  wording_version text,
  wording_sha256 text,
  wording_text text,
  source text,
  source_path text,
  ip_hash text,
  user_agent_hash text,
  provider_event_id text,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index newsletter_consent_events_subscriber_idx on marketing.newsletter_consent_events (subscriber_id, occurred_at);

create function marketing.forbid_consent_event_mutation() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'marketing.newsletter_consent_events is append-only';
end;
$$;

create trigger newsletter_consent_events_append_only
  before update or delete on marketing.newsletter_consent_events
  for each row execute function marketing.forbid_consent_event_mutation();

create table marketing.confirmation_tokens (
  token_hash text primary key,
  subscriber_id uuid not null references marketing.newsletter_subscribers(id),
  request_event_id uuid not null references marketing.newsletter_consent_events(id),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index confirmation_tokens_subscriber_idx on marketing.confirmation_tokens (subscriber_id, issued_at desc);

create table marketing.provider_events (
  provider_event_id text primary key,
  event_type text not null,
  payload_sha256 text not null,
  email_hash text,
  effect text not null,
  outcome text not null default 'received',
  subscriber_id uuid references marketing.newsletter_subscribers(id),
  occurred_at timestamptz,
  received_at timestamptz not null default now()
);

alter table marketing.newsletter_subscribers enable row level security;
alter table marketing.newsletter_consent_events enable row level security;
alter table marketing.confirmation_tokens enable row level security;
alter table marketing.provider_events enable row level security;
revoke all on all tables in schema marketing from public, anon, authenticated;

-- 1. A subscription (or re-subscription) request. Records evidence and issues a confirmation token
--    when a confirmation email should be sent. Never makes anyone subscribed.
create function public.marketing_request_subscription(
  p_email text,
  p_email_hash text,
  p_permission text,
  p_wording_version text,
  p_wording_sha256 text,
  p_wording_text text,
  p_source text,
  p_source_path text,
  p_ip_hash text,
  p_user_agent_hash text,
  p_token_hash text,
  p_token_ttl_seconds integer,
  p_cooldown_seconds integer,
  p_evidence jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub marketing.newsletter_subscribers%rowtype;
  v_event_id uuid;
  v_event_type text;
begin
  if p_email is null or p_email_hash is null or p_token_hash is null or p_wording_sha256 is null then
    raise exception 'marketing_request_subscription: missing required argument';
  end if;

  select * into v_sub from marketing.newsletter_subscribers where email_hash = p_email_hash for update;
  if not found then
    insert into marketing.newsletter_subscribers (email, email_hash, status)
    values (p_email, p_email_hash, 'pending_confirmation')
    returning * into v_sub;
  end if;

  if v_sub.status = 'suppressed' then
    insert into marketing.newsletter_consent_events (subscriber_id, event_type, permission, wording_version, wording_sha256, source, source_path, ip_hash, user_agent_hash, detail)
    values (v_sub.id, 'duplicate_request', p_permission, p_wording_version, p_wording_sha256, p_source, p_source_path, p_ip_hash, p_user_agent_hash, jsonb_build_object('blocked', 'suppressed'));
    return jsonb_build_object('action', 'suppressed_no_email', 'subscriber_id', v_sub.id);
  end if;

  if v_sub.status = 'subscribed' or (v_sub.status = 'held' and v_sub.hold_reason <> 'provider_resubscribe_without_fresh_consent') then
    insert into marketing.newsletter_consent_events (subscriber_id, event_type, permission, wording_version, wording_sha256, source, source_path, ip_hash, user_agent_hash, detail)
    values (v_sub.id, 'duplicate_request', p_permission, p_wording_version, p_wording_sha256, p_source, p_source_path, p_ip_hash, p_user_agent_hash, jsonb_build_object('existing_status', v_sub.status));
    return jsonb_build_object('action', case when v_sub.status = 'subscribed' then 'already_subscribed' else 'held_no_email' end, 'subscriber_id', v_sub.id);
  end if;

  if exists (
    select 1 from marketing.confirmation_tokens t
    where t.subscriber_id = v_sub.id and t.used_at is null and t.issued_at > now() - make_interval(secs => greatest(p_cooldown_seconds, 0))
  ) then
    return jsonb_build_object('action', 'cooldown_no_email', 'subscriber_id', v_sub.id);
  end if;

  if v_sub.status = 'erased' then
    update marketing.newsletter_subscribers
       set email = p_email, status = 'pending_confirmation', state_version = state_version + 1, updated_at = now()
     where id = v_sub.id
     returning * into v_sub;
  end if;

  v_event_type := case when v_sub.status in ('unsubscribed', 'held') then 'resubscription_requested' else 'subscription_requested' end;

  insert into marketing.newsletter_consent_events (
    subscriber_id, event_type, permission, wording_version, wording_sha256, wording_text,
    source, source_path, ip_hash, user_agent_hash, detail)
  values (
    v_sub.id, v_event_type, p_permission, p_wording_version, p_wording_sha256, p_wording_text,
    p_source, p_source_path, p_ip_hash, p_user_agent_hash, coalesce(p_evidence, '{}'::jsonb))
  returning id into v_event_id;

  insert into marketing.confirmation_tokens (token_hash, subscriber_id, request_event_id, expires_at)
  values (p_token_hash, v_sub.id, v_event_id, now() + make_interval(secs => greatest(p_token_ttl_seconds, 60)));

  return jsonb_build_object('action', 'send_confirmation', 'subscriber_id', v_sub.id, 'request_event_id', v_event_id);
end;
$$;

-- 2a. Read-only look-up of a confirmation token, so the organisation-restriction screen can run
--     BEFORE the confirmation is recorded. Consumes nothing.
create function public.marketing_peek_confirmation_token(p_token_hash text) returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_token marketing.confirmation_tokens%rowtype;
  v_email text;
begin
  select * into v_token from marketing.confirmation_tokens where token_hash = p_token_hash;
  if not found then return jsonb_build_object('state', 'invalid'); end if;
  if v_token.used_at is not null then return jsonb_build_object('state', 'already_used'); end if;
  if v_token.expires_at <= now() then return jsonb_build_object('state', 'expired'); end if;
  if exists (select 1 from marketing.confirmation_tokens t where t.subscriber_id = v_token.subscriber_id and t.issued_at > v_token.issued_at) then
    return jsonb_build_object('state', 'superseded');
  end if;
  select email into v_email from marketing.newsletter_subscribers where id = v_token.subscriber_id;
  if v_email is null then return jsonb_build_object('state', 'invalid'); end if;
  return jsonb_build_object('state', 'valid', 'email', v_email);
end;
$$;

-- 2b. Confirmation (the double opt-in click). The only path to 'subscribed'.
create function public.marketing_confirm_subscription(
  p_token_hash text,
  p_ip_hash text,
  p_user_agent_hash text,
  p_restriction_decision text,
  p_restriction_evidence jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token marketing.confirmation_tokens%rowtype;
  v_sub marketing.newsletter_subscribers%rowtype;
  v_request marketing.newsletter_consent_events%rowtype;
  v_event_id uuid;
  v_hold text;
begin
  if p_restriction_decision not in ('clear', 'restricted', 'ambiguous', 'unchecked') then
    raise exception 'marketing_confirm_subscription: invalid restriction decision';
  end if;

  select * into v_token from marketing.confirmation_tokens where token_hash = p_token_hash for update;
  if not found then return jsonb_build_object('outcome', 'invalid'); end if;
  if v_token.used_at is not null then return jsonb_build_object('outcome', 'already_used'); end if;
  if v_token.expires_at <= now() then return jsonb_build_object('outcome', 'expired'); end if;
  if exists (
    select 1 from marketing.confirmation_tokens t
    where t.subscriber_id = v_token.subscriber_id and t.issued_at > v_token.issued_at
  ) then
    return jsonb_build_object('outcome', 'superseded');
  end if;

  select * into v_sub from marketing.newsletter_subscribers where id = v_token.subscriber_id for update;
  update marketing.confirmation_tokens set used_at = now() where token_hash = p_token_hash;

  if v_sub.status = 'suppressed' then return jsonb_build_object('outcome', 'suppressed', 'subscriber_id', v_sub.id); end if;
  if v_sub.status = 'subscribed' then return jsonb_build_object('outcome', 'already_subscribed', 'subscriber_id', v_sub.id); end if;
  if v_sub.status = 'erased' or v_sub.email is null then return jsonb_build_object('outcome', 'invalid'); end if;

  select * into v_request from marketing.newsletter_consent_events where id = v_token.request_event_id;

  insert into marketing.newsletter_consent_events (
    subscriber_id, event_type, permission, wording_version, wording_sha256, wording_text,
    source, source_path, ip_hash, user_agent_hash, detail)
  values (
    v_sub.id, 'confirmed', v_request.permission, v_request.wording_version, v_request.wording_sha256, v_request.wording_text,
    v_request.source, v_request.source_path, p_ip_hash, p_user_agent_hash,
    jsonb_build_object('request_event_id', v_request.id, 'restriction_decision', p_restriction_decision))
  returning id into v_event_id;

  v_hold := case p_restriction_decision
    when 'clear' then null
    when 'restricted' then 'restricted_organisation'
    when 'ambiguous' then 'ambiguous_organisation'
    else 'restriction_check_unavailable' end;

  update marketing.newsletter_subscribers
     set consent_confirmed_at = now(),
         current_consent_event_id = v_event_id,
         status = case when v_hold is null then 'subscribed' else 'held' end,
         hold_reason = v_hold,
         restriction_decision = p_restriction_decision,
         restriction_evidence = coalesce(p_restriction_evidence, '{}'::jsonb),
         restriction_checked_at = now(),
         sync_status = 'pending',
         sync_attempts = 0,
         state_version = state_version + 1,
         updated_at = now()
   where id = v_sub.id
   returning * into v_sub;

  if v_hold is not null then
    insert into marketing.newsletter_consent_events (subscriber_id, event_type, detail)
    values (v_sub.id, 'held', jsonb_build_object('hold_reason', v_hold));
  end if;

  return jsonb_build_object(
    'outcome', case when v_hold is null then 'confirmed' else 'held' end,
    'subscriber_id', v_sub.id,
    'email', v_sub.email,
    'state_version', v_sub.state_version);
end;
$$;

-- 3. A verified provider (Resend) event, applied at most once. Can only reduce reachability.
create function public.marketing_apply_provider_effect(
  p_provider_event_id text,
  p_event_type text,
  p_payload_sha256 text,
  p_email_hash text,
  p_effect text,
  p_occurred_at timestamptz,
  p_detail jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub marketing.newsletter_subscribers%rowtype;
  v_reason text;
  v_rank_new integer;
  v_rank_old integer;
  v_outcome text;
  v_inserted integer;
begin
  if p_effect not in ('global_unsubscribe', 'topic_opt_out', 'contact_deleted', 'topic_opt_in_from_provider',
                      'hard_bounce', 'complaint', 'provider_suppression', 'engagement_clicked', 'engagement_delivered', 'ignored') then
    raise exception 'marketing_apply_provider_effect: unknown effect %', p_effect;
  end if;

  insert into marketing.provider_events (provider_event_id, event_type, payload_sha256, email_hash, effect, occurred_at)
  values (p_provider_event_id, p_event_type, p_payload_sha256, p_email_hash, p_effect, p_occurred_at)
  on conflict (provider_event_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return jsonb_build_object('outcome', 'duplicate'); end if;

  if p_effect = 'ignored' or p_email_hash is null then
    update marketing.provider_events set outcome = 'ignored' where provider_event_id = p_provider_event_id;
    return jsonb_build_object('outcome', 'ignored');
  end if;

  select * into v_sub from marketing.newsletter_subscribers where email_hash = p_email_hash for update;
  if not found then
    -- A provider record MK holds no consent for (for example created outside MK). Logged so the
    -- reconciliation report surfaces it; never turned into a subscriber.
    update marketing.provider_events set outcome = 'no_local_subscriber' where provider_event_id = p_provider_event_id;
    return jsonb_build_object('outcome', 'no_local_subscriber');
  end if;

  if p_effect in ('hard_bounce', 'complaint', 'provider_suppression') then
    v_reason := case p_effect when 'hard_bounce' then 'hard_bounce' when 'complaint' then 'complaint' else 'provider_suppression' end;
    v_rank_new := case v_reason when 'complaint' then 3 when 'hard_bounce' then 2 else 1 end;
    v_rank_old := case v_sub.suppression_reason when 'manual' then 4 when 'complaint' then 3 when 'hard_bounce' then 2 when 'provider_suppression' then 1 else 0 end;
    update marketing.newsletter_subscribers
       set status = case when status = 'erased' then 'erased' else 'suppressed' end,
           suppression_reason = case when v_rank_old >= v_rank_new then suppression_reason else v_reason end,
           suppressed_at = coalesce(suppressed_at, p_occurred_at),
           hold_reason = null,
           sync_status = 'pending',
           state_version = state_version + 1,
           updated_at = now()
     where id = v_sub.id;
    insert into marketing.newsletter_consent_events (subscriber_id, event_type, provider_event_id, detail, occurred_at)
    values (v_sub.id, 'suppressed', p_provider_event_id, jsonb_build_object('reason', v_reason) || coalesce(p_detail, '{}'::jsonb), p_occurred_at);
    v_outcome := 'suppressed';

  elsif p_effect in ('global_unsubscribe', 'topic_opt_out', 'contact_deleted') then
    if v_sub.status in ('suppressed', 'erased') then
      v_outcome := 'ignored_terminal_state';
    elsif v_sub.consent_confirmed_at is not null and v_sub.consent_confirmed_at > p_occurred_at then
      v_outcome := 'ignored_superseded_by_newer_consent';
    else
      update marketing.newsletter_subscribers
         set status = 'unsubscribed',
             unsubscribed_at = greatest(coalesce(unsubscribed_at, p_occurred_at), p_occurred_at),
             hold_reason = null,
             sync_status = 'pending',
             state_version = state_version + 1,
             updated_at = now()
       where id = v_sub.id;
      insert into marketing.newsletter_consent_events (subscriber_id, event_type, provider_event_id, detail, occurred_at)
      values (v_sub.id, case when p_effect = 'topic_opt_out' then 'topic_opt_out' else 'withdrawn' end, p_provider_event_id,
              jsonb_build_object('effect', p_effect), p_occurred_at);
      v_outcome := 'withdrawn';
    end if;

  elsif p_effect = 'topic_opt_in_from_provider' then
    if v_sub.status in ('unsubscribed', 'pending_confirmation', 'held') then
      update marketing.newsletter_subscribers
         set status = 'held', hold_reason = 'provider_resubscribe_without_fresh_consent',
             sync_status = 'pending', state_version = state_version + 1, updated_at = now()
       where id = v_sub.id;
      insert into marketing.newsletter_consent_events (subscriber_id, event_type, provider_event_id, occurred_at)
      values (v_sub.id, 'provider_resubscribe_signal', p_provider_event_id, p_occurred_at);
      v_outcome := 'held_for_fresh_consent';
    else
      v_outcome := 'no_change';
    end if;

  elsif p_effect = 'engagement_clicked' then
    update marketing.newsletter_subscribers
       set last_engagement_at = greatest(coalesce(last_engagement_at, p_occurred_at), p_occurred_at), updated_at = now()
     where id = v_sub.id;
    v_outcome := 'engagement_recorded';
  else
    v_outcome := 'no_change';
  end if;

  update marketing.provider_events set outcome = v_outcome, subscriber_id = v_sub.id where provider_event_id = p_provider_event_id;
  return jsonb_build_object('outcome', v_outcome, 'subscriber_id', v_sub.id);
end;
$$;

-- 4. Outcome of one provider sync / restriction re-screen, guarded by optimistic concurrency.
create function public.marketing_record_sync_outcome(
  p_subscriber_id uuid,
  p_expected_version bigint,
  p_outcome text,
  p_resend_contact_id text,
  p_error text,
  p_hold_reason text,
  p_restriction_decision text,
  p_restriction_evidence jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub marketing.newsletter_subscribers%rowtype;
begin
  if p_outcome not in ('synced', 'failed', 'held') then
    raise exception 'marketing_record_sync_outcome: invalid outcome';
  end if;
  select * into v_sub from marketing.newsletter_subscribers where id = p_subscriber_id for update;
  if not found then return jsonb_build_object('outcome', 'not_found'); end if;
  if v_sub.state_version <> p_expected_version then
    -- State changed while the sync ran (for example an unsubscribe arrived). Do not overwrite it.
    return jsonb_build_object('outcome', 'stale_version', 'state_version', v_sub.state_version);
  end if;

  if p_outcome = 'synced' and v_sub.status = 'held' and v_sub.hold_reason = 'restriction_check_unavailable'
     and p_restriction_decision = 'clear' and v_sub.consent_confirmed_at is not null
     and (v_sub.unsubscribed_at is null or v_sub.consent_confirmed_at > v_sub.unsubscribed_at) then
    -- The only automated release: a hold placed solely because Attio could not be reached, now
    -- screened clear. Restricted and ambiguous holds are released by an operator, never here.
    update marketing.newsletter_subscribers
       set status = 'subscribed', hold_reason = null, restriction_decision = 'clear',
           restriction_evidence = coalesce(p_restriction_evidence, restriction_evidence), restriction_checked_at = now(),
           sync_status = 'pending', state_version = state_version + 1, updated_at = now()
     where id = v_sub.id;
    insert into marketing.newsletter_consent_events (subscriber_id, event_type, detail)
    values (v_sub.id, 'released', jsonb_build_object('from_hold', 'restriction_check_unavailable'));
    return jsonb_build_object('outcome', 'released');
  end if;

  if p_outcome = 'synced' then
    update marketing.newsletter_subscribers
       set sync_status = 'synced', sync_attempts = 0, last_sync_error = null, last_synced_at = now(),
           resend_contact_id = coalesce(p_resend_contact_id, resend_contact_id),
           restriction_decision = case when p_restriction_decision is null then restriction_decision
                                       when status = 'subscribed' and p_restriction_decision <> 'clear' then restriction_decision
                                       else p_restriction_decision end,
           restriction_evidence = coalesce(p_restriction_evidence, restriction_evidence),
           restriction_checked_at = case when p_restriction_decision is null then restriction_checked_at else now() end,
           state_version = state_version + 1, updated_at = now()
     where id = v_sub.id;
  elsif p_outcome = 'failed' then
    update marketing.newsletter_subscribers
       set sync_status = 'failed', sync_attempts = sync_attempts + 1, last_sync_error = left(coalesce(p_error, 'unknown'), 200),
           state_version = state_version + 1, updated_at = now()
     where id = v_sub.id;
  else
    if p_hold_reason is null then raise exception 'marketing_record_sync_outcome: hold requires a reason'; end if;
    update marketing.newsletter_subscribers
       set status = case when status in ('subscribed', 'pending_confirmation', 'held') then 'held' else status end,
           hold_reason = case when status in ('subscribed', 'pending_confirmation', 'held') then p_hold_reason else hold_reason end,
           restriction_decision = coalesce(p_restriction_decision, restriction_decision),
           restriction_evidence = coalesce(p_restriction_evidence, restriction_evidence),
           restriction_checked_at = case when p_restriction_decision is null then restriction_checked_at else now() end,
           resend_contact_id = coalesce(p_resend_contact_id, resend_contact_id),
           sync_status = 'pending', last_sync_error = left(p_error, 200),
           state_version = state_version + 1, updated_at = now()
     where id = v_sub.id;
    insert into marketing.newsletter_consent_events (subscriber_id, event_type, detail)
    values (v_sub.id, 'held', jsonb_build_object('hold_reason', p_hold_reason, 'detail', left(p_error, 200)));
  end if;
  return jsonb_build_object('outcome', p_outcome);
end;
$$;

-- 5. The next people the reconciler should look at.
create function public.marketing_reconciliation_batch(p_limit integer) returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(jsonb_agg(row_to_json(s)::jsonb), '[]'::jsonb)
  from (
    select id, email, status, hold_reason, suppression_reason, consent_confirmed_at, unsubscribed_at,
           suppressed_at, restriction_decision, resend_contact_id, state_version, sync_status, sync_attempts, last_synced_at
      from marketing.newsletter_subscribers
     where email is not null
       and status <> 'pending_confirmation'
       and ((sync_status in ('pending', 'failed', 'not_synced') and sync_attempts < 8)
            or (status = 'subscribed' and (last_synced_at is null or last_synced_at < now() - interval '20 hours')))
     order by updated_at
     limit least(greatest(p_limit, 1), 100)
  ) s;
$$;

-- 6. Counts for audience verification and the weekly report. No addresses.
create function public.marketing_audience_snapshot() returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'generated_at', now(),
    'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from marketing.newsletter_subscribers group by status) a), '{}'::jsonb),
    'by_hold_reason', coalesce((select jsonb_object_agg(hold_reason, n) from (select hold_reason, count(*) n from marketing.newsletter_subscribers where status = 'held' group by hold_reason) b), '{}'::jsonb),
    'by_sync_status', coalesce((select jsonb_object_agg(sync_status, n) from (select sync_status, count(*) n from marketing.newsletter_subscribers group by sync_status) c), '{}'::jsonb),
    'eligible_locally', (select count(*) from marketing.newsletter_subscribers where status = 'subscribed' and restriction_decision = 'clear' and sync_status = 'synced' and consent_confirmed_at is not null),
    'confirmed_last_7_days', (select count(*) from marketing.newsletter_consent_events where event_type = 'confirmed' and occurred_at > now() - interval '7 days'),
    'withdrawn_last_7_days', (select count(*) from marketing.newsletter_consent_events where event_type in ('withdrawn', 'topic_opt_out') and occurred_at > now() - interval '7 days'),
    'suppressed_last_7_days', (select count(*) from marketing.newsletter_consent_events where event_type = 'suppressed' and occurred_at > now() - interval '7 days'),
    'unmatched_provider_events_last_7_days', (select count(*) from marketing.provider_events where outcome = 'no_local_subscriber' and received_at > now() - interval '7 days')
  );
$$;

revoke all on function public.marketing_request_subscription(text, text, text, text, text, text, text, text, text, text, text, integer, integer, jsonb) from public, anon, authenticated;
revoke all on function public.marketing_peek_confirmation_token(text) from public, anon, authenticated;
revoke all on function public.marketing_confirm_subscription(text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.marketing_apply_provider_effect(text, text, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.marketing_record_sync_outcome(uuid, bigint, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.marketing_reconciliation_batch(integer) from public, anon, authenticated;
revoke all on function public.marketing_audience_snapshot() from public, anon, authenticated;
revoke all on function marketing.forbid_consent_event_mutation() from public, anon, authenticated;

grant execute on function public.marketing_request_subscription(text, text, text, text, text, text, text, text, text, text, text, integer, integer, jsonb) to service_role;
grant execute on function public.marketing_peek_confirmation_token(text) to service_role;
grant execute on function public.marketing_confirm_subscription(text, text, text, text, jsonb) to service_role;
grant execute on function public.marketing_apply_provider_effect(text, text, text, text, text, timestamptz, jsonb) to service_role;
grant execute on function public.marketing_record_sync_outcome(uuid, bigint, text, text, text, text, text, jsonb) to service_role;
grant execute on function public.marketing_reconciliation_batch(integer) to service_role;
grant execute on function public.marketing_audience_snapshot() to service_role;
