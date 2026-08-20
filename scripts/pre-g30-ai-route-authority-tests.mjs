import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile('supabase/migrations/20260805090000_pre_g30_ai_route_authority.sql', 'utf8');
const pipeline = await readFile('src/lib/reports/automation/narrative-pipeline.ts', 'utf8');
const routePolicy = await readFile('src/lib/reports/automation/ai-route-policy.ts', 'utf8');

for (const field of ['approved_environment', 'approved_supabase_project', 'approved_model', 'approved_pr_number', 'approved_head_sha', 'expires_at', 'approval_reference']) {
  assert.match(migration, new RegExp(`add column if not exists ${field}`), `${field} must be part of the explicit approval binding`);
}
assert.match(migration, /create or replace function public\.authorize_phase14_ai_route/i);
assert.match(migration, /environment_not_preview/);
assert.match(migration, /supabase_project_not_staging/);
assert.match(migration, /route_approval_binding_mismatch/);
assert.match(migration, /security_gate_unsatisfied/);
assert.match(migration, /ai_feature_policy_disabled/);
assert.match(migration, /revoke all on function public\.authorize_phase14_ai_route/i);
assert.match(migration, /grant execute on function public\.authorize_phase14_ai_route[\s\S]*to service_role/i);

assert.match(routePolicy, /process\.env\.VERCEL_ENV/);
assert.match(routePolicy, /currentSupabaseProject/);
assert.match(routePolicy, /VERCEL_GIT_COMMIT_SHA|MK_RELEASE_HEAD_SHA/);
assert.match(routePolicy, /authorize_phase14_ai_route/);

const decisionOffset = pipeline.indexOf('input.authorizeAiRoute');
const generatorOffset = pipeline.indexOf('createDurablePremiumReportNarrativeGenerator');
assert.ok(decisionOffset >= 0 && decisionOffset < generatorOffset, 'AI route policy must be consulted before durable generator/provider dispatch');
assert.match(pipeline.slice(decisionOffset, generatorOffset), /fallbackResult/);

console.log(JSON.stringify({ ok: true, assertions: 17, suite: 'pre-g30-ai-route-authority' }));
