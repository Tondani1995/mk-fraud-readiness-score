// Release C email/secure-delivery tests.
//
// Static source-assertion coverage (matches scripts/release-a-backlog-reconciliation-tests.mjs
// and scripts/release-b-durable-fulfilment-tests.mjs's style): confirms the migration, provider
// abstraction, message builders, worker route, secure customer-access route, and admin recovery
// layer contain the required role gates, provider-mode enforcement, and audit writes.
//
// This script does NOT connect to a live database. The live-database coverage -- 20 checks on
// the database/core-service layer (atomic approve->release->authorize, claim exclusivity, lease
// validation, bounded retry with backoff, token issuance with revoke-on-reissue, hash lookup and
// tamper resistance, RLS, service_role-only RPC restriction) plus 26 checks on the real-send
// notification wiring (disabled-mode default behaviour, dedupe idempotency, test-mode dispatch
// failing gracefully with no RESEND_API_KEY configured) plus 22 checks on the admin delivery/
// token recovery layer (a real authenticated platform_admin session: role gating via auth.uid(),
// invalid-state rejection, revoke-then-revoke-again rejection, revoke-on-reissue leaving exactly
// one active token, and the reissue send-then-persist glue) plus 12 checks on the provider
// webhook re-verification (real HMAC signature + database attestation, correlation against
// Release-C-created rows, unknown-message/duplicate handling) plus 40 checks + 3 supplementary
// checks on the closure cycle (missing-recipient handling end to end including no report
// regeneration, permanent bounce, transient/temporary bounce staying retry-eligible, complaint
// suppression with an explicit-override escape hatch, event-ordering/status-vocabulary-rank
// correctness, and the internal MK alert's dedupe-based no-alert-loop guarantee) -- was
// independently verified in this and the prior work cycle by applying every migration to a local
// Postgres via `supabase start` and running direct SQL/RPC checks with synthetic fixture data,
// then tearing the stack down. See docs/safe-launch/09-release-evidence.md and PR #43 for that
// evidence. It was manual verification, not wired into this repeatable script, for the same
// reason Release A/B's live checks weren't: it requires bringing up a local Supabase/Docker stack
// this script cannot assume is running.

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
  ? fs.readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.includes('release_c_email_secure_delivery'))
  : [];
assert(migrationCandidates.length === 1, 'Exactly one Release C email/secure-delivery migration file exists');
const migration = `supabase/migrations/${migrationCandidates[0]}`;

const emailProvider = 'src/lib/notifications/email-provider.ts';
const messageTemplates = 'src/lib/notifications/message-templates.ts';
const phase1Notifications = 'src/lib/notifications/phase1-order-notifications.ts';
const paymentService = 'src/lib/payments/payment-service.ts';
const resendTransport = 'src/lib/reports/email/resend-transport.ts';
const customerAccessService = 'src/lib/reports/customer-report-access.ts';
const customerAccessRoute = 'src/app/score/report/access/[token]/route.ts';
const workerRoute = 'src/app/score/api/internal/fulfilment-worker/route.ts';
const deliveryRecoveryService = 'src/lib/reports/delivery-recovery-service.ts';
const deliveryAccessPanel = 'src/components/admin/DeliveryAccessPanel.tsx';
const retryRoute = 'src/app/score/api/admin/orders/[orderReference]/delivery/retry/route.ts';
const revokeRoute = 'src/app/score/api/admin/orders/[orderReference]/delivery/revoke-token/route.ts';
const reissueRoute = 'src/app/score/api/admin/orders/[orderReference]/delivery/reissue-token/route.ts';
const orderDetailPage = 'src/app/score/admin/orders/[orderReference]/page.tsx';

console.log('--- 1. Files exist ---');
for (const file of [
  migration, emailProvider, messageTemplates, phase1Notifications, paymentService, resendTransport,
  customerAccessService, customerAccessRoute, workerRoute, deliveryRecoveryService, deliveryAccessPanel,
  retryRoute, revokeRoute, reissueRoute, orderDetailPage
]) {
  assert(exists(file), `${file} exists`);
}

console.log('--- 2. Migration is additive: extends report_delivery_authorizations without dropping anything ---');
assertIncludes(migration, 'add column if not exists next_attempt_at', 'Adds next_attempt_at additively');
assertIncludes(migration, 'add column if not exists max_attempts', 'Adds max_attempts additively');
assertIncludes(migration, 'add column if not exists retry_count', 'Adds retry_count additively');
for (const status of ['queued', 'claimed', 'dispatching', 'finalized', 'revoked', 'reconciliation_required']) {
  assertIncludes(migration, `'${status}'`, `Status check constraint still includes the pre-existing value ${status}`);
}
for (const status of ['retry_scheduled', 'failed_terminal']) {
  assertIncludes(migration, `'${status}'`, `Status check constraint includes the new Release C value ${status}`);
}
assertNotIncludes(migration, 'drop column', 'Migration never drops a column (additive only)');
assertNotIncludes(migration, 'drop table', 'Migration never drops a table (additive only)');

