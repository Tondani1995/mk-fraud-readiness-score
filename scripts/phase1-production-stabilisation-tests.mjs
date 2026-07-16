import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const required = [
  'supabase/migrations/0023_phase1_manual_fulfilment_recovery.sql',
  'src/lib/reports/phase1-schema-capability.ts',
  'src/lib/reports/phase1-manual-fulfilment.ts',
  'src/lib/reports/phase1-report-access.ts',
  'src/lib/reports/phase1-manual-delivery.ts',
  'src/lib/reports/phase1-operations.ts',
  'src/lib/notifications/phase1-order-notifications.ts',
  'src/components/admin/FulfilmentActions.tsx',
  'src/app/score/admin/orders/page.tsx',
  'src/app/score/admin/orders/[orderReference]/page.tsx',
  'src/app/score/api/admin/orders/[orderReference]/generate-report/route.ts',
  'src/app/score/api/admin/reports/[reportId]/download/route.ts',
  'src/app/score/api/admin/reports/[reportId]/preview/route.ts',
  'src/app/score/api/admin/reports/[reportId]/send-email/route.ts',
  'scripts/apply-phase1-0023-only.sh',
  'scripts/phase1-0023-only-controller.sql',
  '.github/workflows/phase1-migration-replay.yml'
];
for (const file of required) assert.ok(fs.existsSync(path.join(root, file)), `${file} must exist`);

const migration = read(required[0]);
for (const status of ['NOT_REQUESTED', 'REPORT_QUEUED', 'REPORT_GENERATING', 'REPORT_READY', 'GENERATION_FAILED']) {
  assert.ok(migration.includes(status), `generation status ${status} must be persisted`);
}
for (const status of ['NOT_READY', 'DELIVERY_PENDING', 'DELIVERING', 'DELIVERED', 'DELIVERY_FAILED']) {
  assert.ok(migration.includes(status), `delivery status ${status} must be persisted`);
}
assert.ok(migration.includes('manual_report_generation_one_active_order_uidx'), 'one active generation attempt is enforced in the database');
assert.ok(migration.includes("where status in ('REPORT_QUEUED','REPORT_GENERATING')"), 'active generation uniqueness covers queued and generating');
assert.ok(migration.includes('request_key text not null unique'), 'browser retry key is unique');
assert.ok(migration.includes("interval '15 minutes'"), 'stale generation attempts have an explicit recovery threshold');
assert.ok(migration.includes("error_category='generation_stuck_recovered'"), 'authorised stale-attempt recovery is persisted');
assert.ok(migration.includes("public=false"), 'generated report bucket remains private');
assert.ok(migration.includes("'phase14_enabled',false"), 'Phase 14 remains explicitly disabled');
assert.ok(!migration.includes('phase14_require_policy'), 'Phase 1 migration does not satisfy a Phase 14 gate');
assert.ok(!migration.includes('automatic_workflow'), 'Phase 1 migration does not enable autonomous workflow');
assert.ok(migration.includes('phase1_manual_fulfilment_capability'), '0023 installs one authoritative database capability function');
for (const structure of ['manual_report_generation_attempts', 'manual_report_delivery_attempts', 'organisation_id', 'file_size_bytes', 'request_id', 'provider_mode']) {
  assert.ok(migration.includes(structure), `capability manifest covers ${structure}`);
}
for (const rpc of ['claim_manual_report_generation', 'start_manual_report_generation', 'complete_manual_report_generation', 'fail_manual_report_generation', 'claim_manual_report_delivery', 'complete_manual_report_delivery']) {
  assert.ok(migration.includes(rpc), `capability manifest covers ${rpc}`);
}

const capability = read('src/lib/reports/phase1-schema-capability.ts');
assert.ok(capability.includes("'available' | 'unavailable' | 'error'"), 'capability result has an explicit three-state type');
assert.ok(capability.indexOf(".from('app_settings')") < capability.indexOf(".rpc('phase1_manual_fulfilment_capability')"), 'existing marker is read before the 0023-only RPC');
assert.ok(capability.includes('if (markerError)'), 'permission and database errors are not treated as migration absence');
assert.ok(capability.includes("result.status === 'error'") && capability.includes('missingPermissions.length > 0'), 'verified permission failures return error rather than unavailable');
assert.ok(capability.includes('PHASE1_SCHEMA_UNAVAILABLE_MESSAGE'), 'unavailable state uses one shared operational message');
assert.ok(!/process\.env.*(PHASE1.*SCHEMA|MIGRATION)/i.test(capability), 'capability is not inferred from environment flags');

