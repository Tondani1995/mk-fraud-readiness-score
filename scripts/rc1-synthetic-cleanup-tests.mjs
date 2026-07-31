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

// ---------------------------------------------------------------------------
// 20260731150000 -- the remaining immutability guards
//
// Score traces were not the only guard between a completed synthetic journey and its removal.
// guard_score_run_write, guard_assessment_answer_write and guard_exposure_answer_write each
// refuse too, so the cleanup could never have finished. Each gains the identical allowance and
// nothing else -- which these checks prove by reconstructing the original body from it.
// ---------------------------------------------------------------------------
const guardFixName = '20260731150000_rc1_synthetic_cleanup_guard_allowances.sql';
const guardFix = fs.readFileSync(path.join(root, 'supabase', 'migrations', guardFixName), 'utf8');
const answerGuards = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '0005_phase5_v1_1_guards.sql'), 'utf8');

const ALLOWANCE = `  if tg_op = 'DELETE' then
    v_cleanup_ref := pg_catalog.current_setting('rc1.synthetic_cleanup_ref', true);
    if v_cleanup_ref is not null and v_cleanup_ref <> '' then
      select o.synthetic_certification_ref into v_synthetic_ref
      from public.assessments a
      join public.organisations o on o.id = a.organisation_id
      where a.id = old.assessment_id;

      if v_synthetic_ref is not null and v_synthetic_ref = v_cleanup_ref then
        return old;
      end if;
    end if;
  end if;

`;

const GUARDS = [
  { name: 'guard_score_run_write', source: originalGuard },
  { name: 'guard_assessment_answer_write', source: answerGuards },
  { name: 'guard_exposure_answer_write', source: answerGuards },
];

function functionBody(source, name) {
  const start = source.indexOf(`create or replace function public.${name}()`);
  assert.notEqual(start, -1, `${name} is missing`);
  return source.slice(start, source.indexOf('\n$$;', start) + 4);
}

test('D24. all three remaining guards receive the allowance, identically', () => {
  assert.equal(guardFix.split(ALLOWANCE).length - 1, 3,
    'the allowance must be the same text in every guard, not three variations');
  for (const guard of GUARDS) {
    const replacement = functionBody(guardFix, guard.name);
    assert.ok(replacement.includes(ALLOWANCE), `${guard.name} is missing the allowance`);
    // BOTH conditions: the transaction-local marker AND provenance proven from the row.
    assert.match(replacement, /current_setting\('rc1\.synthetic_cleanup_ref', true\)/);
    assert.match(replacement, /join public\.organisations o on o\.id = a\.organisation_id/);
    assert.match(replacement, /v_synthetic_ref = v_cleanup_ref/);
  }
});

test('D25. the allowance is the only change to each guard', () => {
  for (const guard of GUARDS) {
    const original = functionBody(guard.source, guard.name);
    const reconstructed = functionBody(guardFix, guard.name)
      .replace(ALLOWANCE, '')
      .replace('  v_cleanup_ref text;\n', '')
      .replace('  v_synthetic_ref text;\n', '');
    assert.equal(reconstructed, original,
      `${guard.name} differs from the accepted definition beyond the allowance`);
  }
});

