import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const approved = new Map([
  ['20260722143000_checkpoint_e_phase1_ai_attempt_binding.sql', 'd546f6ac3f6743eebbb48b19815b6b2a3ea9926592fe1ca3cade025d7f46ce25'],
  ['20260724150000_release_a_backlog_reconciliation.sql', '4a1c7c88a7f70fb2f50776b140bb26d022aacbbdd41eb46ba160e6a237dc432e'],
  ['20260724160000_release_b_durable_fulfilment.sql', 'f3d37600a461e646007312c07640a1d49c513385094e98ab633795302c667046'],
  ['20260724170000_release_c_email_secure_delivery.sql', 'e320ea500bfcfb3b51166cbe957549ddb8189e53a33f6e1d4cd67845e1e18809'],
  ['20260724180000_release_c_closure_delivery_exceptions.sql', '0c0843897136b046d01c135297fd90911b95bcfd6d2f44490c49aaf153f56533'],
  ['20260725090000_release_c_runtime_secret_admin_provisioning.sql', 'a0eca9a5426955ea1526362940174b0463f7536131cf74fae938c7bfa105923d'],
  ['20260725150000_release_d_operational_alert_lifecycle.sql', 'efc3a4317d23316036cd09a7a1b300675cbdad1a6f5c7b798a7957dd092bf6d1'],
]);

for (const [name, expected] of approved) {
  const file = path.join(root, 'supabase', 'migrations', name);
  const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (actual !== expected) {
    console.error(`STOP accepted migration checksum drift: ${name}`);
    process.exit(1);
  }
}

const manifest = JSON.parse(fs.readFileSync(
  path.join(root, 'scripts', 'rc1-production-preflight.manifest.json'),
  'utf8',
));
const bootstrapName = `${manifest.freeze_bootstrap.version}_${manifest.freeze_bootstrap.name}.sql`;
const bootstrapActual = crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(root, 'supabase', 'migrations', bootstrapName)))
  .digest('hex');
if (bootstrapActual !== manifest.freeze_bootstrap.migration_sha256) {
  console.error(`STOP freeze-bootstrap migration checksum drift: ${bootstrapName}`);
  process.exit(1);
}

console.log(`PASS ${approved.size} accepted behaviour migrations and freeze-bootstrap checksum`);
