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
  requiredPdfChecks: null,
  productFailures: [],
  environmentFailures: []
};

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const bytesFromBlob = async (blob) => Buffer.from(await blob.arrayBuffer());
const safeMessage = (value) => String(value ?? '').replace(/https?:\/\/[^\s]+/gi, '[redacted-url]').replace(/[?&](?:token|jwt|signature|apikey|download)=[^&\s]+/gi, '[redacted-query]').slice(0, 240);

function safeUrlShape(rawUrl) {
  if (!rawUrl) return { present: false, valid: false };
  try {
    const url = new URL(rawUrl);
    const decodedPath = decodeURIComponent(url.pathname);
    return {
      present: true,
      valid: true,
      scheme: url.protocol.replace(':', ''),
      host: url.hostname,
      expectedBucket: decodedPath.includes(`/object/sign/${report.storageBucket}/`),
      expectedObjectPath: decodedPath.includes(`/object/sign/${report.storageBucket}/${report.storagePath}`),
      queryKeys: [...new Set([...url.searchParams.keys()])].sort()
    };
  } catch {
    return { present: true, valid: false };
  }
}

async function responseEvidence(response, body) {
  const contentType = response.headers.get('content-type');
  const evidence = {
    status: response.status,
    host: new URL(response.url).hostname,
    contentType,
    bytes: body.length,
    checksum: sha256(body),
    pdfMagic: body.subarray(0, 4).toString('ascii') === '%PDF',
    location: null,
    error: null
  };
  const location = response.headers.get('location');
  if (location) evidence.location = safeUrlShape(new URL(location, response.url).toString());
  if (contentType?.toLowerCase().includes('json')) {
    try {
      const parsed = JSON.parse(body.toString('utf8'));
      evidence.error = {
        code: typeof parsed.code === 'string' ? safeMessage(parsed.code) : null,
        message: typeof parsed.message === 'string' ? safeMessage(parsed.message) : typeof parsed.error === 'string' ? safeMessage(parsed.error) : null
      };
    } catch {
      evidence.error = { code: null, message: safeMessage(body.toString('utf8')) };
    }
  }
  return evidence;
}

