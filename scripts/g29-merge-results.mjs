import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const inputPaths = process.argv.slice(2);
assert(inputPaths.length > 0, 'Usage: node scripts/g29-merge-results.mjs <result.json>...');

const graph = JSON.parse(await readFile(resolve(root, 'docs/adaptive-assessment/adaptive-graph-v1-draft.json'), 'utf8'));
const expectedSuiteIds = [
  'adaptive.branch-matrix', 'adaptive.engine', 'adaptive.scoring', 'adaptive.correction', 'adaptive.gateway-audit', 'adaptive.customer-copy',
  'legacy.engine', 'legacy.scenarios', 'legacy.snapshot', 'legacy.report-contract',
  'commercial.events', 'commercial.conversion', 'commercial.report-engine', 'commercial.numeric-claims',
  'commercial.quality-a', 'commercial.quality-b', 'commercial.quality-c', 'commercial.quality-d', 'commercial.quality-e',
  'delivery.email', 'delivery.webhook-adversarial', 'delivery.provider-faults', 'delivery.storage-faults',
  'delivery.access-eligibility', 'delivery.security-closure', 'delivery.resend-rate-limit',
  'database.accepted-migrations', 'database.service-role-contract', 'database.old-schema-freeze', 'database.migration-replay',
  'responsive.browser', 'integration.adaptive-db', 'integration.payment-db'
].sort();

const parts = await Promise.all(inputPaths.map(async (inputPath) => JSON.parse(await readFile(resolve(root, inputPath), 'utf8'))));
assert(parts.length > 0);
const commits = new Set(parts.map((part) => part.commit));
const graphVersions = new Set(parts.map((part) => part.graphVersion));
const fingerprints = new Set(parts.map((part) => part.graphFingerprint));
assert.equal(commits.size, 1, 'G29 result files must use one commit');
assert.deepEqual([...graphVersions], [graph.graphVersion], 'G29 result files must use the committed graph version');
assert.deepEqual([...fingerprints], [graph.graphFingerprint], 'G29 result files must use the committed graph fingerprint');

const results = parts.flatMap((part) => part.results ?? []);
const ids = results.map((result) => result.id);
assert.equal(new Set(ids).size, ids.length, 'Every G29 suite must appear exactly once');
assert.deepEqual([...ids].sort(), expectedSuiteIds, 'G29 result set is incomplete or contains an unknown suite');

const suiteCounts = {
  passed: results.filter((result) => result.status === 'passed').length,
  failed: results.filter((result) => result.status === 'failed').length,
  skipped: results.filter((result) => result.status === 'skipped').length
};
const merged = {
  ok: suiteCounts.passed === expectedSuiteIds.length
    && suiteCounts.failed === 0
    && suiteCounts.skipped === 0
    && parts.every((part) => part.productFailures.length === 0 && part.environmentFailures.length === 0),
  runner: 'g29-merge-results',
  commit: [...commits][0],
  graphVersion: [...graphVersions][0],
  graphFingerprint: [...fingerprints][0],
  liveSuitesEnabled: true,
  selectedSuiteIds: expectedSuiteIds,
  suiteCounts,
  productFailures: results.filter((result) => result.status === 'failed' && result.classification === 'product').map((result) => result.id),
  environmentFailures: results.filter((result) => result.status === 'failed' && result.classification === 'environment/configuration').map((result) => result.id),
  reportedAssertions: results.reduce((sum, result) => sum + (typeof result.assertions === 'number' ? result.assertions : 0), 0),
  results
};

const outputPath = process.env.G29_MERGED_OUTPUT ?? 'tmp/g29/g29-merged-result.json';
await writeFile(resolve(root, outputPath), `${JSON.stringify(merged, null, 2)}\n`);
console.log(JSON.stringify(merged));
process.exitCode = merged.ok ? 0 : 1;
