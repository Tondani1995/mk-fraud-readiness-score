// Platform Runtime and Database Hardening tests (PR #19).
//
// Follows the same static-assertion pattern as the other phaseN test
// scripts in this repo: read source/config files and assert on their
// content. No live server or database connection is required, so this
// runs safely in CI alongside the other phaseN:test-* scripts.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

let failures = 0;

function read(relPath) {
  return readFileSync(join(root, relPath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    failures += 1;
    console.error(`FAIL: ${message}`);
  } else {
    console.log(`PASS: ${message}`);
  }
}

function assertIncludes(relPath, needle, message) {
  const content = read(relPath);
  assert(content.includes(needle), message ?? `${relPath} must include "${needle}"`);
}

function assertNotIncludes(relPath, needle, message) {
  const content = read(relPath);
  assert(!content.includes(needle), message ?? `${relPath} must not include "${needle}"`);
}

// --- Runtime declaration tests ---

const pkg = JSON.parse(read('package.json'));

assert(pkg.engines?.node === '24.x', 'package.json engines.node must be "24.x"');
assert(pkg.engines?.node !== '20.x', 'package.json must no longer declare Node 20');

assert(existsSync(join(root, '.nvmrc')), '.nvmrc must exist');
assert(read('.nvmrc').trim() === '24', '.nvmrc must contain "24"');

assertIncludes(
  '.github/workflows/phase7-verification.yml',
  "node-version: '24'",
  'CI workflow must use Node 24'
);
assertNotIncludes(
  '.github/workflows/phase7-verification.yml',
  "node-version: '20'",
  'CI workflow must no longer use Node 20'
);
assertIncludes(
  '.github/workflows/phase7-verification.yml',
  'npm run platform:test-hardening',
  'CI workflow must run platform:test-hardening'
);

// --- @types/node: deliberately left at ^20.16.5 in this push ---
// package-lock.json has NOT been regenerated in this push (see
// docs/v1/platform-hardening/node-24-migration-note.md for why, and for
// the real, verified evidence that regenerating it under actual Node
// 24.18.0/npm 11.16.0 produces a correct, complete lockfile with all 9
// @next/swc-* platform binaries). Bumping @types/node here without also
// committing the matching lockfile would make `npm ci` fail in CI against
// the still-old committed lockfile. Reverting this one field keeps
// package.json and the existing lockfile mutually consistent so `npm ci`
// keeps passing, at the cost of leaving @types/node one major behind
// Node's actual runtime version until the lockfile is regenerated as an
// immediate follow-up.

const typesNode = pkg.devDependencies?.['@types/node'] ?? '';
assert(typesNode === '^20.16.5', `@types/node must remain ^20.16.5 in this push (see node-24-migration-note.md), got "${typesNode}"`);

// --- Shared build-info source tests ---

assertIncludes(
  'src/lib/system/build-info.ts',
  "phase-13-customer-commercial-conversion",
  'build-info.ts must default CURRENT_BUILD_PHASE to phase-13-customer-commercial-conversion'
);
assertIncludes(
  'src/lib/system/build-info.ts',
  'process.env.VERCEL_ENV',
  'build-info.ts release-channel fallback chain must include VERCEL_ENV'
);
assertIncludes(
  'src/lib/system/build-info.ts',
  "'local'",
  'build-info.ts release-channel fallback chain must end in a safe local default'
);

assertIncludes(
  'src/app/api/health/route.ts',
  "from '@/lib/system/build-info'",
  'health route must import the shared build-info source'
);
assertNotIncludes(
  'src/app/api/health/route.ts',
  'phase-6-consolidated-scoring',
  'health route must not hardcode the stale phase-6 fallback'
);

assertIncludes(
  'src/app/api/system/build-info/route.ts',
  "from '@/lib/system/build-info'",
  'build-info route must import the shared build-info source'
);
assertNotIncludes(
  'src/app/api/system/build-info/route.ts',
  'phase-6-consolidated-scoring',
  'build-info route must not hardcode the stale phase-6 fallback'
);

// Neither route file may reference anything resembling a secret/key name.
for (const routeFile of ['src/app/api/health/route.ts', 'src/app/api/system/build-info/route.ts']) {
  for (const forbidden of ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_JWT_SECRET', 'ASSESSMENT_TOKEN_PEPPER', 'process.env.SUPABASE']) {
    assertNotIncludes(routeFile, forbidden, `${routeFile} must not reference ${forbidden}`);
  }
}

// --- Framework boundary tests: Next.js/React must NOT have been upgraded ---

assertIncludes('package.json', '"next": "^14.', 'Next.js must remain on the 14.x line');
assertIncludes('package.json', '"react": "^18.', 'React must remain on the 18.x line');
assertNotIncludes('package.json', '"next": "^15', 'Next.js must not be upgraded to 15');
assertNotIncludes('package.json', '"react": "^19', 'React must not be upgraded to 19');

// --- next.config.ts dead-file boundary test ---
// next.config.ts was confirmed unreferenced by any script, test, or doc,
// and inert on Next.js 14 (which does not load .ts config files). It has
// been removed as dead configuration. next.config.mjs remains the sole,
// authoritative config and must retain the Chromium tracing/webpack
// externals that report generation depends on.

assert(!existsSync(join(root, 'next.config.ts')), 'next.config.ts must be removed (dead, unreferenced Next 14 config)');
assertIncludes('next.config.mjs', 'experimental', 'next.config.mjs must keep the experimental config block');
assertIncludes('next.config.mjs', 'outputFileTracingIncludes', 'next.config.mjs must keep outputFileTracingIncludes for Chromium');
assertIncludes('next.config.mjs', "'@sparticuz/chromium'", 'next.config.mjs must keep the @sparticuz/chromium webpack external');
assertIncludes('next.config.mjs', "'puppeteer-core'", 'next.config.mjs must keep the puppeteer-core webpack external');
assertIncludes('next.config.mjs', "basePath: '/score'", 'next.config.mjs must keep the /score basePath');

// --- Migration boundary tests ---
// 0016 must exist, must not renumber 0014/0015, and must not touch scoring,
// weighting, maturity bands/caps, or exposure calculation.

assert(existsSync(join(root, 'supabase/migrations/0016_platform_database_hardening.sql')), 'migration 0016 must exist');
assert(existsSync(join(root, 'supabase/migrations/0014_phase13_customer_commercial_conversion.sql')), '0014 must not have been renumbered');
assert(existsSync(join(root, 'supabase/migrations/0015_phase13_data_request_policy_cleanup.sql')), '0015 must not have been renumbered');

const migration0016 = read('supabase/migrations/0016_platform_database_hardening.sql');
for (const forbidden of ['drop table', 'drop column', 'weight_pct =', 'maturity_band', 'exposure_score', 'delete from']) {
  assert(
    !migration0016.toLowerCase().includes(forbidden.toLowerCase()),
    `migration 0016 must not contain "${forbidden}" (scoring/destructive-change boundary)`
  );
}
assertIncludes(
  'supabase/migrations/0016_platform_database_hardening.sql',
  'set search_path = public',
  'migration 0016 must set an explicit search_path on set_updated_at()'
);
assertIncludes(
  'supabase/migrations/0016_platform_database_hardening.sql',
  '(select auth.uid())',
  'migration 0016 must wrap auth.uid() in a scalar subquery for admin_profiles_select'
);
assertIncludes(
  'supabase/migrations/0016_platform_database_hardening.sql',
  'create index if not exists',
  'migration 0016 indexes must use CREATE INDEX IF NOT EXISTS'
);

// --- Summary ---

if (failures > 0) {
  console.error(`\n${failures} platform-hardening check(s) failed.`);
  process.exit(1);
} else {
  console.log('\nAll platform-hardening checks passed.');
}
