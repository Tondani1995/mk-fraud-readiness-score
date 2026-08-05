import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const files = (await readdir('supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .sort();
const versions = files.map((name) => name.split('_', 1)[0]);
assert.equal(new Set(versions).size, versions.length, 'migration version keys must be unique');

const previewOnly = files.filter((name) => /preview_development|rc1_preview_resend|g24_adaptive|g25_adaptive|g27_adaptive/i.test(name));
assert.ok(previewOnly.length > 0, 'explicit Preview/Staging migration set is empty');
const productionTarget = files.filter((name) => !previewOnly.includes(name));
assert.equal(new Set(productionTarget).size, productionTarget.length);

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
assert.match(stagingSql, /adaptive_graph_versions|adaptive_save_state/);

console.log(JSON.stringify({
  ok: true,
  assertions: 7,
  migrationCount: files.length,
  productionTargetCount: productionTarget.length,
  stagingPreviewOnlyCount: previewOnly.length,
  stagingPreviewOnlyMigrations: previewOnly
}));
