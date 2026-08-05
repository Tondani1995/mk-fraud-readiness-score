import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const outputDirectory = process.env.G29_PDF_OUTPUT ?? 'tmp/g29/retained-pdf';
await mkdir(outputDirectory, { recursive: true });
const supabaseUrl = required('G29_STAGING_SUPABASE_URL');
const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');
const previewBaseUrl = required('G29_PREVIEW_BASE_URL').replace(/\/$/, '');
const protectionBypass = required('VERCEL_PROTECTION_BYPASS');
const report = {
  orderId: '1038733e-b4d5-482f-8bb9-386a80d5c0b7',
  reportId: 'efa89669-6c35-4bfd-9fcd-2e5dabef4a49',
  reportReference: 'RPT-MKFRS-2026-956FEA052B-V1',
  recipient: 'admin@mkfraud.co.za',
  storageBucket: 'generated-reports',
  storagePath: 'e40d1f06-24d9-4bd7-a34a-da252737fd13/1038733e-b4d5-482f-8bb9-386a80d5c0b7/v1/RPT-MKFRS-2026-956FEA052B-V1-49e8509cb93b9e44.pdf',
  expectedBytes: 329740,
  expectedChecksum: '49e8509cb93b9e44b8f8e3f561c3d475872d90f068f644ac696cbef6848939b5'
};

const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const result = {
  ok: false,
  commit: process.env.GITHUB_SHA ?? null,
  report,
  customerAccess: null,
  storage: null,
  pdf: null,
  visualChecks: null,
  environmentFailures: []
};

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const bytesFromBlob = async (blob) => Buffer.from(await blob.arrayBuffer());

try {
  const { data: tokenResult, error: tokenError } = await db.rpc('issue_customer_report_access_token', {
    p_order_id: report.orderId,
    p_report_id: report.reportId,
    p_recipient_email: report.recipient,
    p_ttl_seconds: 3600
  });
  if (tokenError || !tokenResult?.token) throw new Error(`customer access token issuance failed: ${tokenError?.message ?? 'missing token'}`);

  const customerUrl = `${previewBaseUrl}/score/report/access/${encodeURIComponent(tokenResult.token)}`;
  const customerResponse = await fetch(customerUrl, {
    redirect: 'follow',
    headers: { 'x-vercel-protection-bypass': protectionBypass },
    signal: AbortSignal.timeout(30000)
  });
  const customerBytes = Buffer.from(await customerResponse.arrayBuffer());
  const customerChecksum = sha256(customerBytes);
  const customerContentType = customerResponse.headers.get('content-type');
  result.customerAccess = {
    status: customerResponse.status,
    finalUrlHost: new URL(customerResponse.url).hostname,
    contentType: customerContentType,
    bytes: customerBytes.length,
    checksum: customerChecksum,
    pdfMagic: customerBytes.subarray(0, 4).toString('ascii') === '%PDF',
    matchedStorage: customerBytes.length === report.expectedBytes && customerChecksum === report.expectedChecksum
  };
  if (!result.customerAccess.matchedStorage) {
    result.environmentFailures.push('customer_signed_access_did_not_return_matching_pdf');
  } else {
    await writeFile(join(outputDirectory, 'customer-download.pdf'), customerBytes);
  }
} catch (error) {
  result.customerAccess = { error: String(error?.message ?? error) };
  result.environmentFailures.push('customer_signed_access_request_failed');
}

const { data: storageBlob, error: storageError } = await db.storage
  .from(report.storageBucket)
  .download(report.storagePath);
if (storageError || !storageBlob) throw new Error(`Storage download failed: ${storageError?.message ?? 'missing object'}`);
const storageBytes = await bytesFromBlob(storageBlob);
const storageChecksum = sha256(storageBytes);
const storagePath = join(outputDirectory, 'storage-download.pdf');
await writeFile(storagePath, storageBytes);
result.storage = {
  bytes: storageBytes.length,
  checksum: storageChecksum,
  contentType: storageBlob.type || null,
  pdfMagic: storageBytes.subarray(0, 4).toString('ascii') === '%PDF',
  matchesExpected: storageBytes.length === report.expectedBytes && storageChecksum === report.expectedChecksum
};

const pdfInfo = execFileSync('pdfinfo', [storagePath], { encoding: 'utf8' });
const pageCount = Number(pdfInfo.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0);
const renderDirectory = join(outputDirectory, 'rendered-pages');
await mkdir(renderDirectory, { recursive: true });
for (let page = 1; page <= pageCount; page += 1) {
  const output = join(renderDirectory, `page-${String(page).padStart(3, '0')}`);
  execFileSync('pdftoppm', ['-f', String(page), '-l', String(page), '-png', '-singlefile', storagePath, output]);
}
const extractedTextPath = join(outputDirectory, 'extracted-text.txt');
execFileSync('pdftotext', [storagePath, extractedTextPath]);
const extractedText = await readFile(extractedTextPath, 'utf8');
result.pdf = {
  pageCount,
  bytes: storageBytes.length,
  checksum: storageChecksum,
  mimeType: storageBlob.type || null,
  pdfMagic: storageBytes.subarray(0, 4).toString('ascii') === '%PDF'
};
result.visualChecks = {
  noAdaptiveExposureScore: !/adaptive\s+exposure\s+score/i.test(extractedText),
  noAdaptiveExposureBand: !/adaptive\s+exposure\s+band/i.test(extractedText),
  noModerateExposureWording: !/moderate\s+exposure/i.test(extractedText),
  noExposureVersusReadinessHeading: !/exposure\s+versus\s+readiness/i.test(extractedText),
  unknownNotDescribedAsAbsence: !/unknown.{0,40}(absence|failed|ineffective)/is.test(extractedText),
  excludedNotDescribedAsWeakness: !/excluded.{0,40}weakness/is.test(extractedText),
  unsupportedNumericClaimsAbsent: !/\b(?:peer average|benchmark|percentile)\b/i.test(extractedText),
  visualInspectionRequired: true
};
result.ok = result.environmentFailures.length === 0 && result.storage.matchesExpected && result.customerAccess?.matchedStorage === true;
await writeFile(join(outputDirectory, 'retained-pdf-review.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ ...result, customerAccess: result.customerAccess && { ...result.customerAccess, token: undefined } }));