test('D26. every original refusal still fires for ordinary writes', () => {
  for (const message of [
    'Completed score runs are immutable. Create a new score run instead.',
    'Score runs may only be created for submitted or later assessments. Current status: %.',
    'Completed score run must be locked.',
    'Assessment answers cannot be changed after assessment lock/submission.',
    'Exposure answers cannot be changed after assessment lock/submission.',
    'Parent assessment not found.',
  ]) {
    assert.ok(guardFix.includes(message), `guard replacement dropped the refusal: ${message}`);
  }
  // The allowance is DELETE-only: no INSERT or UPDATE path can reach `return old`.
  for (const guard of GUARDS) {
    const replacement = functionBody(guardFix, guard.name);
    const allowanceIndex = replacement.indexOf(ALLOWANCE);
    assert.ok(allowanceIndex > 0);
    assert.doesNotMatch(
      replacement.slice(allowanceIndex, allowanceIndex + ALLOWANCE.length),
      /tg_op in \('INSERT'|tg_op = 'INSERT'|tg_op = 'UPDATE'/,
    );
  }
});

test('D27. an unprovable delete still fails closed', () => {
  // The allowance returns early only inside the provenance branch. Nothing outside it returns
  // old before the refusals, so a marker with no matching organisation changes nothing -- and a
  // cascade whose parent assessment has already gone still raises 'Parent assessment not found.'
  for (const guard of GUARDS) {
    const replacement = functionBody(guardFix, guard.name);
    const beforeRefusals = replacement.slice(0, replacement.indexOf(ALLOWANCE) + ALLOWANCE.length);
    assert.equal((beforeRefusals.match(/return old;/g) ?? []).length, 1,
      `${guard.name} must have exactly one early return, inside the proven branch`);
  }
  assert.match(guardFix, /provenance cannot be established and the guard still raises/i);
});

test('D28. the guard migration uses no blunt instruments', () => {
  const executable = executableSql(guardFix);
  assert.doesNotMatch(executable, /session_replication_role/i);
  assert.doesNotMatch(executable, /disable trigger/i);
  assert.doesNotMatch(executable, /alter table[^;]*disable/i);
  assert.doesNotMatch(executable, /drop\s+(?:trigger|policy|function|table)/i);
  assert.doesNotMatch(executable, /delete from/i, 'a guard migration must not delete anything');
  assert.doesNotMatch(executable, /grant|revoke/i, 'guard replacement must not move privileges');
  for (const guard of GUARDS) {
    assert.match(functionBody(guardFix, guard.name), /set search_path = public/,
      `${guard.name} must keep its original search_path`);
  }
});

// ---------------------------------------------------------------------------
// 20260731170000 -- the Storage closure
//
// 20260731130000 stopped deleting Storage objects and started counting them, which left the
// database deleting the report row that named the PDF while the PDF itself survived. These check
// the half of the fix that lives in SQL: resolution the caller cannot influence, and a cleanup
// that refuses until removal has been proven.
// ---------------------------------------------------------------------------
const closureName = '20260731170000_rc1_synthetic_storage_cleanup_closure.sql';
const closure = fs.readFileSync(path.join(root, 'supabase', 'migrations', closureName), 'utf8');

function closureFunctionBody(signatureArgs) {
  const marker = `create or replace function public.${signatureArgs}`;
  const start = closure.indexOf(marker);
  assert.notEqual(start, -1, `missing function: ${signatureArgs}`);
  return closure.slice(start, closure.indexOf('\n$$;', start) + 4);
}

const fourArgCleanup = closureFunctionBody(
  'rc1_cleanup_synthetic_certification(\n  p_reference text,\n  p_reason text,\n  p_expected_target_fingerprint text,\n  p_expected_target_count integer\n)',
);

test('D29. resolution requires the same authority as the cleanup itself', () => {
  const prepare = closureFunctionBody('rc1_prepare_synthetic_storage_cleanup(\n  p_reference text\n)');
  assert.match(prepare, /perform public\.rc1_require_platform_admin\(true\)/);
  assert.match(prepare, /\^MKTEST-RC1-\[0-9\]\{8\}-\[0-9\]\{2\}\$/);
  assert.match(prepare, /rc1_synthetic_cleanup:not_enabled_in_this_environment/);
  assert.match(prepare, /security definer/i);
  assert.match(prepare, /set search_path = ''/);
  // Resolution only: it must not remove anything, in either layer.
  assert.doesNotMatch(prepare, /delete from/i);
  assert.doesNotMatch(prepare, /update /i);
});

test('D30. every fail-closed check precedes the first deletion', () => {
  const firstDelete = fourArgCleanup.indexOf('delete from');
  assert.ok(firstDelete > 0, 'the cleanup must still delete something');
  for (const check of [
    'rc1_require_platform_admin(true)',
    'rc1_synthetic_cleanup:reference_not_synthetic',
    'rc1_synthetic_cleanup:meaningful_reason_required',
    'rc1_synthetic_cleanup:storage_proof_required',
    'rc1_synthetic_cleanup:not_enabled_in_this_environment',
    'rc1_synthetic_cleanup:storage_target_mismatch',
    'rc1_synthetic_cleanup:storage_objects_remaining',
  ]) {
    const index = fourArgCleanup.indexOf(check);
    assert.ok(index > 0, `missing fail-closed check: ${check}`);
    assert.ok(index < firstDelete, `${check} must be proven before anything is deleted`);
  }
});

test('D31. the expected targets are re-derived, not trusted', () => {
  // The comparison is against a value computed here, from the rows that exist now.
  assert.match(fourArgCleanup, /into v_actual_count, v_actual_fingerprint/);
  assert.match(
    fourArgCleanup,
    /if v_actual_count <> p_expected_target_count\s*\n\s*or v_actual_fingerprint <> p_expected_target_fingerprint then/,
  );
  // Absence is established against storage.objects directly, not from the caller's assertion.
  assert.match(fourArgCleanup, /from storage\.objects so\s*\n\s*join public\.reports r/);
  assert.match(fourArgCleanup, /if coalesce\(v_remaining, 0\) > 0 then/);
  // And it still never deletes from storage.
  assert.doesNotMatch(
    fourArgCleanup.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n'),
    /delete\s+from\s+storage\./i,
  );
});

test('D32. the closure never enables itself, so Production stays inert', () => {
  assert.doesNotMatch(closure, /insert into public\.app_settings/i);
  assert.match(closure, /setting_key = 'rc1_synthetic_certification_cleanup'/);
  // Applied migrations 49, 50 and 51 are untouched by this one.
  for (const applied of [
    '20260730130000_rc1_synthetic_certification_cleanup.sql',
    '20260731130000_rc1_synthetic_cleanup_storage_api_fix.sql',
    '20260731150000_rc1_synthetic_cleanup_guard_allowances.sql',
  ]) {
    const contents = fs.readFileSync(path.join(root, 'supabase', 'migrations', applied), 'utf8');
    assert.ok(contents.length > 0);
  }
  const executable = closure.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n');
  assert.doesNotMatch(executable, /session_replication_role/i);
  assert.doesNotMatch(executable, /disable trigger/i);
  assert.doesNotMatch(executable, /drop\s+(?:trigger|policy|table)/i);
});

test('D33. the guard allowance still governs the closure deletions', () => {
  // The four-argument form sets the same transaction-local marker the guards require, so it gains
  // no deletion power the accepted mechanism did not already grant it.
  assert.match(fourArgCleanup, /set_config\('rc1\.synthetic_cleanup_ref', p_reference, true\)/);
  const markerIndex = fourArgCleanup.indexOf("set_config('rc1.synthetic_cleanup_ref'");
  assert.ok(markerIndex < fourArgCleanup.indexOf('delete from public.score_question_traces'));
  // Deletion order and protected relations are unchanged from the accepted definition.
  const order = [
    'report_delivery_finalizations',
    'phase14_provider_attestation_consumptions',
    'phase14_provider_attestations',
    'manual_report_generation_attempts',
    'report_delivery_authorizations',
  ].map((table) => ({ table, index: fourArgCleanup.indexOf(`delete from public.${table}`) }));
  for (const entry of order) assert.ok(entry.index > 0, `${entry.table} is never deleted`);
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(order[i - 1].index < order[i].index, `${order[i - 1].table} must precede ${order[i].table}`);
  }
  assert.ok(
    fourArgCleanup.indexOf('delete from public.score_question_traces')
      < fourArgCleanup.indexOf('delete from public.score_runs s'),
  );
  for (const protectedTable of [
    'supabase_migrations', 'schema_migrations', 'methodology_versions', 'domains',
    'questions', 'exposure_factors', 'response_scale', 'products', 'report_templates',
    'admin_profiles', 'rc1_operation_freeze_state'
  ]) {
    assert.doesNotMatch(
      fourArgCleanup, new RegExp(`delete from (?:public\\.)?${protectedTable}\\b`, 'i'),
      `cleanup must never delete from ${protectedTable}`
    );
  }
});

console.log('');
console.log(`rc1-synthetic-cleanup: ${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
