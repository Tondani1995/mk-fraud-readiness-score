-- Bounded current-path correction for the Preview V2 closure.
--
-- The active delivery worker receives the authoritative mode from sendEmail(), but the original
-- three-argument finalizer had no mode parameters and therefore left the durable ledger at its
-- default (`disabled`) even after a test/live provider acceptance.  Keep the original signature
-- intact for historical callers and add an explicit overload for the active worker.  The wrapper
-- updates the linked rows only after validating the same lease/state boundary, then delegates to
-- the existing finalizer in the same transaction.  This preserves its idempotency and provider
-- reconciliation semantics without inferring mode from recipient or environment later.

create or replace function public.finalize_delivery(
  p_authorization_id uuid,
  p_lease_token uuid,
  p_provider_message_id text,
  p_provider_mode text,
  p_test_delivery boolean
) returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_authorization public.report_delivery_authorizations%rowtype;
  v_mode text := lower(pg_catalog.btrim(coalesce(p_provider_mode, '')));
begin
  if v_mode not in ('disabled', 'test', 'live') then
    raise exception 'delivery_provider_mode_invalid';
  end if;
  if p_test_delivery is distinct from (v_mode = 'test') then
    raise exception 'delivery_test_mode_mismatch';
  end if;
  if coalesce(pg_catalog.btrim(p_provider_message_id), '') = '' then
    raise exception 'delivery_provider_message_id_required';
  end if;

  select * into v_authorization
  from public.report_delivery_authorizations
  where id = p_authorization_id
  for update;
  if not found then
    raise exception 'delivery_authorization_not_found';
  end if;
  if v_authorization.status <> 'dispatching'
     or v_authorization.lease_token <> p_lease_token then
    raise exception 'delivery_lease_invalid';
  end if;

  update public.email_events
  set provider_mode = v_mode,
      updated_at = pg_catalog.now()
  where id = v_authorization.email_event_id;
  if not found then
    raise exception 'delivery_email_event_not_found';
  end if;

  update public.report_delivery_authorizations
  set test_delivery = (v_mode = 'test'),
      updated_at = pg_catalog.now()
  where id = v_authorization.id;

  return public.finalize_delivery(
    p_authorization_id,
    p_lease_token,
    p_provider_message_id
  );
end;
$$;

revoke all on function public.finalize_delivery(uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.finalize_delivery(uuid, uuid, text, text, boolean) to service_role;
