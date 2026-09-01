import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  budgetStatusFromProjectedZar,
  EXPECTED_PRODUCTION,
  MONITORING_FORECAST,
  overallStatusFromChecks
} from '../src/lib/monitoring/contracts.ts';
import { publicReadinessPayload } from '../src/lib/monitoring/production-readiness.ts';
import {
  alertNotificationDecision,
  candidatesForEvaluation,
  candidatesForFunnel,
  recoveryNotificationAllowed
} from '../src/lib/monitoring/production-monitor.ts';
import { sanitiseMonitoringDetails, sanitiseMonitoringRoute } from '../src/lib/monitoring/privacy.ts';
import {
  buildReadinessSignature,
  buildSyntheticMonitorHeader,
  verifyReadinessRequest,
  verifySyntheticMonitorHeader
} from '../src/lib/monitoring/signatures.ts';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const pass = (label) => console.log(`  ok - ${label}`);

console.log('--- Production monitoring contract tests ---');

assert.equal(overallStatusFromChecks([]), 'HEALTHY');
assert.equal(overallStatusFromChecks([{ status: 'WARN' }]), 'DEGRADED');
assert.equal(overallStatusFromChecks([{ status: 'FAIL' }]), 'INCIDENT');
pass('readiness status roll-up is deterministic');

assert.equal(budgetStatusFromProjectedZar(49.99), 'GREEN');
assert.equal(budgetStatusFromProjectedZar(50), 'AMBER');
assert.equal(budgetStatusFromProjectedZar(80), 'RED');
assert.equal(MONITORING_FORECAST.checkly.monthlyCostUsd, 0);
assert.ok(MONITORING_FORECAST.checkly.browserRunsPer31DayMonth <= MONITORING_FORECAST.checkly.browserPlanAllowance);
assert.ok(MONITORING_FORECAST.checkly.apiRunsPer31DayMonth <= MONITORING_FORECAST.checkly.apiPlanAllowance);
assert.equal(EXPECTED_PRODUCTION.gaMeasurementId, 'G-LRTK98KGB8');
assert.equal(EXPECTED_PRODUCTION.gaPropertyId, '552214282');
pass('free-tier and existing GA4 ownership guards are bounded');

const safeDetails = sanitiseMonitoringDetails({
  stage: 'snapshot_generation',
  status_code: 500,
  retryable: true,
  customer_email: 'admin@mkfraud.co.za',
  answer_value: 'sensitive response',
  token: 'secret-token',
  nested: { email: 'nested@example.com' }
});
assert.deepEqual(safeDetails, { stage: 'snapshot_generation', status_code: 500, retryable: true });
assert.equal(sanitiseMonitoringRoute('/score/api/adaptive/MKFRS-2026-ABC?token=secret'), '/score/api/adaptive/:assessment');
assert.equal(sanitiseMonitoringRoute('https://example.com/private'), '/unknown');
pass('monitoring details and routes are PII/token scrubbed');

const signingSecret = 'contract-test-secret';
const readinessRequest = new Request('https://example.test/score/api/internal/production-readiness', {
  method: 'GET',
  headers: { authorization: `Bearer ${signingSecret}` }
});
assert.equal(verifyReadinessRequest(readinessRequest, signingSecret, '/score/api/internal/production-readiness'), true);
assert.equal(verifyReadinessRequest(readinessRequest, 'wrong-secret', '/score/api/internal/production-readiness'), false);
const signedRequest = new Request('https://example.test/score/api/internal/production-readiness', {
  method: 'GET',
  headers: { 'x-mk-monitor-signature': buildReadinessSignature(signingSecret, 'GET', '/score/api/internal/production-readiness') }
});
assert.equal(verifyReadinessRequest(signedRequest, signingSecret, '/score/api/internal/production-readiness'), true);
const syntheticHeader = buildSyntheticMonitorHeader(signingSecret, 'core-contract-20260901');
assert.equal(verifySyntheticMonitorHeader(syntheticHeader, signingSecret), 'core-contract-20260901');
assert.equal(verifySyntheticMonitorHeader(syntheticHeader, 'wrong-secret'), null);
pass('readiness and signed synthetic authentication fail closed');

const publicPayload = publicReadinessPayload({
  status: 'DEGRADED',
  checkedAt: '2026-09-01T12:00:00.000Z',
  currentDeploymentSha: 'secret-value-must-not-appear',
  configuredSupabaseProjectRef: 'secret-project-must-not-appear',
  checks: [{ key: 'runtime_environment', category: 'dependency', status: 'WARN', safeCode: 'monitoring_external_activation_pending' }]
});
assert.deepEqual(publicPayload, {
  ok: true,
  status: 'DEGRADED',
  checked_at: '2026-09-01T12:00:00.000Z',
  checks: [{ key: 'runtime_environment', status: 'WARN' }]
});
assert.equal(JSON.stringify(publicPayload).includes('secret-value'), false);
assert.equal(JSON.stringify(publicPayload).includes('secret-project'), false);
pass('public readiness payload exposes status only');

