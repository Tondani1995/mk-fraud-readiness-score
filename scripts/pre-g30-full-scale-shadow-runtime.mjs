import childProcess from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const baseUrl = String(process.env.PRE_G30_PREVIEW_BASE_URL ?? '').trim();
const expectedSha = String(process.env.PRE_G30_EXPECTED_SHA ?? '').trim();
const cronSecret = String(process.env.CRON_SECRET ?? '').trim();
const protectionBypass = String(process.env.VERCEL_PROTECTION_BYPASS ?? '').trim();
const outputPath = String(process.env.PRE_G30_SHADOW_OUTPUT ?? 'tmp/g29/pre-g30-full-scale-shadow.json').trim();
const shaPattern = /^[0-9a-f]{40}$/i;

function fail(message) { throw new Error(message); }
function validate() {
  if (!/^https:\/\/[^/]+(?:\/[^/]*)?$/.test(baseUrl)) fail('Preview URL is invalid.');
  if (!shaPattern.test(expectedSha)) fail('Expected SHA is invalid.');
  if (!cronSecret || cronSecret.length < 32 || /^\*+$/.test(cronSecret) || cronSecret === '***********' || /(REDACTED|MASKED|SENSITIVE)/i.test(cronSecret)) fail('CRON_SECRET is unavailable.');
  if (!protectionBypass) fail('Vercel protection bypass is unavailable.');
}
function removeTree(target) {
  try {
    for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
      const child = path.join(target, entry.name);
      if (entry.isDirectory()) removeTree(child); else fs.unlinkSync(child);
    }
    fs.rmdirSync(target);
  } catch { /* best effort cleanup */ }
}
function writeEvidence(value) {
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

validate();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pre-g30-shadow-'));
fs.chmodSync(tempDir, 0o700);
const headerPath = path.join(tempDir, 'headers.txt');
const bodyPath = path.join(tempDir, 'body.json');
const responsePath = path.join(tempDir, 'response.json');
const responseHeadersPath = path.join(tempDir, 'response-headers.txt');
try {
  fs.writeFileSync(headerPath, `Authorization: Bearer ${cronSecret}\nContent-Type: application/json\nx-vercel-protection-bypass: ${protectionBypass}\nx-vercel-set-bypass-cookie: true\n`, { mode: 0o600 });
  fs.writeFileSync(bodyPath, '{}\n', { mode: 0o600 });
  const curl = childProcess.spawnSync('curl', [
    '--silent', '--show-error', '--output', responsePath,
    '--dump-header', responseHeadersPath, '--write-out', '%{http_code}',
    '--connect-timeout', '30', '--max-time', '360', '--request', 'POST',
    '--header', `@${headerPath}`, '--data-binary', `@${bodyPath}`,
    `${baseUrl}/score/api/internal/pre-g30/full-scale-structured-shadow`
  ], { encoding: 'utf8' });
  if (curl.error || curl.status === null) fail('Shadow request could not be completed.');
  const httpStatus = Number.parseInt(String(curl.stdout ?? '').trim(), 10);
  const responseBody = fs.existsSync(responsePath) ? fs.readFileSync(responsePath, 'utf8') : '';
  const responseHeaders = fs.existsSync(responseHeadersPath) ? fs.readFileSync(responseHeadersPath, 'utf8') : '';
  if (responseBody.includes(cronSecret)) fail('Shadow response contained CRON_SECRET.');
  let parsed;
  try { parsed = JSON.parse(responseBody); } catch {
    const safeBody = responseBody.replace(/\s+/g, ' ').trim().slice(0, 120);
    writeEvidence({ ok: false, httpStatus, response: { error: 'non_json_response', bodyPrefix: safeBody }, vercelRequestId: responseHeaders.match(/^x-vercel-id:\s*(.+)$/im)?.[1]?.trim() ?? null, timestamp: new Date().toISOString(), deploymentUrl: baseUrl, sha: expectedSha });
    fail(`Shadow response was not JSON (HTTP ${httpStatus}).`);
  }
  const evidence = {
    ok: parsed?.ok === true && httpStatus >= 200 && httpStatus < 300,
    httpStatus,
    response: parsed,
    vercelRequestId: responseHeaders.match(/^x-vercel-id:\s*(.+)$/im)?.[1]?.trim() ?? null,
    timestamp: new Date().toISOString(),
    deploymentUrl: baseUrl,
    sha: expectedSha
  };
  writeEvidence(evidence);
  console.log(JSON.stringify({ httpStatus: evidence.httpStatus, response: evidence.response, vercelRequestId: evidence.vercelRequestId, timestamp: evidence.timestamp, deploymentUrl: evidence.deploymentUrl, sha: evidence.sha }));
  if (!evidence.ok) process.exitCode = 1;
} finally {
  removeTree(tempDir);
}
