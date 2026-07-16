-- Phase 14 launch readiness -- H4: admin resolution for a delivery attempt whose provider
-- acceptance is genuinely ambiguous and no webhook has arrived to resolve it automatically.
--
-- The existing automated reconciliation path (public.resolve_premium_report_delivery_reconciliation,
-- driven by reconcilePremiumReportEmail in report-delivery-service-core.ts) only closes a stuck
-- 'reconciliation_required' delivery when a provider-API lookup by provider_message_id produced a
-- definitive 'accepted' or 'not_found' result. When the HTTP response to Resend was lost BEFORE a
-- provider_message_id was ever captured, reconcileReportEmailWithResend cannot call Resend's API
-- at all (Resend has no "look up by idempotency key" endpoint) and returns state:'unknown'. An
-- attestation recorded with provider_state='unknown' satisfies neither of
-- resolve_premium_report_delivery_reconciliation's two branches ('accepted' requires
-- provider_state='accepted'; 'not_accepted' requires provider_state='not_found'), so that RPC
-- cannot resolve this case. Nothing else in the codebase can either. This is the exact scenario
-- the task spec describes: "if no webhook arrives, an authorised admin must be able to resolve
-- the case safely after checking Resend [dashboard]".
--
-- This migration adds that path. It deliberately does NOT require a phase14_provider_attestations
-- row (there may be none -- that is the whole point) -- the evidence is a human checking the
-- Resend dashboard (which can be searched by the delivery-attempt/report/order tags attached at
-- send time, even without a message ID) and recording what they found, with a mandatory note.
create or replace function public.admin_resolve_premium_report_delivery_ambiguity(
  p_authorization_id uuid,
  p_resolution text,
  p_confirmed_provider_message_id text default null,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_auth public.report_delivery_authorizations%rowtype;
  v_email public.email_events%rowtype;
  v_before jsonb;
  v_result jsonb;
begin
  v_actor := public.phase14_require_security(
    'provider_reconciliation', array['platform_admin', 'approver']::public.admin_role[], true, false
  );
  if p_resolution not in ('confirmed_delivered', 'confirmed_not_delivered', 'cannot_determine') then
    raise exception 'delivery_ambiguity_resolution_invalid';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'delivery_ambiguity_resolution_reason_required';
  end if;

  select * into v_auth from public.report_delivery_authorizations where id = p_authorization_id for update;
  if not found or v_auth.status <> 'reconciliation_required' then
    raise exception 'delivery_ambiguity_not_awaiting_reconciliation';
  end if;
  select * into v_email from public.email_events where id = v_auth.email_event_id for update;
  if not found or v_email.status <> 'reconciliation_required' then
    raise exception 'delivery_ambiguity_email_event_state_invalid';
  end if;
  v_before := jsonb_build_object(
    'authorization_status', v_auth.status, 'email_event_status', v_email.status,
    'provider_message_id', v_email.provider_message_id
  );

  perform set_config('phase14.authoritative_transition', 'authenticated_rpc', true);

  if p_resolution = 'confirmed_delivered' then
    -- Reuse the single authoritative finalization path rather than duplicating its logic --
    -- this never sends an email; it only records that Resend already accepted/delivered a
    -- message the admin located directly in the Resend dashboard.
    if coalesce(trim(p_confirmed_provider_message_id), '') = '' then
      raise exception 'delivery_ambiguity_confirmed_message_id_required';
    end if;
    v_result := public.finalize_premium_report_delivery(
      v_auth.id, v_auth.email_event_id, p_confirmed_provider_message_id
    );

  elsif p_resolution = 'confirmed_not_delivered' then
    -- Closes this attempt terminally (never sent, as far as any evidence shows) without deleting
    -- or overwriting the uncertain history -- the prior 'reconciliation_required' state remains
    -- visible in audit_logs below. Moving email_events off 'reconciliation_required' is what
    -- allows authorize_premium_report_delivery to accept a brand-new, separately authorised
    -- attempt for this report later (a fresh email_events row with its own attempt_number and
    -- idempotency key -- never a resend of this one).
    update public.report_delivery_authorizations
    set status = 'revoked', revoked_reason = p_reason, lease_token = null, lease_expires_at = null,
        updated_at = clock_timestamp()
    where id = v_auth.id and status = 'reconciliation_required';
    if not found then raise exception 'delivery_ambiguity_authorization_cas_failed'; end if;
    update public.email_events
    set status = 'failed_before_provider', error_message = p_reason,
        reconciliation_attempted_at = clock_timestamp(),
        reconciliation_result_json = coalesce(reconciliation_result_json, '{}'::jsonb) || jsonb_build_object(
          'resolution', 'confirmed_not_delivered', 'resolved_by', 'admin_manual_dashboard_check', 'note', p_reason
        ),
        delivery_updated_at = clock_timestamp()
    where id = v_auth.email_event_id and status = 'reconciliation_required';
    if not found then raise exception 'delivery_ambiguity_email_event_cas_failed'; end if;
    v_result := jsonb_build_object('resolved', true, 'resolution', 'confirmed_not_delivered', 'authorization_id', v_auth.id);

  else -- cannot_determine
    -- Deliberately leaves both rows in 'reconciliation_required' -- retries stay blocked, per
    -- spec ("keeps the attempt blocked and escalated"). Only the evidence trail is updated.
    update public.email_events
    set reconciliation_attempted_at = clock_timestamp(),
        reconciliation_result_json = coalesce(reconciliation_result_json, '{}'::jsonb) || jsonb_build_object(
          'resolution', 'cannot_determine', 'resolved_by', 'admin_manual_dashboard_check',
          'note', p_reason, 'escalated_at', clock_timestamp()
        )
    where id = v_auth.email_event_id and status = 'reconciliation_required';
    if not found then raise exception 'delivery_ambiguity_email_event_cas_failed'; end if;
    v_result := jsonb_build_object('resolved', false, 'resolution', 'cannot_determine', 'escalated', true, 'authorization_id', v_auth.id);
  end if;

  insert into public.audit_logs(
    actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, before_json, after_json
  ) values (
    'admin', (v_actor ->> 'user_id')::uuid, v_auth.assessment_id,
    'report_delivery_authorizations', v_auth.id,
    'premium_report_delivery_ambiguity_resolved',
    v_before,
    jsonb_build_object(
      'resolution', p_resolution, 'reason', p_reason,
      'confirmed_provider_message_id', p_confirmed_provider_message_id,
      'authorization_id', v_auth.id, 'email_event_id', v_email.id,
      'entry', 'manual_dashboard_check'
    )
  );

  return v_result;
end;
$$;

revoke all on function public.admin_resolve_premium_report_delivery_ambiguity(uuid, text, text, text)
  from public, anon, service_role;
grant execute on function public.admin_resolve_premium_report_delivery_ambiguity(uuid, text, text, text)
  to authenticated;

-- Read-side companion, mirroring admin_list_premium_report_workflow_start_reconciliations (0024):
-- a joined, readable view of delivery attempts currently awaiting reconciliation, for an admin
-- dashboard. report_delivery_authorizations already has an admin-select RLS policy; this is a
-- convenience projection, not a new grant of visibility.
create or replace function public.admin_list_premium_report_delivery_reconciliations()
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare v_actor jsonb; v_rows jsonb;
begin
  v_actor := public.phase14_require_security(
    'provider_reconciliation', array['platform_admin', 'approver', 'reviewer', 'read_only_admin']::public.admin_role[], true, false
  );
  select coalesce(jsonb_agg(row_data order by row_data ->> 'reconciliation_required_at' asc), '[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'authorization_id', a.id, 'email_event_id', e.id, 'report_id', a.report_id,
      'order_id', a.order_id, 'recipient_email', a.recipient_email::text,
      'provider_message_id', e.provider_message_id, 'attempt_number', e.attempt_number,
      'reconciliation_required_at', e.reconciliation_required_at,
      'reconciliation_attempted_at', e.reconciliation_attempted_at,
      'reconciliation_result_json', e.reconciliation_result_json,
      'error_message', e.error_message, 'updated_at', a.updated_at
    ) as row_data
    from public.report_delivery_authorizations a
    join public.email_events e on e.id = a.email_event_id
    where a.status = 'reconciliation_required'
  ) rows;
  return v_rows;
end;
$$;

revoke all on function public.admin_list_premium_report_delivery_reconciliations()
  from public, anon, service_role;
grant execute on function public.admin_list_premium_report_delivery_reconciliations()
  to authenticated;