async function followRedirects(startUrl) {
  const chain = [];
  const cookies = new Map();
  let currentUrl = startUrl;
  for (let redirectCount = 0; redirectCount <= 6; redirectCount += 1) {
    const requestStartedAt = Date.now();
    const headers = { 'x-vercel-protection-bypass': protectionBypass, 'x-vercel-set-bypass-cookie': 'true' };
    const cookie = [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
    if (cookie) headers.cookie = cookie;
    const response = await fetch(currentUrl, {
      redirect: 'manual',
      headers,
      signal: AbortSignal.timeout(30000)
    });
    const setCookies = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()
      : [response.headers.get('set-cookie')].filter(Boolean);
    for (const setCookie of setCookies) {
      const pair = setCookie.split(';', 1)[0];
      const separator = pair.indexOf('=');
      if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
    const body = Buffer.from(await response.arrayBuffer());
    const item = await responseEvidence(response, body);
    item.elapsedMs = Date.now() - requestStartedAt;
    chain.push(item);
    if (response.status < 300 || response.status >= 400) return { initial: chain[0], final: item, chain };
    const location = response.headers.get('location');
    if (!location) return { initial: chain[0], final: item, chain };
    currentUrl = new URL(location, currentUrl).toString();
  }
  return { initial: chain[0], final: chain.at(-1), chain };
}

async function signedProbe(label, signedUrlResult) {
  const output = { label, created: Boolean(signedUrlResult?.signedUrl), creationError: null, url: null, response: null };
  if (!signedUrlResult?.signedUrl) return output;
  output.url = safeUrlShape(signedUrlResult.signedUrl);
  output.response = await followRedirects(signedUrlResult.signedUrl);
  return output;
}

async function writeResult() {
  await writeFile(join(outputDirectory, 'retained-pdf-review.json'), `${JSON.stringify(result, null, 2)}\n`);
}

try {
  const { data: tokenResult, error: tokenError } = await db.rpc('issue_customer_report_access_token', {
    p_order_id: report.orderId,
    p_report_id: report.reportId,
    p_recipient_email: report.recipient,
    p_ttl_seconds: 3600
  });
  if (tokenError || !tokenResult?.token) throw new Error(`customer access token issuance failed: ${tokenError?.message ?? 'missing token'}`);

  const customerUrl = `${previewBaseUrl}/score/report/access/${encodeURIComponent(tokenResult.token)}`;
  const withoutDownload = await db.storage.from(report.storageBucket).createSignedUrl(report.storagePath, 60);
  const withFilename = await db.storage.from(report.storageBucket).createSignedUrl(report.storagePath, 60, { download: report.reportReference.replace(/[^A-Za-z0-9._-]/g, '_') + '.pdf' });
  result.customerAccess = {
    directWithoutDownload: await signedProbe('A:createSignedUrl(path,60)', withoutDownload.data),
    directWithFilename: await signedProbe('B:createSignedUrl(path,60,{download:file_name})', withFilename.data),
    route: await followRedirects(customerUrl)
  };
  if (withoutDownload.error) result.customerAccess.directWithoutDownload.creationError = safeMessage(withoutDownload.error.message);
  if (withFilename.error) result.customerAccess.directWithFilename.creationError = safeMessage(withFilename.error.message);

  const routeFinal = result.customerAccess.route.final;
  const routeInitial = result.customerAccess.route.initial;
  const applicationRedirect = result.customerAccess.route.chain.find((item) => item.location?.expectedBucket && item.location?.expectedObjectPath) ?? null;
  const routeLocationValid = Boolean(applicationRedirect?.status >= 300 && applicationRedirect.status < 400 && applicationRedirect.location?.valid && applicationRedirect.location.expectedBucket && applicationRedirect.location.expectedObjectPath);
  result.customerAccess.applicationRedirect = applicationRedirect;
  const customerMatches = Boolean(routeFinal?.status === 200 && routeFinal.contentType?.toLowerCase().startsWith('application/pdf') && routeFinal.pdfMagic && routeFinal.bytes === report.expectedBytes && routeFinal.checksum === report.expectedChecksum);
  result.customerAccess.initialRouteValid = routeLocationValid;
  result.customerAccess.final = routeFinal;
  result.customerAccess.matchedStorage = customerMatches;
  if (!customerMatches || !routeLocationValid) result.productFailures.push('customer_signed_access_did_not_return_matching_pdf');
} catch (error) {
  result.customerAccess = { error: safeMessage(error?.message ?? error) };
  result.environmentFailures.push('customer_signed_access_request_failed');
}

try {
  const { data: storageBlob, error: storageError } = await db.storage.from(report.storageBucket).download(report.storagePath);
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
  const { noModerateExposureWording: _expectedReportCopyCheck, visualInspectionRequired: _inspectionMarker, ...requiredChecks } = result.visualChecks;
  result.requiredPdfChecks = { ...requiredChecks, allPassed: Object.values(requiredChecks).every(Boolean) };
} catch (error) {
  result.environmentFailures.push('retained_storage_or_pdf_review_failed');
  result.storage ??= { error: safeMessage(error?.message ?? error) };
}

const customerFinal = result.customerAccess?.final;
const customerGate = Boolean(
  result.customerAccess?.initialRouteValid
  && customerFinal?.status === 200
  && customerFinal.contentType?.toLowerCase().startsWith('application/pdf')
  && customerFinal.pdfMagic
  && customerFinal.bytes === report.expectedBytes
  && customerFinal.checksum === report.expectedChecksum
  && result.customerAccess?.matchedStorage
);
result.ok = customerGate
  && result.storage?.matchesExpected === true
  && result.storage?.pdfMagic === true
  && result.requiredPdfChecks?.allPassed === true
  && result.productFailures.length === 0
  && result.environmentFailures.length === 0;
await writeResult();
console.log(JSON.stringify({
  ...result,
  customerAccess: result.customerAccess ? {
    ...result.customerAccess,
    token: undefined
  } : null
}));
process.exitCode = result.ok ? 0 : 1;
