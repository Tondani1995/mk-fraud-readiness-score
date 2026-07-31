/**
 * RC1 audited synthetic-certification cleanup contract.
 *
 * RC1 staging cleanup previously required `set session_replication_role = replica`, which disables
 * every trigger and foreign-key check in the session, because guard_score_trace_write() refuses to
 * delete score traces while the parent run is completed and raises 'Parent score run not found.'
 * if the run is deleted first -- and those tables cascade from score_runs, so the guard fires
 * mid-cascade and no ordering works.
 *
 * The replacement has to be narrow enough that it cannot become a general-purpose delete. These
 * tests assert the authorisation, the refusal paths, the provenance check inside the guard, and
 * that the blunt instruments are gone.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationName = '20260730130000_rc1_synthetic_certification_cleanup.sql';
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', migrationName), 'utf8');
// 20260731130000 replaces the function body. The original migration is applied history and stays
// byte-identical; every assertion about *effective* behaviour must read the replacement.
const storageFixName = '20260731130000_rc1_synthetic_cleanup_storage_api_fix.sql';
const storageFix = fs.readFileSync(path.join(root, 'supabase', 'migrations', storageFixName), 'utf8');
const originalGuard = fs.readFileSync(path.join(root, 'supabase', 'migrations', '0006_phase6_scoring_guards.sql'), 'utf8');

let failures = 0;
let total = 0;
function test(name, fn) {
  total += 1;
  try {
    fn();
    console.log(`  ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`  FAIL - ${name}`);
    console.log(`    ${error.message.split('\n').slice(0, 6).join('\n    ')}`);
  }
}

console.log('RC1 -- audited synthetic-certification cleanup');

// ---------------------------------------------------------------------------
// Authorisation
// ---------------------------------------------------------------------------
test('D1. cleanup requires platform_admin at AAL2', () => {
  assert.match(migration, /create or replace function public\.rc1_cleanup_synthetic_certification\(\s*\n\s*p_reference text,\s*\n\s*p_reason text\s*\n\)/i);
  assert.match(migration, /v_actor := public\.rc1_require_platform_admin\(true\);/,
    'must require the AAL2 variant of the platform-admin check');
  assert.doesNotMatch(migration, /rc1_require_platform_admin\(false\)/,
    'cleanup must never accept an AAL1 session');
});

test('D2. execution is granted only to authenticated, never to anon or service_role', () => {
  assert.match(migration, /revoke all on function public\.rc1_cleanup_synthetic_certification\(text,text\)\s*\n\s*from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.rc1_cleanup_synthetic_certification\(text,text\) to authenticated/i);
  assert.doesNotMatch(migration, /grant execute on function public\.rc1_cleanup_synthetic_certification\(text,text\) to (?:anon|service_role)/i);
});

test('D3. a meaningful reason is required and only its fingerprint is retained', () => {
  assert.match(migration, /rc1_synthetic_cleanup:meaningful_reason_required/);
  assert.match(migration, /char_length\(v_reason\) < 10 or pg_catalog\.char_length\(v_reason\) > 500/);
  assert.match(migration, /v_reason_fingerprint := pg_catalog\.encode\(/);
  // The audit stores the fingerprint, never the reason text itself.
  assert.doesNotMatch(migration, /insert into public\.rc1_synthetic_cleanup_audit[\s\S]{0,400}?\bv_reason\b(?!_fingerprint)/);
});

// ---------------------------------------------------------------------------
// Refusal paths
// ---------------------------------------------------------------------------
test('D4. any reference not beginning with MKTEST-RC1- is refused', () => {
  assert.match(migration, /rc1_synthetic_cleanup:reference_not_synthetic/);
  assert.match(migration, /p_reference !~ '\^MKTEST-RC1-\[0-9\]\{8\}-\[0-9\]\{2\}\$'/);
  // The same shape is enforced on the provenance column and the audit row.
  assert.match(migration, /synthetic_certification_ref ~ '\^MKTEST-RC1-\[0-9\]\{8\}-\[0-9\]\{2\}\$'/);
  assert.match(migration, /synthetic_reference ~ '\^MKTEST-RC1-\[0-9\]\{8\}-\[0-9\]\{2\}\$'/);
});

test('D5. the mechanism is inert unless explicitly enabled, so Production stays disabled', () => {
  assert.match(migration, /rc1_synthetic_cleanup:not_enabled_in_this_environment/);
  assert.match(migration, /setting_key = 'rc1_synthetic_certification_cleanup'/);
  assert.match(migration, /if not coalesce\(v_enabled, false\) then/);
  // The migration must not enable itself anywhere.
  assert.doesNotMatch(migration, /insert into public\.app_settings/i,
    'the migration must not insert its own enablement row');
});

test('D6. resolution is scoped to organisations carrying the synthetic reference', () => {
  assert.match(migration, /from public\.organisations o\s*\n\s*where o\.synthetic_certification_ref = p_reference/);
  // Every downstream set is derived from that organisation set, never from a bare table scan.
  assert.match(migration, /from public\.assessments a where a\.organisation_id = any\(v_org_ids\)/);
  assert.match(migration, /from public\.orders o where o\.assessment_id = any\(v_assessment_ids\)/);
  for (const unscoped of [/delete from public\.assessments\s*;/i, /delete from public\.orders\s*;/i, /delete from public\.organisations\s*;/i]) {
    assert.doesNotMatch(migration, unscoped, 'no unscoped delete may exist');
  }
});

// ---------------------------------------------------------------------------
// The blunt instruments must be gone
// ---------------------------------------------------------------------------
test('D7. cleanup uses no session_replication_role and disables no triggers', () => {
  // Scoped to executable SQL: the header comment names the blunt instrument this migration
  // replaces, and that explanation must not be mistaken for a use of it.
  const executable = migration
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
  assert.doesNotMatch(executable, /session_replication_role/i);
  assert.doesNotMatch(executable, /disable trigger/i);
  assert.doesNotMatch(executable, /alter table[^;]*disable/i);
});

test('D8. the score-trace guard allowance requires BOTH a marked transaction and synthetic provenance', () => {
  const guard = migration.split('create or replace function public.guard_score_trace_write')[1].split('$function$;')[0];
  assert.match(guard, /current_setting\('rc1\.synthetic_cleanup_ref', true\)/);
  // Provenance is proven from the row being deleted, not asserted by the caller.
  assert.match(guard, /join public\.assessments a on a\.id = sr\.assessment_id/);
  assert.match(guard, /join public\.organisations o on o\.id = a\.organisation_id/);
  assert.match(guard, /if v_synthetic_ref is not null and v_synthetic_ref = v_cleanup_ref then/);
  // The allowance is DELETE-only.
  assert.match(guard, /if tg_op = 'DELETE' then\s*\n\s*v_cleanup_ref/);
});

test('D9. the guard still refuses ordinary post-completion writes exactly as before', () => {
  const guard = migration.split('create or replace function public.guard_score_trace_write')[1].split('$function$;')[0];
  assert.match(guard, /raise exception 'Parent score run not found\.'/);
  assert.match(guard, /if parent_status = 'completed' or parent_locked_at is not null then/);
  assert.match(guard, /raise exception 'Score traces and cap events cannot be changed after score run completion\.'/);
  // The original guard's two refusals are both still present, unchanged in wording.
  assert.ok(originalGuard.includes('Score traces and cap events cannot be changed after score run completion.'));
  assert.ok(originalGuard.includes('Parent score run not found.'));
});

test('D10. the authorising marker is transaction-local', () => {
  assert.match(migration, /set_config\('rc1\.synthetic_cleanup_ref', p_reference, true\)/,
    'is_local must be true so the marker cannot outlive the transaction');
});

// ---------------------------------------------------------------------------
// What gets removed, and what must survive
// ---------------------------------------------------------------------------
test('D11. customer access tokens are removed and Storage rows are still resolved exactly', () => {
  // The superseded definition attempted a direct delete; the applied history is unchanged.
  assert.match(migration, /delete from storage\.objects so/);
  for (const definition of [migration, storageFix]) {
    assert.match(definition, /so\.bucket_id = r\.storage_bucket/);
    assert.match(definition, /so\.name = r\.storage_path/);
    assert.match(definition, /delete from public\.customer_report_access_tokens t where t\.report_id = any\(v_report_ids\)/);
  }
});

test('D12. deletion order respects the restrict-bearing delivery references', () => {
  const order = [
    'report_delivery_finalizations',
    'phase14_provider_attestation_consumptions',
    'phase14_provider_attestations',
    'manual_report_generation_attempts',
    'report_delivery_authorizations'
  ].map((table) => ({ table, index: migration.indexOf(`delete from public.${table}`) }));
  for (const entry of order) assert.ok(entry.index > 0, `${entry.table} is never deleted`);
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(
      order[i - 1].index < order[i].index,
      `${order[i - 1].table} must be deleted before ${order[i].table} (ON DELETE RESTRICT)`
    );
  }
  // Traces go before their parent run so the guard can still resolve provenance.
  assert.ok(
    migration.indexOf('delete from public.score_question_traces') < migration.indexOf('delete from public.score_runs s'),
    'score traces must be deleted while the parent run still exists'
  );
});

test('D13. migrations, methodology and configuration are never touched', () => {
  for (const protectedTable of [
    'supabase_migrations', 'schema_migrations', 'methodology_versions', 'domains',
    'questions', 'exposure_factors', 'response_scale', 'products', 'report_templates',
    'admin_profiles', 'rc1_operation_freeze_state'
  ]) {
    assert.doesNotMatch(
      migration, new RegExp(`delete from (?:public\\.)?${protectedTable}\\b`, 'i'),
      `cleanup must never delete from ${protectedTable}`
    );
  }
});

// ---------------------------------------------------------------------------
// Audit and retry
// ---------------------------------------------------------------------------
test('D14. a safe audit record is written with fingerprints and counts only', () => {
  assert.match(migration, /create table if not exists public\.rc1_synthetic_cleanup_audit/i);
  const tableBody = migration
    .split(/create table if not exists public\.rc1_synthetic_cleanup_audit/i)[1]
    .split(/\n\);/)[0];
  for (const column of ['synthetic_reference', 'reason_fingerprint', 'actor_fingerprint', 'deleted_counts', 'executed_at']) {
    assert.ok(tableBody.includes(column), `audit is missing ${column}`);
  }
  for (const forbidden of [/\bemail\b/i, /\breason text\b/i, /\bactor_email\b/i, /\bnarrative\b/i, /\bpayload\b/i]) {
    assert.doesNotMatch(tableBody, forbidden, `audit must not store ${forbidden}`);
  }
  assert.match(migration, /reason_fingerprint ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(migration, /actor_fingerprint ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(migration, /revoke all on table public\.rc1_synthetic_cleanup_audit from public, anon, authenticated/i);
});

test('D15. an exact repeat of a completed cleanup is a recorded no-op, not an error', () => {
  assert.match(migration, /if v_org_ids is null or pg_catalog\.array_length\(v_org_ids, 1\) is null then/);
  assert.match(migration, /'already_clean', true/);
  // The no-op still writes an audit row so the retry is visible.
  const noop = migration.split('if v_org_ids is null')[1].split('end if;')[0];
  assert.match(noop, /insert into public\.rc1_synthetic_cleanup_audit/);
});

test('D16. the new relations are registered on freeze surfaces', () => {
  assert.match(migration, /when 'public\.rc1_synthetic_cleanup_audit' then 'activation_control'/i);
  // The diagnostics table added by the previous migration must survive this replacement.
  assert.match(migration, /when 'public\.report_quality_diagnostics' then 'generation'/i);
});

test('D17. the function is documented as certification-only, not customer erasure', () => {
  assert.match(migration, /NOT a customer erasure facility/i);
  assert.match(migration, /comment on function public\.rc1_cleanup_synthetic_certification\(text,text\)/i);
});

// ---------------------------------------------------------------------------
// 20260731130000 -- storage.protect_delete() regression
//
// storage.protect_delete() is a statement-level guard: `delete from storage.objects` raises
// 42501 regardless of how many rows match, so the original definition threw on every invocation,
// including on a journey with no reports at all. The replacement must not reintroduce it, and
// must not have loosened anything else on the way past.
// ---------------------------------------------------------------------------
function executableSql(source) {
  return source.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n');
}

test('D18. the replacement never deletes from storage directly', () => {
  const executable = executableSql(storageFix);
  assert.doesNotMatch(executable, /delete\s+from\s+storage\./i,
    'storage.protect_delete() rejects direct deletion; removal belongs to the Storage API');
  assert.doesNotMatch(executable, /truncate[^;]*storage\./i);
});

test('D19. Storage objects are reported as pending instead', () => {
  assert.match(storageFix, /'storage_objects_pending'/);
  assert.match(storageFix, /select pg_catalog\.count\(\*\) into v_pending/);
  assert.match(storageFix, /coalesce\(v_pending, 0\)/,
    'a journey with no objects must report 0, not null');
  assert.match(storageFix, /create or replace function public\.rc1_cleanup_synthetic_certification/i);
});

test('D20. every authority check survives the replacement', () => {
  assert.match(storageFix, /v_actor := public\.rc1_require_platform_admin\(true\)/,
    'platform_admin at AAL2 must still be revalidated inside the function');
  assert.match(storageFix, /\^MKTEST-RC1-\[0-9\]\{8\}-\[0-9\]\{2\}\$/);
  assert.match(storageFix, /rc1_synthetic_cleanup:reference_not_synthetic/);
  assert.match(storageFix, /rc1_synthetic_cleanup:meaningful_reason_required/);
  assert.match(storageFix, /rc1_synthetic_cleanup:not_enabled_in_this_environment/);
  assert.match(storageFix, /setting_key = 'rc1_synthetic_certification_cleanup'/);
  assert.match(storageFix, /security definer/i);
  assert.match(storageFix, /set search_path = ''/);
  assert.match(storageFix, /set_config\('rc1\.synthetic_cleanup_ref', p_reference, true\)/,
    'the guard marker must remain transaction-local');
});

test('D21. the replacement uses no blunt instruments either', () => {
  const executable = executableSql(storageFix);
  assert.doesNotMatch(executable, /session_replication_role/i);
  assert.doesNotMatch(executable, /disable trigger/i);
  assert.doesNotMatch(executable, /alter table[^;]*disable/i);
  assert.doesNotMatch(executable, /drop\s+(?:trigger|policy|function|table)/i);
});

test('D22. deletion order and protected relations are unchanged', () => {
  const order = [
    'report_delivery_finalizations',
    'phase14_provider_attestation_consumptions',
    'phase14_provider_attestations',
    'manual_report_generation_attempts',
    'report_delivery_authorizations'
  ].map((table) => ({ table, index: storageFix.indexOf(`delete from public.${table}`) }));
  for (const entry of order) assert.ok(entry.index > 0, `${entry.table} is never deleted`);
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(order[i - 1].index < order[i].index,
      `${order[i - 1].table} must be deleted before ${order[i].table} (ON DELETE RESTRICT)`);
  }
  assert.ok(
    storageFix.indexOf('delete from public.score_question_traces')
      < storageFix.indexOf('delete from public.score_runs s'),
    'score traces must be deleted while the parent run still exists'
  );
  for (const protectedTable of [
    'supabase_migrations', 'schema_migrations', 'methodology_versions', 'domains',
    'questions', 'exposure_factors', 'response_scale', 'products', 'report_templates',
    'admin_profiles', 'rc1_operation_freeze_state'
  ]) {
    assert.doesNotMatch(
      storageFix, new RegExp(`delete from (?:public\\.)?${protectedTable}\\b`, 'i'),
      `cleanup must never delete from ${protectedTable}`
    );
  }
});

test('D23. the replacement keeps the narrow grant and the audit record', () => {
  assert.match(storageFix, /revoke all on function public\.rc1_cleanup_synthetic_certification\(text,text\)\s*\n?\s*from public, anon, authenticated, service_role;/i);
  assert.match(storageFix, /grant execute on function public\.rc1_cleanup_synthetic_certification\(text,text\) to authenticated;/i);
  assert.doesNotMatch(storageFix, /grant execute[^;]*to (?:service_role|anon|public)\b/i);
  // Fingerprints only -- no reason text, no actor identity, no customer data in the audit row.
  assert.match(storageFix, /insert into public\.rc1_synthetic_cleanup_audit/);
  assert.match(storageFix, /reason_fingerprint, actor_fingerprint, freeze_epoch, deleted_counts/);
  assert.match(storageFix, /extensions\.digest\(pg_catalog\.convert_to\(v_reason, 'UTF8'\), 'sha256'\)/);
  assert.match(storageFix, /NOT a customer erasure facility/i);
});

console.log('');
console.log(`rc1-synthetic-cleanup: ${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
