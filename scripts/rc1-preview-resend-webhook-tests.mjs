import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const route = read('src/app/score/api/webhooks/resend/route.ts');
const migration = read('supabase/migrations/20260804110000_rc1_preview_resend_webhook_ingestion.sql');
const reconciliation = read('scripts/rc1-reconcile-resend-preview-webhook.mjs');
const { isPremiumReportDevelopmentMode } = await import('../src/lib/reports/email/premium-report-development-mode.ts');

const base = {
  VERCEL_ENV: 'preview',
  MK_DEVELOPMENT_MODE: 'enabled',
  NEXT_PUBLIC_SUPABASE_URL: 'https://penhenkzfrtmcxklodtu.supabase.co',
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
assert.match(route, /if \(!previewDevelopmentMode\) \{[\s\S]*?getRc1OperationFreezeResponse/);
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

assert.match(reconciliation, /GET|listAllWebhooks|\/webhooks/);
assert.match(reconciliation, /signing_secret === configuredSecret/);
assert.match(reconciliation, /matches\.length !== 1/);
assert.match(reconciliation, /method: 'PATCH'/);
assert.match(reconciliation, /status: 'enabled'/);
for (const forbidden of ['console.log(apiKey', 'console.log(configuredSecret', 'message body', 'recipient']) {
  assert.doesNotMatch(reconciliation, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}
assert.match(reconciliation, /RC1_RESEND_RECONCILIATION_ONCE=confirm/);

console.log('rc1-preview-resend-webhook: exact Preview gate, Production fail-closed path, shared attested core, service-role-only RPC, idempotency, binding fallback, and secret-safe reconciliation checks passed.');
