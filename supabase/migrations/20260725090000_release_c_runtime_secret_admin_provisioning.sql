-- Release C operational gap closure: PHASE14_PROVIDER_WEBHOOK_DB_HMAC_SECRET and
-- PHASE14_PROVIDER_LOOKUP_DB_HMAC_SECRET were never provisioned (Vercel env vars absent, and the
-- paired Supabase runtime secrets -- provider_webhook_db_hmac / provider_lookup_db_hmac -- were
-- never written via set_phase14_runtime_secret). This is why Resend accepted and delivered the two
-- controlled test sends this cycle but no signed webhook could ever be verified: phase14_private.
-- verify_hmac() raises phase14_attestation_secret_unprovisioned whenever a secret_key it looks up
-- has no row in phase14_private.runtime_secrets.
--
-- This migration adds an audited-reason parameter to the existing set_phase14_runtime_secret RPC so
-- the new admin-only provisioning control (/score/admin/phase14-activation) can require and record
-- why a runtime secret was rotated -- the same pattern already used by set_phase14_feature_policy and
-- set_phase14_security_gate_version. It does not change the RPC's actor check, allowed-key
-- allow-list, minimum-length rule, storage target, or fingerprint-only return shape.
--
-- Backward compatible by construction: p_reason defaults to null, so the existing positional
-- 2-argument caller in scripts/phase14-delivery-reconciliation-tests.mjs
-- (`select public.set_phase14_runtime_secret('provider_webhook_db_hmac', $1)`) continues to resolve
-- and behave identically. A plain DROP + CREATE (rather than CREATE OR REPLACE) is used because
-- Postgres cannot replace a function in place when the argument list changes -- CREATE OR REPLACE
-- would instead leave the old 2-argument function in place and create an ambiguous 3-argument
-- overload beside it. The function's own execute grants are re-established explicitly afterwards
-- (revoked from public/anon/service_role, granted to authenticated) exactly matching the posture
-- the archived grant-inventory block in 0017 gave the original 2-argument signature -- that block is
-- historical and is not edited here.

drop function if exists public.set_phase14_runtime_secret(text, text);

create function public.set_phase14_runtime_secret(
  p_secret_key text,
  p_secret_value text,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor jsonb;
begin
  v_actor := public.phase14_require_actor(
    'runtime_secret_rotation',array['platform_admin']::public.admin_role[],true
  );
  if p_secret_key not in ('provider_webhook_db_hmac','provider_lookup_db_hmac') then
    raise exception 'phase14_runtime_secret_key_invalid';
  end if;
  if length(coalesce(p_secret_value,'')) < 32 then raise exception 'phase14_runtime_secret_too_short'; end if;
  insert into phase14_private.runtime_secrets(secret_key,secret_value,rotated_at,rotated_by)
  values (p_secret_key,p_secret_value,now(),(v_actor->>'user_id')::uuid)
  on conflict (secret_key) do update
  set secret_value=excluded.secret_value,rotated_at=excluded.rotated_at,rotated_by=excluded.rotated_by;
  perform set_config('phase14.authoritative_transition','runtime_secret_rotation',true);
  insert into public.audit_logs(actor_type,actor_user_id,entity_table,action,after_json)
  values ('admin',(v_actor->>'user_id')::uuid,'phase14_private.runtime_secrets',
    'phase14_runtime_secret_rotated',
    case when coalesce(trim(p_reason),'') <> '' then
      jsonb_build_object('secret_key',p_secret_key,'reason',p_reason)
    else
      jsonb_build_object('secret_key',p_secret_key)
    end);
  return jsonb_build_object('secret_key',p_secret_key,'rotated_at',now(),
    'fingerprint',encode(extensions.digest(convert_to(p_secret_value,'UTF8'),'sha256'),'hex'));
end;
$$;

revoke all on function public.set_phase14_runtime_secret(text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_phase14_runtime_secret(text,text,text) to authenticated;

select 'release_c_runtime_secret_admin_provisioning_applied' as result;
