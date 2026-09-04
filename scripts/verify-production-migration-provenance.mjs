/**
 * Read-only recovery proof for the Production migration ledger.
 *
 * This check never connects to Supabase and never applies or repairs a migration. It verifies the
 * checked-in exact ledger export, its per-version SQL archive, the immutable df88 migration tree,
 * and the next forward migration.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const ledger = readJson('docs/provenance/production-migration-ledger.json');
const manifest = readJson('docs/provenance/production-migration-provenance-manifest.json');
const sha256 = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const exactRecords = ledger.records ?? [];
const manifestRecords = manifest.records ?? [];

assert.equal(exactRecords.length, 23);
assert.equal(manifestRecords.length, exactRecords.length);
assert.equal(manifest.remote_only_count_before, 23);
assert.equal(manifest.remote_only_count_after_provenance_archive, 0);
assert.equal(manifest.historical_rewrite, false);

const gitShow = (ref, file) => {
  const result = spawnSync('git', ['show', `${ref}:${file}`], { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout : null;
};
const activeBefore = spawnSync('git', [
  'ls-tree', '-r', '--name-only', 'df88caf06446a39fa401dfcf25d46d0411564475', '--', 'supabase/migrations'
], { cwd: root, encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean);
const activeNow = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter((file) => file.endsWith('.sql'))
  .map((file) => `supabase/migrations/${file}`);
assert.equal(activeBefore.length, 138);
assert.deepEqual(activeNow.filter((file) => !file.endsWith('20260904180000_align_paid_fulfilment_to_shared_manual_console.sql')).sort(), activeBefore.sort());
for (const file of activeBefore) {
  assert.equal(fs.readFileSync(path.join(root, file), 'utf8'), gitShow('df88caf06446a39fa401dfcf25d46d0411564475', file), `${file} changed from recovered Production source`);
}

for (const row of exactRecords) {
  const record = manifestRecords.find((item) => item.version === row.version);
  assert.ok(record, `missing manifest record for ${row.version}`);
  assert.equal(record.name, row.name);
  assert.equal(record.remote_applied, true);
  assert.ok(Array.isArray(row.statements));
  assert.ok(Object.prototype.hasOwnProperty.call(row, 'rollback'));
  assert.ok(Object.prototype.hasOwnProperty.call(row, 'created_by'));
  const exactSql = row.statements.join('\n');
  assert.equal(exactSql.length, record.statement_text_length, `${row.version} length mismatch`);
  assert.equal(sha256(exactSql), record.statement_sha256, `${row.version} exact SQL hash mismatch`);
  const archivePath = path.join(root, record.local_file_restored);
  const archivedSql = fs.readFileSync(archivePath, 'utf8');
  assert.ok(archivedSql === exactSql || archivedSql === `${exactSql}\n`, `${row.version} archive is not the exact ledger text`);
  if (record.originating_local_source_path) {
    const sourceSql = gitShow(record.originating_local_source_ref, record.originating_local_source_path);
    assert.ok(sourceSql !== null, `${row.version} originating source is not in its cited ref`);
    const sourceHash = sha256(sourceSql);
    assert.equal(sourceHash, record.originating_local_source_sha256, `${row.version} source hash mismatch`);
    assert.equal(sourceHash === record.statement_sha256, record.source_content_exact_match_to_remote_statement);
  } else {
    assert.equal(record.source_content_exact_match_to_remote_statement, false);
  }
}

const next = manifest.next_unapplied_forward_migration;
assert.equal(next.version, '20260904180000');
assert.equal(fs.existsSync(path.join(root, next.path)), true);
assert.equal(exactRecords.some((row) => row.version === next.version), false);
assert.equal(sha256(fs.readFileSync(path.join(root, next.path), 'utf8')), next.source_sha256);

console.log(JSON.stringify({
  ok: true,
  remoteAppliedRowsExported: exactRecords.length,
  remoteOnlyBefore: manifest.remote_only_count_before,
  remoteOnlyAfterProvenanceArchive: manifest.remote_only_count_after_provenance_archive,
  activeRecoveredMigrationFiles: activeBefore.length,
  activeMigrationFilesNow: activeNow.length,
  historicalMigrationRewrite: false,
  nextUnapplied: next.version,
  databaseMutation: 0,
  migrationApplyCalls: 0
}, null, 2));
