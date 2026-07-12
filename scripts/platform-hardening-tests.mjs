// Platform Runtime and Database Hardening tests (PR #19).
//
// Static assertions only: no live server and no database connection. The
// checks intentionally preserve the Node 20 / Chromium compatibility guard
// until a separate Node 24 compatibility spike proves live PDF generation.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

let failures = 0;

function read(relPath) {
  return readFileSync(join(root, relPath), 'utf8');
}

function exists(relPath) {
  return existsSync(join(root, relPath));
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

const pkg = JSON.parse(read('package.json'));

// Runtime pin and CI boundary.
assert(pkg.engines?.node === '20.x', 'package.json engines.node must remain "20.x"');
assert(pkg.engines?.node !== '24.x', 'package.json must not declare Node 24 in PR #19');
assert(exists('.nvmrc'), '.nvmrc must exist');
assert(read('.nvmrc').trim() === '20', '.nvmrc must contain "20"');
assert(!exists('.node-version'), '.node-version must not be added');
assert(!exists('volta.json'), 'Volta configuration must not be added');
assertIncludes('.github/workflows/phase7-verification.yml', "node-version: '20'", 'CI workflow must use Node 20');
assertNotIncludes('.github/workflows/phase7-verification.yml', "node-version: '24'", 'CI workflow must not use Node 24');
assertIncludes('.github/workflows/phase7-verification.yml', 'npm run platform:test-hardening', 'CI workflow must run platform:test-hardening');

// The Phase 10 report suite owns the Chromium runtime guard.
assertIncludes('scripts/phase10-premium-report-tests.mjs', '"node": "20.x"', 'Phase 10 suite must continue asserting the Node 20 runtime pin');
assertIncludes('scripts/phase10-premium-report-tests.mjs', 'Vercel runtime to Node 20 for Chromium shared libraries', 'Phase 10 guard must explain Chromium compatibility');

// Framework boundary: do not upgrade Next or React here.
assert(pkg.dependencies?.next?.startsWith('^14.'), 'Next.js must remain on the 14.x line');
assert(pkg.devDependencies?.['eslint-config-next']?.startsWith('^14.'), 'eslint-config-next must remain on the 14.x line');
assert(pkg.dependencies?.react?.startsWith('^18.'), 'React must remain on the 18.x line');
assert(pkg.dependencies?.['react-dom']?.startsWith('^18.'), 'React DOM must remain on the 18.x line');
assert(!pkg.dependencies?.next?.startsWith('^15.'), 'Next.js must not be upgraded to 15');
assert(!pkg.dependencies?.react?.startsWith('^19.'), 'React must not be upgraded to 19');

// Shared build-info source tests.
assertIncludes('src/lib/system/build-info.ts', 'phase-13-customer-commercial-conversion', 'build-info.ts must default CURRENT_BUILD_PHASE correctly');
assertIncludes('src/lib/system/build-info.ts', 'process.env.VERCEL_ENV', 'release-channel fallback chain must include VERCEL_ENV');
assertIncludes('src/lib/system/build-info.ts', "'local'", 'release-channel fallback chain must end with local');
assertIncludes('src/app/api/health/route.ts', "from '@/lib/system/build-info'", 'health route must use the shared build-info source');
assertIncludes('src/app/api/system/build-info/route.ts', "from '@/lib/system/build-info'", 'build-info route must use the shared build-info source');
assertNotIncludes('src/app/api/health/route.ts', 'phase-6-consolidated-scoring', 'health route must not hardcode stale phase fallback');
assertNotIncludes('src/app/api/system/build-info/route.ts', 'phase-6-consolidated-scoring', 'build-info route must not hardcode stale phase fallback');

for (const routeFile of ['src/app/api/health/route.ts', 'src/app/api/system/build-info/route.ts', 'src/lib/system/build-info.ts']) {
  for (const forbidden of ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_JWT_SECRET', 'ASSESSMENT_TOKEN_PEPPER', 'process.env.SUPABASE', 'process.env.DATABASE', 'NEXT_PUBLIC_SUPABASE']) {
    assertNotIncludes(routeFile, forbidden, `${routeFile} must not expose or enumerate ${forbidden}`);
  }
}

// next.config.ts dead-file boundary. next.config.mjs remains authoritative.
assert(!exists('next.config.ts'), 'next.config.ts must be removed only if dead/unreferenced');
assertIncludes('next.config.mjs', "basePath: '/score'", 'next.config.mjs must keep the /score basePath');
assertIncludes('next.config.mjs', 'experimental', 'next.config.mjs must keep the Next 14-compatible experimental block');
assertIncludes('next.config.mjs', 'outputFileTracingIncludes', 'next.config.mjs must keep outputFileTracingIncludes');
assertIncludes('next.config.mjs', '@sparticuz/chromium/bin', 'next.config.mjs must trace @sparticuz/chromium/bin assets');
assertIncludes('next.config.mjs', '/api/admin/orders/[orderReference]/generate-report', 'next.config.mjs must trace the report-generation route');
assertIncludes('next.config.mjs', "'@sparticuz/chromium': 'commonjs @sparticuz/chromium'", 'next.config.mjs must externalize @sparticuz/chromium');
assertIncludes('next.config.mjs', "'puppeteer-core': 'commonjs puppeteer-core'", 'next.config.mjs must externalize puppeteer-core');
assertNotIncludes('next.config.mjs', 'serverExternalPackages', 'Next 14 config must not move to Next 15 conventions');

// Migration boundary tests.
assert(exists('supabase/migrations/0016_platform_database_hardening.sql'), 'migration 0016 must exist when safe fixes are included');
assert(exists('supabase/migrations/0014_phase13_customer_commercial_conversion.sql'), '0014 must not be edited/renumbered');
assert(exists('supabase/migrations/0015_phase13_data_request_policy_cleanup.sql'), '0015 must not be edited/renumbered');

const migration0016 = read('supabase/migrations/0016_platform_database_hardening.sql');
for (const forbidden of [
  'drop table',
  'drop column',
  'delete from',
  'truncate',
  'grant all on',
  'grant select on all tables',
  'to anon',
  'to authenticated',
  'weight_pct =',
  'maturity_band',
  'exposure_score'
]) {
  assert(!migration0016.toLowerCase().includes(forbidden.toLowerCase()), `migration 0016 must not contain "${forbidden}"`);
}
assertIncludes('supabase/migrations/0016_platform_database_hardening.sql', 'set search_path = public', 'migration 0016 must set explicit search_path on set_updated_at()');
assertIncludes('supabase/migrations/0016_platform_database_hardening.sql', '(select auth.uid())', 'migration 0016 must wrap auth.uid() for admin_profiles_select');
assertIncludes('supabase/migrations/0016_platform_database_hardening.sql', 'create index if not exists', 'migration 0016 indexes must be idempotent');
assertIncludes('supabase/migrations/0016_platform_database_hardening.sql', 'reports_order_id_idx', 'migration 0016 must include the evidenced reports(order_id) index');
assertIncludes('supabase/migrations/0016_platform_database_hardening.sql', 'assessment_answers_question_id_idx', 'migration 0016 must include the evidenced assessment_answers(question_id) index');

// Documentation boundary for the deferred Node upgrade.
assertIncludes('docs/v1/platform-hardening/node24-compatibility-spike.md', 'Node 20', 'Node 24 spike note must explain the current Node 20 pin');
assertIncludes('docs/v1/platform-hardening/node24-compatibility-spike.md', 'live PDF generation', 'Node 24 spike note must require live PDF evidence');
assertIncludes('docs/v1/platform-hardening/supabase-advisor-inventory.md', 'assessment_tokens', 'advisor inventory must document assessment_tokens RLS finding');
assertIncludes('docs/v1/platform-hardening/supabase-advisor-inventory.md', 'rate_limit_hits', 'advisor inventory must document rate_limit_hits RLS finding');
assertIncludes('docs/v1/platform-hardening/supabase-advisor-inventory.md', 'citext', 'advisor inventory must document citext parking decision');

if (failures > 0) {
  console.error(`\n${failures} platform-hardening check(s) failed.`);
  process.exit(1);
}

console.log('\nAll platform-hardening checks passed.');
