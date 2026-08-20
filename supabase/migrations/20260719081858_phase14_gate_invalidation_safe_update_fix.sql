-- Source/cloud reconciliation (docs/safe-launch/25-source-cloud-migration-reconciliation.md):
-- this version identity was applied to jvjxlphdyzerrhwcgkup but had no corresponding file anywhere
-- in this repository's git history before this reconciliation. Recovered from two independently
-- consistent sources: (1) supabase_migrations.schema_migrations.statements for this exact version,
-- retrieved read-only via the Supabase MCP execute_sql tool on 2026-07-25; (2) the never-merged
-- branch hotfix/phase14-safe-update-invalidation, whose own commit ("Hotfix Phase 14 gate
-- invalidation safe-update guard") independently carries byte-identical statement content under
-- the local filename 0032_phase14_gate_invalidation_safe_update_fix.sql. Both sources agree
-- exactly; nothing here was invented.
--
-- Fully idempotent (create or replace function) -- safe to apply to jvjxlphdyzerrhwcgkup (a no-op,
-- since this is already the live definition) and to any fresh database alike.
--
-- Context: the version of this same function committed in 0017_phase14_canonical_disabled_foundation.sql
-- lacks the `where true` clauses this version adds to two bulk UPDATE statements. Production's own
-- safe-update guard requires an explicit WHERE clause even for a deliberate all-row update; this
-- fix was applied directly to production (predating this migration-history reconciliation effort)
-- and is restored here so git can reproduce the schema jvjxlphdyzerrhwcgkup actually runs.

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
