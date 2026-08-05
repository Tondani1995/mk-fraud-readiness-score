import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  PREMIUM_REPORT_AI_TIMEOUT_MS,
  PREMIUM_REPORT_AI_MAX_OUTPUT_TOKENS
} from '../src/lib/reports/automation/ai-sdk-generator.ts';
import {
  PREMIUM_REPORT_AI_POST_PROVIDER_MARGIN_MS,
  PREMIUM_REPORT_ROUTE_MAX_DURATION_SECONDS
} from '../src/lib/reports/automation/phase-timing.ts';
import { classifyTimeoutDiagnostic } from '../src/lib/reports/automation/ai-failure-classification.ts';

const generator = fs.readFileSync('src/lib/reports/automation/ai-sdk-generator.ts', 'utf8');
const durable = fs.readFileSync('src/lib/reports/automation/durable-ai-attempts.ts', 'utf8');
const route = fs.readFileSync('src/app/score/api/admin/orders/[orderReference]/generate-report/route.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260805200000_pre_g30_ai_timeout_window.sql', 'utf8');
const prompt = fs.readFileSync('src/lib/reports/automation/prompt.ts', 'utf8');
const types = fs.readFileSync('src/lib/reports/automation/types.ts', 'utf8');

assert.equal(PREMIUM_REPORT_AI_TIMEOUT_MS, 240_000, 'the old 45-second AI timeout must be removed');
assert.equal(PREMIUM_REPORT_ROUTE_MAX_DURATION_SECONDS, 300);
assert.equal(PREMIUM_REPORT_AI_POST_PROVIDER_MARGIN_MS, 30_000);
assert.ok(PREMIUM_REPORT_AI_TIMEOUT_MS + PREMIUM_REPORT_AI_POST_PROVIDER_MARGIN_MS <= PREMIUM_REPORT_ROUTE_MAX_DURATION_SECONDS * 1000,
  'AI timeout plus post-provider margin must fit within the route duration');
assert.equal(PREMIUM_REPORT_AI_MAX_OUTPUT_TOKENS, 5000);
assert.match(route, /export const maxDuration = PREMIUM_REPORT_ROUTE_MAX_DURATION_SECONDS/);
assert.match(generator, /maxRetries:\s*0/);
assert.doesNotMatch(generator, /45_000/);
assert.match(generator, /AbortSignal\.timeout\(PREMIUM_REPORT_AI_TIMEOUT_MS\)/);
assert.match(migration, /timeout_ms between 1000 and 300000/);
assert.match(durable, /automatic replay is blocked/);
assert.match(types, /mk-essential-evidence-projection-v2-compact/);

assert.equal(classifyTimeoutDiagnostic(new Error('The operation was aborted due to timeout')), 'application_total_timeout');
assert.equal(classifyTimeoutDiagnostic(new Error('AI Gateway request failed: timeout')), 'gateway_timeout');
assert.equal(classifyTimeoutDiagnostic(new Error('fetch failed: ETIMEDOUT')), 'network_timeout_ambiguous');
assert.equal(classifyTimeoutDiagnostic(new Error('ordinary validation error')), null);

console.log(JSON.stringify({
  ok: true,
  aiTimeoutMs: PREMIUM_REPORT_AI_TIMEOUT_MS,
  routeMaxDurationSeconds: PREMIUM_REPORT_ROUTE_MAX_DURATION_SECONDS,
  postProviderMarginMs: PREMIUM_REPORT_AI_POST_PROVIDER_MARGIN_MS,
  providerRetries: 0,
  timeoutDiagnostics: ['application_total_timeout', 'platform_function_timeout', 'gateway_timeout', 'provider_declared_timeout', 'network_timeout_ambiguous']
}));
