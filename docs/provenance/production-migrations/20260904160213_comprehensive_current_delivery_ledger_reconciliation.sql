-- Bounded current-path correction for the one Preview V3 delivery whose provider accepted
-- the email before the stale provider_mode constraint rejected persistence. This migration
-- deliberately changes no historical rows and never sends, retries or issues a token.

begin;

-- Preserve every historical mode already admitted by the Phase 1 constraint while admitting
-- the current Release C application modes. The preflight assertion makes an unexpected legacy
-- value fail the migration instead of silently rewriting it.
do $$
declare
  v_invalid_count integer;
begin
  select count(*) into v_invalid_count
  from public.email_events
  where provider_mode is not null
    and provider_mode not in ('disabled', 'double', 'external', 'test', 'live');
  if v_invalid_count <> 0 then
    raise exception 'current_delivery_provider_mode_existing_value_invalid:%', v_invalid_count;
  end if;
end;
$$;

alter table public.email_events
  drop constraint if exists email_events_phase1_provider_mode_chk;

alter table public.email_events
  drop constraint if exists email_events_provider_mode_current_chk;

alter table public.email_events
  add constraint email_events_provider_mode_current_chk
  check (provider_mode = any (array['disabled', 'double', 'external', 'test', 'live']::text[]));

do $$
declare
  v_invalid_count integer;
begin
  select count(*) into v_invalid_count
  from public.email_events
  where provider_mode is not null
    and provider_mode not in ('disabled', 'double', 'external', 'test', 'live');
  if v_invalid_count <> 0 then
    raise exception 'current_delivery_provider_mode_constraint_validation_failed:%', v_invalid_count;
  end if;
end;
$$;

