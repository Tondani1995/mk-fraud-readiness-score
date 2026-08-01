/**
 * RC1 delivery-entitlement Storage checksum contract.
 *
 * The certification journey generated a real PDF, verified it in private Storage, and was then
 * refused delivery. phase14_delivery_entitlement requires the stored object to carry a sha256
 * equal to the report checksum, but read it only from storage.objects.metadata -- the *system*
 * metadata column (eTag, size, mimetype, cacheControl, ...). Supabase Storage records the
 * uploader's `metadata: { sha256 }` in storage.objects.user_metadata instead, so on this Storage
 * version the check could never pass and automatic premium delivery could never complete.
 *
 * These checks pin the correction and, more importantly, pin that it is a correction and not a
 * relaxation: a checksum must still be present and still equal the report's recorded checksum.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationName = '20260801120000_rc1_delivery_entitlement_user_metadata.sql';
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', migrationName), 'utf8');
const uploader = fs.readFileSync(path.join(root, 'src', 'lib', 'reports', 'phase1-manual-fulfilment.ts'), 'utf8');
const publication = fs.readFileSync(path.join(root, 'src', 'lib', 'reports', 'storage-publication.ts'), 'utf8');

let failures = 0;
let total = 0;
function test(name, fn) {
  total += 1;
  try {
    fn();
    console.log(`  ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`  FAIL - ${name}`);
    console.log(`    ${String(error?.message ?? error).split('\n').slice(0, 5).join('\n    ')}`);
  }
}

console.log('RC1 -- delivery entitlement storage checksum');

test('E1. the object lookup selects user_metadata', () => {
  assert.match(
    migration,
    /select bucket_id, name, metadata, user_metadata into v_object from storage\.objects/,
    'user_metadata must be read from storage.objects',
  );
});

test('E2. user_metadata is consulted first, and the historical locations are retained', () => {
  assert.match(
    migration,
    /coalesce\(v_object\.user_metadata->>'sha256', v_object\.metadata->>'sha256', v_object\.metadata->'metadata'->>'sha256', ''\)/,
    'the coalesce chain must prefer user_metadata and keep both legacy locations',
  );
});

test('E3. the checksum comparison is unchanged and still fails closed', () => {
  // Still compared against the report's own recorded checksum, still the same refusal.
  assert.match(migration, /<> v_report\.checksum then raise exception 'report_storage_metadata_mismatch'/);
  // A missing checksum coalesces to '' and therefore still mismatches.
  assert.match(migration, /, ''\) <> v_report\.checksum/);
});

test('E4. the mimetype requirement is untouched', () => {
  assert.match(migration, /coalesce\(v_object\.metadata->>'mimetype', ''\) <> 'application\/pdf'/);
});

test('E5. every other entitlement condition survives verbatim', () => {
  for (const condition of [
    'delivery_report_type_ineligible',
    'delivery_price_mismatch',
    'delivery_currency_mismatch',
    'delivery_order_not_paid',
    'delivery_manual_verification_missing',
    'delivery_product_policy_mismatch',
    'delivery_relationship_mismatch',
    'delivery_stale_score_run',
    'delivery_score_run_ineligible',
    'delivery_report_not_current',
    'delivery_report_status_forbidden',
    'download_report_status_forbidden',
    'delivery_storage_metadata_invalid',
    'report_storage_object_missing',
    'delivery_recipient_override_forbidden',
  ]) {
    assert.ok(migration.includes(condition), `the replacement dropped: ${condition}`);
  }
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/);
});

test('E6. the uploader really writes the checksum Supabase stores as user metadata', () => {
  // The uploader was always correct; this pins that it stays correct, so the two halves cannot
  // drift apart again.
  assert.match(uploader, /metadata: \{ sha256: checksum, reportReference, orderId: assembled\.orderId \}/);
  assert.match(publication, /metadata: \{\s*\n\s*sha256: input\.checksum,/);
});

test('E7. the migration changes nothing but this function', () => {
  const executable = migration.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n');
  assert.equal((executable.match(/create or replace function/g) ?? []).length, 1);
  assert.match(executable, /create or replace function public\.phase14_delivery_entitlement/);
  assert.doesNotMatch(executable, /drop |alter table|grant |revoke |delete from|update /i);
});

console.log('');
console.log(`rc1-delivery-entitlement-metadata: ${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
