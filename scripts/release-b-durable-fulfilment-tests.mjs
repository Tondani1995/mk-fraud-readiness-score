// Release B durable fulfilment tests.
//
// Static source-assertion coverage (matches scripts/release-a-backlog-reconciliation-tests.mjs
// section 1-8/10-11 style): confirms the migration, worker route, service layer, and admin
// routes contain the required role gates, lease/idempotency checks, and audit writes.
//
// This script does NOT connect to a live database. The live-database coverage (payment
// confirmation queuing exactly one job and rejecting a duplicate idempotency key, worker
// claim exclusivity, lease-not-held rejection, retry backoff and MANUAL_REVIEW_REQUIRED
// escalation at max_attempts, retry_fulfilment_job rejecting an ineligible state instead of
// silently no-op-ing, expired-lease recovery vs. an unexpired lease being left untouched,
// submit_for_quality_review's REPORT_READY precondition, role-gated approve/reject, reject
// creating exactly one linked regenerated attempt, RLS blocking anon, and service_role-only
// worker RPCs rejecting the authenticated role) was independently verified in this work cycle
// by applying every migration to a local Postgres via `supabase start` and running 24 direct
// SQL checks against it with synthetic fixture data, then rolling back and removing the test
// volumes -- see docs/safe-launch/09-release-evidence.md and PR #42 for that evidence. It was
// a one-off manual verification, not wired into this repeatable script, for the same reason
// Release A's live checks weren't: it requires bringing up a local Supabase/Docker stack this
// script cannot assume is running.

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function assert(condition, label) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`  ok - ${label}`);
}

function assertIncludes(file, needle, label) {
  assert(read(file).includes(needle), `${label} (expected ${file} to include ${JSON.stringify(needle)})`);
}

function assertNotIncludes(file, needle, label) {
  assert(!read(file).includes(needle), `${label} (expected ${file} NOT to include ${JSON.stringify(needle)})`);
}

const migrationCandidates = fs.existsSync(path.join(root, 'supabase/migrations'))
  ? fs.readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.includes('release_b_durable_fulfilment'))
  : [];
assert(migrationCandidates.length === 1, 'Exactly one Release B durable fulfilment migration file exists');
const migration = `supabase/migrations/${migrationCandidates[0]}`;

const workerRoute = 'src/app/score/api/internal/fulfilment-worker/route.ts';
const service = 'src/lib/fulfilment/fulfilment-service.ts';
const approveRoute = 'src/app/score/api/admin/orders/[orderReference]/fulfilment/approve/route.ts';
const rejectRoute = 'src/app/score/api/admin/orders/[orderReference]/fulfilment/reject/route.ts';
const retryRoute = 'src/app/score/api/admin/orders/[orderReference]/fulfilment/retry/route.ts';
const recoverRoute = 'src/app/score/api/admin/orders/[orderReference]/fulfilment/recover/route.ts';
const reviewPanel = 'src/components/admin/FulfilmentReviewPanel.tsx';
const runbook = 'docs/safe-launch/13-durable-fulfilment-runbook.md';

console.log('--- 1. Files exist ---');
for (const file of [migration, workerRoute, service, approveRoute, rejectRoute, retryRoute, recoverRoute, reviewPanel, runbook]) {
  assert(exists(file), `${file} exists`);
}

console.log('--- 2. Migration is additive: every pre-existing status/trigger_source value is preserved ---');
for (const status of ['NOT_REQUESTED', 'REPORT_QUEUED', 'REPORT_GENERATING', 'REPORT_READY', 'GENERATION_FAILED']) {
  assertIncludes(migration, `'${status}'`, `Status check constraint still includes the pre-existing value ${status}`);
}
for (const newStatus of ['AWAITING_QUALITY_REVIEW', 'DELIVERY_QUEUED', 'RETRY_SCHEDULED', 'MANUAL_REVIEW_REQUIRED']) {
  assertIncludes(migration, `'${newStatus}'`, `Status check constraint includes the new Release B value ${newStatus}`);
}
for (const source of ['admin_generate', 'admin_retry', 'admin_regenerate', 'payment_confirmation']) {
  assertIncludes(migration, `'${source}'`, `trigger_source check constraint still includes the pre-existing value ${source}`);
}
assertNotIncludes(migration, 'drop column', 'Migration never drops a column (additive only)');
assertNotIncludes(migration, 'drop table', 'Migration never drops a table (additive only)');

