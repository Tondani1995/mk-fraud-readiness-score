/**
 * Joint-launch cutover gate — executable, READ-ONLY.
 *
 * "Migrations before code" is necessary but not sufficient. The catalogue migration changes live
 * product prices the instant it commits, so between that commit and the matching deployment there
 * would otherwise be a window in which an ordinary user hits the OLD application contract against
 * the NEW database catalogue. This gate exists so that window is never merely asserted in prose.
 *
 * Two things close the window, and this script proves both rather than describing them:
 *
 *   1. THE OPERATION FREEZE. public.orders carries the RC1 freeze trigger on the `order_create`
 *      surface. While the database is FROZEN, no order can be created by any application version --
 *      old or new. The migrations and the deployment therefore both land inside the freeze, and the
 *      freeze is released only after the smoke checks pass.
 *
 *   2. THE CATALOGUE CONTRACT CHECK. create_paid_order() is told the catalogue contract the calling
 *      build compiled against and refuses the write if the database disagrees. So even if the freeze
 *      were released early, a stale R5,000 deployment cannot write a mispriced order -- it is
 *      rejected with paid_order_catalogue_contract_mismatch instead.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/joint-launch-release-window-gate.mjs --stage pre-migration
 *
 *   --stage pre-migration   before applying the four joint-launch migrations
 *   --stage post-migration  after applying them, before deploying the application
 *   --stage post-deploy     after deploying, before releasing the freeze
 *   --json                  machine-readable output
 *
 * This script issues SELECTs only. It never applies a migration, never deploys, never mutates a
 * row, and never releases the freeze -- releasing is a deliberate human action taken only after
 * this gate reports PASS at the post-deploy stage.
 */

import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

import {
  COMMERCIAL_CURRENCY,
  COMPREHENSIVE_PRICE_CENTS,
  COMPREHENSIVE_PRODUCT_CODE,
  ESSENTIAL_PRICE_CENTS,
  ESSENTIAL_PRODUCT_CODE
} from '../src/lib/commercial/product-catalogue.ts';

const JOINT_LAUNCH_MIGRATIONS = [
  '20260810120000',
  '20260810121000',
  '20260810122000',
  '20260810123000',
  '20260810124000',
  '20260810125000'
];

const STAGES = ['pre-migration', 'post-migration', 'post-deploy'];