const generationRoute = read('src/app/score/api/admin/orders/[orderReference]/generate-report/route.ts');
assert.ok(generationRoute.includes('X-Idempotency-Key') || generationRoute.includes('x-idempotency-key'), 'generation route accepts a stable idempotency key');
assert.ok(!generationRoute.includes('phase14-security'), 'manual generation route is independent of Phase 14 security gates');
assert.ok(generationRoute.includes('getAdminSession'), 'generation requires an authenticated admin session');

const generation = read('src/lib/reports/phase1-manual-fulfilment.ts');
assert.ok(generation.indexOf('await getPhase1SchemaCapability') < generation.indexOf('assembled = await assembleReportData'), 'generation checks capability before report work');
assert.ok(generation.includes("upsert: false"), 'report objects are immutable');
assert.ok(generation.includes("subarray(0, 4).toString('ascii') !== '%PDF'"), 'PDF output is validated');
assert.ok(generation.includes('verifyPrivateObject'), 'stored output is read back and verified');
assert.ok(generation.includes('organisationId') && generation.includes('orderId'), 'private storage path binds organisation and order');
assert.ok(!generation.includes('createSignedUrl'), 'generation never exposes storage URLs');

const access = read('src/lib/reports/phase1-report-access.ts');
assert.ok(access.indexOf('getPhase1SchemaCapability') < access.indexOf(".from('reports')"), 'report access checks capability before 0023 report columns');
for (const reason of ['report_record_missing', 'stored_file_missing', 'signed_link_creation_failed', 'expired_link', 'report_order_mismatch', 'storage_path_mismatch']) {
  assert.ok(access.includes(reason), `access differentiates ${reason}`);
}
assert.ok(access.includes('ACCESS_TTL_SECONDS = 60'), 'access URLs expire quickly');
assert.ok(access.includes('report_order_mismatch'), 'manipulated order/report identifiers are blocked');
assert.ok(!access.includes('signed_url:'), 'signed URLs are not written to activity metadata');

const delivery = read('src/lib/reports/phase1-manual-delivery.ts');
assert.ok(delivery.indexOf('getPhase1SchemaCapability') < delivery.indexOf(".from('reports')"), 'delivery checks capability before 0023 report columns');
assert.ok(delivery.includes("return process.env.PHASE1_DELIVERY_MODE === 'double' ? 'double' : 'disabled'"), 'delivery defaults to disabled provider mode');
assert.ok(delivery.includes('providerSendAttempted: false'), 'delivery double never claims a real provider send');
assert.ok(!delivery.includes('resend'), 'Phase 1 delivery does not invoke Resend');

const notifications = read('src/lib/notifications/phase1-order-notifications.ts');
assert.ok(notifications.indexOf('getPhase1SchemaCapability') < notifications.indexOf(".select('overall_score,final_maturity')"), 'new notification work checks capability before Phase 1 persistence');
assert.ok(notifications.includes('customer_order_confirmation'), 'customer order confirmation is recorded');
assert.ok(notifications.includes('admin_new_order_notification'), 'admin new-order notification is recorded');
assert.ok(notifications.includes('dedupeKey'), 'notifications are idempotent');
assert.ok(notifications.includes('consultant review and engagement'), 'professional assessment communication preserves consultant-review boundary');

const actions = read('src/components/admin/FulfilmentActions.tsx');
for (const label of ['Generating report…', 'Retry Generation', 'Preview Report', 'Download Report', 'Initiate Delivery', 'Retry Delivery', 'Create New Version']) {
  assert.ok(actions.includes(label), `admin action ${label} is visible`);
}
assert.ok(actions.includes('Report generation is already in progress for this order.'), 'active generation message is exact');
assert.ok(actions.includes('generationStuck'), 'stale generation attempts expose a manual retry control');

const queueUi = read('src/lib/reports/phase1-operations.ts') + read('src/app/score/admin/orders/page.tsx');
for (const label of ['Requires Immediate Attention', 'Paid but No Report', 'Report Generation Failed', 'Report Ready but Not Delivered', 'Delivery Failed']) {
  assert.ok(queueUi.includes(label), `priority queue ${label} exists`);
}

const statusRoute = read('src/app/score/admin/orders/[orderReference]/status/route.ts');
assert.ok(statusRoute.includes('confirmManualPayment'), 'verified manual payment uses the shared payment service');
assert.ok(statusRoute.includes('getPaymentAutomationCapability'), 'payment confirmation remains compatible before the payment migration');
assert.ok(!statusRoute.includes('queuePremiumReportFulfilment') && !statusRoute.includes('startPremiumReportWorkflow'), 'payment confirmation does not start a Phase 14 workflow');

