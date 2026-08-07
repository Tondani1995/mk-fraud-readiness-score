-- Artefact-aware customer report-access audit.
--
-- Additive only. public.record_customer_report_access(uuid,uuid,uuid,boolean,text,text) is left
-- completely untouched -- same signature, same body, same grants -- so every existing caller keeps
-- working and no PostgREST overload ambiguity is introduced. This is a separate, explicitly named
-- function rather than a defaulted seventh parameter for exactly that reason.
--
-- Why it exists: the accepted six-argument function builds its own metadata_json from its own
-- inputs, so an artefact discriminator supplied by the application was discarded and the persisted
-- trail could not distinguish the report PDF from the supporting register. The artefact type must
-- live in the authoritative event/audit trail, not only in the application's return value.

begin;

create or replace function public.record_customer_report_artefact_access(
  p_token_id uuid,
  p_order_id uuid,
  p_report_id uuid,
  p_success boolean,
  p_artefact_type text,
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
  v_metadata jsonb;
  v_token public.customer_report_access_tokens%rowtype;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'customer_report_access_service_role_required';
  end if;
  if p_success is null then
    raise exception 'customer_report_access_success_required';
  end if;
  -- Closed vocabulary. Anything else is rejected rather than recorded as an unknown artefact.
  if p_artefact_type is null or p_artefact_type not in ('pdf', 'supporting_register') then
    raise exception 'customer_report_access_artefact_type_invalid';
  end if;

  v_metadata := pg_catalog.jsonb_build_object(
    'token_id', p_token_id,
    'technical_reference', p_technical_reference,
    'success', p_success,
    'error_category', p_reason,
    'artefact_type', p_artefact_type
  );

  -- Identical binding rules to the accepted access audit: a token may only be recorded against the
  -- exact order and report it was issued for.
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

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'event_type', v_event_type,
    'actor_type', 'respondent_token',
    'artefact_type', p_artefact_type,
    'report_event_recorded', p_report_id is not null,
    'order_event_recorded', p_order_id is not null
  );
end;
$$;

revoke all on function public.record_customer_report_artefact_access(
  uuid, uuid, uuid, boolean, text, text, text
) from public, anon, authenticated;
grant execute on function public.record_customer_report_artefact_access(
  uuid, uuid, uuid, boolean, text, text, text
) to service_role;

commit;
