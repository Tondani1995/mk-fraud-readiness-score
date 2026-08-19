import fs from 'node:fs';
import path from 'node:path';

const required = [
  'STAGING_SUPABASE_URL',
  'STAGING_SUPABASE_SERVICE_ROLE_KEY',
  'VERCEL_PROTECTION_BYPASS',
  'PREVIEW_URL'
];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required secret: ${key}`);
}

const certifiedSha = process.env.CERTIFIED_SHA;
const preview = process.env.PREVIEW_URL.replace(/\/$/, '');
const supabaseUrl = process.env.STAGING_SUPABASE_URL.replace(/\/$/, '');
const serviceKey = process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY;
const bypass = process.env.VERCEL_PROTECTION_BYPASS;
const outputRoot = path.resolve('tmp/essential-five-customer-acceptance');
fs.mkdirSync(outputRoot, { recursive: true });

const candidates = [
  {
    slug: 'bokamoso-skills-institute',
    organisation: 'Bokamoso Skills Institute',
    orderReference: 'MKORD-2026-4790A29D',
    orderId: '74eddf8c-7043-40d5-bef8-46ef5e14d099',
    assessmentId: '6f74336c-53dd-4fe2-ba32-f4665337fe65',
    expectedScore: 29.58,
    expectedMaturity: 'Reactive'
  },
  {
    slug: 'rivonia-health-logistics',
    organisation: 'Rivonia Health Logistics (Pty) Ltd',
    orderReference: 'MKORD-2026-22FF6B69',
    orderId: '7bb56b39-37fd-4310-9586-a6479c5aafaa',
    assessmentId: 'f8952c51-9c03-44e1-873e-b188e0f1fe23',
    expectedScore: 35.55,
    expectedMaturity: 'Reactive'
  },
  {
    slug: 'siyakhula-community-foundation',
    organisation: 'Siyakhula Community Foundation',
    orderReference: 'MKORD-2026-912225EC',
    orderId: '1ecd5ab1-6c67-4bf4-b40f-771012453795',
    assessmentId: '27f101b6-bd82-4acf-ab61-3fd22c82c007',
    expectedScore: 42.44,
    expectedMaturity: 'Developing'
  },
  {
    slug: 'vhutshilo-foods-manufacturing',
    organisation: 'Vhutshilo Foods Manufacturing (Pty) Ltd',
    orderReference: 'MKORD-2026-FAA9331C',
    orderId: 'dea30683-e478-4676-b806-3d19dc88ed7e',
    assessmentId: 'f136b838-340a-4119-91eb-6afa8a6930e6',
    expectedScore: 43.23,
    expectedMaturity: 'Developing'
  },
  {
    slug: 'mzanzi-living-property-services',
    organisation: 'Mzanzi Living Property Services',
    orderReference: 'MKORD-2026-FAE975D6',
    orderId: 'f9ecc010-ec06-495f-9a8e-0a629c5ad25b',
    assessmentId: 'e514a491-70f3-47bd-b4a0-6aea04771a61',
    expectedScore: 49.50,
    expectedMaturity: 'Developing'
  }
];

const results = [];
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };

function encodeStoragePath(value) {
  return String(value).split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

async function sb(resourcePath) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${resourcePath}`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: 'application/json'
    }
  });
  const text = await response.text();
  if (!response.ok) fail(`Staging read failed (${response.status}): ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : [];
}

async function downloadStorageObject(bucket, storagePath, destination) {
  const url = `${supabaseUrl}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encodeStoragePath(storagePath)}`;
  const response = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`
    }
  });
  if (!response.ok) {
    const text = await response.text();
    fail(`Storage download failed (${response.status}) for ${storagePath}: ${text.slice(0, 300)}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  assert(bytes.length > 10_000, `Downloaded artefact is unexpectedly small: ${storagePath} (${bytes.length} bytes).`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, bytes);
  return bytes.length;
}

async function runCandidate(candidate, index) {
  const startedAt = new Date().toISOString();
  const requestKey = `essential-5x-${certifiedSha?.slice(0, 12) ?? 'certified'}-${index + 1}-${candidate.slug}`;
  const reportPath = `reports?order_id=eq.${encodeURIComponent(candidate.orderId)}&select=id,report_reference,version_number,status,storage_status,storage_bucket,storage_path,file_name,file_size_bytes,generated_at&order=version_number.desc`;
  const deliveryPath = `manual_report_delivery_attempts?order_id=eq.${encodeURIComponent(candidate.orderId)}&select=id,status`;
  const generationPath = `manual_report_generation_attempts?order_id=eq.${encodeURIComponent(candidate.orderId)}&select=id,status,report_version,output_report_id,request_key,created_at&order=created_at.desc`;
  const orderPath = `orders?id=eq.${encodeURIComponent(candidate.orderId)}&select=id,order_reference,organisation_name,status,assessment_id`;
  const scorePath = `score_runs?assessment_id=eq.${encodeURIComponent(candidate.assessmentId)}&select=id,overall_score,final_maturity,status,run_number&order=run_number.desc&limit=1`;

  const [orders, beforeReports, beforeDeliveries, beforeGenerations, scores] = await Promise.all([
    sb(orderPath), sb(reportPath), sb(deliveryPath), sb(generationPath), sb(scorePath)
  ]);

  assert(orders.length === 1, `${candidate.organisation}: order preflight did not resolve exactly once.`);
  assert(orders[0].order_reference === candidate.orderReference, `${candidate.organisation}: order reference mismatch.`);
  assert(orders[0].organisation_name === candidate.organisation, `${candidate.organisation}: organisation mismatch.`);
  assert(orders[0].assessment_id === candidate.assessmentId, `${candidate.organisation}: assessment mismatch.`);
  assert(String(orders[0].status) === 'payment_received', `${candidate.organisation}: order is not payment_received.`);
  assert(scores.length === 1, `${candidate.organisation}: score run preflight missing.`);
  assert(Math.abs(Number(scores[0].overall_score) - candidate.expectedScore) < 0.005, `${candidate.organisation}: score drifted from ${candidate.expectedScore} to ${scores[0].overall_score}.`);
  assert(String(scores[0].final_maturity) === candidate.expectedMaturity, `${candidate.organisation}: maturity drifted from ${candidate.expectedMaturity} to ${scores[0].final_maturity}.`);
  assert(!beforeGenerations.some((attempt) => attempt.request_key === requestKey), `${candidate.organisation}: request key already exists; refusing replay.`);

  const beforeMaxVersion = beforeReports.length ? Math.max(...beforeReports.map((report) => Number(report.version_number))) : 0;
  const expectedVersion = beforeMaxVersion + 1;
  const action = beforeReports.length ? 'admin_regenerate' : 'admin_generate';

  const adminPage = await fetch(`${preview}/score/admin/orders/${encodeURIComponent(candidate.orderReference)}`, {
    method: 'GET',
    redirect: 'manual',
    headers: {
      'x-vercel-protection-bypass': bypass,
      Accept: 'text/html'
    }
  });
  const adminHtml = await adminPage.text();
  assert(adminPage.status === 200, `${candidate.organisation}: Preview admin preflight failed with HTTP ${adminPage.status}.`);
  assert(adminHtml.includes(candidate.orderReference) || adminHtml.includes(candidate.organisation), `${candidate.organisation}: Preview did not resolve the intended staging order.`);

  console.log(`[${index + 1}/5] ${candidate.organisation}: preflight PASS; issuing exactly one ${action} request.`);
  const generationResponse = await fetch(`${preview}/score/api/admin/orders/${encodeURIComponent(candidate.orderReference)}/generate-report`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'x-vercel-protection-bypass': bypass,
      'x-idempotency-key': requestKey,
      'content-type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ action, requestKey })
  });
  const generationText = await generationResponse.text();
  let generationBody = null;
  try { generationBody = JSON.parse(generationText); } catch {}
  if (!generationResponse.ok) fail(`${candidate.organisation}: single generation request failed (${generationResponse.status}): ${generationText.slice(0, 500)}`);
  assert(generationBody?.ok === true, `${candidate.organisation}: generation response was not ok: ${generationText.slice(0, 500)}`);

  const [afterReports, afterDeliveries, afterGenerations] = await Promise.all([
    sb(reportPath), sb(deliveryPath), sb(generationPath)
  ]);
  const newReports = afterReports.filter((report) => Number(report.version_number) === expectedVersion);
  const laterReports = afterReports.filter((report) => Number(report.version_number) > expectedVersion);

  assert(newReports.length === 1, `${candidate.organisation}: expected exactly one V${expectedVersion}, found ${newReports.length}.`);
  const report = newReports[0];
  assert(report.status === 'generated', `${candidate.organisation}: generated report status is ${report.status}.`);
  assert(report.storage_status === 'VERIFIED', `${candidate.organisation}: report storage is ${report.storage_status}.`);
  assert(laterReports.length === 0, `${candidate.organisation}: found ${laterReports.length} report(s) later than expected V${expectedVersion}.`);
  assert(afterDeliveries.length === beforeDeliveries.length, `${candidate.organisation}: delivery attempts changed from ${beforeDeliveries.length} to ${afterDeliveries.length}.`);
  assert(afterGenerations.length === beforeGenerations.length + 1, `${candidate.organisation}: generation attempts delta was ${afterGenerations.length - beforeGenerations.length}, expected +1.`);
  assert(afterGenerations.some((attempt) => attempt.request_key === requestKey && attempt.status === 'SUCCEEDED' && Number(attempt.report_version) === expectedVersion), `${candidate.organisation}: successful generation attempt for fixed request key not found.`);

  const supporting = await sb(`report_artifacts?report_id=eq.${encodeURIComponent(report.id)}&artefact_type=eq.supporting_register&select=id,artefact_type,storage_bucket,storage_path,file_name,file_size_bytes,storage_status,release_state`);
  assert(supporting.length === 1, `${candidate.organisation}: expected one Supporting Register artefact, found ${supporting.length}.`);
  assert(supporting[0].storage_status === 'VERIFIED', `${candidate.organisation}: Supporting Register storage is ${supporting[0].storage_status}.`);
  assert(supporting[0].release_state === 'verified', `${candidate.organisation}: Supporting Register release state is ${supporting[0].release_state}.`);

  const candidateDir = path.join(outputRoot, candidate.slug);
  const pdfName = report.file_name || `${report.report_reference}.pdf`;
  const xlsxName = supporting[0].file_name || `${report.report_reference}-supporting-register.xlsx`;
  const pdfBytes = await downloadStorageObject(report.storage_bucket, report.storage_path, path.join(candidateDir, pdfName));
  const xlsxBytes = await downloadStorageObject(supporting[0].storage_bucket, supporting[0].storage_path, path.join(candidateDir, xlsxName));

  const result = {
    organisation: candidate.organisation,
    orderReference: candidate.orderReference,
    assessmentId: candidate.assessmentId,
    expectedScore: candidate.expectedScore,
    expectedMaturity: candidate.expectedMaturity,
    action,
    requestKey,
    beforeMaxVersion,
    generatedVersion: expectedVersion,
    reportReference: report.report_reference,
    reportId: report.id,
    reportStorageStatus: report.storage_status,
    reportBytes: pdfBytes,
    supportingRegister: xlsxName,
    supportingRegisterBytes: xlsxBytes,
    deliveryAttemptsBefore: beforeDeliveries.length,
    deliveryAttemptsAfter: afterDeliveries.length,
    generationAttemptsDelta: afterGenerations.length - beforeGenerations.length,
    startedAt,
    completedAt: new Date().toISOString(),
    status: 'PASS'
  };
  results.push(result);
  fs.writeFileSync(path.join(outputRoot, 'manifest.json'), JSON.stringify({ certifiedSha, preview, results }, null, 2));
  console.log(`[${index + 1}/5] ${candidate.organisation}: PASS -> ${report.report_reference}; report ${pdfBytes} bytes; register ${xlsxBytes} bytes.`);
}

let failure = null;
try {
  for (let index = 0; index < candidates.length; index += 1) {
    await runCandidate(candidates[index], index);
  }
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
  console.error(`FIVE-CUSTOMER ACCEPTANCE STOPPED: ${failure}`);
} finally {
  fs.writeFileSync(path.join(outputRoot, 'manifest.json'), JSON.stringify({ certifiedSha, preview, results, failure }, null, 2));
}

const summary = [
  '# Essential five-customer generation acceptance',
  '',
  `Certified product SHA: ${certifiedSha}`,
  `Exact Preview: ${preview}`,
  `Successful fresh generations: ${results.length}/5`,
  `Failure: ${failure ?? 'none'}`,
  '',
  ...results.map((result, index) => `${index + 1}. ${result.organisation} — ${result.reportReference} — ${result.status} — delivery ${result.deliveryAttemptsBefore}/${result.deliveryAttemptsAfter}`)
].join('\n');
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);

if (failure) throw new Error(failure);
assert(results.length === 5, `Expected 5 successful generations, got ${results.length}.`);
console.log('FIVE-CUSTOMER ESSENTIAL GENERATION ACCEPTANCE: PASS 5/5, zero retries, zero delivery mutations.');
