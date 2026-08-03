import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const require = createRequire(import.meta.url);
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const route = read('src/app/score/api/admin/delivery/premium-report/route.ts');
const service = read('src/lib/reports/email/premium-report-admin-initiation.ts');
const policy = read('src/lib/reports/email/premium-report-admin-initiation-policy.ts');
const delivery = read('src/lib/reports/email/report-delivery-service-core.ts');
const migration = read('supabase/migrations/20260803220000_rc1_premium_delivery_active_uniqueness.sql');

for (const required of [
  'getRc1OperationFreezeResponse',
  "'delivery'",
  'platform_admin',
  'premiumReportAdminInitiationInputSchema',
  'initiatePremiumReportDelivery',
  'AAL2',
  'noStore'
]) assert.match(route, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `route missing ${required}`);
assert.doesNotMatch(route, /CRON_SECRET|authorization.*Bearer/i, 'admin route must never accept the worker secret');
for (const untouchedEvent of ['customer_order_confirmation', 'admin_new_order_notification', 'payment_confirmed', 'eft_order_created']) {
  assert.doesNotMatch(route, new RegExp(untouchedEvent), `admin route must not touch ${untouchedEvent}`);
}
assert.doesNotMatch(migration, /email_events|notifications|payment_transition_events/, 'active-attempt migration must not mutate unrelated ledgers');

for (const required of [
  'storage_unverified',
  'report_order_mismatch',
  'score_run_relationship_invalid',
  'resolveCurrentReportId',
  'assertReportAccessEligible',
  'payment_transition_events',
  'report_delivery_authorizations',
  'premium_report_admin_delivery_initiation_requested',
  'premium_report_admin_delivery_initiation_completed',
  'deliverPremiumReportEmail',
  "requirePhase14Action('email_delivery')"
]) assert.match(service, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `service missing ${required}`);
assert.doesNotMatch(service, /recipient_email.*console\.|console\..*recipient_email|storage_path.*console\.|CRON_SECRET/, 'service must not log recipient, Storage path or worker secret');

for (const required of [
  'strict()',
  'orderId',
  'orderReference',
  'reportId',
  'reportReference',
  'recipient',
  'assertApprovedRecipient',
  'assertExactlyOneValidPaymentTransition',
  'assertTestProviderMode',
  'recipient_not_allowlisted',
  'payment_transition_count_invalid',
  'production_forbidden'
]) assert.match(policy, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `policy missing ${required}`);

for (const required of [
  'create unique index if not exists report_delivery_authorizations_one_active_uidx',
  "status in ('queued', 'claimed', 'dispatching', 'reconciliation_required', 'retry_scheduled')",
  'rc1_premium_delivery_active_uniqueness_existing_duplicate',
  'begin;',
  'commit;'
]) assert.match(migration, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `migration missing ${required}`);
assert.match(delivery, /report_delivery_authorizations_one_active_uidx/);
assert.match(delivery, /status:\s*'in_progress'/);

function loadPolicyModule() {
  const output = ts.transpileModule(read('src/lib/reports/email/premium-report-admin-initiation-policy.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(require, module, module.exports);
  return module.exports;
}

const {
  premiumReportAdminInitiationInputSchema,
  assertCertificationEnvironment,
  assertTestProviderMode,
  assertApprovedRecipient,
  assertExactlyOneValidPaymentTransition
} = loadPolicyModule();

assert.equal(premiumReportAdminInitiationInputSchema.safeParse({ orderReference: 'MKORD-1', reportReference: 'RPT-1' }).success, true);
assert.equal(premiumReportAdminInitiationInputSchema.safeParse({ orderReference: 'MKORD-1' }).success, false);
assert.equal(premiumReportAdminInitiationInputSchema.safeParse({ orderReference: 'MKORD-1', reportReference: 'RPT-1', arbitrary: 'nope' }).success, false);
assert.throws(() => assertCertificationEnvironment('production', 'production'), /Production/);
assert.throws(() => assertTestProviderMode('disabled'), /test provider/);
assert.doesNotThrow(() => assertApprovedRecipient('qa@example.test', ['qa@example.test']));
assert.throws(() => assertApprovedRecipient('other@example.test', ['qa@example.test']), /allowlist/);
assert.doesNotThrow(() => assertExactlyOneValidPaymentTransition(1));
for (const count of [0, 2, null, undefined]) assert.throws(() => assertExactlyOneValidPaymentTransition(count), /exactly one/);

console.log('RC1 premium-report admin initiation contract tests passed: AAL2/role/freeze/Production gates, strict selectors, payment/Storage/relationship/allowlist refusals, no CRON_SECRET, existing delivery reuse, and active-attempt concurrency uniqueness are wired.');
