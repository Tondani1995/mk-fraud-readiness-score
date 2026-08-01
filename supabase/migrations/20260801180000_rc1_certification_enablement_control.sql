-- RC1: an audited AAL2 control for the two certification enablement flags.
--
-- Why this exists
-- ---------------
-- rc1_synthetic_certification_cleanup and rc1_orphan_remediation are both deliberately inert until
-- an operator turns them on, and both refuse outright when their app_settings row is missing or
-- disabled. Nothing could turn them on through an audited path: update_phase14_feature_policy --
-- the RPC behind the AAL2 settings route -- refuses every key except the two Phase 14 ones:
--
--   if p_setting_key not in ('phase14_autonomous_report_engine','phase14_delivery_policy') then
--     raise exception 'phase14_feature_policy_key_forbidden';
--
-- So the only ways to enable them were a direct database edit or service_role, neither of which is
-- authorised or audited. That is the gap this closes.
--
-- Design
-- ------
-- One function, a closed allow-list of exactly the two RC1 certification keys, platform_admin at
-- AAL2, a meaningful reason, and an audit row carrying fingerprints and the resulting state only.
-- It writes public.app_settings, which sits on the activation_control freeze surface, so the
-- existing RC1 guard already refuses the write while the database is frozen -- the enablement can
-- only be granted inside a deliberate RELEASED window, and that rule is not restated here because
-- duplicating it would let the two drift.
--
-- The function cannot reach any other setting: the allow-list is checked before anything else, so
-- a Phase 14 policy, a methodology row or a provider mode can never be changed through it.

begin;

create table if not exists public.rc1_certification_enablement_audit (
  id uuid primary key default gen_random_uuid(),
  setting_key text not null,
  enabled boolean not null,
  reason_fingerprint text not null,
  actor_fingerprint text not null,
  freeze_epoch bigint,
  changed_at timestamptz not null default now(),
  constraint rc1_certification_enablement_audit_key_check
    check (setting_key in ('rc1_synthetic_certification_cleanup', 'rc1_orphan_remediation')),
  constraint rc1_certification_enablement_audit_reason_fingerprint_check
    check (reason_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint rc1_certification_enablement_audit_actor_fingerprint_check
    check (actor_fingerprint ~ '^[0-9a-f]{64}$')
);

alter table public.rc1_certification_enablement_audit enable row level security;
revoke all on table public.rc1_certification_enablement_audit from public, anon, authenticated;

create or replace function public.rc1_set_certification_enablement(
  p_setting_key text,
  p_enabled boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_reason_fingerprint text;
  v_actor_fingerprint text;
  v_freeze_epoch bigint;
  v_value jsonb;
begin
  -- The allow-list is checked first, so no other setting is reachable even momentarily.
  if p_setting_key is null
     or p_setting_key not in ('rc1_synthetic_certification_cleanup', 'rc1_orphan_remediation') then
    raise exception 'rc1_certification_enablement:setting_key_forbidden';
  end if;
  if p_enabled is null then
    raise exception 'rc1_certification_enablement:enabled_required';
  end if;

  v_actor := public.rc1_require_platform_admin(true);
  v_actor_fingerprint := v_actor->>'actor_fingerprint';

  if pg_catalog.char_length(v_reason) < 10 or pg_catalog.char_length(v_reason) > 500 then
    raise exception 'rc1_certification_enablement:meaningful_reason_required';
  end if;

  v_reason_fingerprint := pg_catalog.encode(
    extensions.digest(pg_catalog.convert_to(v_reason, 'UTF8'), 'sha256'), 'hex');

  begin
    select freeze_epoch into v_freeze_epoch
    from public.rc1_operation_freeze_state where singleton = true;
  exception when others then
    v_freeze_epoch := null;
  end;

  -- The stored value carries the operator fingerprint, never an identity or the reason text.
  v_value := jsonb_build_object(
    'enabled', p_enabled,
    'scope', 'staging_certification_only',
    'authorised_by_fingerprint', v_actor_fingerprint,
    'reason_fingerprint', v_reason_fingerprint,
    'freeze_epoch', v_freeze_epoch,
    'authorised_at', now()
  );

  -- app_settings is on the activation_control freeze surface: while the database is frozen the
  -- existing RC1 guard refuses this write, so enablement is only possible inside a RELEASED window.
  insert into public.app_settings(setting_key, value_json)
  values (p_setting_key, v_value)
  on conflict (setting_key) do update
  set value_json = excluded.value_json, updated_at = now();

  insert into public.rc1_certification_enablement_audit (
    setting_key, enabled, reason_fingerprint, actor_fingerprint, freeze_epoch
  ) values (
    p_setting_key, p_enabled, v_reason_fingerprint, v_actor_fingerprint, v_freeze_epoch
  );

  return jsonb_build_object(
    'setting_key', p_setting_key,
    'enabled', p_enabled,
    'scope', 'staging_certification_only',
    'freeze_epoch', v_freeze_epoch
  );
end;
$$;

revoke all on function public.rc1_set_certification_enablement(text,boolean,text)
  from public, anon, authenticated, service_role;
grant execute on function public.rc1_set_certification_enablement(text,boolean,text) to authenticated;

comment on function public.rc1_set_certification_enablement(text,boolean,text) is
  'Grants or withdraws one of the two RC1 certification enablement flags. Requires platform_admin at AAL2 and a meaningful reason; refuses every setting key outside the closed RC1 allow-list. Writes public.app_settings, which the RC1 freeze guard protects, so enablement is only possible inside a deliberate RELEASED window. Audits fingerprints and the resulting state only.';

commit;