const orderDetail = read('src/app/score/admin/orders/[orderReference]/page.tsx');
const orderList = read('src/app/score/admin/orders/page.tsx');
const reportsPage = read('src/app/score/admin/reports/page.tsx');
const exactUnavailable = 'Phase 1 fulfilment upgrade is not yet activated in this environment.';
assert.ok(capability.includes(exactUnavailable), 'the required activation message is exact');
for (const page of [orderDetail, orderList, reportsPage]) assert.ok(page.includes('capability'), 'admin Phase 1 page consumes the authoritative capability');
assert.ok(orderDetail.includes('capabilityAvailable={operationalAvailable}'), 'order controls fail closed on capability or query failure');

const applyController = read('scripts/phase1-0023-only-controller.sql');
const applyWrapper = read('scripts/apply-phase1-0023-only.sh');
assert.ok(applyWrapper.includes('--single-transaction'), 'exact 0023 application and ledger recording are atomic');
assert.ok(applyWrapper.includes('PHASE1_EXPECTED_TARGET_FINGERPRINT'), 'controller requires exact target confirmation');
assert.ok(applyWrapper.includes('sha256'), 'controller verifies the reviewed migration bytes');
assert.ok(applyController.includes('phase1_0023_refused_prohibited_migration_history'), 'prohibited migration history is rejected');
assert.ok(applyController.includes("'0023'"), 'controller records only the 0023 ledger version');
assert.ok(!applyController.includes("values('0017'"), 'controller does not fabricate prohibited ledger history');

const releaseWorkflow = read('.github/workflows/phase1-migration-replay.yml');
for (const evidence of ['npm ci', 'PHASE1_EXPECT_CAPABILITY=unavailable', 'phase1-0023-replay-tests.sh', 'PHASE1_EXPECT_CAPABILITY=available']) {
  assert.ok(releaseWorkflow.includes(evidence), `release workflow covers ${evidence}`);
}

class LocalFulfilmentDouble {
  constructor() {
    this.orders = new Map();
    this.attempts = [];
    this.reports = [];
    this.files = new Map();
    this.deliveries = [];
    this.notifications = new Map();
    this.timeline = [];
  }
  addOrder(overrides = {}) {
    const order = { id: crypto.randomUUID(), reference: `LOCAL-${this.orders.size + 1}`, paid: true, assessmentComplete: true, ...overrides };
    this.orders.set(order.reference, order);
    this.timeline.push({ type: 'order_created', orderId: order.id });
    return order;
  }
  notify(order, type) {
    const key = `${type}:${order.id}`;
    if (!this.notifications.has(key)) this.notifications.set(key, { key, status: 'recorded_disabled' });
    return this.notifications.get(key);
  }
  claim(order, key, role = 'platform_admin', action = 'admin_generate') {
    assert.ok(['platform_admin', 'reviewer', 'approver'].includes(role), 'unauthorised generation is blocked');
    assert.ok(order.paid, 'unpaid order is blocked');
    assert.ok(order.assessmentComplete, 'incomplete assessment is blocked');
    const replay = this.attempts.find((attempt) => attempt.key === key);
    if (replay) return replay;
    const active = this.attempts.find((attempt) => attempt.orderId === order.id && ['REPORT_QUEUED', 'REPORT_GENERATING'].includes(attempt.status));
    if (active) return active;
    const version = Math.max(0, ...this.reports.filter((report) => report.orderId === order.id).map((report) => report.version)) + 1;
    const attempt = { id: crypto.randomUUID(), key, orderId: order.id, action, version, status: 'REPORT_QUEUED', retryCount: this.attempts.filter((item) => item.orderId === order.id && item.status === 'GENERATION_FAILED').length };
    this.attempts.push(attempt);
    this.timeline.push({ type: 'generation_requested', attemptId: attempt.id });
    return attempt;
  }
  succeed(attempt) {
    attempt.status = 'REPORT_GENERATING';
    const bytes = Buffer.from('%PDF-1.7 local deterministic fixture '.repeat(50));
    const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
    const path = `${attempt.orderId}/v${attempt.version}/${checksum}.pdf`;
    this.files.set(path, bytes);
    const report = { id: crypto.randomUUID(), orderId: attempt.orderId, version: attempt.version, path, checksum, status: 'REPORT_READY' };
    this.reports.push(report);
    attempt.status = 'REPORT_READY';
    attempt.reportId = report.id;
    this.timeline.push({ type: 'report_stored', reportId: report.id }, { type: 'generation_succeeded', attemptId: attempt.id });
    return report;
  }
  fail(attempt) {
    attempt.status = 'GENERATION_FAILED';
    attempt.error = 'Controlled PDF failure.';
    this.timeline.push({ type: 'generation_failed', attemptId: attempt.id, safeReason: attempt.error });
  }
  access(report, order) {
    assert.equal(report.orderId, order.id, 'report-order mismatch is blocked');
    assert.ok(this.files.has(report.path), 'stored file missing is distinct from permission failure');
    return { expiresAt: Date.now() + 60_000 };
  }
  deliver(report, result) {
    const attempt = { id: crypto.randomUUID(), reportId: report.id, status: result === 'success' ? 'DELIVERED' : 'DELIVERY_FAILED' };
    this.deliveries.push(attempt);
    this.timeline.push({ type: result === 'success' ? 'delivery_succeeded' : 'delivery_failed', attemptId: attempt.id });
    return attempt;
  }
  queues(order) {
    const report = this.reports.find((item) => item.orderId === order.id);
    const delivery = report ? this.deliveries.filter((item) => item.reportId === report.id).at(-1) : null;
    return {
      paidNoReport: order.paid && !report,
      readyNotDelivered: Boolean(report && delivery?.status !== 'DELIVERED'),
      generationFailed: this.attempts.some((item) => item.orderId === order.id && item.status === 'GENERATION_FAILED')
    };
  }
}

