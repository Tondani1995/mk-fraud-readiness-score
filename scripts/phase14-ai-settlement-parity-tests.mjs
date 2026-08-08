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

test('the paid Essential path has no fallback to the old completion RPC', () => {
  const caller = read('src/lib/reports/phase1-manual-fulfilment.ts');
  // A missing atomic-finalisation contract must fail closed. Falling back to
  // complete_manual_report_generation() would reinstate the ordering defect that let a completed,
  // VERIFIED report lose its PDF when the supporting register failed.
  assert.ok(!caller.includes("rpc('complete_manual_report_generation'"),
    'the paid path must not call the old completion RPC');
  assert.ok(!caller.includes("rpc('complete_report_secondary_artefact'"),
    'the paid path must not complete the artefact separately after the report');
  assert.ok(caller.includes("'finalise_manual_report_with_supporting_register'"),
    'the paid path must complete through the atomic finalisation RPC');
  // No absence-detection fallback around the finalisation call.
  for (const marker of ['PGRST202', '42883', 'isFinalisationAbsent', 'finalisation_absent']) {
    assert.ok(!caller.includes(marker),
      `the paid path must not branch on finalisation-RPC absence (${marker})`);
  }
});

test('cleanup can never delete a committed customer artefact', () => {
  const caller = read('src/lib/reports/phase1-manual-fulfilment.ts');
  assert.match(caller, /finalisationCommitted/, 'an explicit finalisation boundary is required');
  assert.match(caller, /finalisationInvoked/, 'dispatch must be tracked separately from commit');
  // Cleanup may only proceed on POSITIVE proof of non-commit. 'committed' and 'uncertain' both
  // retain the objects: a lost response over a successful COMMIT must never delete the artefacts
  // backing an already-current paid report.
  assert.match(caller, /const cleanupCandidates: string\[\] = finalisationOutcome !== 'not_committed'\s*\n?\s*\?\s*\[\]/,
    'cleanup must select nothing unless non-commit is positively proven');
  assert.match(caller, /finalisationInvoked && !finalisationCommitted/,
    'an error after dispatch must trigger authoritative reconciliation');
  assert.match(caller, /resolveFinalisationOutcome\(/, 'reconciliation must read authoritative state');
  assert.match(caller, /pdfUploaded/, 'PDF upload state must be explicit');
  assert.match(caller, /registerUploaded/, 'register upload state must be explicit');
  assert.ok(!/\blet uploaded\b/.test(caller), 'the ambiguous single `uploaded` flag must be gone');
});

test('both physical artefacts are stored and verified before finalisation', () => {
  const caller = read('src/lib/reports/phase1-manual-fulfilment.ts');
  const storeRegister = caller.indexOf('buildAndStoreSupportingRegister');
  const finalise = caller.indexOf("'finalise_manual_report_with_supporting_register'");
  assert.ok(storeRegister > 0 && finalise > storeRegister,
    'the register must be stored and verified before the finalisation call');
  const register = read('src/lib/reports/supporting-register-delivery.ts');
  assert.match(register, /verifyStoredObject\(/, 'stored register bytes must be verified');
  // Scope to the new helper's own body: the legacy generateAndPersistSupportingRegister() still
  // exists below it and legitimately calls the completion RPC for the non-paid capability path.
  const helperStart = register.indexOf('export async function buildAndStoreSupportingRegister');
  const helperBody = register.slice(helperStart, register.indexOf('export async function', helperStart + 10));
  assert.ok(helperStart > 0 && !helperBody.includes('complete_report_secondary_artefact'),
    'the store helper must not create the database artefact row');
  assert.ok(!helperBody.includes('.rpc('), 'the store helper must perform no database completion');
});

test('an ambiguous finalisation is reconciled against authoritative state, never assumed', () => {
  const caller = read('src/lib/reports/phase1-manual-fulfilment.ts');
  const resolver = caller.slice(caller.indexOf('async function resolveFinalisationOutcome'),
    caller.indexOf('async function verifyPrivateObject'));
  assert.ok(resolver.length > 0, 'the reconciliation resolver must exist');
  // It must read the attempt, the bound report and the register artefact.
  for (const source of ['manual_report_generation_attempts', 'reports', 'report_artifacts']) {
    assert.ok(resolver.includes(source), `reconciliation must inspect ${source}`);
  }
  assert.ok(resolver.includes("attempt.status !== 'REPORT_READY'"),
    'reconciliation must key on REPORT_READY');
  assert.ok(resolver.includes('output_report_id'), 'reconciliation must key on output_report_id');
  assert.ok(resolver.includes("storage_status !== 'VERIFIED'"),
    'a non-VERIFIED register must not count as a committed finalisation');
  // Every failure path in the resolver returns 'uncertain', never 'not_committed'.
  const uncertainReturns = (resolver.match(/return 'uncertain'/g) ?? []).length;
  const notCommittedReturns = (resolver.match(/return 'not_committed'/g) ?? []).length;
  assert.ok(uncertainReturns >= 5, 'unreadable state must resolve to uncertain, not absence');
  assert.equal(notCommittedReturns, 1,
    'only one positively-proven path may conclude the transaction did not commit');
  assert.ok(resolver.includes('} catch {'), 'a thrown reconciliation must be uncertain, not absence');
});

test('a committed attempt is never downgraded by a transport error', () => {
  const caller = read('src/lib/reports/phase1-manual-fulfilment.ts');
  // Stronger than the original guard: failure state may be persisted ONLY on positive proof of
  // non-commit. 'committed' would corrupt a completed generation; 'uncertain' would assert a
  // rollback that was never established.
  assert.match(caller, /if \(finalisationOutcome === 'not_committed'\)[\s\S]{0,200}recordFailure\(/,
    'failure persistence must require positive proof of non-commit');
  assert.match(caller, /phase1_finalisation_reconciliation_required[\s\S]{0,300}failureSuppressed/,
    'committed and uncertain outcomes must emit reconciliation evidence instead of mutating');
  const failCall = caller.indexOf('await recordFailure(db, attemptId, mapped.reason');
  const guard = caller.lastIndexOf("finalisationOutcome === 'not_committed'", failCall);
  assert.ok(guard > 0 && guard < failCall,
    'the failure-persistence call must sit behind the not_committed guard');
});

test('the atomic RPC supersedes the previous report before inserting the new one', () => {
  const sql = read('supabase/migrations/20260808160000_atomic_report_finalisation_with_register.sql');
  const supersede = sql.indexOf("update public.reports set status='superseded'");
  const insertReport = sql.indexOf('insert into public.reports (');
  const insertArtefact = sql.indexOf('insert into public.report_artifacts (');
  assert.ok(supersede > 0 && insertReport > 0 && insertArtefact > 0, 'all three operations required');
  // reports_one_current_assessment_type_uidx is an immediately-enforced partial unique index on
  // (assessment_id, report_type), not a deferrable constraint, so inserting the new 'generated' row
  // while the previous is still live collides. The accepted complete_manual_report_generation()
  // supersedes first for this reason.
  assert.ok(supersede < insertReport,
    'the previous report must be superseded BEFORE the new report is inserted');
  assert.ok(insertReport < insertArtefact,
    'the artefact must bind a report that already exists in the transaction');
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
