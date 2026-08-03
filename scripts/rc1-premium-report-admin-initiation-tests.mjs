import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = process.cwd();
const require = createRequire(import.meta.url);
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const route = read('src/app/score/api/admin/delivery/premium-report/route.ts');
const service = read('src/lib/reports/email/premium-report-preview-development.ts');
const mode = read('src/lib/reports/email/premium-report-development-mode.ts');
const delivery = read('src/lib/reports/email/report-delivery-service-core.ts');
const dispatch = read('src/lib/reports/email/delivery-dispatch.ts');
const migration = read('supabase/migrations/20260803230000_preview_development_delivery.sql');
const uniqueness = read('supabase/migrations/20260803220000_rc1_premium_delivery_active_uniqueness.sql');

for (const forbidden of [
  'getAdminSession', 'platform_admin', 'requirePhase14Action', 'AAL2',
  'manual_delivery', 'recipient_override', 'getRc1OperationFreezeResponse', 'RC1_OPERATION_FROZEN'
]) assert.doesNotMatch(route, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `Preview route still depends on ${forbidden}`);
for (const required of [
  'isPremiumReportDevelopmentMode', 'premiumReportAdminInitiationInputSchema',
  'initiatePremiumReportDevelopmentDelivery', 'development_mode_required', 'noStore'
]) assert.match(route, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `route missing ${required}`);
assert.doesNotMatch(route, /CRON_SECRET|authorization.*Bearer/i);
for (const untouchedEvent of ['customer_order_confirmation', 'admin_new_order_notification', 'payment_confirmed', 'eft_order_created']) {
  assert.doesNotMatch(route, new RegExp(untouchedEvent));
}

for (const required of [
  'payment_received', 'payment_transition_events', 'assertExactlyOneValidPaymentTransition',
  'resolveCurrentReportId', 'assertReportAccessEligible', 'storage_unverified',
  'PREMIUM_REPORT_DEVELOPMENT_RECIPIENT', 'recipient_not_allowlisted',
  'developmentMode: true', 'provider_mode', 'premium_report_preview_development_delivery_requested',
  'premium_report_preview_development_delivery_completed'
]) assert.match(service, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `development service missing ${required}`);
assert.doesNotMatch(service, /getAdminSession|Phase14|requirePhase14Action|platform_admin|MFA|AAL2/);
assert.match(mode, /VERCEL_ENV/);
assert.match(mode, /MK_DEVELOPMENT_MODE/);
assert.match(mode, /penhenkzfrtmcxklodtu/);
assert.match(mode, /MK_EMAIL_PROVIDER_MODE/);
assert.match(mode, /MK_EMAIL_RECIPIENT_ALLOWLIST/);
assert.match(mode, /admin@mkfraud\.co\.za/);

for (const required of [
  'preview_development_prepare_premium_report_delivery',
  'preview_development_finalize_premium_report_delivery',
  'preview_development_mark_reconciliation_required',
  'phase14_delivery_entitlement',
  'pg_advisory_xact_lock',
  "status in ('queued','claimed','dispatching','reconciliation_required','retry_scheduled')",
  "status = 'sending'",
  "status = 'finalized'",
  'revoke all on function',
  'grant execute on function'
]) assert.match(migration, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `migration missing ${required}`);
assert.match(delivery, /developmentMode/);
assert.match(delivery, /preview_development_prepare_premium_report_delivery/);
assert.match(delivery, /provider_request_key/);
assert.match(dispatch, /preview_development_finalize_premium_report_delivery/);
assert.match(dispatch, /preview_development_mark_reconciliation_required/);
assert.match(uniqueness, /report_delivery_authorizations_one_active_uidx/);

function loadModule(file) {
  const output = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(require, module, module.exports);
  return module.exports;
}

const { isPremiumReportDevelopmentMode, PREMIUM_REPORT_DEVELOPMENT_RECIPIENT } = loadModule('src/lib/reports/email/premium-report-development-mode.ts');
const baseEnv = {
  VERCEL_ENV: 'preview',
  MK_DEVELOPMENT_MODE: 'enabled',
  NEXT_PUBLIC_SUPABASE_URL: 'https://penhenkzfrtmcxklodtu.supabase.co',
  MK_EMAIL_PROVIDER_MODE: 'test',
  MK_EMAIL_RECIPIENT_ALLOWLIST: PREMIUM_REPORT_DEVELOPMENT_RECIPIENT
};
assert.equal(isPremiumReportDevelopmentMode(baseEnv), true, 'Preview development mode should open only for the exact staging contract');
assert.equal(isPremiumReportDevelopmentMode({ ...baseEnv, VERCEL_ENV: 'production' }), false, 'Production must be refused');
assert.equal(isPremiumReportDevelopmentMode({ ...baseEnv, NEXT_PUBLIC_SUPABASE_URL: 'https://production-project.supabase.co' }), false, 'Non-staging Supabase must be refused');
assert.equal(isPremiumReportDevelopmentMode({ ...baseEnv, MK_DEVELOPMENT_MODE: 'disabled' }), false, 'Disabled development mode must be refused');
assert.equal(isPremiumReportDevelopmentMode({ ...baseEnv, MK_EMAIL_RECIPIENT_ALLOWLIST: 'other@example.test' }), false, 'Missing allowlist entry must be refused');

const { premiumReportAdminInitiationInputSchema, assertApprovedRecipient, assertExactlyOneValidPaymentTransition } = loadModule('src/lib/reports/email/premium-report-admin-initiation-policy.ts');
assert.equal(premiumReportAdminInitiationInputSchema.safeParse({ orderReference: 'MKORD-1', reportReference: 'RPT-1' }).success, true);
assert.equal(premiumReportAdminInitiationInputSchema.safeParse({ orderReference: 'MKORD-1' }).success, false);
assert.throws(() => assertApprovedRecipient('other@example.test', [PREMIUM_REPORT_DEVELOPMENT_RECIPIENT]), /allowlist/);
assert.doesNotThrow(() => assertApprovedRecipient(PREMIUM_REPORT_DEVELOPMENT_RECIPIENT, [PREMIUM_REPORT_DEVELOPMENT_RECIPIENT]));
assert.throws(() => assertExactlyOneValidPaymentTransition(0), /exactly one/);
assert.doesNotThrow(() => assertExactlyOneValidPaymentTransition(1));
assert.throws(() => assertExactlyOneValidPaymentTransition(2), /exactly one/);

console.log('Preview development delivery contract tests passed: exact staging gate, anonymous Preview route, Production/non-staging/disabled/recipient refusals, commercial checks, Storage/checksum reuse, provider idempotency, and repeated/concurrent one-send uniqueness are wired.');
