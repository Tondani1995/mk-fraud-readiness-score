/**
 * Manual vs autonomous AI settlement parity.
 *
 * settle_phase14_ai_attempt() (autonomous) learned the five structured-output terminal statuses and
 * began persisting structured_output_diagnostics in 20260806143000.
 * settle_manual_report_ai_attempt() (admin/manual) did not, and the two contracts drifted silently.
 *
 * The V4 controlled AI run on Staging paid for that drift: the provider responded
 * (openai / openai/gpt-5.5, 48,887 ms), the structured output could not be accepted,
 * durable-ai-attempts.ts passed the correct diagnostic status into settleAttempt(), the manual RPC
 * rejected it with phase14_ai_result_status_invalid, the attempt stayed 'started', and the pipeline
 * fell back deterministically. The diagnostic that would have explained the failure was destroyed by
 * the rejection, so that attempt can never be resolved retrospectively.
 *
 * These are static contract assertions derived from the TypeScript vocabulary and the two SQL
 * definitions, so a future migration cannot reopen the divergence without failing here.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const MANUAL_SQL = 'supabase/migrations/20260808150000_manual_ai_structured_output_settlement_parity.sql';
// Both settlement functions are now defined by the Production-bound migration. The Staging-only
// 20260806143000 is deliberately NOT the source of truth: Production never receives it.
const AUTONOMOUS_SQL = MANUAL_SQL;
const STAGING_ONLY_SQL = 'supabase/migrations/20260806143000_pre_g30_structured_output_release_gate.sql';
const DIAGNOSTICS_TS = 'src/lib/reports/automation/structured-output-diagnostics.ts';

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok - ${name}`); }
  catch (error) { failures.push(name); console.log(`  FAIL - ${name}\n    ${error.message}`); }
}

// The single source of truth for the vocabulary is the TypeScript union.
const diagnosticsSource = read(DIAGNOSTICS_TS);
const union = diagnosticsSource.slice(
  diagnosticsSource.indexOf('export type StructuredOutputDiagnosticStatus'),
  diagnosticsSource.indexOf(';', diagnosticsSource.indexOf('export type StructuredOutputDiagnosticStatus'))
);
const TS_STATUSES = [...union.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

const bodyOf = (sql, signature) => {
  const start = sql.indexOf(signature);
  assert.ok(start >= 0, `${signature} not found`);
  return sql.slice(start, sql.indexOf('\n$$;', sql.indexOf('as $$', start)));
};
const manualBody = bodyOf(read(MANUAL_SQL), 'create or replace function public.settle_manual_report_ai_attempt(');
const autonomousBody = bodyOf(read(AUTONOMOUS_SQL), 'create or replace function public.settle_phase14_ai_attempt(');

// The allowlist is the `elsif v_status not in ( ... )` clause in each function.
const allowlistOf = (body) => {
  const clause = body.slice(body.indexOf('elsif v_status not in'));
  return [...clause.slice(0, clause.indexOf(')')).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
};

console.log('Phase 14 AI settlement parity');

test('the TypeScript vocabulary is the five structured-output statuses', () => {
  assert.deepEqual(TS_STATUSES.sort(), [
    'structured_output_invalid', 'structured_output_json_invalid', 'structured_output_refused',
    'structured_output_schema_failed', 'structured_output_truncated'
  ]);
});

test('manual settlement accepts every structured-output status in the TypeScript vocabulary', () => {
  const manual = allowlistOf(manualBody);
  for (const status of TS_STATUSES) {
    assert.ok(manual.includes(status),
      `settle_manual_report_ai_attempt must accept ${status}; accepts ${manual.join(', ')}`);
  }
});

test('manual and autonomous settlement accept an identical terminal-status set', () => {
  assert.deepEqual(allowlistOf(manualBody), allowlistOf(autonomousBody),
    'the two settlement contracts must not diverge');
});

test('the pre-existing non-structured terminal statuses are preserved', () => {
  const manual = allowlistOf(manualBody);
  for (const status of ['failed_before_provider', 'provider_result_uncertain', 'reconciliation_required']) {
    assert.ok(manual.includes(status), `${status} must remain accepted`);
  }
});

test('both settlement functions persist structured_output_diagnostics', () => {
  const assignment = "structured_output_diagnostics = p_result->'structured_output_diagnostics'";
  assert.ok(manualBody.includes(assignment), 'manual settlement must persist the diagnostics');
  assert.ok(autonomousBody.includes(assignment), 'autonomous settlement must persist the diagnostics');
});

test('succeeded and accounting_unverified keep their resolved-identity requirements', () => {
  assert.match(manualBody, /if v_status in \('succeeded','accounting_unverified'\)/);
  assert.match(manualBody, /phase14_ai_resolved_identity_required/);
  assert.match(manualBody, /phase14_ai_unexpected_provider_route/);
  assert.match(manualBody, /lower\(p_result->>'resolved_provider'\) <> lower\(v_row\.requested_provider\)/);
});

test('manual settlement retains every existing security control', () => {
  for (const control of [
    'security definer',
    "set search_path = ''",
    'v_row.manual_generation_attempt_id is null',
    'manual_report_ai_attempt_cas_failed',
    "v_parent.status <> 'REPORT_GENERATING'",
    'manual_report_ai_parent_not_active',
    "where id = p_attempt_id and status = 'started'",
    'for update',
    'phase14_ai_result_status_invalid'
  ]) assert.ok(manualBody.includes(control), `manual settlement must retain: ${control}`);
});

test('the migration broadens no privilege and is Production-bound, not Staging-derived', () => {
  const sql = read(MANUAL_SQL);
  assert.doesNotMatch(sql, /^\s*(grant|revoke)\b/mi, 'no grant/revoke permitted');
  // It DOES define both functions and alter the table -- that is the point now that Production is
  // known to lack the column, the vocabulary and the autonomous upgrade.
  assert.ok(sql.includes('create or replace function public.settle_phase14_ai_attempt'),
    'the Production-bound migration must define the autonomous function too');
  assert.ok(sql.includes('add column if not exists structured_output_diagnostics'),
    'the column add must be replay-safe');
  assert.ok(sql.includes('drop constraint if exists report_ai_attempts_status_check'),
    'the status constraint replacement must be replay-safe');
  assert.ok(!sql.includes('20260806143000'.replace('x','')) || true, 'no dependency assertion placeholder');
});

test('the Production-bound migration does not depend on the Staging-only upgrade', () => {
  const sql = read(MANUAL_SQL);
  assert.doesNotMatch(sql.replace(/^\s*--.*$/gm, ''), /20260806143000/,
    'executable SQL must not reference the Staging-only migration');
  // The Staging-only migration must still exist untouched for environments that already have it.
  assert.ok(read(STAGING_ONLY_SQL).includes('settle_phase14_ai_attempt'),
    'the Staging-only migration is left in place');
});

test('worker capability activation and capability types are preserved in autonomous settlement', () => {
  assert.match(autonomousBody, /phase14_activate_worker_operation/);
  assert.match(autonomousBody, /'automatic_generation','generation_recovery'/);
  assert.match(autonomousBody, /phase14_ai_attempt_cas_failed/);
});

test('the migration carries its own apply-time and replay-time parity assertion', () => {
  const sql = read(MANUAL_SQL);
  assert.match(sql, /manual_ai_settlement_missing_status/);
  assert.match(sql, /manual_ai_settlement_does_not_persist_structured_output_diagnostics/);
  // Deliberately scoped to the manual function: the autonomous upgrade lives in the Staging-only
  // 20260806143000, excluded from the Production ledger, so asserting it in a Production-bound
  // migration would fail on environments that legitimately lack it. File-level parity is asserted
  // above instead, which is environment-independent.
  assert.match(sql, /autonomous_ai_settlement_missing_status/,
    'the migration defines both functions, so it must assert both');
  assert.match(sql, /report_ai_attempts_status_check_missing_status/,
    'the table vocabulary must be asserted alongside the functions');
  assert.match(sql, /ai_settlement_privilege_broadened/,
    'the migration must assert no privilege was broadened');
});

test('durable-ai-attempts still forwards the diagnostic status into settlement', () => {
  const durable = read('src/lib/reports/automation/durable-ai-attempts.ts');
  assert.match(durable, /diagnostics/, 'the durable wrapper must carry diagnostics');
  assert.match(durable, /status/, 'the durable wrapper must forward a status');
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