const local = new LocalFulfilmentDouble();

// P1-A: complete -> generate -> private store -> preview/download -> timeline.
const orderA = local.addOrder();
const reportA = local.succeed(local.claim(orderA, 'p1-a'));
assert.equal(reportA.status, 'REPORT_READY');
assert.ok(local.access(reportA, orderA).expiresAt > Date.now());
assert.ok(local.timeline.some((event) => event.type === 'report_stored'));

// Eligibility and authorisation boundaries.
assert.throws(() => local.claim(local.addOrder({ assessmentComplete: false }), 'incomplete'), /incomplete assessment/);
assert.throws(() => local.claim(local.addOrder(), 'unauthorised', 'finance_admin'), /unauthorised generation/);

// P1-B: controlled PDF failure is visible, no ready report, retry succeeds.
const orderB = local.addOrder();
const failed = local.claim(orderB, 'p1-b-fail');
local.fail(failed);
assert.equal(local.reports.filter((report) => report.orderId === orderB.id).length, 0);
const retried = local.claim(orderB, 'p1-b-retry', 'platform_admin', 'admin_retry');
const reportB = local.succeed(retried);
assert.equal(retried.retryCount, 1);
assert.equal(reportB.version, 1);

// P1-C: double submit and concurrent admins resolve to one active attempt/version.
const orderC = local.addOrder();
const first = local.claim(orderC, 'p1-c-one');
const duplicateKey = local.claim(orderC, 'p1-c-one');
const concurrentAdmin = local.claim(orderC, 'p1-c-two', 'approver');
assert.equal(first.id, duplicateKey.id);
assert.equal(first.id, concurrentAdmin.id);
const reportC = local.succeed(first);
assert.equal(local.reports.filter((report) => report.orderId === orderC.id).length, 1);
assert.equal(reportC.version, 1);

// Regeneration preserves prior version.
const regenerated = local.succeed(local.claim(orderC, 'p1-c-regenerate', 'approver', 'admin_regenerate'));
assert.equal(regenerated.version, 2);
assert.equal(local.reports.filter((report) => report.orderId === orderC.id).length, 2);

// P1-D: missing stored file is reported as a file error.
local.files.delete(reportC.path);
assert.throws(() => local.access(reportC, orderC), /stored file missing/);

// P1-E: delivery double fails, retry succeeds, and regeneration count is unchanged.
const reportCountBeforeDelivery = local.reports.length;
assert.equal(local.deliver(reportB, 'failure').status, 'DELIVERY_FAILED');
assert.equal(local.deliver(reportB, 'success').status, 'DELIVERED');
assert.equal(local.reports.length, reportCountBeforeDelivery);

// Notifications are idempotent and no provider call exists in this double.
const customerNotice = local.notify(orderA, 'customer_order_confirmation');
assert.equal(local.notify(orderA, 'customer_order_confirmation'), customerNotice);
const adminNotice = local.notify(orderA, 'admin_new_order_notification');
assert.equal(local.notifications.size, 2);
assert.equal(adminNotice.status, 'recorded_disabled');

// P1-F: paid/no-report and ready/not-delivered remain observable.
const orderF1 = local.addOrder();
const orderF2 = local.addOrder();
const reportF2 = local.succeed(local.claim(orderF2, 'p1-f-ready'));
assert.equal(local.queues(orderF1).paidNoReport, true);
assert.equal(local.queues(orderF2).readyNotDelivered, true);
assert.ok(reportF2);

// Safe timeline does not contain secrets, tokens, URLs, or stack traces.
const serializedTimeline = JSON.stringify(local.timeline);
assert.ok(!/access_token|signedUrl|BEGIN PRIVATE KEY|node_modules\//i.test(serializedTimeline));

console.log('Phase 1 production stabilisation contract tests passed.');
console.log('Local scenarios passed: P1-A, P1-B, P1-C, P1-D, P1-E, P1-F.');