console.log('--- 3. claim_next_fulfilment_job(): atomic claim, service_role only ---');
assertIncludes(migration, 'create or replace function public.claim_next_fulfilment_job', 'claim_next_fulfilment_job() is defined');
assertIncludes(migration, 'for update skip locked', 'Claim RPC uses for update skip locked (no double-claim race)');
assertIncludes(migration, 'grant execute on function public.claim_next_fulfilment_job(text, integer) to service_role', 'claim_next_fulfilment_job() is service_role only, not callable by authenticated/anon');

console.log('--- 4. fail_fulfilment_job(): lease ownership enforced, bounded retries with backoff ---');
assertIncludes(migration, "if v_before.lease_owner is null or v_before.lease_owner <> p_lease_owner then", 'fail_fulfilment_job() rejects a caller that does not hold the lease');
assertIncludes(migration, "raise exception 'fulfilment_lease_not_held'", 'Distinct error for a non-lease-holder');
assertIncludes(migration, "v_next_status := case when v_retry < v_before.max_attempts then 'RETRY_SCHEDULED' else 'MANUAL_REVIEW_REQUIRED' end", 'Bounded retry logic: RETRY_SCHEDULED below max_attempts, MANUAL_REVIEW_REQUIRED at/above it');
assertIncludes(migration, 'least(3600, 30 * (2 ^ least(v_retry, 7))::integer)', 'Exponential backoff formula matches the audited phase14_storage_cleanup_queue pattern');

console.log('--- 5. recover_expired_fulfilment_leases(): only touches rows whose lease has actually expired ---');
assertIncludes(migration, 'where status = \'REPORT_GENERATING\' and lease_expires_at is not null and lease_expires_at < now()', 'Recovery sweep is scoped to expired leases only');
assertIncludes(migration, "next_attempt_at = now()", 'Recovered jobs are immediately eligible again (crash recovery, not backoff-delayed)');

console.log('--- 6. Quality review: role-gated, reason length enforced, reject creates a linked regenerated attempt ---');
for (const rpcName of ['approve_quality_review', 'reject_quality_review']) {
  assertIncludes(migration, `create or replace function public.${rpcName}`, `${rpcName}() is defined`);
}
assertIncludes(migration, "v_actor.role not in ('platform_admin', 'reviewer', 'approver')", 'Quality review RPCs restrict the actor role to platform_admin/reviewer/approver');
assertIncludes(migration, "raise exception 'fulfilment_quality_review_reason_too_short'", 'Quality review requires a reason of at least 5 characters');
assertIncludes(migration, 'regenerated_from_attempt_id', 'reject_quality_review() links the new attempt back to the rejected one');
assertIncludes(migration, "'quality_rejected_regenerate'", 'The regenerated attempt is tagged with its own trigger_source, distinct from admin/payment triggers');

console.log('--- 7. Admin recovery: retry_fulfilment_job()/recover_fulfilment_job() reject an ineligible state instead of silently no-op-ing ---');
assertIncludes(migration, "v_before.status not in ('MANUAL_REVIEW_REQUIRED', 'GENERATION_FAILED')", 'retry_fulfilment_job() only accepts these two states');
assertIncludes(migration, "raise exception 'fulfilment_retry_invalid_state'", 'retry_fulfilment_job() raises a distinct, explicit error for any other state (not a silent no-op)');
assertIncludes(migration, "v_before.status <> 'REPORT_GENERATING'", 'recover_fulfilment_job() only accepts a currently-generating row');
assertIncludes(migration, "raise exception 'fulfilment_recover_invalid_state'", 'recover_fulfilment_job() raises a distinct, explicit error otherwise');

console.log('--- 8. Every mutating RPC writes to audit_logs ---');
for (const action of [
  'fulfilment_job_claimed', 'fulfilment_job_failed', 'quality_review_submitted', 'fulfilment_lease_recovered',
  'quality_review_approved', 'quality_review_rejected', 'fulfilment_job_requeued', 'fulfilment_job_retried', 'fulfilment_job_admin_recovered'
]) {
  assertIncludes(migration, `'${action}'`, `An audit_logs row is written with action = ${action}`);
}

