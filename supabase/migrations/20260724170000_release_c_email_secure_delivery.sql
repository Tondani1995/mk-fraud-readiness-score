-- MK Fraud Readiness Platform - Release C: real transactional email and secure customer
-- report delivery.
--
-- Follows docs/safe-launch/15-email-and-secure-delivery-design.md. Reuses the
-- report_delivery_authorizations / report_delivery_finalizations / report_delivery_remediations
-- TABLE SCHEMAS unchanged, but implements new, Release-C-scoped claim/lease/finalize RPCs
-- rather than the existing Phase14 RPCs (claim_premium_report_delivery,
-- authorize_premium_report_delivery, phase14_delivery_entitlement) -- see the design doc's
-- "Why new delivery RPCs, not the Phase14 ones" for the full reasoning: those are coupled to a
-- different (dormant) generation pipeline's entitlement chain and to a security gate whose own
-- governance trail this programme has already flagged for MK-operator review
-- (docs/safe-launch/00-current-state.md §4a). email_events already had every column this
-- release needs (provider, provider_message_id, provider_request_key, send_lease_token,
-- dedupe_key, notification_type, metadata_json, retry_count, provider_mode incl. 'external') --
-- no new columns are added to it.
--
-- Closes the reports.status='released' gap identified in the audit: approve_quality_review()
-- (Release B, redefined here via CREATE OR REPLACE, 20260724160000_release_b_durable_fulfilment.sql
-- is not edited) now also creates the delivery authorization and sets the underlying report to
-- 'released' atomically, in the same transaction as the approval itself.

begin;

-- ---------------------------------------------------------------------------
-- 1. Extend report_delivery_authorizations: relax the Phase14-specific security_gate_version
--    requirement (Release C's rows are not produced by the Phase14-gated pipeline and have no
--    meaningful value for it), add retry/backoff columns, extend the status check additively.
-- ---------------------------------------------------------------------------

alter table public.report_delivery_authorizations
  alter column security_gate_version drop not null;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'report_delivery_authorizations_security_gate_version_check') then
    alter table public.report_delivery_authorizations drop constraint report_delivery_authorizations_security_gate_version_check;
  end if;
  alter table public.report_delivery_authorizations add constraint report_delivery_authorizations_security_gate_version_check
    check (security_gate_version is null or security_gate_version > 0);
end $$;

alter table public.report_delivery_authorizations
  add column if not exists next_attempt_at timestamptz,
  add column if not exists max_attempts integer not null default 5 check (max_attempts > 0),
  add column if not exists retry_count integer not null default 0 check (retry_count >= 0);

alter table public.report_delivery_authorizations
  drop constraint if exists report_delivery_authorizations_status_check;
alter table public.report_delivery_authorizations
  add constraint report_delivery_authorizations_status_check
  check (status in (
    'queued', 'claimed', 'dispatching', 'finalized', 'revoked', 'reconciliation_required',
    'retry_scheduled', 'failed_terminal'
  ));

create index if not exists report_delivery_authorizations_status_next_attempt_idx
  on public.report_delivery_authorizations(status, next_attempt_at);
create index if not exists report_delivery_authorizations_lease_expiry_idx
  on public.report_delivery_authorizations(lease_expires_at)
  where status = 'dispatching';

-- ---------------------------------------------------------------------------
-- 2. New table: customer_report_access_tokens. The one genuinely new database object this
--    release requires (audit Q25). Follows the exact hash/TTL pattern already proven by
--    public.assessment_tokens (src/lib/respondent/tokens.ts) -- only a hash is ever stored, the
--    raw token is returned once at issuance and never persisted.
-- ---------------------------------------------------------------------------

