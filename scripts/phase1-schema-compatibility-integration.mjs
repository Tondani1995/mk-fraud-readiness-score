import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const baseUrl = (process.env.LOCAL_INTEGRATION_BASE_URL ?? '').replace(/\/$/, '');
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const expected = process.env.PHASE1_EXPECT_CAPABILITY;
const unavailableMessage = 'Phase 1 fulfilment upgrade is not yet activated in this environment.';

for (const [label, value] of Object.entries({ baseUrl, supabaseUrl, serviceRoleKey, expected })) {
  assert.ok(value, `${label} is required.`);
}
for (const value of [baseUrl, supabaseUrl]) {
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(new URL(value).hostname), 'Integration targets must be loopback-only.');
}
assert.ok(['unavailable', 'available'].includes(expected), 'PHASE1_EXPECT_CAPABILITY must be unavailable or available.');

const service = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

async function response(path, init) {
  return fetch(`${baseUrl}${path}`, { redirect: 'manual', ...init });
}

async function json(path, init, expectedStatus = 200) {
  const result = await response(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) }
  });
  const body = await result.json().catch(() => ({}));
  assert.equal(result.status, expectedStatus, `${path} returned ${result.status}: ${JSON.stringify(body)}`);
  return { result, body };
}

async function createCompletedAssessment(fixture = 'unavailable') {
  assert.ok(['unavailable', 'violating', 'passing'].includes(fixture));
  const fixtureLabel = fixture === 'unavailable' ? 'compatibility' : fixture;
  const { body: started } = await json('/score/api/assessments/start', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Phase 1 Compatibility Test',
      email: `phase1-${fixtureLabel}-${nonce}@example.test`,
      roleTitle: 'Release verification',
      organisationName: `Phase 1 ${fixtureLabel} ${nonce}`,
      industry: 'Testing',
      province: 'Gauteng',
      employeeBand: '11-50',
      annualRevenueBand: 'R10m-R50m',
      consentPrivacy: true,
      consentResearch: false
    })
  }, 201);
  const assessmentId = started.data.assessmentId;
  const assessmentReference = started.data.assessmentReference;
  const token = new URL(started.data.resumeUrl).searchParams.get('token');
  assert.ok(assessmentId && assessmentReference && token);

  const { data: assessment, error: assessmentError } = await service.from('assessments')
    .select('methodology_version_id,organisation_id,primary_respondent_id,current_score_run_id').eq('id', assessmentId).single();
  assert.ifError(assessmentError);

  if (expected === 'available') {
    const [{ data: questions, error: questionError }, { data: factors, error: factorError }] = await Promise.all([
      service.from('questions').select('id,question_code').eq('methodology_version_id', assessment.methodology_version_id).eq('active', true).order('sort_order'),
      service.from('exposure_factors').select('id,options_json').eq('methodology_version_id', assessment.methodology_version_id).order('sort_order')
    ]);
    assert.ifError(questionError);
    assert.ifError(factorError);
    // These are deliberately opposite commercial-quality fixtures. The thin fixture records a
    // fully-in-place response for every question and no exposure, so it has no material evidence
    // to link to the mandatory scenarios and must fail closed. The passing fixture records genuine
    // control gaps and the highest disposable-test exposure option so the real scenario builders,
    // rendered content and rendered roadmap all have assessment evidence to work from. Checkpoint C
    // makes exact question playbooks mandatory for every material finding, so this fixture fails
    // the eight specifically covered controls and records all other controls as consistently
    // operating. It must not fabricate 50+ unsupported absent-control findings merely to make the
    // old broad fixture pass.
    const checkpointCPlaybookQuestions = new Set([
      'D1-Q04', 'D3-Q04', 'D5-Q01', 'D5-Q05', 'D6-Q01', 'D7-Q01', 'D7-Q04', 'D8-Q04'
    ]);
    const answers = questions.map((question) => ({
      questionId: question.id,
      responseValue: fixture === 'passing' && checkpointCPlaybookQuestions.has(question.question_code) ? 0 : 4,
      isNotApplicable: false,
      nAReason: ''
    }));
    const exposureAnswers = factors.map((factor) => {
      const options = factor.options_json.options;
      const option = fixture === 'passing' ? options[options.length - 1] : options[0];
      return { exposureFactorId: factor.id, selectedValue: option.value, selectedLabel: option.label, pointsAwarded: Number(option.points) };
    });
    await json(`/score/api/assessments/${assessmentReference}/answers`, {
      method: 'POST', body: JSON.stringify({ token, answers, exposureAnswers })
    });
    const { body: submitted } = await json(`/score/api/assessments/${assessmentReference}/submit`, {
      method: 'POST', body: JSON.stringify({ token })
    });
    assert.equal(submitted.status, 'scored');
    const { data: scored, error: scoredError } = await service.from('assessments')
      .select('current_score_run_id').eq('id', assessmentId).single();
    assert.ifError(scoredError);
    assessment.current_score_run_id = scored.current_score_run_id;
    assert.ok(assessment.current_score_run_id);
  }

  return { id: assessmentId, reference: assessmentReference, fixture, ...assessment };
}

