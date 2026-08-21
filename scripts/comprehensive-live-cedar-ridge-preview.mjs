// Calls the narrow Preview-only Cedar Ridge acceptance seam once.
// The route accepts the exact committed fixture, performs no database writes,
// and consumes the server-side AI Gateway credential without returning it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const previewUrl = String(process.env.MK_PREVIEW_URL ?? '').replace(/\/$/, '');
if (!previewUrl) throw new Error('MK_PREVIEW_URL is required.');

const fixturePath = path.resolve('outputs/product-acceptance-v12-repaired-20260821/assessment-inputs.json');
const outputDir = path.resolve('outputs/product-acceptance-live-cedar-ridge-20260821');
fs.mkdirSync(outputDir, { recursive: true });
const assessment = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const response = await fetch(`${previewUrl}/score/api/product-acceptance/comprehensive`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json' },
  body: JSON.stringify({ assessment }),
  signal: AbortSignal.timeout(300_000)
});
const payload = await response.json().catch(() => ({}));
if (!response.ok || payload.ok !== true) {
  console.error(JSON.stringify({ ok: false, httpStatus: response.status, response: payload }, null, 2));
  process.exit(1);
}

const writeJson = (name, value) => fs.writeFileSync(path.join(outputDir, name), JSON.stringify(value, null, 2));
const fileEvidence = (name, base64) => {
  const file = path.join(outputDir, name);
  const bytes = Buffer.from(base64, 'base64');
  fs.writeFileSync(file, bytes);
  return { file, bytes: bytes.byteLength, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
};

const pdf = fileEvidence('MKFRS-CEDAR-RIDGE-FIXTURE-comprehensive-live-preview.pdf', payload.output.pdf.base64);
const xlsx = fileEvidence('RPT-MKFRS-CEDAR-RIDGE-FIXTURE-V2-comprehensive-live-preview-supporting-register.xlsx', payload.output.xlsx.base64);
writeJson('provider-response.json', payload.providerResponse);
writeJson('interpretation-safety.json', payload.safety);
writeJson('interpretation-accounting.json', payload.accounting);
writeJson('pre-provider-deterministic-stages.json', payload.deterministic);
writeJson('run.json', {
  productAcceptance: 'Cedar Ridge fixture + one server-side Preview AI interpretation',
  previewUrl,
  sourceSha: process.env.MK_SOURCE_SHA ?? null,
  providerCalls: payload.accounting.calls,
  provider: payload.accounting.model?.split('/')?.[0] ?? null,
  model: payload.accounting.model,
  inputTokens: payload.accounting.inputTokens,
  outputTokens: payload.accounting.outputTokens,
  totalTokens: payload.accounting.totalTokens,
  costMicros: payload.accounting.costMicros,
  durationMs: payload.durationMs,
  repairs: payload.accounting.repairs,
  repairedSlots: payload.accounting.repairedSlots,
  technicalReference: payload.technicalReference,
  fixtureSha256: payload.fixtureSha256,
  interpretationVersion: payload.interpretationVersion,
  evidencePackSha256: payload.evidencePackSha256,
  promptSha256: payload.promptSha256,
  finalNarrativeSha256: payload.finalNarrativeSha256,
  safety: { policyVersion: payload.safety.policyVersion, publishable: payload.safety.publishable, issueCount: payload.safety.issues.length, repairs: payload.safety.repairs.length },
  output: { pdf, xlsx, workbookSheets: payload.output.workbookSheets, workbookRows: payload.output.workbookRows },
  providerCallsBeforeDispatch: 0,
  stagingMutations: 0,
  platformAdminsCreated: 0,
  customerEmailSent: 0
});

console.log(JSON.stringify({
  ok: true,
  httpStatus: response.status,
  technicalReference: payload.technicalReference,
  model: payload.accounting.model,
  providerCalls: payload.accounting.calls,
  inputTokens: payload.accounting.inputTokens,
  outputTokens: payload.accounting.outputTokens,
  totalTokens: payload.accounting.totalTokens,
  costMicros: payload.accounting.costMicros,
  durationMs: payload.durationMs,
  repairs: payload.accounting.repairs,
  evidencePackSha256: payload.evidencePackSha256,
  promptSha256: payload.promptSha256,
  finalNarrativeSha256: payload.finalNarrativeSha256,
  pdf,
  xlsx,
  safety: { policyVersion: payload.safety.policyVersion, publishable: payload.safety.publishable, issues: payload.safety.issues.length, repairs: payload.safety.repairs.length },
  stagingMutations: 0,
  platformAdminsCreated: 0,
  customerEmailSent: 0
}, null, 2));
