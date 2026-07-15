import assert from 'node:assert/strict';
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

async function createCompletedAssessment() {
  const { body: started } = await json('/score/api/assessments/start', {
    method: 'POST',
    body: JSON.stringify({
      fullName: 'Phase 1 Compatibility Test',
      email: `phase1-${nonce}@example.test`,
      roleTitle: 'Release verification',
      organisationName: `Phase 1 Compatibility ${nonce}`,
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
    .select('methodology_version_id,organisation_id,primary_respondent_id').eq('id', assessmentId).single();
  assert.ifError(assessmentError);

  if (expected === 'available') {
    const [{ data: questions, error: questionError }, { data: factors, error: factorError }] = await Promise.all([
      service.from('questions').select('id').eq('methodology_version_id', assessment.methodology_version_id).eq('active', true).order('sort_order'),
      service.from('exposure_factors').select('id,options_json').eq('methodology_version_id', assessment.methodology_version_id).order('sort_order')
    ]);
    assert.ifError(questionError);
    assert.ifError(factorError);
    const answers = questions.map((question) => ({ questionId: question.id, responseValue: 4, isNotApplicable: false, nAReason: '' }));
    const exposureAnswers = factors.map((factor) => {
      const option = factor.options_json.options[0];
      return { exposureFactorId: factor.id, selectedValue: option.value, selectedLabel: option.label, pointsAwarded: Number(option.points) };
    });
    await json(`/score/api/assessments/${assessmentReference}/answers`, {
      method: 'POST', body: JSON.stringify({ token, answers, exposureAnswers })
    });
    const { body: submitted } = await json(`/score/api/assessments/${assessmentReference}/submit`, {
      method: 'POST', body: JSON.stringify({ token })
    });
    assert.equal(submitted.status, 'scored');
  }

  return { id: assessmentId, reference: assessmentReference, ...assessment };
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

const [home, loginPage] = await Promise.all([response('/'), response('/score/admin/login')]);
assert.equal(home.status, 200);
assert.equal(loginPage.status, 200);

const assessment = await createCompletedAssessment();
const admin = await createAdmin();
const { data: product, error: productError } = await service.from('products')
  .select('id,name,price_cents,currency').eq('active', true).eq('product_code', 'essential_self_assessment').single();
assert.ifError(productError);
const orderReference = `MKORD-PHASE1-${nonce}`.toUpperCase();
const initialStatus = expected === 'available' ? 'payment_received' : 'awaiting_payment';
const { data: order, error: orderError } = await service.from('orders').insert({
  order_reference: orderReference,
  assessment_id: assessment.id,
  product_id: product.id,
  status: initialStatus,
  amount_cents: product.price_cents,
  currency: product.currency,
  requested_by_respondent_id: assessment.primary_respondent_id,
  product_name: product.name,
  customer_email: `phase1-${nonce}@example.test`,
  customer_name: 'Phase 1 Compatibility Test',
  organisation_name: `Phase 1 Compatibility ${nonce}`,
  eft_instructions_snapshot: { active: true, contactEmail: 'release@example.test' },
  verified_by: expected === 'available' ? admin.id : null,
  verified_at: expected === 'available' ? new Date().toISOString() : null
}).select('id,order_reference').single();
assert.ifError(orderError);

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
  const generated = await json(`/score/api/admin/orders/${encodeURIComponent(orderReference)}/generate-report`, {
    method: 'POST', headers: { ...authHeaders, 'x-idempotency-key': `post-${nonce}` }, body: JSON.stringify({ action: 'admin_generate' })
  });
  assert.equal(generated.body.ok, true);
  reportId = generated.body.reportId;
  assert.ok(reportId);
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

console.log(JSON.stringify({ ok: true, expected, orderReference, reportId, existingStatusPath: nextStatus }));