create table public.customer_report_access_tokens (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete cascade,
  recipient_email public.citext not null,
  token_hash text not null unique,
  purpose text not null default 'report_ready' check (purpose in ('report_ready')),
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_reason text,
  issued_by uuid references public.admin_profiles(id) on delete set null,
  last_accessed_at timestamptz,
  access_count integer not null default 0 check (access_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One active (non-revoked) token per report+recipient at a time -- reissue must revoke the
-- prior token first, in the same transaction, per the design doc.
create unique index customer_report_access_tokens_active_uidx
  on public.customer_report_access_tokens(report_id, recipient_email)
  where revoked_at is null;
create index customer_report_access_tokens_order_idx on public.customer_report_access_tokens(order_id);
create index customer_report_access_tokens_expiry_idx on public.customer_report_access_tokens(expires_at);

create trigger trg_customer_report_access_tokens_updated_at
  before update on public.customer_report_access_tokens
  for each row execute function public.set_updated_at();

alter table public.customer_report_access_tokens enable row level security;
revoke all on table public.customer_report_access_tokens from public, anon, authenticated;
grant select on table public.customer_report_access_tokens to authenticated;
create policy customer_report_access_tokens_admin_select on public.customer_report_access_tokens
  for select to authenticated
  using (public.current_admin_role() in ('platform_admin', 'finance_admin', 'reviewer', 'approver'));
-- No insert/update/delete grant to any role -- issuance/validation/access-recording are all
-- performed by the service-role client (issuance, validation) or the RPCs below (revoke/reissue).

-- ---------------------------------------------------------------------------
-- 3. Delivery worker RPCs (service_role only), mirroring Release B's
--    claim_next_fulfilment_job()/fail_fulfilment_job() pattern exactly for consistency.
-- ---------------------------------------------------------------------------

create or replace function public.claim_next_delivery(
  p_lease_owner text,
  p_lease_seconds integer default 300
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.report_delivery_authorizations%rowtype;
begin
  if coalesce(trim(p_lease_owner), '') = '' then
    raise exception 'delivery_lease_owner_required';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 3600 then
    raise exception 'delivery_lease_seconds_out_of_range';
  end if;

  select * into v_row
  from public.report_delivery_authorizations
  where status in ('queued', 'retry_scheduled')
    and (next_attempt_at is null or next_attempt_at <= now())
    and (lease_expires_at is null or lease_expires_at <= now())
  order by authorised_at asc
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.report_delivery_authorizations
  set status = 'claimed',
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      claimed_at = now(),
      next_attempt_at = null,
      updated_at = now()
  where id = v_row.id
  returning * into v_row;

  -- report_delivery_authorizations is on the guard_phase14_authoritative_mutation()
  -- shared-table list (0017_phase14_canonical_disabled_foundation.sql:6837), so an audit_logs
  -- write naming it requires an authoritative-transition context even though this RPC is
  -- deliberately independent of Phase14's own business logic -- see the design doc's "Why new
  -- delivery RPCs, not the Phase14 ones". 'worker_rpc' is one of the guard's own allowed
  -- context values; this does not invoke any Phase14 entitlement/gate check.
  perform set_config('phase14.authoritative_transition', 'worker_rpc', true);
  insert into public.audit_logs(actor_type, entity_table, entity_id, action, after_json)
  values ('system', 'report_delivery_authorizations', v_row.id, 'delivery_job_claimed', to_jsonb(v_row));

  return to_jsonb(v_row);
end;
$$;

create or replace function public.mark_delivery_dispatch_started(
  p_authorization_id uuid,
  p_lease_token uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.report_delivery_authorizations%rowtype;
begin
  select * into v_row from public.report_delivery_authorizations where id = p_authorization_id for update;
  if not found then raise exception 'delivery_authorization_not_found'; end if;
  if v_row.status <> 'claimed' or v_row.lease_token <> p_lease_token or v_row.lease_expires_at < now() then
    raise exception 'delivery_lease_invalid';
  end if;

  update public.report_delivery_authorizations
  set status = 'dispatching', dispatch_started_at = now(), updated_at = now()
  where id = p_authorization_id
  returning * into v_row;

  update public.email_events
  set status = 'PROVIDER_REQUEST_STARTED', updated_at = now()
  where id = v_row.email_event_id;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.finalize_delivery(
  p_authorization_id uuid,
  p_lease_token uuid,
  p_provider_message_id text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.report_delivery_authorizations%rowtype;
begin
  select * into v_row from public.report_delivery_authorizations where id = p_authorization_id for update;
  if not found then raise exception 'delivery_authorization_not_found'; end if;
  if v_row.status <> 'dispatching' or v_row.lease_token <> p_lease_token then
    raise exception 'delivery_lease_invalid';
  end if;

  update public.report_delivery_authorizations
  set status = 'finalized', finalized_at = now(), provider_message_id = p_provider_message_id,
      lease_token = null, lease_expires_at = null, updated_at = now()
  where id = p_authorization_id
  returning * into v_row;

  update public.email_events
  set status = 'PROVIDER_ACCEPTED', provider_message_id = p_provider_message_id, sent_at = now(), updated_at = now()
  where id = v_row.email_event_id;

  insert into public.report_delivery_finalizations(authorization_id, email_event_id, report_id, provider, provider_message_id)
  values (v_row.id, v_row.email_event_id, v_row.report_id, coalesce(v_row.provider, 'resend'), p_provider_message_id)
  on conflict (authorization_id) do nothing;

  perform set_config('phase14.authoritative_transition', 'worker_rpc', true);
  insert into public.audit_logs(actor_type, entity_table, entity_id, action, after_json)
  values ('system', 'report_delivery_authorizations', v_row.id, 'delivery_finalized', to_jsonb(v_row));

  return to_jsonb(v_row);
end;
$$;

create or replace function public.fail_delivery(
  p_authorization_id uuid,
  p_lease_token uuid,
  p_error_category text,
  p_safe_operational_error text,
  p_technical_reference text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.report_delivery_authorizations%rowtype;
  v_after public.report_delivery_authorizations%rowtype;
  v_next_status text;
  v_retry integer;
begin
  select * into v_before from public.report_delivery_authorizations where id = p_authorization_id for update;
  if not found then raise exception 'delivery_authorization_not_found'; end if;
  if v_before.lease_token is null or v_before.lease_token <> p_lease_token then
    raise exception 'delivery_lease_invalid';
  end if;

  v_retry := v_before.retry_count + 1;
  v_next_status := case when v_retry < v_before.max_attempts then 'retry_scheduled' else 'failed_terminal' end;

  update public.report_delivery_authorizations
  set status = v_next_status,
      retry_count = v_retry,
      next_attempt_at = case when v_next_status = 'retry_scheduled'
        then now() + make_interval(secs => least(3600, 30 * (2 ^ least(v_retry, 7))::integer))
        else null end,
      lease_token = null, lease_expires_at = null,
      updated_at = now()
  where id = p_authorization_id
  returning * into v_after;

  update public.email_events
  set status = case when v_next_status = 'retry_scheduled' then 'RETRY_SCHEDULED' else 'FAILED_TERMINAL' end,
      error_message = left(coalesce(p_safe_operational_error, 'Report delivery failed.'), 500),
      retry_count = v_retry,
      updated_at = now()
  where id = v_after.email_event_id;

  perform set_config('phase14.authoritative_transition', 'worker_rpc', true);
  insert into public.audit_logs(actor_type, entity_table, entity_id, action, before_json, after_json)
  values ('system', 'report_delivery_authorizations', v_after.id, 'delivery_failed', to_jsonb(v_before), to_jsonb(v_after));

  return to_jsonb(v_after);
end;
$$;

revoke all on function public.claim_next_delivery(text, integer) from public, anon, authenticated;
grant execute on function public.claim_next_delivery(text, integer) to service_role;
revoke all on function public.mark_delivery_dispatch_started(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_delivery_dispatch_started(uuid, uuid) to service_role;
revoke all on function public.finalize_delivery(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.finalize_delivery(uuid, uuid, text) to service_role;
revoke all on function public.fail_delivery(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.fail_delivery(uuid, uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Admin RPCs: retry a failed delivery, revoke/reissue a customer access token.
--    Same role-check-inline pattern as Release A/B's admin RPCs (defence in depth).
-- ---------------------------------------------------------------------------

create or replace function public.retry_delivery(
  p_authorization_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor public.admin_profiles%rowtype;
  v_before public.report_delivery_authorizations%rowtype;
  v_after public.report_delivery_authorizations%rowtype;
begin
  if v_actor_id is null then raise exception 'delivery_retry_no_session'; end if;
  select * into v_actor from public.admin_profiles where id = v_actor_id and status = 'active';
  if not found or v_actor.role not in ('platform_admin', 'finance_admin') then
    raise exception 'delivery_retry_role_forbidden';
  end if;

  select * into v_before from public.report_delivery_authorizations where id = p_authorization_id for update;
  if not found or v_before.status not in ('failed_terminal', 'reconciliation_required') then
    raise exception 'delivery_retry_invalid_state';
  end if;

  update public.report_delivery_authorizations
  set status = 'queued', retry_count = 0, next_attempt_at = null,
      lease_token = null, lease_expires_at = null, updated_at = now()
  where id = p_authorization_id
  returning * into v_after;

  update public.email_events set status = 'RETRY_SCHEDULED', updated_at = now() where id = v_after.email_event_id;

  perform set_config('phase14.authoritative_transition', 'authenticated_rpc', true);
  insert into public.audit_logs(actor_type, actor_user_id, entity_table, entity_id, action, before_json, after_json)
  values ('admin', v_actor_id, 'report_delivery_authorizations', v_after.id, 'delivery_retried', to_jsonb(v_before), to_jsonb(v_after));

  return to_jsonb(v_after);
end;
$$;

create or replace function public.revoke_customer_report_access_token(
  p_token_id uuid,
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
  v_before public.customer_report_access_tokens%rowtype;
  v_after public.customer_report_access_tokens%rowtype;
begin
  if v_actor_id is null then raise exception 'access_token_no_session'; end if;
  select * into v_actor from public.admin_profiles where id = v_actor_id and status = 'active';
  if not found or v_actor.role not in ('platform_admin', 'reviewer', 'approver') then
    raise exception 'access_token_role_forbidden';
  end if;
  if length(v_note) < 5 then raise exception 'access_token_reason_too_short'; end if;

  select * into v_before from public.customer_report_access_tokens where id = p_token_id for update;
  if not found or v_before.revoked_at is not null then
    raise exception 'access_token_already_revoked';
  end if;

  update public.customer_report_access_tokens
  set revoked_at = now(), revoked_reason = v_note, updated_at = now()
  where id = p_token_id
  returning * into v_after;

  insert into public.audit_logs(actor_type, actor_user_id, entity_table, entity_id, action, before_json, after_json)
  values ('admin', v_actor_id, 'customer_report_access_tokens', v_after.id, 'access_token_revoked', to_jsonb(v_before), to_jsonb(v_after));

  return to_jsonb(v_after);
end;
$$;

-- Worker-triggered (service_role only, no human actor) issuance. Called once by the delivery
-- worker per send attempt, right before building the report-ready email -- see
-- docs/safe-launch/15-email-and-secure-delivery-design.md, "Token lifecycle". If an active token
-- already exists for this report+recipient (a retry after the provider send itself failed on a
-- prior attempt -- the raw token from that attempt cannot be recovered, only its hash is ever
-- stored), it is revoked and a fresh one issued: every worker attempt mints its own token rather
-- than trying to reuse one whose raw value is already gone. Revoking an unused prior token is
-- always safe.
create or replace function public.issue_customer_report_access_token(
  p_order_id uuid,
  p_report_id uuid,
  p_recipient_email text,
  p_ttl_seconds integer default 604800
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_report public.reports%rowtype;
  v_raw_token text;
  v_token_hash text;
  v_new public.customer_report_access_tokens%rowtype;
begin
  if p_ttl_seconds is null or p_ttl_seconds < 3600 or p_ttl_seconds > 2592000 then
    raise exception 'access_token_ttl_out_of_range';
  end if;

  select * into v_report from public.reports where id = p_report_id and order_id = p_order_id for update;
  if not found then raise exception 'access_token_report_order_mismatch'; end if;

  update public.customer_report_access_tokens
  set revoked_at = now(), revoked_reason = 'Superseded by a fresh worker-issued token for this send attempt.', updated_at = now()
  where report_id = p_report_id and recipient_email = p_recipient_email::public.citext and revoked_at is null;

  v_raw_token := encode(extensions.gen_random_bytes(32), 'base64');
  v_raw_token := replace(replace(replace(v_raw_token, '+', '-'), '/', '_'), '=', '');
  v_token_hash := encode(extensions.digest(convert_to(v_raw_token, 'UTF8'), 'sha256'), 'hex');

  insert into public.customer_report_access_tokens(
    order_id, report_id, recipient_email, token_hash, expires_at
  ) values (
    p_order_id, p_report_id, p_recipient_email::public.citext, v_token_hash,
    now() + make_interval(secs => p_ttl_seconds)
  ) returning * into v_new;

  insert into public.audit_logs(actor_type, entity_table, entity_id, action, after_json)
  values ('system', 'customer_report_access_tokens', v_new.id, 'access_token_issued',
    jsonb_build_object('order_id', p_order_id, 'report_id', p_report_id, 'expires_at', v_new.expires_at));

  return jsonb_build_object('token', v_raw_token, 'token_id', v_new.id, 'expires_at', v_new.expires_at);
end;
$$;

revoke all on function public.issue_customer_report_access_token(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.issue_customer_report_access_token(uuid, uuid, text, integer) to service_role;

create or replace function public.reissue_customer_report_access_token(
  p_order_id uuid,
  p_report_id uuid,
  p_recipient_email text,
  p_reason text,
  p_ttl_seconds integer default 604800
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
    jsonb_build_object('reason', v_note, 'token_id', v_new.id)
  ) returning * into v_event;

  insert into public.audit_logs(actor_type, actor_user_id, entity_table, entity_id, action, after_json)
  values ('admin', v_actor_id, 'customer_report_access_tokens', v_new.id, 'access_token_reissued',
    jsonb_build_object('order_id', p_order_id, 'report_id', p_report_id, 'reason', v_note, 'email_event_id', v_event.id));

  return jsonb_build_object('token', v_raw_token, 'token_id', v_new.id, 'expires_at', v_new.expires_at, 'email_event_id', v_event.id);
end;
$$;

revoke all on function public.retry_delivery(uuid) from public, anon, authenticated;
grant execute on function public.retry_delivery(uuid) to authenticated;
revoke all on function public.revoke_customer_report_access_token(uuid, text) from public, anon, authenticated;
grant execute on function public.revoke_customer_report_access_token(uuid, text) to authenticated;
revoke all on function public.reissue_customer_report_access_token(uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.reissue_customer_report_access_token(uuid, uuid, text, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Redefine approve_quality_review (Release B, 20260724160000_release_b_durable_fulfilment.sql)
--    via CREATE OR REPLACE. That migration is not edited. Full existing body reproduced
--    faithfully; the only new logic is the additive block that creates the delivery
--    authorization and releases the report, marked below.
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
      insert into public.audit_logs(actor_type, actor_user_id, entity_table, entity_id, action, after_json)
      values ('system', null, 'orders', v_report.order_id, 'delivery_not_queued_missing_recipient_email',
        jsonb_build_object('report_id', v_report.id, 'attempt_id', v_after.id));
    end if;
  end if;

  insert into public.audit_logs(actor_type, actor_user_id, entity_table, entity_id, action, before_json, after_json)
  values ('admin', v_actor_id, 'manual_report_generation_attempts', v_after.id, 'quality_review_approved', to_jsonb(v_before), to_jsonb(v_after));

  return to_jsonb(v_after);
end;
$$;

revoke all on function public.approve_quality_review(uuid, text) from public, anon, authenticated;
grant execute on function public.approve_quality_review(uuid, text) to authenticated;

commit;