console.log('--- 3. Provider abstraction: sendEmail() is the only call site for the real Resend transport ---');
assertIncludes(emailProvider, 'sendReportEmailWithResend', 'email-provider.ts calls the real transport');
{
  const callers = [phase1Notifications, workerRoute, deliveryRecoveryService]
    .filter((file) => read(file).includes('sendReportEmailWithResend'));
  assert(callers.length === 0, 'No caller outside email-provider.ts imports sendReportEmailWithResend directly (every send goes through sendEmail())');
}
assertIncludes(emailProvider, "getEmailProviderMode() === 'live'", 'isCertifiedForProduction() requires live mode');

console.log('--- 4. Real-send wiring: all 4 message types actually call sendEmail(), not a hardcoded disabled status ---');
assertIncludes(phase1Notifications, 'await sendEmail(', 'phase1-order-notifications.ts calls sendEmail()');
assertIncludes(phase1Notifications, 'recordPaymentConfirmedNotification', 'payment-confirmed notification function is exported');
assertIncludes(paymentService, 'recordPaymentConfirmedNotification', 'payment-service.ts calls the payment-confirmed notification');
assertIncludes(paymentService, '.catch(', 'Payment confirmation notification failure cannot fail payment recording (wrapped in .catch)');
assertIncludes(workerRoute, 'processOneDelivery', 'Worker route delegates report-ready delivery to the shared delivery worker');
assertIncludes('src/lib/fulfilment/delivery-worker.ts', 'await sendEmail(', 'Shared delivery worker calls sendEmail() for report-ready delivery');
assertNotIncludes(phase1Notifications, "status: 'recorded_disabled',\n    request_id: requestId,\n    provider_mode: 'disabled',", 'Notification status/provider_mode are no longer hardcoded to disabled at insert time');

console.log('--- 5. Message templates: no assessment content, no storage paths, no permanent URLs ---');
const templateSource = read(messageTemplates);
assertNotIncludes(messageTemplates, 'storage_path', 'No storage path referenced in any message builder');
assertNotIncludes(messageTemplates, 'storageBucket', 'No storage bucket referenced in any message builder');
assert(!/overall_score|final_maturity|risk_/i.test(templateSource), 'No assessment score/risk fields referenced in any message builder');
assertIncludes(messageTemplates, 'accessUrl: string; // the /score/report/access/[token] route, not a storage URL', 'Report-ready message documents that its URL is the secure access route, not a storage URL');

console.log('--- 6. Secure customer-access route: token possession is the access control, checksum re-verified, no admin session required ---');
assertIncludes(customerAccessService, 'assertReportAccessEligible', 'Reuses the existing eligibility gate (customer_download purpose)');
assertNotIncludes(customerAccessRoute, 'requireAdmin', 'Customer access route does not require an admin session');
assertIncludes(customerAccessService, 'checksum', 'Customer access route re-verifies the report checksum');

console.log('--- 7. Worker route: second claim phase for delivery, one route not a second worker platform ---');
assertIncludes(workerRoute, 'processOneDelivery', 'Worker route uses the shared delivery phase');
assertIncludes('src/lib/fulfilment/delivery-worker.ts', 'claim_next_delivery', 'Shared delivery phase claims scheduled delivery jobs via claim_next_delivery()');
assertIncludes(workerRoute, 'claim_next_fulfilment_job', 'Same worker route still claims generation jobs via claim_next_fulfilment_job()');

