import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const files = (await readdir('supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .sort();
const versions = files.map((name) => name.split('_', 1)[0]);
assert.equal(new Set(versions).size, versions.length, 'migration version keys must be unique');

const manifest = JSON.parse(await readFile('scripts/pre-g30-migration-target-manifest.json', 'utf8'));
const previewOnly = manifest.stagingOnly.map((entry) => entry.migration);
assert.ok(previewOnly.length > 0, 'explicit Preview/Staging migration set is empty');
assert.equal(new Set(previewOnly).size, previewOnly.length, 'Staging-only manifest contains duplicates');
assert.deepEqual([...previewOnly].sort(), [...previewOnly].filter((name) => files.includes(name)).sort(), 'Staging-only manifest references missing migrations');
const productionTarget = files.filter((name) => !previewOnly.includes(name));
assert.equal(new Set(productionTarget).size, productionTarget.length);
for (const group of manifest.requiredProductionGroups) {
  for (const migration of group.patterns) assert.ok(productionTarget.includes(migration), `${group.group} migration is not in Production target: ${migration}`);
}

const productionSql = (await Promise.all(productionTarget.map((name) => readFile(`supabase/migrations/${name}`, 'utf8')))).join('\n');
for (const objectName of [
  'preview_development_prepare_premium_report_delivery',
  'preview_development_finalize_premium_report_delivery',
  'preview_development_mark_reconciliation_required',
  'preview_development_rpc'
]) {
  assert.doesNotMatch(productionSql, new RegExp(`\\b${objectName}\\b`), `${objectName} must not enter Production-target replay`);
}

const stagingSql = (await Promise.all(previewOnly.map((name) => readFile(`supabase/migrations/${name}`, 'utf8')))).join('\n');
assert.match(stagingSql, /preview_development_prepare_premium_report_delivery/);
assert.doesNotMatch(stagingSql, /create table public\.adaptive_graph_versions|create table if not exists public\.adaptive_graph_versions/);
for (const objectName of [
  'adaptive_graph_versions', 'assessment_navigation_states', 'adaptive_save_state',
  'phase14_ai_route_policies', 'authorize_phase14_ai_route'
]) assert.match(productionSql, new RegExp(`\\b${objectName}\\b`), `${objectName} must exist in the Production target`);

const checksums = {};
for (const name of files) checksums[name] = createHash('sha256').update(await readFile(`supabase/migrations/${name}`)).digest('hex');

console.log(JSON.stringify({
  ok: true,
  assertions: 13,
  migrationCount: files.length,
  productionTargetCount: productionTarget.length,
  stagingPreviewOnlyCount: previewOnly.length,
  productionTargetManifest: productionTarget.map((migration, dependencyOrder) => ({ migration, checksum: checksums[migration], target: 'production', dependencyOrder })),
  stagingOnlyManifest: manifest.stagingOnly.map((entry, dependencyOrder) => ({ ...entry, checksum: checksums[entry.migration], target: 'staging_only', dependencyOrder }))
}));
