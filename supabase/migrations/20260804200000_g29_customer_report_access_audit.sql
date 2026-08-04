-- G29 customer report access audit correction.
-- The customer route is service-role backed and must not write the three audit/event tables
-- independently. Keep the existing token-possession model and record the customer actor using
-- the existing respondent_token enum value (customer_token is not a valid audit actor).

begin;

create or replace function public.record_customer_report_access(
  p_token_id uuid,
  p_order_id uuid,
  p_report_id uuid,
  p_success boolean,
  p_reason text default null,
  p_technical_reference text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text := case when p_success then 'customer_report_accessed' else 'customer_report_access_failed' end;
  v_note text := case when p_success then 'Customer accessed the secure report link.'
    else 'Customer access failed: ' || coalesce(p_reason, 'unknown') || '.' end;
  v_metadata jsonb := jsonb_build_object(
    'token_id', p_token_id,
    'technical_reference', p_technical_reference,
    'success', p_success,
    'error_category', p_reason
  );
  v_token public.customer_report_access_tokens%rowtype;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'customer_report_access_service_role_required';
  end if;
  if p_success is null then
    raise exception 'customer_report_access_success_required';
  end if;
  if p_token_id is not null then
    select * into v_token
    from public.customer_report_access_tokens
    where id = p_token_id;
    if not found then raise exception 'customer_report_access_token_missing'; end if;
    if v_token.order_id is distinct from p_order_id
       or v_token.report_id is distinct from p_report_id then
      raise exception 'customer_report_access_binding_mismatch';
    end if;
  elsif p_order_id is not null or p_report_id is not null then
    raise exception 'customer_report_access_partial_binding';
  end if;

  if p_report_id is not null then
    insert into public.report_events(report_id, event_type, note, metadata_json)
    values (p_report_id, v_event_type, v_note, v_metadata);
  end if;
  if p_order_id is not null then
    insert into public.order_events(order_id, event_type, note, metadata_json)
    values (p_order_id, v_event_type, v_note, v_metadata);
  end if;
  insert into public.audit_logs(
    actor_type, entity_table, entity_id, action, after_json
  ) values (
    'respondent_token', 'customer_report_access_tokens', p_token_id, v_event_type, v_metadata
  );

  return jsonb_build_object(
    'ok', true,
    'event_type', v_event_type,
    'actor_type', 'respondent_token',
    'report_event_recorded', p_report_id is not null,
    'order_event_recorded', p_order_id is not null
  );
end;
$$;

revoke all on function public.record_customer_report_access(uuid, uuid, uuid, boolean, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_customer_report_access(uuid, uuid, uuid, boolean, text, text)
  to service_role;

commit;