-- One hard-pinned, no-send reconciliation seam for the already accepted Preview message.
-- Inputs are retained for an auditable RPC contract, but every binding is checked against the
-- one released V3 fixture. The function is intentionally not a retry path and never reads or
-- returns the customer access token.
create or replace function public.reconcile_comprehensive_v3_provider_acceptance(
  p_authorization_id uuid,
  p_report_id uuid,
  p_report_checksum text,
  p_provider_message_id text,
  p_provider_mode text,
  p_test_delivery boolean,
  p_actor_admin_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_assessment_id constant uuid := 'bdf65b33-fa79-4839-8dbc-382cad61fa2b';
  c_order_id constant uuid := '9affc194-17a2-49cf-bc0e-b45d0535e336';
  c_report_id constant uuid := '57d1a0ec-198b-448c-8edf-79db62c9e218';
  c_authorization_id constant uuid := 'cf8c71b1-453a-4396-a351-a8ec702e1238';
  c_email_event_id constant uuid := '2bba4678-186e-4261-9c2a-b9962d6f22b2';
  c_report_reference constant text := 'RPT-MKFRS-2026-63D3103D95-V3';
  c_report_checksum constant text := '87e7fd6a550c3bd816665116c3e437f7133a8af591836670d5437787f86f0d8f';
  c_provider_message_id constant text := 'c17a2968-e4ec-406d-a99b-b384c83e2214';
  c_provider_mode constant text := 'test';
  v_auth public.report_delivery_authorizations%rowtype;
  v_event public.email_events%rowtype;
  v_report public.reports%rowtype;
  v_finalization public.report_delivery_finalizations%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_active_token_count integer;
  v_report_ready_event_count integer;
  v_provider_message_event_count integer;
  v_finalization_count integer;
  v_newer_report_count integer;
begin
  if coalesce(nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '')
       <> 'service_role' then
    raise exception 'comprehensive_v3_delivery_reconciliation_service_role_required';
  end if;

  if p_authorization_id is distinct from c_authorization_id
     or p_report_id is distinct from c_report_id
     or p_report_checksum is distinct from c_report_checksum
     or p_provider_message_id is distinct from c_provider_message_id
     or pg_catalog.lower(pg_catalog.btrim(coalesce(p_provider_mode, ''))) <> c_provider_mode
     or p_test_delivery is distinct from true
     or p_actor_admin_id is null then
    raise exception 'comprehensive_v3_delivery_reconciliation_input_binding_mismatch';
  end if;

  if not exists (
    select 1
    from public.admin_profiles
    where id = p_actor_admin_id
      and status = 'active'
      and role = 'platform_admin'
  ) then
    raise exception 'comprehensive_v3_delivery_reconciliation_platform_admin_required';
  end if;

  select * into v_auth
  from public.report_delivery_authorizations
  where id = c_authorization_id
  for update;
  if not found
     or v_auth.report_id is distinct from c_report_id
     or v_auth.assessment_id is distinct from c_assessment_id
     or v_auth.order_id is distinct from c_order_id
     or v_auth.email_event_id is distinct from c_email_event_id
     or v_auth.report_checksum is distinct from c_report_checksum
     or v_auth.provider is distinct from 'resend'
     or v_auth.provider_message_id is distinct from c_provider_message_id then
    raise exception 'comprehensive_v3_delivery_reconciliation_authorization_binding_mismatch';
  end if;

  select * into v_report
  from public.reports
  where id = c_report_id
  for share;
  if not found
     or v_report.assessment_id is distinct from c_assessment_id
     or v_report.order_id is distinct from c_order_id
     or v_report.report_reference is distinct from c_report_reference
     or v_report.version_number <> 3
     or v_report.status <> 'released'
     or v_report.checksum is distinct from c_report_checksum
     or v_report.storage_status <> 'VERIFIED' then
    raise exception 'comprehensive_v3_delivery_reconciliation_report_binding_mismatch';
  end if;

  select count(*) into v_newer_report_count
  from public.reports r
  where r.assessment_id = c_assessment_id
    and r.report_type = v_report.report_type
    and r.version_number > 3
    and r.status not in ('superseded', 'voided');
  if v_newer_report_count <> 0 then
    raise exception 'comprehensive_v3_delivery_reconciliation_report_not_current';
  end if;

  select * into v_event
  from public.email_events
  where id = c_email_event_id
  for update;
  if not found
     or v_event.report_id is distinct from c_report_id
     or v_event.order_id is distinct from c_order_id
     or v_event.template_key is distinct from 'report_ready'
     or v_event.notification_type is distinct from 'report_ready'
     or v_event.provider is distinct from 'resend'
     or v_event.provider_message_id is distinct from c_provider_message_id then
    raise exception 'comprehensive_v3_delivery_reconciliation_email_binding_mismatch';
  end if;

  select count(*) into v_report_ready_event_count
  from public.email_events
  where report_id = c_report_id
    and template_key = 'report_ready'
    and notification_type = 'report_ready';
  if v_report_ready_event_count <> 1 then
    raise exception 'comprehensive_v3_delivery_reconciliation_email_event_count_invalid:%', v_report_ready_event_count;
  end if;

  select count(*) into v_provider_message_event_count
  from public.email_events
  where provider = 'resend'
    and provider_message_id = c_provider_message_id;
  if v_provider_message_event_count <> 1 then
    raise exception 'comprehensive_v3_delivery_reconciliation_provider_message_event_count_invalid:%', v_provider_message_event_count;
  end if;

  select count(*) into v_active_token_count
  from public.customer_report_access_tokens
  where report_id = c_report_id
    and purpose = 'report_ready'
    and revoked_at is null;
  if v_active_token_count <> 1 then
    raise exception 'comprehensive_v3_delivery_reconciliation_active_token_count_invalid:%', v_active_token_count;
  end if;

  select count(*) into v_finalization_count
  from public.report_delivery_finalizations
  where authorization_id = c_authorization_id
     or report_id = c_report_id;

  if v_auth.status = 'finalized' then
    if not v_auth.test_delivery
       or v_event.status <> 'PROVIDER_ACCEPTED'
       or v_event.provider_mode <> c_provider_mode
       or v_finalization_count <> 1 then
      raise exception 'comprehensive_v3_delivery_reconciliation_finalized_state_mismatch';
    end if;
    select * into v_finalization
    from public.report_delivery_finalizations
    where authorization_id = c_authorization_id;
    if not found
       or v_finalization.email_event_id is distinct from c_email_event_id
       or v_finalization.report_id is distinct from c_report_id
       or v_finalization.provider is distinct from 'resend'
       or v_finalization.provider_message_id is distinct from c_provider_message_id then
      raise exception 'comprehensive_v3_delivery_reconciliation_finalization_binding_mismatch';
    end if;
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'already_reconciled', true,
      'authorization_id', c_authorization_id,
      'report_id', c_report_id,
      'email_event_id', c_email_event_id,
      'provider', 'resend',
      'provider_mode', c_provider_mode,
      'provider_calls', 0
    );
  end if;

  if v_auth.status <> 'reconciliation_required'
     or v_auth.test_delivery
     or v_event.status <> 'provider_acceptance_uncertain'
     or v_event.provider_mode <> 'disabled' then
    raise exception 'comprehensive_v3_delivery_reconciliation_precondition_mismatch';
  end if;
  if v_finalization_count <> 0 then
    raise exception 'comprehensive_v3_delivery_reconciliation_unexpected_finalization';
  end if;

  -- This is the only mutation context used below. It is the same guarded context used by the
  -- worker that made the original provider request; no provider, retry, token or dispatch RPC
  -- is called from this transaction.
  perform pg_catalog.set_config('phase14.authoritative_transition', 'worker_rpc', true);

  update public.email_events
  set provider_mode = c_provider_mode,
      status = 'PROVIDER_ACCEPTED',
      provider_message_id = c_provider_message_id,
      sent_at = coalesce(sent_at, v_now),
      delivery_updated_at = v_now,
      error_message = null,
      reconciliation_attempted_at = v_now,
      reconciliation_result_json = pg_catalog.jsonb_build_object(
        'resolution', 'provider_acceptance_reconciled_without_resend',
        'provider_message_id', c_provider_message_id,
        'reconciliation_at', v_now
      ),
      updated_at = v_now
  where id = c_email_event_id
    and status = 'provider_acceptance_uncertain';
  if not found then
    raise exception 'comprehensive_v3_delivery_reconciliation_email_cas_failed';
  end if;

  update public.report_delivery_authorizations
  set status = 'finalized',
      test_delivery = true,
      provider_message_id = c_provider_message_id,
      finalized_at = v_now,
      lease_token = null,
      lease_expires_at = null,
      updated_at = v_now
  where id = c_authorization_id
    and status = 'reconciliation_required';
  if not found then
    raise exception 'comprehensive_v3_delivery_reconciliation_authorization_cas_failed';
  end if;

  insert into public.report_delivery_finalizations(
    authorization_id,
    email_event_id,
    report_id,
    fulfilment_id,
    provider,
    provider_message_id,
    finalized_at
  ) values (
    c_authorization_id,
    c_email_event_id,
    c_report_id,
    v_report.fulfilment_id,
    'resend',
    c_provider_message_id,
    v_now
  );

  insert into public.audit_logs(
    actor_type,
    actor_user_id,
    assessment_id,
    entity_table,
    entity_id,
    action,
    after_json
  ) values (
    'admin',
    p_actor_admin_id,
    c_assessment_id,
    'report_delivery_authorizations',
    c_authorization_id,
    'comprehensive_v3_delivery_reconciled_after_schema_persistence_failure',
    pg_catalog.jsonb_build_object(
      'report_id', c_report_id,
      'email_event_id', c_email_event_id,
      'provider', 'resend',
      'provider_message_id', c_provider_message_id,
      'provider_mode', c_provider_mode,
      'test_delivery', true,
      'provider_calls', 0,
      'resend_retried', false,
      'token_reissued', false
    )
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'already_reconciled', false,
    'authorization_id', c_authorization_id,
    'report_id', c_report_id,
    'email_event_id', c_email_event_id,
    'provider', 'resend',
    'provider_mode', c_provider_mode,
    'provider_calls', 0
  );
end;
$$;

revoke all on function public.reconcile_comprehensive_v3_provider_acceptance(
  uuid, uuid, text, text, text, boolean, uuid
) from public, anon, authenticated;
grant execute on function public.reconcile_comprehensive_v3_provider_acceptance(
  uuid, uuid, text, text, text, boolean, uuid
) to service_role;

commit;
