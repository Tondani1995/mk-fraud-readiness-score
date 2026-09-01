-- Phase 14 gate invalidation safe-update compatibility fix.
-- The authority-epoch invalidation intentionally disables all feature and AI route policies.
-- Production's safe-update guard requires explicit WHERE clauses, even for deliberate all-row updates.

create or replace function public.invalidate_phase14_authority_on_gate_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.authority_epoch is distinct from new.authority_epoch then
    perform set_config('phase14.authoritative_transition', 'gate_invalidation', true);

    update public.phase14_feature_policies
    set enabled = false,
        approved_gate_version = null,
        approved_authority_epoch = null,
        approved_at = null,
        reason = 'Automatically disabled because the Phase 14 authority epoch changed.',
        updated_at = now()
    where true;

    update public.phase14_ai_route_policies
    set enabled = false,
        approved_gate_version = null,
        approved_authority_epoch = null,
        approved_by = null,
        approved_session_id = null,
        approved_at = null,
        updated_at = now()
    where true;

    update public.phase14_worker_capabilities
    set status = 'revoked',
        revoked_at = now(),
        revoked_reason = 'Phase 14 authority epoch changed.',
        lease_secret_hash = null,
        lease_expires_at = null,
        updated_at = now()
    where status in ('authorised','leased');

    insert into public.audit_logs(
      actor_type,
      entity_table,
      action,
      before_json,
      after_json
    )
    values (
      'system',
      'phase14_security_gates',
      'phase14_authority_epoch_changed',
      jsonb_build_object(
        'authority_epoch', old.authority_epoch,
        'status', old.status,
        'required_version', old.required_version,
        'satisfied_version', old.satisfied_version
      ),
      jsonb_build_object(
        'authority_epoch', new.authority_epoch,
        'status', new.status,
        'required_version', new.required_version,
        'satisfied_version', new.satisfied_version
      )
    );
  end if;

  return new;
end;
$function$;
