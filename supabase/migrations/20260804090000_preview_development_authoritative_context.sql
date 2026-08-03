-- Preview development delivery: establish the narrow authoritative context required by the
-- shared-table mutation guard. This is additive and must remain Staging-only; the application
-- gate still fails closed unless VERCEL_ENV is exactly preview and the Supabase project is the
-- known Staging project.

begin;

-- The cleanup allowance migration is the current definition of this guard. Preserve all of its
-- ownership, provenance, and operation-ref checks while adding one exact transition owner.
create or replace function public.guard_phase14_authoritative_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else '{}'::jsonb end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  v_old_owned boolean := false;
  v_new_owned boolean := false;
  v_context text := nullif(current_setting('phase14.authoritative_transition', true), '');
  v_transition_owner name;
  v_cleanup_ref text;
  v_synthetic_ref text;
begin
  if tg_table_name = 'phase14_operational_alerts' then
    v_old_owned := tg_op in ('UPDATE','DELETE');
    v_new_owned := tg_op in ('INSERT','UPDATE');
  else
    v_old_owned := public.phase14_shared_row_was_owned(tg_table_name, v_old);
    v_new_owned := public.phase14_shared_row_was_owned(tg_table_name, v_new);
  end if;
  if tg_table_name='email_provider_events' and tg_op in ('INSERT','UPDATE')
     and not v_new_owned and nullif(v_new->>'email_event_id','') is not null then
    v_new_owned:=exists(select 1 from public.email_events e
      where e.id=(v_new->>'email_event_id')::uuid and e.phase14_operation_ref is not null);
  end if;

  if tg_op = 'DELETE' then
    v_cleanup_ref := nullif(current_setting('rc1.synthetic_cleanup_ref', true), '');
    if v_cleanup_ref is not null then
      select o.synthetic_certification_ref into v_synthetic_ref
      from public.organisations o
      where o.id in (
        select a.organisation_id from public.assessments a
        where a.id = nullif(v_old->>'assessment_id','')::uuid
        union
        select a.organisation_id from public.reports r
        join public.assessments a on a.id = r.assessment_id
        where r.id = nullif(v_old->>'report_id','')::uuid
        union
        select a.organisation_id from public.email_events e
        join public.assessments a on a.id = e.assessment_id
        where e.id = nullif(v_old->>'email_event_id','')::uuid
      )
        and o.synthetic_certification_ref = v_cleanup_ref
      limit 1;

      if v_synthetic_ref is not null and v_synthetic_ref = v_cleanup_ref then
        return old;
      end if;
    end if;
  end if;

  select pg_get_userbyid(p.proowner) into v_transition_owner
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='phase14_require_security'
  order by p.oid limit 1;

  if v_old_owned or v_new_owned then
    if current_user is distinct from v_transition_owner
       or coalesce(v_context,'') not in (
         'authenticated_rpc','fulfilment_queue_rpc','fulfilment_transition_rpc',
         'gate_administration','gate_invalidation','migration','operational_alert_rpc',
         'policy_approval','runtime_secret_rotation','trusted_provider_attestation',
         'worker_authorization','worker_attested_rpc','worker_rpc','worker_completion',
         'preview_development_rpc'
       ) then
      raise exception 'phase14_authoritative_rpc_required:%:%',tg_table_name,tg_op;
    end if;
  end if;

  if tg_table_name <> 'phase14_operational_alerts' and tg_op='UPDATE' and v_old_owned
     and old.phase14_operation_ref is distinct from new.phase14_operation_ref then
    raise exception 'phase14_operation_ref_immutable:%',tg_table_name;
  end if;
  if tg_table_name <> 'phase14_operational_alerts'
     and tg_op in ('INSERT','UPDATE') and v_new_owned
     and new.phase14_operation_ref is null then
    new.phase14_operation_ref := 'phase14:' || replace(tg_table_name,'_','-') || ':' || new.id::text;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

-- Wrap the already-reviewed DML implementations so the context is set locally for the complete
-- nested call. Audit writes stay inside these SECURITY DEFINER wrappers; the application service
-- performs no guarded-table inserts.
alter function public.preview_development_prepare_premium_report_delivery(uuid, text, text)
  rename to preview_development_prepare_premium_report_delivery_impl;
alter function public.preview_development_finalize_premium_report_delivery(uuid, uuid, text)
  rename to preview_development_finalize_premium_report_delivery_impl;
alter function public.preview_development_mark_reconciliation_required(uuid, text, text)
  rename to preview_development_mark_reconciliation_required_impl;

create function public.preview_development_prepare_premium_report_delivery(
  p_report_id uuid,
  p_recipient text,
  p_provider text default 'resend'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_auth public.report_delivery_authorizations%rowtype;
begin
  perform set_config('phase14.authoritative_transition', 'preview_development_rpc', true);
  v_result := public.preview_development_prepare_premium_report_delivery_impl(
    p_report_id, p_recipient, p_provider
  );
  if coalesce((v_result->>'reused_existing_send')::boolean, false) = false then
    select * into v_auth from public.report_delivery_authorizations
    where id = (v_result->>'authorization_id')::uuid;
    insert into public.audit_logs(
      actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, after_json
    ) values (
      'system', null, v_auth.assessment_id, 'reports',
      (v_result->>'report_id')::uuid, 'premium_report_preview_development_delivery_requested',
      jsonb_build_object(
        'authorization_id', v_result->>'authorization_id',
        'email_event_id', v_result->>'email_event_id',
        'recipient_allowlisted', true, 'provider_mode', 'test', 'development_mode', true
      )
    );
  end if;
  return v_result;
end;
$$;

create function public.preview_development_finalize_premium_report_delivery(
  p_authorization_id uuid,
  p_email_event_id uuid,
  p_provider_message_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('phase14.authoritative_transition', 'preview_development_rpc', true);
  return public.preview_development_finalize_premium_report_delivery_impl(
    p_authorization_id, p_email_event_id, p_provider_message_id
  );
end;
$$;

create function public.preview_development_mark_reconciliation_required(
  p_authorization_id uuid,
  p_provider_message_id text default null,
  p_reason text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth public.report_delivery_authorizations%rowtype;
  v_result boolean;
begin
  perform set_config('phase14.authoritative_transition', 'preview_development_rpc', true);
  select * into v_auth from public.report_delivery_authorizations where id = p_authorization_id;
  v_result := public.preview_development_mark_reconciliation_required_impl(
    p_authorization_id, p_provider_message_id, p_reason
  );
  if v_auth.id is not null then
    insert into public.audit_logs(
      actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, after_json
    ) values (
      'system', null, v_auth.assessment_id, 'reports', v_auth.report_id,
      'premium_report_preview_development_delivery_reconciliation_required',
      jsonb_build_object(
        'authorization_id', v_auth.id, 'provider_message_id', p_provider_message_id,
        'reason_present', coalesce(trim(p_reason), '') <> '', 'development_mode', true
      )
    );
  end if;
  return v_result;
end;
$$;

revoke all on function public.preview_development_prepare_premium_report_delivery_impl(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.preview_development_finalize_premium_report_delivery_impl(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.preview_development_mark_reconciliation_required_impl(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.preview_development_prepare_premium_report_delivery(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.preview_development_finalize_premium_report_delivery(uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.preview_development_mark_reconciliation_required(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.preview_development_prepare_premium_report_delivery(uuid, text, text) to service_role;
grant execute on function public.preview_development_finalize_premium_report_delivery(uuid, uuid, text) to service_role;
grant execute on function public.preview_development_mark_reconciliation_required(uuid, text, text) to service_role;

commit;