async function createAdmin() {
  const email = `phase1-admin-${nonce}@example.test`;
  const password = `Release-${nonce}-A9!`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(error);
  const { error: profileError } = await service.from('admin_profiles').insert({
    id: data.user.id,
    email,
    full_name: 'Phase 1 Release Test',
    role: 'platform_admin',
    status: 'active'
  });
  assert.ifError(profileError);
  const login = await json('/score/api/admin/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  assert.equal(login.body.ok, true);
  const cookie = login.result.headers.getSetCookie().map((value) => value.split(';', 1)[0]).join('; ');
  assert.match(cookie, /mk_admin_access_token=/);
  return { id: data.user.id, cookie };
}

async function createOrder(assessment, admin, product) {
  const orderReference = `MKORD-PHASE1-${assessment.fixture}-${nonce}`.toUpperCase();
  const initialStatus = expected === 'available' ? 'payment_received' : 'awaiting_payment';
  const { data: order, error } = await service.from('orders').insert({
    order_reference: orderReference,
    assessment_id: assessment.id,
    product_id: product.id,
    status: initialStatus,
    amount_cents: product.price_cents,
    currency: product.currency,
    requested_by_respondent_id: assessment.primary_respondent_id,
    product_name: product.name,
    customer_email: `phase1-${assessment.fixture}-${nonce}@example.test`,
    customer_name: 'Phase 1 Compatibility Test',
    organisation_name: `Phase 1 ${assessment.fixture} ${nonce}`,
    eft_instructions_snapshot: { active: true, contactEmail: 'release@example.test' },
    verified_by: expected === 'available' ? admin.id : null,
    verified_at: expected === 'available' ? new Date().toISOString() : null
  }).select('id,order_reference').single();
  assert.ifError(error);
  return { ...order, reference: orderReference, assessment };
}

async function createPreviousValidReportFixture(order, admin) {
  const { data: template, error: templateError } = await service.from('report_templates')
    .select('id').eq('report_type', 'essential_self_assessment').eq('status', 'active')
    .order('version_number', { ascending: false }).limit(1).single();
  assert.ifError(templateError);

  const reportReference = `RPT-${order.assessment.reference}-V1`;
  const fileName = `${reportReference}.pdf`;
  const bytes = Buffer.concat([
    Buffer.from('%PDF-1.4\n% Phase 1 disposable previous-report fixture\n'),
    Buffer.alloc(2_048, 0x20),
    Buffer.from('\n%%EOF\n')
  ]);
  const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
  const storageBucket = 'generated-reports';
  const storagePath = `${order.assessment.organisation_id}/${order.id}/v1/${fileName}`;
  const { error: uploadError } = await service.storage.from(storageBucket).upload(storagePath, bytes, {
    contentType: 'application/pdf',
    upsert: false,
    metadata: { sha256: checksum, fixture: 'phase1-release-safety-previous-valid-report' }
  });
  assert.ifError(uploadError);

  const { data: report, error: reportError } = await service.from('reports').insert({
    assessment_id: order.assessment.id,
    organisation_id: order.assessment.organisation_id,
    order_id: order.id,
    score_run_id: order.assessment.current_score_run_id,
    template_id: template.id,
    report_type: 'essential_self_assessment',
    status: 'generated',
    report_reference: reportReference,
    version_number: 1,
    storage_bucket: storageBucket,
    storage_path: storagePath,
    checksum,
    file_name: fileName,
    mime_type: 'application/pdf',
    file_size_bytes: bytes.length,
    storage_status: 'VERIFIED',
    storage_verified_at: new Date().toISOString(),
    generated_by: admin.id,
    generated_at: new Date().toISOString()
  }).select('id,status,report_reference,version_number,storage_bucket,storage_path,checksum,file_size_bytes,storage_status,supersedes_report_id').single();
  assert.ifError(reportError);
  return { ...report, bytes };
}

const [home, loginPage] = await Promise.all([response('/'), response('/score/admin/login')]);
assert.equal(home.status, 200);
assert.equal(loginPage.status, 200);

const admin = await createAdmin();
const { data: product, error: productError } = await service.from('products')
  .select('id,name,price_cents,currency').eq('active', true).eq('product_code', 'essential_self_assessment').single();
assert.ifError(productError);
const assessments = expected === 'available'
  ? { violating: await createCompletedAssessment('violating'), passing: await createCompletedAssessment('passing') }
  : { unavailable: await createCompletedAssessment('unavailable') };
const orders = expected === 'available'
  ? {
      violating: await createOrder(assessments.violating, admin, product),
      passing: await createOrder(assessments.passing, admin, product)
    }
  : { unavailable: await createOrder(assessments.unavailable, admin, product) };
const order = expected === 'available' ? orders.passing : orders.unavailable;
const orderReference = order.reference;

const authHeaders = { cookie: admin.cookie };
const [ordersPage, orderPage, reportsPage] = await Promise.all([
  response('/score/admin/orders', { headers: authHeaders }),
  response(`/score/admin/orders/${encodeURIComponent(orderReference)}`, { headers: authHeaders }),
  response('/score/admin/reports', { headers: authHeaders })
]);
for (const page of [ordersPage, orderPage, reportsPage]) assert.equal(page.status, 200);
const [ordersHtml, orderHtml, reportsHtml] = await Promise.all([ordersPage.text(), orderPage.text(), reportsPage.text()]);
assert.match(ordersHtml, new RegExp(orderReference));

let reportId = '00000000-0000-0000-0000-000000000001';
let releaseSafetyEvidence = null;
if (expected === 'unavailable') {
  for (const html of [ordersHtml, orderHtml, reportsHtml]) assert.ok(html.includes(unavailableMessage));
  for (const label of ['Generate Report', 'Preview Report', 'Download Report', 'Initiate Delivery']) {
    assert.ok(!orderHtml.includes(`>${label}<`), `${label} must not render before 0023.`);
  }
  const generation = await json(`/score/api/admin/orders/${encodeURIComponent(orderReference)}/generate-report`, {
    method: 'POST', headers: { ...authHeaders, 'x-idempotency-key': `pre-${nonce}` }, body: JSON.stringify({ action: 'admin_generate' })
  }, 503);
  assert.equal(generation.body.message, unavailableMessage);
  for (const mode of ['preview', 'download']) {
    const access = await json(`/score/api/admin/reports/${reportId}/${mode}?order=${encodeURIComponent(orderReference)}`, { headers: authHeaders }, 503);
    assert.equal(access.body.message, unavailableMessage);
  }
  const delivery = await json(`/score/api/admin/reports/${reportId}/send-email`, {
    method: 'POST', headers: { ...authHeaders, 'x-idempotency-key': `delivery-pre-${nonce}` }, body: JSON.stringify({ orderReference })
  }, 503);
  assert.equal(delivery.body.message, unavailableMessage);
} else {
  for (const html of [ordersHtml, orderHtml, reportsHtml]) assert.ok(!html.includes(unavailableMessage));

  // A deliberately thin assessment must fail before PDF upload/completion. Seed one verified,
  // test-only prior report for that order so the test also proves a failed regeneration leaves the
  // previous valid version and its private object untouched.
  const previousReport = await createPreviousValidReportFixture(orders.violating, admin);
  const failedGeneration = await json(`/score/api/admin/orders/${encodeURIComponent(orders.violating.reference)}/generate-report`, {
    method: 'POST',
    headers: { ...authHeaders, 'x-idempotency-key': `quality-fail-${nonce}` },
    body: JSON.stringify({ action: 'admin_regenerate' })
  }, 422);
  assert.equal(failedGeneration.body.ok, false);
  assert.equal(failedGeneration.body.reason, 'commercial_quality_failed');
  assert.ok(failedGeneration.body.technicalReference);

  const { data: failedAttempt, error: failedAttemptError } = await service.from('manual_report_generation_attempts')
    .select('id,status,output_report_id,error_category,report_version')
    .eq('order_id', orders.violating.id).order('created_at', { ascending: false }).limit(1).single();
  assert.ifError(failedAttemptError);
  assert.equal(failedAttempt.status, 'GENERATION_FAILED');
  assert.equal(failedAttempt.output_report_id, null);
  assert.equal(failedAttempt.error_category, 'commercial_quality_failed');
  assert.equal(failedAttempt.report_version, 2);

  const { data: preservedReports, error: preservedReportsError } = await service.from('reports')
    .select('id,status,report_reference,version_number,storage_bucket,storage_path,checksum,file_size_bytes,storage_status,supersedes_report_id')
    .eq('order_id', orders.violating.id).order('version_number');
  assert.ifError(preservedReportsError);
  assert.equal(preservedReports.length, 1, 'A quality failure must not create a successful report row.');
  assert.deepEqual(preservedReports[0], {
    id: previousReport.id,
    status: previousReport.status,
    report_reference: previousReport.report_reference,
    version_number: previousReport.version_number,
    storage_bucket: previousReport.storage_bucket,
    storage_path: previousReport.storage_path,
    checksum: previousReport.checksum,
    file_size_bytes: previousReport.file_size_bytes,
    storage_status: previousReport.storage_status,
    supersedes_report_id: previousReport.supersedes_report_id
  });
  const { data: preservedObject, error: preservedObjectError } = await service.storage
    .from(previousReport.storage_bucket).download(previousReport.storage_path);
  assert.ifError(preservedObjectError);
  const preservedBytes = Buffer.from(await preservedObject.arrayBuffer());
  assert.equal(preservedBytes.length, previousReport.bytes.length);
  assert.equal(crypto.createHash('sha256').update(preservedBytes).digest('hex'), previousReport.checksum);
  const { data: versionFolders, error: versionFoldersError } = await service.storage
    .from(previousReport.storage_bucket).list(`${orders.violating.assessment.organisation_id}/${orders.violating.id}`);
  assert.ifError(versionFoldersError);
  assert.deepEqual(versionFolders.map((entry) => entry.name).sort(), ['v1'], 'Quality failure must not upload a v2 object.');

  const [{ count: completionEventCount, error: completionEventError }, { count: deliveryAttemptCount, error: deliveryAttemptError }] = await Promise.all([
    service.from('order_events').select('id', { count: 'exact', head: true })
      .eq('order_id', orders.violating.id).in('event_type', ['report_stored', 'generation_succeeded']),
    service.from('manual_report_delivery_attempts').select('id', { count: 'exact', head: true })
      .eq('order_id', orders.violating.id)
  ]);
  assert.ifError(completionEventError);
  assert.ifError(deliveryAttemptError);
  assert.equal(completionEventCount, 0, 'Quality failure must not record upload/completion events.');
  assert.equal(deliveryAttemptCount, 0, 'Quality failure must not start delivery.');

  // The passing assessment uses the same real production orchestration, quality assertion,
  // Chromium-backed PDF path, private upload/read-back verification and completion RPC.
  const generated = await json(`/score/api/admin/orders/${encodeURIComponent(orderReference)}/generate-report`, {
    method: 'POST', headers: { ...authHeaders, 'x-idempotency-key': `quality-pass-${nonce}` }, body: JSON.stringify({ action: 'admin_generate' })
  });
  assert.equal(generated.body.ok, true);
  reportId = generated.body.reportId;
  assert.ok(reportId);
  const [{ data: readyAttempt, error: readyAttemptError }, { data: verifiedReport, error: verifiedReportError }] = await Promise.all([
    service.from('manual_report_generation_attempts')
      .select('id,status,output_report_id,error_category,report_version')
      .eq('order_id', orders.passing.id).order('created_at', { ascending: false }).limit(1).single(),
    service.from('reports')
      .select('id,status,storage_status,storage_bucket,storage_path,checksum,file_size_bytes,version_number')
      .eq('id', reportId).single()
  ]);
  assert.ifError(readyAttemptError);
  assert.ifError(verifiedReportError);
  assert.equal(readyAttempt.status, 'REPORT_READY');
  assert.equal(readyAttempt.output_report_id, reportId);
  assert.equal(readyAttempt.error_category, null);
  assert.equal(verifiedReport.storage_status, 'VERIFIED');
  assert.equal(verifiedReport.status, 'generated');
  assert.equal(verifiedReport.version_number, 1);
  assert.ok(verifiedReport.storage_path && verifiedReport.checksum && verifiedReport.file_size_bytes > 1_000);
  for (const mode of ['preview', 'download']) {
    const access = await json(`/score/api/admin/reports/${reportId}/${mode}?order=${encodeURIComponent(orderReference)}`, { headers: authHeaders });
    assert.equal(access.body.ok, true);
    assert.match(access.body.url, /^https?:\/\//);
  }
  const delivery = await json(`/score/api/admin/reports/${reportId}/send-email`, {
    method: 'POST', headers: { ...authHeaders, 'x-idempotency-key': `delivery-post-${nonce}` }, body: JSON.stringify({ orderReference })
  });
  assert.equal(delivery.body.status, 'DELIVERY_PENDING');
  assert.match(delivery.body.message, /explicitly disabled/i);
  releaseSafetyEvidence = {
    violating: {
      orderReference: orders.violating.reference,
      httpStatus: 422,
      reason: failedGeneration.body.reason,
      attemptStatus: failedAttempt.status,
      outputReportId: failedAttempt.output_report_id,
      newSuccessfulReportCount: preservedReports.length - 1,
      completionEventCount,
      deliveryAttemptCount,
      previousReportPreserved: true
    },
    passing: {
      orderReference,
      reportId,
      attemptStatus: readyAttempt.status,
      storageStatus: verifiedReport.storage_status,
      pdfSizeBytes: verifiedReport.file_size_bytes
    }
  };
}

const nextStatus = expected === 'available' ? 'awaiting_payment' : 'payment_received';
const form = new FormData();
form.set('status', nextStatus);
form.set('note', 'Compatibility test of the existing order status path.');
const statusResult = await response(`/score/admin/orders/${encodeURIComponent(orderReference)}/status`, {
  method: 'POST', headers: authHeaders, body: form
});
assert.ok([302, 303, 307, 308].includes(statusResult.status));
const { data: updated, error: updatedError } = await service.from('orders').select('status').eq('id', order.id).single();
assert.ifError(updatedError);
assert.equal(updated.status, nextStatus);

console.log(JSON.stringify({ ok: true, expected, orderReference, reportId, existingStatusPath: nextStatus, releaseSafetyEvidence }));
