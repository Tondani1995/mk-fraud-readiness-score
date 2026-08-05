import crypto from 'node:crypto';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const previewBaseUrl = String(process.env.PRE_G30_PREVIEW_BASE_URL ?? '').trim();
const expectedSha = String(process.env.PRE_G30_EXPECTED_SHA ?? '').trim();
const attemptId = String(process.env.PRE_G30_ATTEMPT_ID ?? '').trim();
const cronSecret = String(process.env.CRON_SECRET ?? '').trim();
const protectionBypass = String(process.env.VERCEL_PROTECTION_BYPASS ?? '').trim();
const outputPath = String(
  process.env.PRE_G30_RUNTIME_OUTPUT ?? 'tmp/g29/pre-g30-staging-worker-runtime.json'
).trim();
const providedTempDir = String(process.env.PRE_G30_RUNTIME_TMP ?? '').trim();

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA_PATTERN = /^[0-9a-f]{40}$/i;

function fail(message) {
  throw new Error(message);
}

function validateInputs() {
  if (!/^https:\/\/[^/]+(?:\/[^/]*)?$/.test(previewBaseUrl)) {
    fail('PRE_G30_PREVIEW_BASE_URL must be an HTTPS deployment URL.');
  }
  if (!SHA_PATTERN.test(expectedSha)) fail('PRE_G30_EXPECTED_SHA must be a full commit SHA.');
  if (!UUID_PATTERN.test(attemptId)) fail('fulfilment_attempt_id must be a UUID.');
  if (!cronSecret || cronSecret.length < 32) fail('CRON_SECRET is missing or shorter than 32 characters.');
  if (/^\*+$/.test(cronSecret) || cronSecret === '***********') {
    fail('CRON_SECRET is a masked placeholder.');
  }
  if (/(REDACTED|MASKED|SENSITIVE)/i.test(cronSecret)) {
    fail('CRON_SECRET is a placeholder.');
  }
  if (!protectionBypass) fail('VERCEL_PROTECTION_BYPASS is missing.');
}

function removeTree(target) {
  try {
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      const child = path.join(target, entry.name);
      if (entry.isDirectory()) removeTree(child);
      else fs.unlinkSync(child);
    }
    fs.rmdirSync(target);
  } catch {
    // Cleanup is best effort and never logs secret-bearing paths or values.
  }
}

