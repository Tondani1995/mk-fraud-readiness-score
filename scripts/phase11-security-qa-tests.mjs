import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const baseUrl = process.env.PHASE11_BASE_URL?.replace(/\/$/, '') ?? null;
const adminCookie = process.env.PHASE11_ADMIN_COOKIE ?? null;
const reportId = process.env.PHASE11_REPORT_ID ?? '00000000-0000-4000-8000-000000000000';
const orderReference = process.env.PHASE11_ORDER_REFERENCE ?? 'MKORD-PHASE11-AUTHCHECK';
const unpaidOrderReference = process.env.PHASE11_UNPAID_ORDER_REFERENCE ?? 'MKORD-PHASE11-UNPAID';

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function assertIncludes(file, needle, label) {
  assert(read(file).includes(needle), `${label}: expected ${file} to include ${needle}`);
}

function assertNotIncludes(file, needle, label) {
  assert(!read(file).includes(needle), `${label}: expected ${file} not to include ${needle}`);
}

function assertMatches(file, pattern, label) {
  assert(pattern.test(read(file)), `${label}: expected ${file} to match ${pattern}`);
}

function assertSourceOrder(file, firstNeedle, secondNeedle, label) {
  const source = read(file);
  const firstIndex = source.indexOf(firstNeedle);
  const secondIndex = source.indexOf(secondNeedle);
  assert(firstIndex >= 0, `${label}: expected ${file} to include ${firstNeedle}`);
  assert(secondIndex >= 0, `${label}: expected ${file} to include ${secondNeedle}`);
  assert(firstIndex < secondIndex, `${label}: ${firstNeedle} must appear before ${secondNeedle}`);
}