console.log('--- 9. Payment transaction boundary: record_payment_transition() queues the job atomically, in the same function ---');
assertIncludes(migration, 'create or replace function public.record_payment_transition', 'record_payment_transition() is redefined in this migration (not edited in 0024)');
assertIncludes(migration, "v_job_request_key := 'payment_fulfilment:' || v_order.id::text || ':' || p_idempotency_key", 'Job request_key is deterministic from (order_id, idempotency_key)');
assertIncludes(migration, 'on conflict (request_key) do nothing', 'A retried payment confirmation cannot create a second job (unique-constraint conflict is absorbed, not an error)');
{
  const sql = read(migration);
  const paidBranchIndex = sql.indexOf("if p_new_state = 'PAID' then");
  const returnIndex = sql.lastIndexOf("return jsonb_build_object('applied', true");
  assert(paidBranchIndex > -1 && returnIndex > paidBranchIndex, 'Job queuing happens before the function returns, inside the same transaction as the payment state transition');
}

console.log('--- 10. Worker route: Bearer-token authenticated, no PII in logs, reuses the existing generation function unmodified ---');
assertIncludes(workerRoute, "request.headers.get('authorization') !== `Bearer ${cronSecret}`", 'Worker route uses the same CRON_SECRET Bearer-token pattern as the existing storage-cleanup route');
assertIncludes(workerRoute, 'forbidden', 'Worker route returns 403 for a missing/invalid secret');
assertIncludes(workerRoute, 'generateManualPhase1Report', 'Worker route calls the existing, unmodified report-generation function');
assertNotIncludes(workerRoute, 'customer_email', 'Worker route never references customer email');
assertNotIncludes(workerRoute, 'customer_name', 'Worker route never references customer name');

console.log('--- 11. Admin routes are role-gated before calling the service layer ---');
assertIncludes(approveRoute, 'FULFILMENT_QUALITY_REVIEW_ROLES', 'Approve route uses the shared quality-review role list');
assertIncludes(rejectRoute, 'FULFILMENT_QUALITY_REVIEW_ROLES', 'Reject route uses the shared quality-review role list');
assertIncludes(retryRoute, 'canManageFinance', 'Retry route is gated by canManageFinance (matches retry_fulfilment_job()\'s own role check)');
assertIncludes(recoverRoute, 'canManageFinance', 'Recover route is gated by canManageFinance (matches recover_fulfilment_job()\'s own role check)');
for (const routeFile of [approveRoute, rejectRoute, retryRoute, recoverRoute]) {
  const sql = read(routeFile);
  const roleCheckIndex = sql.search(/if \(!admin \|\|/);
  const serviceCallIndex = Math.min(
    ...['approveQualityReview(', 'rejectQualityReview(', 'retryFulfilmentJob(', 'recoverFulfilmentJob(']
      .map((needle) => sql.indexOf(needle))
      .filter((index) => index > -1)
  );
  assert(roleCheckIndex > -1 && serviceCallIndex > roleCheckIndex, `${routeFile}: the role check happens before the service call`);
}

console.log('--- 12. vercel.json registers the worker route as a cron entry ---');
assertIncludes('vercel.json', '/score/api/internal/fulfilment-worker', 'vercel.json cron points at the new worker route');

console.log('--- 13. No fabricated customer data anywhere in the new code/docs ---');
const allNewSources = [migration, workerRoute, service, approveRoute, rejectRoute, retryRoute, recoverRoute, reviewPanel, runbook].map(read).join('\n');
assert(!/@(gmail|yahoo|outlook|hotmail)\.com/i.test(allNewSources), 'No example email addresses appear anywhere in the new files');

console.log('--- 14. package.json wiring ---');
assertIncludes('package.json', '"release-b:test-durable-fulfilment": "node scripts/release-b-durable-fulfilment-tests.mjs"', 'package.json registers the Release B test script');

console.log('\nRelease B durable fulfilment static checks passed: additive-only migration, lease-based claim exclusivity, bounded retry with backoff, expired-lease recovery scoping, role-gated quality review with linked regeneration, admin recovery state validation, audit coverage, the atomic payment-to-job transaction boundary, worker route auth/no-PII discipline, and admin route role gating are all present in source. This script does not connect to a live Supabase project -- see the header comment for the 24 live-database checks performed manually this work cycle.');
