import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const route = read('src/app/score/api/webhooks/resend/route.ts');
const migration = read('supabase/migrations/20260804110000_rc1_preview_resend_webhook_ingestion.sql');
const onceMigration = read('supabase/migrations/20260804130000_rc1_preview_resend_reconciliation_once.sql');
const reconciliationCore = read('src/lib/reports/email/resend-webhook-reconciliation.ts');
const reconciliation = read('scripts/rc1-reconcile-resend-preview-webhook.mjs');
const { isPremiumReportDevelopmentMode } = await import('../src/lib/reports/email/premium-report-development-mode.ts');

const base = {
  VERCEL_ENV: 'preview',
  MK_DEVELOPMENT_MODE: 'enabled',
  NEXT_PUBLIC_SUPABASE_URL: 'https://iszihmmbgsfefawqmnwo.supabase.co',
  MK_EMAIL_PROVIDER_MODE: 'test',
  MK_EMAIL_RECIPIENT_ALLOWLIST: 'admin@mkfraud.co.za',
};
assert.equal(isPremiumReportDevelopmentMode(base), true);
assert.equal(isPremiumReportDevelopmentMode({ ...base, VERCEL_ENV: 'production' }), false);
assert.equal(isPremiumReportDevelopmentMode({ ...base, NEXT_PUBLIC_SUPABASE_URL: 'https://other.supabase.co' }), false);
assert.equal(isPremiumReportDevelopmentMode({ ...base, MK_DEVELOPMENT_MODE: 'disabled' }), false);
assert.equal(isPremiumReportDevelopmentMode({ ...base, MK_EMAIL_PROVIDER_MODE: 'live' }), false);
assert.equal(isPremiumReportDevelopmentMode({ ...base, MK_EMAIL_RECIPIENT_ALLOWLIST: 'other@example.invalid' }), false);

assert.match(route, /const previewDevelopmentMode = isPremiumReportDevelopmentMode\(\);/);
assert.doesNotMatch(route, /getRc1(?:Operation|Customer)FreezeResponse|MK_RC1_OPERATION_FREEZE_MODE/);
assert.match(route, /previewDevelopmentMode\s*\?\s*'preview_development_ingest_phase14_provider_webhook'/);
assert.match(route, /:\s*'ingest_phase14_provider_webhook'/);

assert.match(migration, /phase14_private\.ingest_phase14_provider_webhook_core/);
assert.match(migration, /phase14_require_policy\('provider_webhook_ingestion'\)/);
assert.match(migration, /preview_development_provider_forbidden/);
assert.match(migration, /'preview_development_rpc'/);
assert.match(migration, /provider_webhook_db_hmac/);
assert.match(migration, /delivery_attempt_ref/);
assert.match(migration, /on conflict \(provider,provider_event_id\)/i);
assert.match(migration, /apply_email_provider_event_atomic/);
assert.match(migration, /grant execute on function public\.preview_development_ingest_phase14_provider_webhook[^;]+to service_role/);
assert.doesNotMatch(migration, /grant execute on function public\.preview_development_ingest_phase14_provider_webhook[^;]+to (?:anon|authenticated)/i);

const previewWrapper = migration.slice(migration.indexOf('create or replace function public.preview_development_ingest_phase14_provider_webhook'));
assert.doesNotMatch(previewWrapper, /phase14_require_policy/);
assert.match(previewWrapper, /lower\(trim\(coalesce\(p_provider,''\)\)\) <> 'resend'/);

assert.match(reconciliationCore, /listResendWebhooks|\/webhooks/);
assert.match(reconciliationCore, /signing_secret === signingSecret/);
assert.match(reconciliationCore, /matches\.length !== 1/);
assert.match(reconciliationCore, /method: 'PATCH'/);
assert.match(reconciliationCore, /status: 'enabled'/);
assert.match(onceMigration, /preview_development_record_resend_webhook_reconciliation/);
assert.match(onceMigration, /on conflict \(operation_key\) do nothing/);
assert.match(reconciliation, /rc1-preview-resend-reconciliation/);
for (const forbidden of ['console.log(apiKey', 'console.log(configuredSecret', 'message body', 'recipient']) {
  assert.doesNotMatch(reconciliation, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.doesNotMatch(reconciliationCore, /console\.(log|info|error).*signingSecret|console\.(log|info|error).*apiKey/i);

console.log('rc1-preview-resend-webhook: exact Preview gate, Production fail-closed path, shared attested core, service-role-only RPC, idempotency, binding fallback, and secret-safe reconciliation checks passed.');