function textOnly(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const publicForbiddenTerms = [
  'D8-Q',
  'EXP-',
  'REC-',
  'hard-gate',
  'N/A rule',
  'Phase 9',
  'Phase 10',
  'Phase 11',
  'undefined',
  'NaN',
  'raw JSON',
  'peer average',
  'AI-generated'
];

function assertNoCustomerFacingLeakage(label, content) {
  const text = textOnly(content);
  for (const term of publicForbiddenTerms) {
    assert(!text.includes(term), `${label} leaked customer-facing forbidden term: ${term}`);
  }
  assert(!/at\s+[A-Za-z0-9_.$]+\s+\(.+:\d+:\d+\)/.test(text), `${label} appears to expose a stack trace.`);
}

function isDenied(response) {
  return response.status >= 300 && response.status < 400 || [401, 403, 404, 405].includes(response.status);
}

async function fetchPath(pathname, init = {}) {
  const headers = new Headers(init.headers ?? {});
  return fetch(`${baseUrl}${pathname}`, {
    ...init,
    headers,
    redirect: 'manual'
  });
}

function runStaticChecks() {
  assert(exists('src/app'), 'src/app must exist.');
  assert(exists('src/app/api'), 'src/app/api must exist.');
  assert(exists('src/lib/reports/premium-report-service.ts'), 'Shared premium report service must exist.');
  assert(exists('src/lib/reports/report-entitlement.ts'), 'Shared premium report entitlement guard must exist.');

  const packageJson = JSON.parse(read('package.json'));
  assert(String(packageJson.dependencies?.next ?? '').startsWith('^14.'), 'Next must remain on 14.x in the Phase 11 security patch.');
  assert(String(packageJson.devDependencies?.['eslint-config-next'] ?? '').startsWith('^14.'), 'eslint-config-next must remain on 14.x in the Phase 11 security patch.');
  assertIncludes('next.config.mjs', 'experimental', 'Next 14 config must keep experimental config block');
  assertIncludes('next.config.mjs', 'outputFileTracingIncludes', 'Next 14 config must keep experimental outputFileTracingIncludes');
  assertIncludes('src/lib/auth/session-cookies.ts', 'export function getAdminAccessTokenFromCookies(): string | null', 'Next 14 cookie helper must remain synchronous');

  const adminPages = [
    'src/app/admin/page.tsx',
    'src/app/admin/assessments/page.tsx',
    'src/app/admin/assessments/[assessmentRef]/page.tsx',
    'src/app/admin/audit-log/page.tsx',
    'src/app/admin/config/content/page.tsx',
    'src/app/admin/config/products/page.tsx',
    'src/app/admin/config/questions/page.tsx',
    'src/app/admin/methodology/page.tsx',
    'src/app/admin/orders/page.tsx',
    'src/app/admin/orders/[orderReference]/page.tsx',
    'src/app/admin/reports/page.tsx',
    'src/app/admin/settings/page.tsx'
  ];

  for (const file of adminPages) {
    const source = read(file);
    assert(source.includes('requireAdmin') || source.includes('ProtectedAdminPage'), `${file} must require admin access.`);
  }

  assertSourceOrder('src/app/admin/audit-log/page.tsx', 'const admin = await requireAdmin', 'await getAdminAuditLog', 'Audit log page must authenticate before reading audit events');
  assertSourceOrder('src/app/admin/config/content/page.tsx', 'const admin = await requireAdmin', 'await getAdminMethodologyConfig', 'Content config page must authenticate before reading methodology content');
  assertSourceOrder('src/app/admin/config/products/page.tsx', 'const admin = await requireAdmin', 'await getAdminProductConfig', 'Product config page must authenticate before reading commercial settings');
  assertSourceOrder('src/app/admin/config/questions/page.tsx', 'const admin = await requireAdmin', 'await getAdminMethodologyConfig', 'Question config page must authenticate before reading methodology config');
  assertSourceOrder('src/app/admin/orders/page.tsx', 'const admin = await requireAdmin', 'await getAdminOrderList', 'Order queue page must authenticate before reading orders');
  assertSourceOrder('src/app/admin/orders/[orderReference]/page.tsx', 'const admin = await requireAdmin', 'await getAdminOrderDetail', 'Order detail page must authenticate before reading order detail');
  assertSourceOrder('src/app/admin/reports/page.tsx', 'const admin = await requireAdmin', 'await getRecentReports', 'Reports page must authenticate before reading report versions');

  assertIncludes('src/lib/auth/admin-route.ts', 'getAdminAccessTokenFromCookies', 'Admin route helper reads the httpOnly admin session cookie');
  assertIncludes('src/lib/auth/admin-route.ts', ".eq('status', 'active')", 'Admin route helper requires active admin profile');

  const generateRoute = 'src/app/api/admin/orders/[orderReference]/generate-report/route.ts';
  const reportService = 'src/lib/reports/premium-report-service-core.ts';
  const entitlementGuard = 'src/lib/reports/report-entitlement.ts';
  const paymentRoute = 'src/app/admin/orders/[orderReference]/status/route.ts';

  assertIncludes(generateRoute, 'getAdminSession', 'Generate-report route must check admin session');
  assertIncludes(generateRoute, 'REPORT_GENERATION_ROLES', 'Generate-report route must use explicit roles');
  assertIncludes(generateRoute, 'generatePremiumReport', 'Generate-report route delegates to the shared service after authentication');
  assertSourceOrder(generateRoute, 'const admin = await getAdminSession()', 'await generatePremiumReport', 'Generate-report route must authenticate before calling shared generation service');
  assertIncludes(entitlementGuard, "PREMIUM_REPORT_ELIGIBLE_ORDER_STATUS = 'payment_received'", 'Report entitlement guard must require payment_received only');
  assertIncludes(entitlementGuard, 'ESSENTIAL_SELF_ASSESSMENT_PRICE_CENTS = 500000', 'Report entitlement guard must require the paid R5,000 product');
  assertIncludes(entitlementGuard, "ESSENTIAL_SELF_ASSESSMENT_PRODUCT_CODE = 'essential_self_assessment'", 'Report entitlement guard must require the essential self-assessment product');
  assertNotIncludes('src/lib/reports/assemble-report-data.ts', "'verified'", 'Legacy verified status must not be report-generation eligible');
  assertIncludes('src/app/admin/orders/[orderReference]/page.tsx', "order.status === 'payment_received'", 'Admin UI must show generation only for payment_received orders');

  assertIncludes(paymentRoute, 'updateAdminOrderStatus', 'Payment status route records the finance status transition');
  assertIncludes(paymentRoute, 'getPremiumReportAutomationFlags', 'Payment status route loads safe automation flags');
  assertIncludes(paymentRoute, 'flags.autoFulfilmentEnabled', 'Payment status route cannot queue fulfilment while automation is disabled');
  assertIncludes(paymentRoute, 'queuePremiumReportFulfilment', 'Later automatic fulfilment uses the idempotent queue');
  assertSourceOrder(paymentRoute, 'const result = await updateAdminOrderStatus', 'if (status === \'payment_received\')', 'Payment must be persisted before optional fulfilment queueing');
  assertNotIncludes(paymentRoute, 'renderHtmlToPdfBuffer', 'Marking payment received must never render a PDF inside the finance route.');
  assertNotIncludes(paymentRoute, 'generatePremiumReport(', 'Payment status route must queue rather than synchronously generate a report.');

  assertIncludes(reportService, 'assembleReportData', 'Shared service assembles persisted report evidence');
  assertIncludes(reportService, 'validatePremiumReportGenerationEntitlement', 'Shared service enforces the premium report entitlement guard');
  assertIncludes(reportService, 'renderHtmlToPdfBuffer', 'Shared service owns PDF rendering');
  assertIncludes(reportService, "'admin_terminal_phase14_generation_publication'", 'Shared service writes manual report and audit events in the atomic terminal transaction');
  assertIncludes(reportService, "'terminal_phase14_generation_publication'", 'Shared service writes worker report and audit events in the atomic terminal transaction');
  assertNotIncludes(reportService, "rpc('record_phase14_report_generated'", 'Shared service must not write terminal evidence after publication in a split transaction');
  assertNotIncludes(reportService, "from('report_events')", 'Shared service must not bypass the Phase 14 report-event state machine');
  assertNotIncludes(reportService, "from('audit_logs')", 'Shared service must not bypass the Phase 14 audit state machine');
  assertIncludes(reportService, 'readyForEmailDelivery: true', 'Shared service returns only after the terminal transaction reaches the controlled delivery-ready state');
  assertNotIncludes(reportService, 'resend.emails.send', 'Phase 14A shared service must not dispatch customer email.');
  assertNotIncludes(reportService, 'publicUrl', 'Shared service must not expose permanent public report URLs.');

  assertIncludes('src/app/api/admin/reports/[reportId]/download/route.ts', 'getAdminSession', 'Report download route must check admin session');
  assertIncludes('src/app/api/admin/reports/[reportId]/download/route.ts', 'REPORT_DOWNLOAD_ROLES', 'Report download route must use explicit roles');
  assertIncludes('src/app/api/admin/reports/[reportId]/download/route.ts', 'downloadPremiumReport', 'Report download route must use the shared entitlement and checksum service');
  assertIncludes('src/app/api/admin/reports/[reportId]/download/route.ts', 'Content-Disposition', 'Report download route must stream a controlled attachment');
  assertIncludes('src/app/api/admin/reports/[reportId]/download/route.ts', 'private, no-store', 'Report download response must not be cached');
  assertNotIncludes('src/app/api/admin/reports/[reportId]/download/route.ts', 'createSignedUrl', 'Report download route must not issue raw storage URLs');
  assertNotIncludes('src/app/api/admin/reports/[reportId]/download/route.ts', 'publicUrl', 'Report download route must not expose permanent public URLs');
  assertIncludes('supabase/migrations/0011_phase10_pdf_report_engine_additions.sql', "values ('generated-reports', 'generated-reports', false", 'Generated reports bucket must be private in migration');

  assertIncludes('src/app/snapshot/[assessmentRef]/page.tsx', 'validateSnapshotToken', 'Snapshot route must validate private snapshot token');
  assertIncludes('src/app/assessment/[assessmentRef]/result/page.tsx', 'Private snapshot link required', 'Legacy result route must not render snapshots by reference only');
  assertNotIncludes('src/app/assessment/[assessmentRef]/result/page.tsx', 'loadFreeSnapshotByReference', 'Legacy result route must not load snapshots without token validation');
  assertIncludes('src/app/api/assessments/[assessmentRef]/report-request/route.ts', 'validateSnapshotToken', 'Report request route must require snapshot token');
  assertIncludes('src/components/assessment/FreeSnapshot.tsx', 'snapshotTokenFromUrl', 'Snapshot client must send private snapshot token for report requests');

  assertMatches('src/components/assessment/FreeSnapshot.tsx', /Request detailed report|Continue to EFT instructions/, 'Free snapshot keeps a report request CTA');
  assertNoCustomerFacingLeakage('FreeSnapshot component', read('src/components/assessment/FreeSnapshot.tsx'));
  assertNoCustomerFacingLeakage('report request page', read('src/app/report/request/[assessmentRef]/page.tsx'));

  const reportTemplate = read('src/lib/reports/templates/report-template.ts');
  assert(!/\bD\d{1,2}-Q\d{2}\b|EXP-\d{2}|REC-\d{2}/.test(reportTemplate), 'Report template must not hard-code internal codes.');
  assert(!/Phase 9|Phase 10|Phase 11/.test(reportTemplate), 'Report template must not expose phase labels.');
  assert(!/peer average|AI-generated/i.test(reportTemplate), 'Report template must not claim unsupported benchmarks or label output as AI-generated.');

  assertIncludes('src/app/api/assessments/[assessmentRef]/report-request/route.ts', "from('audit_logs')", 'Report request route must audit customer report requests');
  assertIncludes('src/lib/orders/manual-eft-orders.ts', "from('order_events')", 'Order service must write order events');
  assertIncludes('src/lib/orders/manual-eft-orders.ts', "from('audit_logs')", 'Order service must write audit logs');
  assertIncludes(reportService, "'admin_terminal_phase14_generation_publication'", 'Shared report service must use the administrator terminal state machine');
  assertIncludes(reportService, "'terminal_phase14_generation_publication'", 'Shared report service must use the worker terminal state machine');
  assertNotIncludes(reportService, "rpc('record_phase14_report_generated'", 'Shared report service must not retain the legacy split event route');
  assertIncludes('src/app/api/admin/reports/[reportId]/download/route.ts', "rpc('record_phase14_report_download'", 'Report download route must record download_requested through the Phase 14 state machine');
}

async function runHttpChecks() {
  if (!baseUrl) {
    console.log('Phase 11 rendered-route checks skipped: set PHASE11_BASE_URL to test a running app or preview.');
    return;
  }

  const admin = await fetchPath('/score/admin');
  assert(isDenied(admin), `Logged-out /score/admin should be blocked or redirected; got ${admin.status}.`);

  const orderPage = await fetchPath(`/score/admin/orders/${unpaidOrderReference}`);
  assert(isDenied(orderPage), `Logged-out admin order page should be blocked or redirected; got ${orderPage.status}.`);

  const generate = await fetchPath(`/score/api/admin/orders/${unpaidOrderReference}/generate-report`, { method: 'POST' });
  assert(isDenied(generate), `Logged-out generate-report API should be blocked; got ${generate.status}.`);
  assertNoCustomerFacingLeakage('logged-out generate-report response', await generate.text());

  const download = await fetchPath(`/score/api/admin/reports/${reportId}/download`);
  assert(isDenied(download), `Logged-out report download API should be blocked; got ${download.status}.`);
  assertNoCustomerFacingLeakage('logged-out report download response', await download.text());

  const me = await fetchPath('/score/api/admin/me');
  assert(isDenied(me), `Logged-out admin profile API should be blocked; got ${me.status}.`);
  assertNoCustomerFacingLeakage('logged-out admin profile response', await me.text());

  for (const pathname of ['/score/start', `/score/report/request/${orderReference}`, `/score/assessment/${orderReference}/result`]) {
    const response = await fetchPath(pathname);
    assert(response.status < 500, `${pathname} should not return a server error; got ${response.status}.`);
    assertNoCustomerFacingLeakage(pathname, await response.text());
  }

  if (adminCookie && reportId) {
    const authed = await fetchPath(`/score/api/admin/reports/${reportId}/download`, {
      headers: { cookie: adminCookie }
    });
    assert(authed.status !== 401 && authed.status !== 403, `Authenticated report download should not be forbidden; got ${authed.status}.`);
  } else {
    console.log('Phase 11 authenticated admin checks skipped: set PHASE11_ADMIN_COOKIE and PHASE11_REPORT_ID.');
  }
}

runStaticChecks();
await runHttpChecks();

console.log('Phase 11 security/QA checks passed. Static access control, payment gating, feature-flagged queueing, private report storage, audit ownership, Next 14 boundary and optional logged-out route checks are covered.');
