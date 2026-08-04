import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { spawnSync, execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';

// The disposable CI grants are deliberately broader than the Staging ACL contract so that
// the payment RPC integration can exercise PostgREST. Run the ACL contract before those
// test-only grants, then let the normal G29 runner handle the remaining disposable suites.
const root = process.cwd();
const outputPath = process.env.G29_OUTPUT ?? resolve(root, 'tmp/g29/service-role-contract.json');
const graph = JSON.parse(await readFile(resolve(root, 'docs/adaptive-assessment/adaptive-graph-v1-draft.json'), 'utf8'));
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const run = spawnSync(process.execPath, ['scripts/rc1-service-role-privilege-contract-tests.mjs'], {
  cwd: root,
  encoding: 'utf8',
  env: process.env,
});
const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`.trim();
let parsed = null;
for (const line of output.split('\n').reverse()) {
  try {
    const candidate = JSON.parse(line);
    if (candidate && typeof candidate === 'object') { parsed = candidate; break; }
  } catch {}
}
const passed = run.status === 0;
const result = {
  id: 'database.service-role-contract',
  category: 'database',
  status: passed ? 'passed' : 'failed',
  classification: 'product',
  severity: passed ? null : 'P1',
  exitCode: run.status,
  signal: run.signal ?? null,
  assertions: parsed?.assertions ?? null,
  output,
  parsed,
};
const summary = {
  ok: passed,
  runner: 'g29-service-role-contract-runner',
  commit,
  graphVersion: graph.graphVersion,
  graphFingerprint: graph.graphFingerprint,
  liveSuitesEnabled: true,
  selectedSuiteIds: [result.id],
  suiteCounts: { passed: passed ? 1 : 0, failed: passed ? 0 : 1, skipped: 0 },
  productFailures: passed ? [] : [result.id],
  environmentFailures: [],
  reportedAssertions: typeof result.assertions === 'number' ? result.assertions : 0,
  results: [result],
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary));