const now = new Date('2026-09-01T12:00:00.000Z');
assert.equal(alertNotificationDecision({ now }), 'send_initial');
assert.equal(alertNotificationDecision({ now, existing: { status: 'open', last_notified_at: '2026-09-01T11:00:00.000Z' } }), 'suppress');
assert.equal(alertNotificationDecision({ now, existing: { status: 'open', last_notified_at: '2026-09-01T07:00:00.000Z' } }), 'send_reminder');
assert.equal(recoveryNotificationAllowed({ status: 'open', last_notified_at: '2026-09-01T11:00:00.000Z', last_recovery_notified_at: null }), true);
assert.equal(recoveryNotificationAllowed({ status: 'resolved', last_notified_at: '2026-09-01T11:00:00.000Z', last_recovery_notified_at: null }), false);
assert.equal(recoveryNotificationAllowed({ status: 'open', last_notified_at: '2026-09-01T11:00:00.000Z', last_recovery_notified_at: '2026-09-01T11:30:00.000Z' }), false);
pass('incident dedupe, reminders and one-time recovery are bounded');

const baseMetrics = {
  starts: 0,
  firstAnswers: 0,
  progressAssessments: 0,
  progressAttempts: 0,
  submissions: 0,
  snapshotGenerationSucceeded: 0,
  snapshotGenerationFailed: 0,
  snapshotViews: 0,
  productSelections: 0,
  orders: 0,
  apiFailures: 0,
  apiFailureRows: [],
  submittedWithoutSnapshot: 0,
  notificationFailures: 0
};
assert.deepEqual(candidatesForFunnel(baseMetrics, EXPECTED_PRODUCTION.deploymentSha), []);
assert.equal(candidatesForFunnel({ ...baseMetrics, submittedWithoutSnapshot: 1 }, EXPECTED_PRODUCTION.deploymentSha)[0].priority, 'P1');
assert.equal(candidatesForFunnel({ ...baseMetrics, starts: 5, firstAnswers: 1 }, EXPECTED_PRODUCTION.deploymentSha)[0].priority, 'P3');
assert.equal(candidatesForFunnel({ ...baseMetrics, starts: 1, firstAnswers: 0 }, EXPECTED_PRODUCTION.deploymentSha).length, 0);
const warningCandidates = candidatesForEvaluation({
  status: 'DEGRADED',
  checkedAt: now.toISOString(),
  currentDeploymentSha: EXPECTED_PRODUCTION.deploymentSha,
  configuredSupabaseProjectRef: EXPECTED_PRODUCTION.supabaseProjectRef,
  checks: [{ key: 'monitoring_configuration', category: 'dependency', status: 'WARN', safeCode: 'monitoring_external_activation_pending' }]
});
assert.equal(warningCandidates[0].priority, 'P3');
pass('normal abandonment stays a signal while hard failures alert');

const routeSource = read('src/app/score/api/internal/production-monitor/route.ts');
assert.match(routeSource, /process\.env\.VERCEL_ENV === 'preview'/);
assert.match(routeSource, /MK_MONITORING_FAILURE_INJECTION/);
assert.match(routeSource, /export const GET = handle/);
assert.match(routeSource, /export const POST = handle/);
const sentryClientSource = read('instrumentation-client.ts');
assert.match(sentryClientSource, /sendDefaultPii:\s*false/);
assert.match(sentryClientSource, /tracesSampleRate:\s*0/);
assert.match(sentryClientSource, /replaysSessionSampleRate:\s*0/);
assert.match(sentryClientSource, /replaysOnErrorSampleRate:\s*0/);
assert.match(sentryClientSource, /ReplayCanvas/);
const sentryTestRoute = read('src/app/score/api/internal/sentry-test-error/route.ts');
assert.match(sentryTestRoute, /process\.env\.VERCEL_ENV !== 'preview'/);
assert.match(sentryTestRoute, /Sentry\.getClient\(\)/);
assert.match(sentryTestRoute, /Sentry\.flush\(2000\)/);
assert.match(read('src/app/score/api/adaptive/[assessmentRef]/submit/route.ts'), /safeErrorCategory\(error\)/);
const monitoringAdminPage = read('src/app/score/admin/monitoring/page.tsx');
assert.match(monitoringAdminPage, /getAuthenticatedAdminSession/);
assert.match(monitoringAdminPage, /redirect\('\/score\/admin\/login'\)/);
assert.doesNotMatch(monitoringAdminPage, /requireAdmin/);
assert.doesNotMatch(read('supabase/migrations/20260901183000_production_observability_foundation.sql'), /delete\s+from/i);
assert.doesNotMatch(read('supabase/migrations/20260901183000_production_observability_foundation.sql'), /drop\s+table/i);
assert.match(read('supabase/migrations/20260901190000_production_monitor_cron.sql'), /v12_stalled_lead_cron_secret/);
assert.match(read('supabase/migrations/20260901190000_production_monitor_cron.sql'), /www\.mkfraud\.co\.za\/score\/api\/internal\/production-monitor\?daily=0/);
pass('Preview injection is gated and database work is additive');

console.log('Production monitoring contract tests passed.');
