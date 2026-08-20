import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { spawnSync, execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';

const root = process.cwd();
const live = process.argv.includes('--live') || process.env.G29_RUN_LIVE === '1';
const outputPath = process.env.G29_OUTPUT ?? resolve(root, 'tmp/g29/g29-result.json');
const requestedSuiteIds = (process.env.G29_SUITE_IDS
  ?? process.argv.find((argument) => argument.startsWith('--suites='))?.slice('--suites='.length)
  ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const graph = JSON.parse(await readFile(resolve(root, 'docs/adaptive-assessment/adaptive-graph-v1-draft.json'), 'utf8'));
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();

const node = (file, loader = false) => ({
  command: process.execPath,
  args: loader ? ['--experimental-strip-types', '--experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs', file] : [file]
});
const npm = (script) => ({ command: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: ['run', script] });

const suites = [
  { id: 'adaptive.branch-matrix', category: 'adaptive', ...node('scripts/g29-adaptive-branch-matrix-tests.mjs', true) },
  { id: 'adaptive.engine', category: 'adaptive', ...npm('g25:test-adaptive-engine') },
  { id: 'adaptive.scoring', category: 'adaptive', ...npm('g27:test-adaptive-scoring') },
  { id: 'adaptive.correction', category: 'adaptive', ...npm('g27:test-adaptive-correction') },
  { id: 'adaptive.gateway-audit', category: 'adaptive', ...npm('g27:test-adaptive-gateway-audit') },
  { id: 'adaptive.customer-copy', category: 'adaptive', ...npm('g25:test-customer-copy') },
  { id: 'legacy.engine', category: 'legacy', ...npm('phase6:test-engine') },
  { id: 'legacy.scenarios', category: 'legacy', ...npm('phase6:test-scenarios') },
  { id: 'legacy.snapshot', category: 'legacy', ...npm('phase7:test-snapshot') },
  { id: 'legacy.report-contract', category: 'commercial', ...npm('phase10:test-report') },
  { id: 'legacy.respondent-integration', category: 'legacy', live: true, ...npm('consolidation:test-respondent') },
  { id: 'commercial.events', category: 'commercial', ...npm('phase13:test-events') },
  { id: 'commercial.conversion', category: 'commercial', ...npm('phase13:test-conversion') },
  { id: 'commercial.report-engine', category: 'commercial', ...npm('phase14:test-report-engine') },
  { id: 'commercial.payment-verification', category: 'commercial', ...npm('g29:test-payment-verification') },
  { id: 'commercial.numeric-claims', category: 'commercial', ...node('scripts/g27-commercial-report-numeric-tests.mjs') },
  { id: 'commercial.quality-a', category: 'commercial', ...npm('v7:test-checkpoint-a-unit') },
  { id: 'commercial.quality-b', category: 'commercial', ...npm('v7:test-checkpoint-b') },
  { id: 'commercial.quality-c', category: 'commercial', ...npm('v7:test-checkpoint-c') },
  { id: 'commercial.quality-d', category: 'commercial', ...npm('v7:test-checkpoint-d') },
  { id: 'commercial.quality-e', category: 'commercial', ...npm('v7:test-checkpoint-e') },
  { id: 'delivery.email', category: 'delivery', ...npm('phase14:test-email-delivery') },
  { id: 'delivery.webhook-adversarial', category: 'delivery', ...npm('phase14:test-webhook-adversarial') },
  { id: 'delivery.provider-faults', category: 'delivery', ...npm('phase14:test-provider-faults') },
  { id: 'delivery.storage-faults', category: 'delivery', ...npm('phase14:test-storage-faults') },
  { id: 'delivery.access-eligibility', category: 'delivery', ...npm('phase14:test-report-access-eligibility') },
  { id: 'delivery.verified-byte-delivery', category: 'delivery', ...npm('g29:test-verified-byte-delivery') },
  { id: 'delivery.security-closure', category: 'delivery', ...npm('phase14:test-security-closure') },
  { id: 'delivery.resend-rate-limit', category: 'delivery', ...npm('phase14:test-resend-webhook-rate-limit') },
  { id: 'database.accepted-migrations', category: 'database', ...npm('rc1:verify-accepted-migrations') },
  { id: 'database.service-role-contract', category: 'database', ...npm('rc1:test-service-role-contract') },
  { id: 'database.old-schema-freeze', category: 'database', ...npm('rc1:test-old-schema-freeze') },
  { id: 'database.migration-replay', category: 'database', ...npm('v7:test-checkpoint-e-migration') },
  { id: 'database.ai-route-authority', category: 'database', ...npm('pre-g30:test-ai-route-authority') },
  { id: 'database.migration-target-separation', category: 'database', ...npm('pre-g30:test-migration-targets') },
  { id: 'database.adaptive-launch-authority', category: 'database', ...npm('pre-g30:test-adaptive-launch') },
  { id: 'responsive.browser', category: 'responsive', live: true, ...npm('phase23:test-browser') },
  { id: 'integration.adaptive-db', category: 'integration', live: true, ...npm('g25:test-adaptive-db') },
  { id: 'integration.payment-db', category: 'integration', live: true, ...npm('phase23:test-payment-db') }
];

const knownSuiteIds = new Set(suites.map((suite) => suite.id));
for (const requestedSuiteId of requestedSuiteIds) {
  if (!knownSuiteIds.has(requestedSuiteId)) throw new Error(`Unknown G29 suite: ${requestedSuiteId}`);
}
const selectedSuites = requestedSuiteIds.length
  ? suites.filter((suite) => requestedSuiteIds.includes(suite.id))
  : suites;

const environmentFailure = /(G29_ENVIRONMENT_FAILURE|(?:LOCAL_DB_URL|G25_SUPABASE_URL|G25_SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_ROLE_KEY) is required|chrome executable|vercel protection bypass|net::ERR_CONNECTION_REFUSED at http:\/\/127\.0\.0\.1|dyld\[|libicudata|embedded-postgres|postgres init script failed)/i;
const extractJson = (text) => {
  for (const line of text.trim().split('\n').reverse()) {
    try { const parsed = JSON.parse(line); if (parsed && typeof parsed === 'object') return parsed; } catch {}
  }
  return null;
};

const results = [];
for (const suite of selectedSuites) {
  if (suite.live && !live) {
    results.push({ id: suite.id, category: suite.category, status: 'skipped', classification: 'environment/configuration', reason: 'live suite requires --live', exitCode: null });
    continue;
  }
  const run = spawnSync(suite.command, suite.args, {
    cwd: root, encoding: 'utf8', env: process.env,
    timeout: Number(process.env.G29_SUITE_TIMEOUT_MS ?? 180000)
  });
  const stdout = run.stdout ?? '';
  const stderr = run.stderr ?? '';
  const combined = `${stdout}\n${stderr}`;
  const parsed = extractJson(stdout);
  const status = run.status === 0 ? 'passed' : 'failed';
  const classification = status === 'passed'
    ? 'product'
    : (run.status === 2 || run.error?.code === 'ENOENT' || environmentFailure.test(combined) ? 'environment/configuration' : 'product');
  const severity = status === 'passed' || classification !== 'product'
    ? null
    : (/\bP0\b|critical|data loss|security bypass/i.test(combined) ? 'P0' : (/\bP2\b/i.test(combined) ? 'P2' : 'P1'));
  results.push({
    id: suite.id, category: suite.category, status, classification,
    severity,
    exitCode: run.status, signal: run.signal ?? null,
    assertions: parsed?.assertions ?? parsed?.tests ?? parsed?.passed ?? null,
    output: combined.slice(-8000), parsed
  });
}

const summary = {
  ok: results.every((result) => result.status === 'passed'),
  runner: 'g29-integrated-regression-runner', commit: sha,
  graphVersion: graph.graphVersion, graphFingerprint: graph.graphFingerprint,
  liveSuitesEnabled: live,
  selectedSuiteIds: selectedSuites.map((suite) => suite.id),
  suiteCounts: {
    passed: results.filter((result) => result.status === 'passed').length,
    failed: results.filter((result) => result.status === 'failed').length,
    skipped: results.filter((result) => result.status === 'skipped').length
  },
  productFailures: results.filter((result) => result.classification === 'product' && result.status === 'failed').map((result) => result.id),
  environmentFailures: results.filter((result) => result.classification === 'environment/configuration').map((result) => result.id),
  reportedAssertions: results.reduce((sum, result) => sum + (typeof result.assertions === 'number' ? result.assertions : 0), 0),
  results
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary));
process.exitCode = summary.productFailures.length ? 1 : (summary.environmentFailures.length ? 2 : 0);