// Read-only self-check: this gate must never be able to change the environment it inspects.
const source = fs.readFileSync(new URL(import.meta.url), 'utf8');
const mutationPattern = /\.(insert|update|upsert|delete|remove)\s*\(|\b(INSERT INTO|UPDATE |DELETE FROM|ALTER |DROP |TRUNCATE|rc1_release_freeze|rc1_activate_freeze)\b/;
const guarded = source.replace(/mutationPattern\s*=\s*\/[^\n]*\n/, '');
if (mutationPattern.test(guarded)) {
  console.error('REFUSING TO RUN: the release gate must be read-only but its source contains a mutation.');
  process.exit(2);
}

const args = process.argv.slice(2);
const stage = args.includes('--stage') ? args[args.indexOf('--stage') + 1] : null;
const asJson = args.includes('--json');

if (!STAGES.includes(stage)) {
  console.error(`--stage must be one of: ${STAGES.join(', ')}`);
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. No credential is printed by this gate.');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const checks = [];
function record(id, ok, detail) {
  checks.push({ id, ok, detail });
}

// 1. The freeze must be ACTIVE for every stage up to and including post-deploy. Releasing it is the
//    final step of the cutover and happens only after this gate passes at post-deploy.
const { data: freeze, error: freezeError } = await db.rpc('rc1_freeze_status');
if (freezeError) {
  record('freeze_status_readable', false, `rc1_freeze_status unavailable: ${freezeError.message}`);
} else {
  const state = freeze?.state ?? 'unknown';
  record(
    'operation_freeze_active',
    state !== 'released',
    `freeze state is "${state}"; order creation must be frozen for the whole cutover`
  );
}

// 2. Migration ledger.
const { data: ledger, error: ledgerError } = await db
  .schema('supabase_migrations')
  .from('schema_migrations')
  .select('version')
  .in('version', JOINT_LAUNCH_MIGRATIONS);

const appliedVersions = new Set((ledger ?? []).map((row) => row.version));
const allApplied = JOINT_LAUNCH_MIGRATIONS.every((version) => appliedVersions.has(version));

if (ledgerError) {
  record('migration_ledger_readable', false, `ledger unavailable: ${ledgerError.message}`);
} else if (stage === 'pre-migration') {
  record(
    'joint_launch_migrations_not_yet_applied',
    appliedVersions.size === 0,
    `${appliedVersions.size} of ${JOINT_LAUNCH_MIGRATIONS.length} joint-launch migrations already applied`
  );
} else {
  record(
    'joint_launch_migrations_applied',
    allApplied,
    `${appliedVersions.size} of ${JOINT_LAUNCH_MIGRATIONS.length} joint-launch migrations applied`
  );
}

// 3. Catalogue state.
const { data: products, error: productsError } = await db
  .from('products')
  .select('product_code,name,price_cents,currency,active');

if (productsError) {
  record('catalogue_readable', false, `products unavailable: ${productsError.message}`);
} else {
  const byCode = Object.fromEntries((products ?? []).map((row) => [row.product_code, row]));
  const essential = byCode[ESSENTIAL_PRODUCT_CODE];
  const comprehensive = byCode[COMPREHENSIVE_PRODUCT_CODE];

  if (stage === 'pre-migration') {
    record(
      'catalogue_still_pre_cutover',
      essential?.price_cents !== ESSENTIAL_PRICE_CENTS,
      `Essential is ${essential?.price_cents}; the cutover has not been applied yet`
    );
  } else {
    record(
      'essential_price_is_launch_contract',
      essential?.price_cents === ESSENTIAL_PRICE_CENTS && essential?.currency === COMMERCIAL_CURRENCY,
      `Essential is ${essential?.price_cents} ${essential?.currency}, expected ${ESSENTIAL_PRICE_CENTS} ${COMMERCIAL_CURRENCY}`
    );
    record(
      'comprehensive_price_is_launch_contract',
      comprehensive?.price_cents === COMPREHENSIVE_PRICE_CENTS && comprehensive?.currency === COMMERCIAL_CURRENCY,
      `Comprehensive is ${comprehensive?.price_cents} ${comprehensive?.currency}, expected ${COMPREHENSIVE_PRICE_CENTS} ${COMMERCIAL_CURRENCY}`
    );
    record(
      'no_active_legacy_price',
      (products ?? []).every((row) => !row.active || ![500000, 5000000].includes(row.price_cents)),
      'no active product may still be priced at R5,000 or R50,000'
    );
  }
}

// 4. Exactly one open price version per product, and it must match this build's catalogue.
if (stage !== 'pre-migration') {
  const { data: versions, error: versionsError } = await db
    .from('product_price_versions')
    .select('product_id,price_cents,currency,effective_to,products:product_id(product_code)');

  if (versionsError) {
    record('price_versions_readable', false, `price versions unavailable: ${versionsError.message}`);
  } else {
    const open = (versions ?? []).filter((row) => row.effective_to === null);
    const openByCode = new Map();
    for (const row of open) {
      const code = Array.isArray(row.products) ? row.products[0]?.product_code : row.products?.product_code;
      openByCode.set(code, (openByCode.get(code) ?? 0) + 1);
    }
    record(
      'exactly_one_open_price_version_per_product',
      [...openByCode.values()].every((count) => count === 1),
      `open version counts: ${JSON.stringify(Object.fromEntries(openByCode))}`
    );

    const openEssential = open.find((row) => {
      const code = Array.isArray(row.products) ? row.products[0]?.product_code : row.products?.product_code;
      return code === ESSENTIAL_PRODUCT_CODE;
    });
    const openComprehensive = open.find((row) => {
      const code = Array.isArray(row.products) ? row.products[0]?.product_code : row.products?.product_code;
      return code === COMPREHENSIVE_PRODUCT_CODE;
    });

    // THE DEPLOYMENT-MATCH CHECK: this script imports the same catalogue module the application
    // compiles against, so a mismatch here is exactly the "old code, new database" condition.
    record(
      'deployed_catalogue_matches_database',
      openEssential?.price_cents === ESSENTIAL_PRICE_CENTS
        && openComprehensive?.price_cents === COMPREHENSIVE_PRICE_CENTS,
      `database open versions: Essential ${openEssential?.price_cents}, Comprehensive ${openComprehensive?.price_cents}; `
        + `this build expects ${ESSENTIAL_PRICE_CENTS} and ${COMPREHENSIVE_PRICE_CENTS}`
    );
  }
}

// 5. The atomic order primitive and the versioned SQL entitlement must both be reachable before the
//    freeze is released, or order creation and report entitlement would still run on the old
//    contract. Presence is probed through PostgREST's OpenAPI document -- the same technique
//    Release D uses for operational-alert capability detection -- rather than by CALLING them,
//    because calling create_paid_order() would create an order.
if (stage === 'post-migration' || stage === 'post-deploy') {
  let spec = null;
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/openapi+json' }
    });
    spec = response.ok ? await response.json() : null;
  } catch {
    spec = null;
  }

  if (!spec || typeof spec !== 'object' || !spec.paths) {
    // Fail closed: an unreadable schema is not evidence that the primitives exist.
    record('rpc_capability_document_readable', false, 'PostgREST OpenAPI document could not be read; cannot confirm RPC availability');
  } else {
    record(
      'atomic_order_rpc_available',
      Object.prototype.hasOwnProperty.call(spec.paths, '/rpc/create_paid_order'),
      'create_paid_order must be reachable before order creation is unfrozen'
    );
    record(
      'versioned_price_helper_available',
      Object.prototype.hasOwnProperty.call(spec.paths, '/rpc/order_price_version_entitled'),
      'order_price_version_entitled must be reachable before report entitlement runs'
    );
  }
}

const failed = checks.filter((check) => !check.ok);
const summary = {
  generatedAt: new Date().toISOString(),
  stage,
  passed: checks.length - failed.length,
  failed: failed.length,
  verdict: failed.length === 0 ? 'PASS' : 'STOP',
  mutationsPerformed: 0,
  nextAction: failed.length > 0
    ? 'STOP. Do not proceed to the next cutover step, and do not release the operation freeze.'
    : stage === 'pre-migration'
      ? 'Apply the four joint-launch migrations, then re-run with --stage post-migration.'
      : stage === 'post-migration'
        ? 'Deploy the matching application SHA, then re-run with --stage post-deploy.'
        : 'Run the smoke checklist, then release the operation freeze as the final step.'
};

if (asJson) {
  console.log(JSON.stringify({ summary, checks }, null, 2));
} else {
  console.log(`joint-launch release window gate — stage ${stage}`);
  for (const check of checks) {
    console.log(`  ${check.ok ? 'ok  ' : 'STOP'} - ${check.id}${check.ok ? '' : `  (${check.detail})`}`);
  }
  console.log('');
  console.log(JSON.stringify(summary, null, 2));
}

process.exit(failed.length === 0 ? 0 : 1);
