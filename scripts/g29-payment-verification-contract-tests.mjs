import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
function loadPureModule(file) {
  const output = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)((specifier) => {
    throw new Error(`Unexpected dependency in payment verification module: ${specifier}`);
  }, module, module.exports);
  return module.exports;
}

const migration = read('supabase/migrations/20260804194001_g29_payment_verification_contract.sql');
const firstSideEffect = migration.indexOf('insert into public.payment_automation_records');
assert.ok(firstSideEffect > 0);
assert.ok(migration.indexOf('payment_manual_verifier_invalid') < firstSideEffect);
assert.ok(migration.indexOf('payment_manual_verification_invalid') < firstSideEffect);
assert.ok(migration.indexOf('payment_stitch_verification_invalid') < firstSideEffect);
assert.ok(migration.indexOf('payment_system_recovery_unverified') < firstSideEffect);
assert.match(migration, /v_verifier\.role not in \('platform_admin', 'finance_admin'\)/);
assert.match(migration, /p_verification_result <> 'authorised_manual_confirmation'/);
assert.match(migration, /p_verification_result <> 'svix_signature_valid'/);
assert.match(migration, /p_verification_result <> 'system_recovery_reconciled'/);
assert.match(migration, /prior_event\.processing_result = 'applied'/);
assert.match(migration, /grant execute on function public\.record_payment_transition/);

const { evaluatePaymentVerificationEvidence } = loadPureModule('src/lib/payments/payment-verification.ts');
const base = {
  paymentState: 'PAID', confirmationSource: 'manual_admin', actorReference: '11111111-1111-4111-8111-111111111111',
  providerTransactionReference: null, providerEventReference: 'manual:one', providerEventAt: '2026-08-04T00:00:00.000Z',
  verificationResult: 'authorised_manual_confirmation', processingResult: 'applied', paymentEventId: 'event-one',
  amountCents: 500000, orderAmountCents: 500000, currency: 'ZAR', orderCurrency: 'ZAR',
  orderVerifiedAt: '2026-08-04T00:00:00.000Z', orderVerifiedBy: '11111111-1111-4111-8111-111111111111',
  manualVerifierStatus: 'active', manualVerifierRole: 'platform_admin', priorValidSourceEvent: false, transitionCount: 1
};
const cases = [
  ['valid manual finance evidence', { ...base, manualVerifierRole: 'finance_admin' }, true],
  ['non-profile manual actor', { ...base, manualVerifierStatus: null }, false],
  ['wrong manual role', { ...base, manualVerifierRole: 'reviewer' }, false],
  ['missing manual binding', { ...base, orderVerifiedBy: null }, false],
  ['valid signed Stitch evidence', { ...base, confirmationSource: 'stitch_webhook', actorReference: 'stitch', orderVerifiedBy: null, verificationResult: 'svix_signature_valid', providerTransactionReference: 'txn-1', providerEventReference: 'evt-1' }, true],
  ['unsigned Stitch evidence', { ...base, confirmationSource: 'stitch_webhook', actorReference: 'stitch', orderVerifiedBy: null, verificationResult: 'unverified', providerTransactionReference: 'txn-1', providerEventReference: 'evt-1' }, false],
  ['Stitch missing provider reference', { ...base, confirmationSource: 'stitch_webhook', actorReference: 'stitch', orderVerifiedBy: null, verificationResult: 'svix_signature_valid', providerTransactionReference: null, providerEventReference: 'evt-1' }, false],
  ['disabled payment event', { ...base, processingResult: 'rejected' }, false],
  ['wrong amount', { ...base, amountCents: 499900 }, false],
  ['duplicate paid transitions', { ...base, transitionCount: 2 }, false],
  ['valid reconciled recovery', { ...base, confirmationSource: 'system_recovery', actorReference: 'recovery', orderVerifiedBy: null, verificationResult: 'system_recovery_reconciled', priorValidSourceEvent: true, transitionCount: 2 }, true],
  ['unreconciled recovery', { ...base, confirmationSource: 'system_recovery', actorReference: 'recovery', orderVerifiedBy: null, verificationResult: 'system_recovery_reconciled', priorValidSourceEvent: false, transitionCount: 2 }, false]
];
for (const [label, evidence, expected] of cases) {
  assert.equal(evaluatePaymentVerificationEvidence(evidence).valid, expected, label);
}

console.log(JSON.stringify({ ok: true, assertions: cases.length + 8, sourceCases: cases.length, atomicGuard: 'pre-side-effect' }));
