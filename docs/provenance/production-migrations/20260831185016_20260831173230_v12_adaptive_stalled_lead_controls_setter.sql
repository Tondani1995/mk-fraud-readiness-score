-- V1.2: the stalled-lead monitor is an operational control, not a generic
-- app-settings writer. The existing row is provisioned by the forward
-- Production contract; this RPC is the only runtime write authority for it.

begin;

create or replace function public.set_v12_adaptive_stalled_lead_controls(
  p_enabled boolean,
  p_inactivity_hours integer,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_setting_key constant text := 'v12_adaptive_stalled_lead_controls';
  v_source constant text := 'v12_forward_contract';
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_current jsonb;
  v_next jsonb;
  v_previous_enabled boolean;
  v_previous_hours integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_enabled is null then
    raise exception 'v12_stalled_lead_controls:enabled_required';
  end if;

  if p_inactivity_hours is null
     or p_inactivity_hours < 1
     or p_inactivity_hours > 168 then
    raise exception 'v12_stalled_lead_controls:inactivity_hours_out_of_range';
  end if;

  if pg_catalog.char_length(v_reason) < 10
     or pg_catalog.char_length(v_reason) > 500 then
    raise exception 'v12_stalled_lead_controls:meaningful_reason_required';
  end if;

  select s.value_json
    into v_current
    from public.app_settings as s
   where s.setting_key = v_setting_key
   for update;

  if not found then
    raise exception 'v12_stalled_lead_controls:setting_missing';
  end if;

  if pg_catalog.jsonb_typeof(v_current) <> 'object'
     or (select count(*) from pg_catalog.jsonb_object_keys(v_current)) <> 3
     or not (v_current ? 'source')
     or not (v_current ? 'enabled')
     or not (v_current ? 'inactivity_hours')
     or v_current->>'source' is distinct from v_source
     or pg_catalog.jsonb_typeof(v_current->'enabled') <> 'boolean'
     or pg_catalog.jsonb_typeof(v_current->'inactivity_hours') <> 'number'
     or v_current->>'inactivity_hours' !~ '^[0-9]{1,3}$' then
    raise exception 'v12_stalled_lead_controls:unexpected_current_shape';
  end if;

  v_previous_enabled := (v_current->>'enabled')::boolean;
  v_previous_hours := (v_current->>'inactivity_hours')::integer;
  if v_previous_hours < 1 or v_previous_hours > 168 then
    raise exception 'v12_stalled_lead_controls:unexpected_current_shape';
  end if;

  v_next := pg_catalog.jsonb_build_object(
    'source', v_source,
    'enabled', p_enabled,
    'inactivity_hours', p_inactivity_hours
  );

  perform pg_catalog.set_config('phase14.authoritative_transition', 'policy_approval', true);

  update public.app_settings
     set value_json = v_next,
         updated_at = v_now
   where setting_key = v_setting_key;

  if not found then
    raise exception 'v12_stalled_lead_controls:update_failed';
  end if;

  insert into public.audit_logs(
    actor_type,
    entity_table,
    action,
    before_json,
    after_json
  ) values (
    'system',
    'app_settings',
    'v12_stalled_lead_controls_changed',
    pg_catalog.jsonb_build_object(
      'setting_key', v_setting_key,
      'source', v_source,
      'enabled', v_previous_enabled,
      'inactivity_hours', v_previous_hours
    ),
    pg_catalog.jsonb_build_object(
      'setting_key', v_setting_key,
      'source', v_source,
      'enabled', p_enabled,
      'inactivity_hours', p_inactivity_hours,
      'reason', v_reason
    )
  );

  return pg_catalog.jsonb_build_object(
    'setting_key', v_setting_key,
    'value_json', v_next,
    'changed_at', v_now,
    'audit_action', 'v12_stalled_lead_controls_changed'
  );
end;
$$;

revoke all on function public.set_v12_adaptive_stalled_lead_controls(boolean, integer, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_v12_adaptive_stalled_lead_controls(boolean, integer, text)
  to service_role;

comment on function public.set_v12_adaptive_stalled_lead_controls(boolean, integer, text) is
  'Audited service-role-only setter for the fixed v12_adaptive_stalled_lead_controls app setting. Validates the v12_forward_contract shape, preserves direct table-write lockdown, updates atomically and records the previous/new control state without customer data.';

commit;