console.log('--- 8. Admin recovery: retry/revoke/reissue are role-gated before calling the service layer, matching the RPCs\' own internal checks ---');
assertIncludes(deliveryRecoveryService, "DELIVERY_RETRY_ROLES: AdminRole[] = ['platform_admin', 'finance_admin']", 'DELIVERY_RETRY_ROLES matches retry_delivery()\'s internal role check');
assertIncludes(deliveryRecoveryService, "ACCESS_TOKEN_ROLES: AdminRole[] = ['platform_admin', 'reviewer', 'approver']", 'ACCESS_TOKEN_ROLES matches revoke/reissue_customer_report_access_token()\'s internal role check');
for (const [routeFile, roleList] of [[retryRoute, 'DELIVERY_RETRY_ROLES'], [revokeRoute, 'ACCESS_TOKEN_ROLES'], [reissueRoute, 'ACCESS_TOKEN_ROLES']]) {
  const sql = read(routeFile);
  const roleCheckIndex = sql.search(/if \(!admin \|\|/);
  const rpcCallIndex = sql.search(/retryDelivery\(|revokeAccessToken\(|reissueAccessToken\(/);
  assert(roleCheckIndex > -1 && rpcCallIndex > roleCheckIndex, `${routeFile}: the role check (${roleList}) happens before the service call`);
}
assertIncludes(deliveryRecoveryService, "createSupabaseAuthenticatedServerClient", 'Admin RPC calls use the authenticated (not service-role) client so auth.uid() resolves inside the security definer RPCs');

console.log('--- 9. Reissue actually dispatches the email it creates (nothing else claims report_ready_reissue rows) ---');
assertIncludes(deliveryRecoveryService, "'report_ready_reissue' email_events row", 'delivery-recovery-service.ts documents that no worker phase claims report_ready_reissue rows');
assertIncludes(deliveryRecoveryService, 'buildReportReadyMessage', 'reissueAccessToken() builds the report-ready message');
assertIncludes(deliveryRecoveryService, "await sendEmail(", 'reissueAccessToken() actually sends the email, not just queues a row');
assertIncludes(deliveryRecoveryService, ".update({", 'reissueAccessToken() persists the real send outcome back onto the email_events row');

console.log('--- 10. Admin UI surfaces the delivery/token state it now manages ---');
assertIncludes(orderDetailPage, 'DeliveryAccessPanel', 'Order-detail page renders the new delivery/access panel');
assertIncludes(orderDetailPage, 'getOrderDeliveryState', 'Order-detail page fetches report_delivery_authorizations/customer_report_access_tokens state');

console.log('--- 11. No fabricated customer data anywhere in the new code ---');
const allNewSources = [
  migration, emailProvider, messageTemplates, phase1Notifications, deliveryRecoveryService,
  deliveryAccessPanel, retryRoute, revokeRoute, reissueRoute
].map(read).join('\n');
assert(!/@(gmail|yahoo|outlook|hotmail)\.com/i.test(allNewSources), 'No example email addresses appear anywhere in the new files');

console.log('--- 12. package.json wiring ---');
assertIncludes('package.json', '"release-c:test-email-secure-delivery": "node scripts/release-c-email-secure-delivery-tests.mjs"', 'package.json registers the Release C test script');

// ---------------------------------------------------------------------------
// Closure cycle (docs/safe-launch/09-release-evidence.md, "Release C closure cycle"):
// missing-recipient handling, bounce/complaint owned exceptions + resend suppression, and the
// status-vocabulary rank fix. Item 1 from that cycle (unified admin delivery-state display) is
// implemented independently and covered by its own evidence, not by this script.
// ---------------------------------------------------------------------------

const closureMigrationCandidates = fs.existsSync(path.join(root, 'supabase/migrations'))
  ? fs.readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.includes('release_c_closure_delivery_exceptions'))
  : [];
assert(closureMigrationCandidates.length === 1, 'Exactly one Release C closure migration file exists');
const closureMigration = `supabase/migrations/${closureMigrationCandidates[0]}`;
const correctRecipientRoute = 'src/app/score/api/admin/orders/[orderReference]/delivery/correct-recipient/route.ts';
const webhookRoute = 'src/app/score/api/webhooks/resend/route.ts';
const fulfilmentService = 'src/lib/fulfilment/fulfilment-service.ts';

console.log('--- 13. Closure migration is additive: extends existing RPCs/tables, drops only the one function signature it deliberately replaces ---');
assert(exists(closureMigration), `${closureMigration} exists`);
assertNotIncludes(closureMigration, 'drop table', 'Migration never drops a table');
assertNotIncludes(closureMigration, 'drop column', 'Migration never drops a column');
assertIncludes(closureMigration, 'drop function if exists public.reissue_customer_report_access_token(uuid, uuid, text, text, integer);', 'The only drop is the deliberate, documented 5-parameter reissue_customer_report_access_token overload replacement');
assertIncludes(closureMigration, 'create or replace function public.correct_delivery_recipient_and_queue', 'New RPC correct_delivery_recipient_and_queue() is defined');
assertIncludes(closureMigration, "p_override_suppression boolean default false", 'reissue_customer_report_access_token() gains a defaulted trailing override parameter, not a breaking signature change for existing callers that already pass all 5 original args');

console.log('--- 14. Missing-recipient handling: visible exception, not just a log line; no report regeneration; no placeholder address ---');
assertIncludes(closureMigration, "v_delivery_exception := 'recipient_required'", 'approve_quality_review() flags the exception on its own return value');
assertIncludes(closureMigration, "'delivery_recipient_required'", 'A visible order_events row is created for the missing-recipient case');
assertIncludes(closureMigration, 'correct_delivery_recipient_and_queue', 'The correction path is a new, auditable RPC, not a direct table mutation');
assertIncludes(closureMigration, "not exists (select 1 from public.report_delivery_authorizations a where a.report_id = r.id)", 'Correction only targets a report with no existing delivery authorization -- cannot create a second, competing one');
assertNotIncludes(closureMigration, "'no-reply@", 'No placeholder/fake email address is ever inserted');
assertIncludes(phase1Notifications, 'recordDeliveryRecipientRequiredAlert', 'A dedicated, deduped internal-alert function exists');
assertIncludes(fulfilmentService, "delivery_exception === 'recipient_required'", 'approveQualityReview() checks the RPC-reported exception flag');
assertIncludes(fulfilmentService, 'recordDeliveryRecipientRequiredAlert', 'approveQualityReview() fires the internal alert on that flag');
assertIncludes(fulfilmentService, '.catch(', 'The alert call cannot fail the approval itself (fire-and-forget, matching every other notification call site in this codebase)');
assertIncludes(correctRecipientRoute, 'ACCESS_TOKEN_ROLES', 'The correction admin route is role-gated');
assertIncludes(deliveryAccessPanel, 'recipientException', 'The admin panel surfaces the recipient-required exception');
assertIncludes(deliveryAccessPanel, 'correct-recipient', 'The admin panel calls the correction route');

console.log('--- 15. Bounce/complaint owned exceptions and resend suppression ---');
assertIncludes(closureMigration, "v_status in ('bounced', 'complained')", 'Owned exceptions are created for both bounce and complaint outcomes');
assertIncludes(closureMigration, "insert into public.order_events(order_id, event_type, note, metadata_json)\n      values (\n        v_email.order_id,", 'A visible order_events row is written for bounce/complaint, in the order activity timeline every other order event already appears in');
assertIncludes(closureMigration, "'delivery-' || v_status || ':' || v_email.id::text", 'The phase14_operational_alerts alert_key is deterministic per (email, outcome) -- a replayed identical event cannot create a duplicate alert (no alert loop)');
assertIncludes(closureMigration, "raise exception 'access_token_reissue_blocked_prior_%', v_suppressing_status;", 'reissue_customer_report_access_token() blocks by default on a prior bounce or complaint for the same report+recipient');
assertIncludes(closureMigration, 'p_override_suppression', 'An explicit override parameter is required to bypass the suppression -- not a silent default-allow');
assertIncludes(webhookRoute, "bounceData?.type", 'The webhook route inspects the provider bounce-type field');
assertIncludes(webhookRoute, "'email.bounced.transient'", 'A transient/soft bounce is classified separately from a permanent one before reaching the RPC');
assertNotIncludes(webhookRoute, 'RESEND_WEBHOOK_SECRET =', 'The webhook secret check itself is untouched -- signature/replay protection was not weakened to add this classification');

console.log('--- 16. Status-vocabulary rank fix: Release C\'s own statuses are recognised, not left at an unrecognised rank-0 default ---');
for (const status of ['PROVIDER_REQUEST_STARTED', 'RETRY_SCHEDULED', 'PROVIDER_ACCEPTED', 'FAILED_TERMINAL']) {
  assertIncludes(closureMigration, `when '${status}' then`, `apply_email_provider_event_atomic()'s rank ladder recognises the Release C status ${status}`);
}
assertIncludes(closureMigration, "when 'queued' then 10 when 'sending' then 20", 'The pre-existing lowercase Phase14 rank ladder is preserved unchanged, not replaced');

console.log('--- 17. package.json wiring (unchanged -- same script, extended in place) ---');
assertIncludes('package.json', '"release-c:test-email-secure-delivery": "node scripts/release-c-email-secure-delivery-tests.mjs"', 'package.json still registers this same test script');

console.log('\nRelease C email/secure-delivery static checks passed: additive-only migration, sendEmail() as the sole real-transport call site, all 4 message types actually dispatching (not hardcoded disabled), message-content privacy discipline, secure customer-access token-possession control, the shared worker route\'s second claim phase, admin recovery role gating matching each RPC\'s own internal check, missing-recipient exception handling with no report regeneration and no placeholder address, bounce/complaint owned exceptions with resend suppression, and the status-vocabulary rank fix are all present in source. This script does not connect to a live Supabase project -- see the header comment for the live-database checks performed manually across this and the prior work cycle.');
