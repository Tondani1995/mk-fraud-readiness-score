-- RC1 staging postflight least-privilege correction.
--
-- This migration changes ACLs only. It does not replace any function, alter any
-- function property, or alter the trigger/event-trigger registrations.
--
-- public.rls_auto_enable() is a Supabase-hosted platform baseline function. It
-- is present on the permanent staging project but is not installed by the local
-- Supabase PostgreSQL 17 image. The conditional block therefore hardens it when
-- present without making repository replay depend on a platform-owned object.

do $least_privilege_preflight$
begin
  if to_regprocedure(
    'public.authorize_bounced_report_redelivery(uuid,uuid,text)'
  ) is null then
    raise exception
      'rc1_postflight_hardening:authorize_bounced_report_redelivery_missing';
  end if;

  if to_regprocedure(
    'public.invalidate_phase14_authority_on_gate_change()'
  ) is null then
    raise exception
      'rc1_postflight_hardening:gate_invalidation_trigger_function_missing';
  end if;
end;
$least_privilege_preflight$;

revoke all privileges on function
  public.authorize_bounced_report_redelivery(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function
  public.authorize_bounced_report_redelivery(uuid, uuid, text)
  to authenticated;

revoke all privileges on function
  public.invalidate_phase14_authority_on_gate_change()
  from public, anon, authenticated, service_role;

do $harden_platform_rls_event_trigger$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute
      'revoke all privileges on function public.rls_auto_enable() '
      'from public, anon, authenticated, service_role';
  end if;
end;
$harden_platform_rls_event_trigger$;

do $least_privilege_postflight$
begin
  if has_function_privilege(
      'public',
      'public.authorize_bounced_report_redelivery(uuid,uuid,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.authorize_bounced_report_redelivery(uuid,uuid,text)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'authenticated',
      'public.authorize_bounced_report_redelivery(uuid,uuid,text)',
      'EXECUTE'
    )
    or has_function_privilege(
      'service_role',
      'public.authorize_bounced_report_redelivery(uuid,uuid,text)',
      'EXECUTE'
    ) then
    raise exception 'rc1_postflight_hardening:bounce_redelivery_acl_invalid';
  end if;

  if has_function_privilege(
      'public',
      'public.invalidate_phase14_authority_on_gate_change()',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.invalidate_phase14_authority_on_gate_change()',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.invalidate_phase14_authority_on_gate_change()',
      'EXECUTE'
    )
    or has_function_privilege(
      'service_role',
      'public.invalidate_phase14_authority_on_gate_change()',
      'EXECUTE'
    ) then
    raise exception 'rc1_postflight_hardening:gate_invalidation_acl_invalid';
  end if;

  if to_regprocedure('public.rls_auto_enable()') is not null
    and (
      has_function_privilege(
        'public', 'public.rls_auto_enable()', 'EXECUTE'
      )
      or has_function_privilege(
        'anon', 'public.rls_auto_enable()', 'EXECUTE'
      )
      or has_function_privilege(
        'authenticated', 'public.rls_auto_enable()', 'EXECUTE'
      )
      or has_function_privilege(
        'service_role', 'public.rls_auto_enable()', 'EXECUTE'
      )
    ) then
    raise exception 'rc1_postflight_hardening:rls_auto_enable_acl_invalid';
  end if;
end;
$least_privilege_postflight$;
