-- Retire MFA/AAL2 as an application/control-plane dependency.
-- Live authenticated sessions, active admin profiles and role checks remain mandatory.

create or replace function public.rc1_require_platform_admin(p_require_aal2 boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_exp bigint;
  v_profile public.admin_profiles%rowtype;
begin
  if v_user_id is null then raise exception 'rc1_freeze_control:no_session'; end if;
  begin
    v_exp := nullif(v_claims->>'exp', '')::bigint;
    v_session_id := nullif(v_claims->>'session_id', '')::uuid;
  exception when others then
    raise exception 'rc1_freeze_control:malformed_session';
  end;
  if v_exp is null or pg_catalog.to_timestamp(v_exp) <= pg_catalog.clock_timestamp() then raise exception 'rc1_freeze_control:expired_session'; end if;
  if v_session_id is null or not exists (
    select 1 from auth.sessions s where s.id = v_session_id and s.user_id = v_user_id and (s.not_after is null or s.not_after > pg_catalog.clock_timestamp())
  ) then raise exception 'rc1_freeze_control:inactive_session'; end if;
  select * into v_profile from public.admin_profiles where id = v_user_id;
  if not found or v_profile.status <> 'active' or v_profile.role <> 'platform_admin' then raise exception 'rc1_freeze_control:platform_admin_required'; end if;
  return pg_catalog.jsonb_build_object('user_id', v_user_id, 'actor_fingerprint', pg_catalog.encode(extensions.digest(pg_catalog.convert_to(v_user_id::text, 'UTF8'), 'sha256'), 'hex'));
end;
$function$;

create or replace function public.phase14_require_actor(p_action text, p_allowed_roles public.admin_role[], p_require_aal2 boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  v_user_id uuid := auth.uid();
  v_profile public.admin_profiles%rowtype;
  v_session_id uuid;
  v_exp bigint;
begin
  if v_user_id is null then raise exception 'phase14_no_session:%', p_action; end if;
  v_exp := nullif(v_claims->>'exp', '')::bigint;
  if v_exp is null or pg_catalog.to_timestamp(v_exp) <= pg_catalog.now() then raise exception 'phase14_session_expired:%', p_action; end if;
  begin v_session_id := nullif(v_claims->>'session_id', '')::uuid; exception when others then raise exception 'phase14_session_id_invalid:%', p_action; end;
  if v_session_id is null then raise exception 'phase14_session_id_required:%', p_action; end if;
  if not exists (select 1 from auth.sessions s where s.id = v_session_id and s.user_id = v_user_id and (s.not_after is null or s.not_after > pg_catalog.now())) then raise exception 'phase14_session_revoked_or_expired:%', p_action; end if;
  select * into v_profile from public.admin_profiles where id = v_user_id;
  if not found then raise exception 'phase14_profile_missing:%', p_action; end if;
  if v_profile.status = 'revoked' then raise exception 'phase14_profile_revoked:%', p_action; end if;
  if v_profile.status <> 'active' then raise exception 'phase14_profile_inactive:%', p_action; end if;
  if not (v_profile.role = any(p_allowed_roles)) then raise exception 'phase14_role_forbidden:%', p_action; end if;
  return pg_catalog.jsonb_build_object('user_id', v_user_id, 'role', v_profile.role, 'session_id', v_session_id);
end;
$function$;

comment on function public.rc1_require_platform_admin(boolean) is 'Requires a live authenticated platform_admin session. Legacy second-factor argument is ignored.';
comment on function public.phase14_require_actor(text, public.admin_role[], boolean) is 'Requires a live authenticated administrator session in an allowed role. Legacy second-factor argument is ignored.';
