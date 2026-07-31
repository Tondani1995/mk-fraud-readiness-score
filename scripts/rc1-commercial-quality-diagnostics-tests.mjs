/**
 * RC1 safe commercial-quality diagnostics contract.
 *
 * When the V7 gate fails, the operator needs to know *which* gate failed and on which question.
 * Before RC1 that information was thrown away with the error, leaving only
 * error_category = 'commercial_quality_failed'. The fix must not overcorrect: the diagnostic has to
 * be useful to authorised operations while remaining incapable of carrying report narrative,
 * secrets or customer data.
 *
 * Credential-free: the mapper is exercised directly and the database contract is asserted by
 * static analysis of the migration, in the same style as the other RC1 suites.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { toSafeQualityDiagnostics } from '../src/lib/reports/commercial-quality.ts';

const root = process.cwd();
const migrationName = '20260730120000_rc1_commercial_quality_diagnostics.sql';
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', migrationName), 'utf8');
const fulfilment = fs.readFileSync(path.join(root, 'src', 'lib', 'reports', 'phase1-manual-fulfilment.ts'), 'utf8');

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

console.log('RC1 -- safe commercial-quality diagnostics');

// ---------------------------------------------------------------------------
// Mapper contract
// ---------------------------------------------------------------------------
test('B1. violation codes and severities survive the mapping', () => {
  const out = toSafeQualityDiagnostics([
    { code: 'QG_MATERIAL_PLAYBOOK_MISSING', severity: 'violation', message: 'x', entityId: 'MF-D2-Q01', source: 'evidence-model' },
    { code: 'QG_EXECUTIVE_DIAGNOSIS_CAP_COUNT_RISK', severity: 'warning', message: 'y', source: 'evidence-model' }
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].violation_code, 'QG_MATERIAL_PLAYBOOK_MISSING');
  assert.equal(out[0].severity, 'violation');
  assert.equal(out[1].severity, 'warning');
});

test('B2. affected question and domain are recovered from the finding id', () => {
  const [d] = toSafeQualityDiagnostics([
    { code: 'QG_RECOMMENDED_CONTROL_MISSING', severity: 'violation', message: 'ignored', entityId: 'MF-D10-Q06' }
  ]);
  assert.equal(d.question_code, 'D10-Q06');
  assert.equal(d.domain_code, 'D10');
});

test('B3. document-level issues are still recorded, with no question or domain attached', () => {
  const [d] = toSafeQualityDiagnostics([
    { code: 'QG_RISK_REGISTER_MISSING', severity: 'violation', message: 'ignored', source: 'evidence-model' }
  ]);
  assert.equal(d.violation_code, 'QG_RISK_REGISTER_MISSING');
  assert.equal(d.question_code, undefined);
  assert.equal(d.domain_code, undefined);
});

test('B4. the narrative-bearing message field is never carried into a diagnostic', () => {
  const secret = 'Kalahari Freight refund of R412 000 approved by J Mokoena';
  const out = toSafeQualityDiagnostics([
    { code: 'QG_SOURCE_QUESTION_MISSING', severity: 'violation', message: secret, entityId: 'MF-D3-Q01' }
  ]);
  const serialised = JSON.stringify(out);
  assert.equal(serialised.includes(secret), false, 'issue message leaked into the diagnostic');
  assert.equal(serialised.includes('Kalahari'), false);
  for (const key of Object.keys(out[0])) {
    assert.ok(
      ['violation_code', 'severity', 'question_code', 'domain_code', 'source'].includes(key),
      `unexpected diagnostic key "${key}"`
    );
  }
});

test('B5. malformed codes, entity ids and sources fail closed rather than passing through', () => {
  const out = toSafeQualityDiagnostics([
    { code: 'not-a-code', severity: 'violation' },
    { code: '', severity: 'violation' },
    { code: 'QG_OK_CODE', severity: 'violation', entityId: 'MF-not-a-question', source: 'Evidence Model; DROP TABLE' }
  ]);
  assert.equal(out.length, 1, 'malformed codes must be dropped');
  assert.equal(out[0].violation_code, 'QG_OK_CODE');
  assert.equal(out[0].question_code, undefined, 'unparseable entity id must not produce a question code');
  assert.equal(out[0].source, undefined, 'unsafe source must be dropped');
});

// ---------------------------------------------------------------------------
// Database contract
// ---------------------------------------------------------------------------
test('B6. the diagnostics table stores only closed-vocabulary identifiers', () => {
  assert.match(migration, /create table if not exists public\.report_quality_diagnostics/i);
  for (const column of ['attempt_id', 'safe_category', 'violation_code', 'severity', 'question_code', 'domain_code', 'source', 'recorded_at']) {
    assert.match(migration, new RegExp(`\\n\\s+${column}\\s`, 'i'), `missing column ${column}`);
  }
  // Nothing resembling narrative storage may exist on the table itself. Scoped to the CREATE TABLE
  // body so the table's own comment -- which states that narrative must never be stored -- is not
  // mistaken for a narrative column.
  const tableBody = migration
    .split(/create table if not exists public\.report_quality_diagnostics/i)[1]
    .split(/\n\);/)[0];
  for (const forbidden of [/\bmessage\b/i, /\bnarrative\b/i, /\bhtml\b/i, /\bpayload_json\b/i, /\bcontent\b/i, /\bemail\b/i, /\borganisation\b/i]) {
    assert.doesNotMatch(tableBody, forbidden, `diagnostics table must not store ${forbidden}`);
  }
  assert.match(migration, /question_code ~ '\^D\[0-9\]\+-Q\[0-9\]\+\$'/);
  assert.match(migration, /domain_code ~ '\^D\[0-9\]\+\$'/);
});

test('B7. ingest rejects any payload key outside the closed set', () => {
  assert.match(migration, /v_allowed text\[\] := array\['violation_code', 'severity', 'question_code', 'domain_code', 'source'\]/);
  assert.match(migration, /rc1_quality_diagnostics:unexpected_payload_key/);
  assert.match(migration, /where k <> all\(v_allowed\)/);
  // The mapper's own key set and the database's allowed set must agree.
  const [sample] = toSafeQualityDiagnostics([
    { code: 'QG_X_CODE', severity: 'violation', entityId: 'MF-D1-Q01', source: 'evidence-model' }
  ]);
  for (const key of Object.keys(sample)) {
    assert.ok(migration.includes(`'${key}'`), `database ingest does not accept mapper key "${key}"`);
  }
});

test('B8. ingest validates the attempt, category and array shape and bounds the payload', () => {
  for (const guard of [
    /rc1_quality_diagnostics:attempt_required/,
    /rc1_quality_diagnostics:unknown_attempt/,
    /rc1_quality_diagnostics:invalid_category/,
    /rc1_quality_diagnostics:items_must_be_array/,
    /rc1_quality_diagnostics:item_must_be_object/,
    /rc1_quality_diagnostics:too_many_items/
  ]) {
    assert.match(migration, guard, `missing ingest guard ${guard}`);
  }
});

test('B9. no API role can read or write the diagnostics table directly', () => {
  assert.match(migration, /alter table public\.report_quality_diagnostics enable row level security/i);
  assert.match(migration, /revoke all on table public\.report_quality_diagnostics from public, anon, authenticated/i);
  assert.match(migration, /grant select, insert on table public\.report_quality_diagnostics to service_role/i);
  assert.doesNotMatch(migration, /grant[^;]*on table public\.report_quality_diagnostics[^;]*to (?:anon|authenticated)/i);
});

test('B10. write is service-role only; read requires an active platform admin', () => {
  assert.match(migration, /revoke all on function public\.record_report_quality_diagnostics\(uuid,text,jsonb\)\s*\n\s*from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.record_report_quality_diagnostics\(uuid,text,jsonb\) to service_role/i);
  assert.doesNotMatch(migration, /grant execute on function public\.record_report_quality_diagnostics\(uuid,text,jsonb\) to authenticated/i);

  assert.match(migration, /create or replace function public\.rc1_report_quality_diagnostics\(p_attempt_id uuid\)/i);
  assert.match(migration, /perform public\.rc1_require_platform_admin\(false\)/i);
  assert.match(migration, /grant execute on function public\.rc1_report_quality_diagnostics\(uuid\) to authenticated/i);
  assert.doesNotMatch(migration, /grant execute on function public\.rc1_report_quality_diagnostics\(uuid\) to anon/i);
});

test('B11. the new relation is registered on an existing freeze surface', () => {
  // rc1_install_new_relation_guards attaches the freeze guard to every new table, and the guard
  // raises 'unknown_surface' when rc1_surface_for_relation returns null -- so an unregistered
  // table would be permanently unwritable.
  assert.match(migration, /create or replace function public\.rc1_surface_for_relation\(p_schema text, p_table text\)/i);
  assert.match(migration, /when 'public\.report_quality_diagnostics' then 'generation'/i);
  assert.match(migration, /revoke all on function public\.rc1_surface_for_relation\(text,text\)\s*\n\s*from public, anon, authenticated, service_role/i);
});

// ---------------------------------------------------------------------------
// Customer-facing surface must stay clean
// ---------------------------------------------------------------------------
test('B12. diagnostics are persisted on failure but never returned to the caller', () => {
  assert.match(fulfilment, /await recordQualityDiagnostics\(db, attemptId, error\)/);
  assert.equal(
    (fulfilment.match(/await recordQualityDiagnostics\(db, attemptId, error\)/g) ?? []).length, 2,
    'both commercial-quality catch sites must persist diagnostics'
  );
  // The thrown error keeps the fixed safe message; violation codes are not attached to it.
  assert.match(fulfilment, /throw new Phase1GenerationError\('commercial_quality_failed', error\.safeMessage, 422, technicalReference\)/);
  assert.doesNotMatch(fulfilment, /Phase1GenerationError\('commercial_quality_failed',[^)]*violations/);
});

test('B13. diagnostics persistence can never mask the underlying generation failure', () => {
  const helper = fulfilment.split('async function recordQualityDiagnostics')[1].split('async function verifyPrivateObject')[0];
  assert.match(helper, /try\s*\{/, 'diagnostics persistence must be wrapped');
  assert.match(helper, /catch\s*\{/, 'diagnostics persistence must swallow its own failure');
  assert.doesNotMatch(helper, /\bthrow\b/, 'diagnostics persistence must not throw');
});

console.log('');
console.log(`rc1-commercial-quality-diagnostics: ${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
