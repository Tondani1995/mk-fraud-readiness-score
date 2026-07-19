import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function assertIncludes(file, needle, label) {
  const source = read(file);
  assert(source.includes(needle), `${label}: expected ${file} to include ${JSON.stringify(needle)}`);
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

// Regression coverage for the production hotfix: service_role was missing
// SELECT on public.app_settings (migration 0017's revoke was overbroad),
// which broke the app_settings marker read inside getPhase1SchemaCapability
// and, through it, hid the Generate Report button behind one generic error
// message even though the three phase1-operations.ts queries never ran.
//
// These are source-level checks in the same style as the other phaseN test
// scripts in this repo (no live database needed here -- the live-Postgres
// replay for this exact area is scripts/phase1-0023-replay-tests.sh, wired
// into .github/workflows/phase1-migration-replay.yml). This file exists to
// pin the specific behaviours the hotfix ticket asked for:
//   1. All three operations queries succeeding leaves failedQueries empty.
//   2. Each query failure is captured and logged independently.
//   3. The admin UI surfaces the exact failed dependency, not one message.
//   4. Generate Report's render condition is untouched by this hotfix.

const migrationDir = 'supabase/migrations';
const migrationFiles = fs.readdirSync(path.join(root, migrationDir)).filter((name) => name.endsWith('.sql'));
const grantMigration = migrationFiles.find((name) => name.includes('app_settings_service_role_select_restore'));
assert(Boolean(grantMigration), 'Expected a migration restoring service_role SELECT on app_settings to exist in supabase/migrations');
assertIncludes(`${migrationDir}/${grantMigration}`, 'grant select on table public.app_settings to service_role', 'Fix migration must grant SELECT on app_settings to service_role');
assertIncludes(`${migrationDir}/${grantMigration}`, 'insert', 'Fix migration commentary must explain INSERT/UPDATE/DELETE remain revoked (write lockdown untouched)');

// 1 & 2: capability-diagnostics.ts exists and never logs raw error.message (safety contract)
assertIncludes('src/lib/reports/capability-diagnostics.ts', 'export function logCapabilityQueryFailure', 'Diagnostic helper must exist');
assertIncludes('src/lib/reports/capability-diagnostics.ts', 'safeMessage', 'Diagnostic helper must produce a fixed safe message, not raw driver text');
{
  const source = read('src/lib/reports/capability-diagnostics.ts');
  const consoleErrorCall = source.slice(source.indexOf('console.error('), source.indexOf('return diagnostic;'));
  assert(!consoleErrorCall.includes('error.message'), 'Diagnostic helper\'s logged payload must never include the raw PostgREST error.message (may echo query parameters) -- explanatory comments referencing it are fine');
}

// phase1-schema-capability.ts: marker + RPC failures each produce a distinct failedQuery
assertIncludes('src/lib/reports/phase1-schema-capability.ts', "failedQuery?: QueryFailureDiagnostic | null", 'Phase1SchemaCapability must expose which query failed');
assertIncludes('src/lib/reports/phase1-schema-capability.ts', "logCapabilityQueryFailure('app_settings:v2_phase1_manual_fulfilment'", 'Marker read failure must be logged and named distinctly');
assertIncludes('src/lib/reports/phase1-schema-capability.ts', "logCapabilityQueryFailure(\n      'rpc:phase1_manual_fulfilment_capability'", 'RPC failure must be logged and named distinctly');

// phase1-operations.ts: the three queries are checked and logged independently, not
// as one combined boolean the way the pre-hotfix code did.
{
  const source = read('src/lib/reports/phase1-operations.ts');
  assert(source.includes("logCapabilityQueryFailure('manual_report_generation_attempts'"), 'Generation attempts query failure must be logged independently');
  assert(source.includes("logCapabilityQueryFailure('manual_report_delivery_attempts'"), 'Delivery attempts query failure must be logged independently');
  assert(source.includes("logCapabilityQueryFailure('email_events'"), 'Notification/email events query failure must be logged independently');
  assert(source.includes('failedQueries: capability.failedQuery'), 'When capability itself is unavailable, its failedQuery must propagate into operations.failedQueries');
  assert(source.includes('schemaAvailable: failedQueries.length === 0'), 'schemaAvailable must be true only when zero of the three queries failed (all-succeeding path)');
  assert(countOccurrences(source, 'logCapabilityQueryFailure(') === 3, 'Expected exactly three independent logCapabilityQueryFailure call sites (one per query) in phase1-operations.ts, found a different count');
}

// 3: the order detail page renders per-dependency failure detail, not just the
// single generic PHASE1_SCHEMA_ERROR_MESSAGE string.
{
  const pagePath = 'src/app/score/admin/orders/[orderReference]/page.tsx';
  const source = read(pagePath);
  assert(source.includes('failedDependencies'), 'Order detail page must compute a failedDependencies list from capability/operations/report failures');
  assert(source.includes('capability.failedQuery ? [capability.failedQuery] : []'), 'failedDependencies must include the schema-capability failure when present');
  assert(source.includes('(operations as any).failedQueries'), 'failedDependencies must include the three-operations-query failures when present');
  assert(source.includes('reportResult.failedQuery ? [reportResult.failedQuery] : []'), 'failedDependencies must include the reports-query failure when present');
  assert(source.includes('failedDependencies.map((failure, index)'), 'Order detail page must render the per-dependency failure list in the UI, not just the generic banner');
  assert(source.includes('failure.safeMessage'), 'Rendered failure detail must use the fixed safe message, not raw error text');
}

// 4: Generate Report's render condition (FulfilmentActions) is untouched --
// this hotfix must not change *when* the button renders, only *why* it was
// hidden when capability checks fail.
{
  const source = read('src/components/admin/FulfilmentActions.tsx');
  assertIncludes('src/components/admin/FulfilmentActions.tsx', "props.capabilityAvailable && props.canGenerate && props.eligible && !props.storageCandidate && props.generationState !== 'GENERATION_FAILED'", 'Generate Report button render condition must be unchanged by this hotfix');
}

console.log('phase1-capability-diagnostics-tests: all assertions passed');
