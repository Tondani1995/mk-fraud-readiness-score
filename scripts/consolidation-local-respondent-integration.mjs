import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const baseUrl = (process.env.LOCAL_INTEGRATION_BASE_URL ?? '').replace(/\/$/, '');
const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

function requireLoopback(value, label) {
  const url = new URL(value);
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(url.hostname), `${label} must be loopback-only.`);
}

assert.ok(baseUrl, 'LOCAL_INTEGRATION_BASE_URL is required.');
assert.ok(supabaseUrl, 'NEXT_PUBLIC_SUPABASE_URL is required.');
assert.ok(serviceRoleKey, 'SUPABASE_SERVICE_ROLE_KEY is required.');
requireLoopback(baseUrl, 'LOCAL_INTEGRATION_BASE_URL');
requireLoopback(supabaseUrl, 'NEXT_PUBLIC_SUPABASE_URL');

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function jsonRequest(path, init) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) }
  });
  const body = await response.json().catch(() => ({}));
  assert.ok(response.ok && body.ok, `${path} failed (${response.status}): ${JSON.stringify(body)}`);
  return body;
}

const nonce = Date.now();
const started = await jsonRequest('/score/api/assessments/start', {
  method: 'POST',
  body: JSON.stringify({
    fullName: 'Local Consolidation Test',
    email: `local-consolidation-${nonce}@example.test`,
    roleTitle: 'Verification',
    organisationName: `Local Consolidation ${nonce}`,
    industry: 'Testing',
    province: 'Gauteng',
    employeeBand: '11-50',
    annualRevenueBand: 'R10m-R50m',
    consentPrivacy: true,
    consentResearch: false
  })
});

const { assessmentId, assessmentReference, resumeUrl } = started.data;
const resumeToken = new URL(resumeUrl).searchParams.get('token');
assert.ok(assessmentId && assessmentReference && resumeToken, 'Start response did not include a usable reference and token.');
assert.equal(new URL(resumeUrl).origin, new URL(baseUrl).origin, 'Resume URL left the consolidated origin.');
assert.match(new URL(resumeUrl).pathname, /^\/score\/assessment\//);

const { data: assessment, error: assessmentError } = await service
  .from('assessments')
  .select('methodology_version_id')
  .eq('id', assessmentId)
  .single();
assert.ifError(assessmentError);

const [{ data: questions, error: questionsError }, { data: factors, error: factorsError }] = await Promise.all([
  service
    .from('questions')
    .select('id,question_code')
    .eq('methodology_version_id', assessment.methodology_version_id)
    .eq('active', true)
    .order('sort_order'),
  service
    .from('exposure_factors')
    .select('id,factor_code,options_json')
    .eq('methodology_version_id', assessment.methodology_version_id)
    .order('sort_order')
]);
assert.ifError(questionsError);
assert.ifError(factorsError);
assert.ok(questions?.length, 'Active methodology has no questions.');
assert.ok(factors?.length, 'Active methodology has no exposure factors.');
assert.equal(questions.length, 68, 'The approved methodology must retain exactly 68 readiness questions.');
assert.equal(factors.length, 8, 'The approved methodology must retain exactly 8 exposure factors.');

const answers = questions.map((question) => ({
  questionId: question.id,
  responseValue: 3,
  isNotApplicable: false,
  nAReason: ''
}));
const exposureAnswers = factors.map((factor) => {
  const options = factor.options_json?.options;
  assert.ok(Array.isArray(options) && options.length, `${factor.factor_code} has no approved options.`);
  const option = options[Math.floor(options.length / 2)];
  return {
    exposureFactorId: factor.id,
    selectedValue: option.value,
    selectedLabel: option.label,
    pointsAwarded: Number(option.points)
  };
});

const saved = await jsonRequest(`/score/api/assessments/${encodeURIComponent(assessmentReference)}/answers`, {
  method: 'POST',
  body: JSON.stringify({ token: resumeToken, answers, exposureAnswers })
});
assert.equal(saved.progress.answeredQuestions, questions.length);
assert.equal(saved.progress.answeredExposureFactors, factors.length);
assert.equal(saved.progress.overallPct, 100);

const submitted = await jsonRequest(`/score/api/assessments/${encodeURIComponent(assessmentReference)}/submit`, {
  method: 'POST',
  body: JSON.stringify({ token: resumeToken })
});
assert.equal(submitted.status, 'scored');
assert.equal(submitted.progress.overallPct, 100);
assert.equal(submitted.snapshot.assessmentReference, assessmentReference);
assert.equal(submitted.snapshot.scoreRunId, submitted.scoreRunId);
assert.equal(new URL(submitted.snapshotUrl).origin, new URL(baseUrl).origin);
assert.match(new URL(submitted.snapshotUrl).pathname, /^\/score\/snapshot\//);

const { data: scoreRun, error: scoreError } = await service
  .from('score_runs')
  .select('id,status,overall_score,final_maturity,coverage_pct')
  .eq('id', submitted.scoreRunId)
  .single();
assert.ifError(scoreError);
assert.equal(scoreRun.status, 'completed');
assert.equal(Number(scoreRun.overall_score), Number(submitted.snapshot.overallScore));
assert.equal(scoreRun.final_maturity, submitted.snapshot.finalMaturity);
assert.equal(Number(scoreRun.coverage_pct), Number(submitted.snapshot.coveragePct));

const snapshotResponse = await fetch(submitted.snapshotUrl);
assert.equal(snapshotResponse.status, 200);
const snapshotHtml = await snapshotResponse.text();
assert.match(snapshotHtml, new RegExp(assessmentReference));

console.log(JSON.stringify({
  ok: true,
  assessmentReference,
  questions: questions.length,
  exposureFactors: factors.length,
  overallScore: submitted.snapshot.overallScore,
  finalMaturity: submitted.snapshot.finalMaturity,
  snapshotPath: new URL(submitted.snapshotUrl).pathname
}));