function writeEvidence(evidence) {
  const outputAbsolutePath = path.resolve(outputPath);
  fs.mkdirSync(path.dirname(outputAbsolutePath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(outputAbsolutePath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
}

async function main() {
  validateInputs();
  const correlationReference = crypto.randomUUID();
  const ownsTempDir = !providedTempDir;
  const tempDir = providedTempDir || fs.mkdtempSync(path.join(os.tmpdir(), 'pre-g30-worker-'));
  fs.chmodSync(tempDir, 0o700);
  const headerPath = path.join(tempDir, 'headers.txt');
  const bodyPath = path.join(tempDir, 'body.json');
  const cookiePath = path.join(tempDir, 'cookies.txt');
  const responsePath = path.join(tempDir, 'response.json');
  try {
    fs.writeFileSync(
      headerPath,
      `Authorization: Bearer ${cronSecret}\nContent-Type: application/json\nx-vercel-protection-bypass: ${protectionBypass}\nx-vercel-set-bypass-cookie: true\n`,
      { mode: 0o600 }
    );
    fs.writeFileSync(
      bodyPath,
      JSON.stringify({ attemptId, correlationReference }),
      { mode: 0o600 }
    );
    fs.writeFileSync(cookiePath, '', { mode: 0o600 });

    const responseHeadersPath = path.join(tempDir, 'response-headers.txt');
    const curl = childProcess.spawnSync('curl', [
      '--silent',
      '--show-error',
      '--location',
      '--cookie', cookiePath,
      '--cookie-jar', cookiePath,
      '--output', responsePath,
      '--dump-header', responseHeadersPath,
      '--write-out', '%{http_code}',
      '--connect-timeout', '30',
      '--max-time', '120',
      '--request', 'POST',
      '--header', `@${headerPath}`,
      '--data-binary', `@${bodyPath}`,
      `${previewBaseUrl}/score/api/internal/fulfilment-worker`
    ], { encoding: 'utf8' });
    if (curl.error || curl.status === null) {
      writeEvidence({
        ok: false,
        httpStatus: null,
        responseBody: null,
        vercelRequestId: null,
        attemptId,
        correlationReference,
        deploymentUrl: previewBaseUrl,
        sha: expectedSha,
        timestamp: new Date().toISOString(),
        failureCategory: 'protected_worker_request_failed'
      });
      fail('Protected worker request could not be completed.');
    }
    const responseBody = fs.existsSync(responsePath) ? fs.readFileSync(responsePath, 'utf8') : '';
    const responseHeaders = fs.existsSync(responseHeadersPath)
      ? fs.readFileSync(responseHeadersPath, 'utf8')
      : '';
    if (!fs.existsSync(responsePath)) {
      writeEvidence({
        ok: false,
        httpStatus: null,
        responseBody: null,
        vercelRequestId: null,
        attemptId,
        correlationReference,
        deploymentUrl: previewBaseUrl,
        sha: expectedSha,
        timestamp: new Date().toISOString(),
        failureCategory: 'worker_response_body_missing'
      });
      fail('Protected worker returned no response body.');
    }
    if (responseBody.includes(cronSecret)) fail('Worker response contained the protected secret.');

    const httpStatus = Number.parseInt(String(curl.stdout ?? '').trim(), 10);
    if (!Number.isInteger(httpStatus)) {
      writeEvidence({
        ok: false,
        httpStatus: null,
        responseBody: responseBody.slice(0, 20000),
        vercelRequestId: null,
        attemptId,
        correlationReference,
        deploymentUrl: previewBaseUrl,
        sha: expectedSha,
        timestamp: new Date().toISOString(),
        failureCategory: 'worker_http_status_missing'
      });
      fail('Worker did not return an HTTP status.');
    }
    const vercelRequestId = responseHeaders.match(/^x-vercel-id:\s*(.+)$/im)?.[1]?.trim() ?? null;

    let parsed;
    try {
      parsed = JSON.parse(responseBody);
    } catch {
      writeEvidence({
        ok: false,
        httpStatus,
        responseBody: responseBody.slice(0, 20000),
        vercelRequestId,
        attemptId,
        correlationReference,
        deploymentUrl: previewBaseUrl,
        sha: expectedSha,
        timestamp: new Date().toISOString(),
        failureCategory: 'worker_non_json_response'
      });
      fail(`Worker returned a non-JSON response with HTTP ${httpStatus}.`);
    }
    const returnedAttemptId = typeof parsed?.attemptId === 'string' ? parsed.attemptId : null;
    const idempotentlyCompleted = parsed?.idempotentReplay === true;
    const claimed = parsed?.claimed === true || idempotentlyCompleted;
    const evidence = {
      ok: false,
      httpStatus,
      responseBody: parsed,
      vercelRequestId,
      attemptId,
      correlationReference,
      deploymentUrl: previewBaseUrl,
      sha: expectedSha,
      timestamp: new Date().toISOString(),
      claimed: parsed?.claimed === true,
      idempotentReplay: idempotentlyCompleted
    };
    const reject = (message, failureCategory) => {
      writeEvidence({ ...evidence, failureCategory });
      fail(message);
    };
    if (httpStatus < 200 || httpStatus >= 300) reject(`Worker returned HTTP ${httpStatus}.`, 'worker_http_error');
    if (parsed?.ok !== true) reject('Worker response did not report ok=true.', 'worker_ok_false');
    if (returnedAttemptId !== attemptId) reject('Worker returned a different attempt ID.', 'worker_attempt_mismatch');
    if (!claimed) reject('Worker did not claim or idempotently complete the requested attempt.', 'worker_not_claimed');
    if (parsed?.outcome !== 'automatic_release_complete' && !idempotentlyCompleted) {
      reject('Worker did not complete automatic release.', 'worker_release_incomplete');
    }
    const deliveryComplete = parsed?.delivery?.outcome === 'delivered'
      || (idempotentlyCompleted && parsed?.delivery?.outcome === 'not_claimed');
    if (!deliveryComplete) reject('Worker did not complete or safely replay delivery.', 'worker_delivery_incomplete');
    evidence.ok = true;
    writeEvidence(evidence);
    console.log(JSON.stringify({
      httpStatus: evidence.httpStatus,
      responseBody: evidence.responseBody,
      vercelRequestId: evidence.vercelRequestId,
      attemptId: evidence.attemptId,
      correlationReference: evidence.correlationReference,
      deploymentUrl: evidence.deploymentUrl,
      sha: evidence.sha,
      timestamp: evidence.timestamp,
      claimed: evidence.claimed,
      idempotentReplay: evidence.idempotentReplay
    }));
  } finally {
    if (ownsTempDir) removeTree(tempDir);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Worker invocation failed.');
  process.exitCode = 1;
});
