// Platform hardening and Node 24 compatibility verification.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const exists = (rel) => existsSync(join(root, rel));
let failures = 0;
function assert(condition, message) {
  if (condition) console.log(`PASS: ${message}`);
  else { failures += 1; console.error(`FAIL: ${message}`); }
}
function includes(file, needle, message) { assert(read(file).includes(needle), message); }
function excludes(file, needle, message) { assert(!read(file).includes(needle), message); }

function evaluateBuildInfo(envOverrides = {}) {
  const env = { ...process.env };
  for (const key of ['MK_BUILD_PHASE', 'MK_RELEASE_CHANNEL', 'VERCEL_ENV', 'NODE_ENV']) delete env[key];
  Object.assign(env, envOverrides);
  const script = `
    import { readFileSync } from 'node:fs';
    import { Buffer } from 'node:buffer';
    const source = readFileSync(${JSON.stringify(join(root, 'src/lib/system/build-info.ts'))}, 'utf8');
    const url = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64') + '#' + Math.random();
    const info = await import(url);
    console.log(JSON.stringify({ phase: info.CURRENT_BUILD_PHASE, releaseChannel: info.CURRENT_RELEASE_CHANNEL }));
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: root, env, encoding: 'utf8' });
  assert(result.status === 0, `build-info must evaluate for ${JSON.stringify(envOverrides)}`);
  return result.status === 0 ? JSON.parse(result.stdout.trim()) : null;
}

const pkg = JSON.parse(read('package.json'));
assert(pkg.engines?.node === '24.x', 'package.json must declare Node 24');
assert(read('.nvmrc').trim() === '24', '.nvmrc must contain 24');
includes('.github/workflows/phase7-verification.yml', "node-version: '24'", 'CI must run Node 24');
assert(pkg.dependencies?.workflow === '4.6.0', 'Supported Workflow SDK 4.6.0 must be pinned');
assert(pkg.dependencies?.['@sparticuz/chromium'] === '143.0.4', 'Node 24 Chromium 143.0.4 must be exactly pinned');
assert(pkg.dependencies?.['puppeteer-core'] === '24.34.0', 'Puppeteer 24.34.0 must be exactly pinned for Chrome 143.0.7499.169');
assert(pkg.dependencies?.next?.startsWith('^14.'), 'Next must remain 14.x');
assert(pkg.dependencies?.react?.startsWith('^18.'), 'React must remain 18.x');
assert(pkg.dependencies?.['react-dom']?.startsWith('^18.'), 'React DOM must remain 18.x');

assert(exists('package-lock.json'), 'package-lock must exist');
const lock = JSON.parse(read('package-lock.json'));
assert(lock.lockfileVersion === 3, 'lockfileVersion must remain 3');
assert(lock.packages?.['']?.name === pkg.name, 'lockfile root name must match package');
assert(lock.packages?.['']?.version === pkg.version, 'lockfile root version must match package');
assert(lock.packages?.['']?.engines?.node === pkg.engines.node, 'lockfile root engine must match package');
assert(lock.packages?.['node_modules/workflow']?.version === '4.6.0', 'lockfile must contain Workflow 4.6.0');
assert(lock.packages?.['node_modules/@sparticuz/chromium']?.version === '143.0.4', 'lockfile must contain Chromium 143.0.4');
assert(lock.packages?.['node_modules/puppeteer-core']?.version === '24.34.0', 'lockfile must contain puppeteer-core 24.34.0');
assert(lock.packages?.['node_modules/@puppeteer/browsers']?.version === '2.11.0', 'lockfile must contain @puppeteer/browsers 2.11.0');
for (const swc of [
  '@next/swc-darwin-arm64','@next/swc-darwin-x64','@next/swc-linux-arm64-gnu',
  '@next/swc-linux-arm64-musl','@next/swc-linux-x64-gnu','@next/swc-linux-x64-musl',
  '@next/swc-win32-arm64-msvc','@next/swc-win32-ia32-msvc','@next/swc-win32-x64-msvc'
]) assert(Boolean(lock.packages?.[`node_modules/${swc}`]), `lockfile must include ${swc}`);

includes('scripts/phase10-premium-report-tests.mjs', 'Node 24 compatibility boundary', 'Phase 10 must explicitly guard Node 24');
includes('next.config.mjs', "basePath: '/score'", 'basePath must remain /score');
includes('next.config.mjs', 'outputFileTracingIncludes', 'Chromium tracing must remain');
includes('next.config.mjs', '@sparticuz/chromium/bin', 'Chromium bin must remain traced');
includes('next.config.mjs', "'@sparticuz/chromium': 'commonjs @sparticuz/chromium'", 'Chromium must remain external');
includes('next.config.mjs', "'puppeteer-core': 'commonjs puppeteer-core'", 'Puppeteer must remain external');
includes('next.config.mjs', "from 'workflow/next'", 'Workflow Next wrapper must remain enabled');
excludes('next.config.mjs', 'serverExternalPackages', 'Next 15-only configuration must remain absent');
assert(!exists('next.config.ts'), 'dead next.config.ts must remain removed');

includes('src/lib/system/build-info.ts', "export const CURRENT_BUILD_PHASE = 'phase-14-autonomous-premium-report-engine'", 'build phase must be Phase 14 and code authoritative');
excludes('src/lib/system/build-info.ts', 'process.env.MK_BUILD_PHASE', 'stale phase environment must not override code');
const stale = evaluateBuildInfo({ MK_BUILD_PHASE: 'phase-6-consolidated-scoring' });
assert(stale?.phase === 'phase-14-autonomous-premium-report-engine', 'stale phase env must be ignored');
assert(evaluateBuildInfo({ VERCEL_ENV: 'preview', MK_RELEASE_CHANNEL: 'local' })?.releaseChannel === 'preview', 'Vercel preview must win');
assert(evaluateBuildInfo({ VERCEL_ENV: 'production', MK_RELEASE_CHANNEL: 'local' })?.releaseChannel === 'production', 'Vercel production must win');
assert(evaluateBuildInfo({})?.releaseChannel === 'local', 'local fallback must remain safe');

const migrations = [
  '0016_platform_database_hardening.sql',
  '0017_phase14_autonomous_report_engine.sql',
  '0018_phase14_pdf_email_delivery.sql',
  '0019_phase14_email_delivery_state_hardening.sql'
];
for (const migration of migrations) {
  const path = `supabase/migrations/${migration}`;
  assert(exists(path), `${path} must exist`);
  const content = read(path).toLowerCase();
  for (const forbidden of ['drop table','drop column','truncate','grant all on','grant select on all tables']) {
    assert(!content.includes(forbidden), `${migration} must not contain ${forbidden}`);
  }
}
includes('supabase/migrations/0017_phase14_autonomous_report_engine.sql', 'premium_report_auto_fulfilment_enabled":false', 'auto fulfilment must default off');
includes('supabase/migrations/0017_phase14_autonomous_report_engine.sql', 'premium_report_ai_narrative_enabled":false', 'AI narrative must default off');
includes('supabase/migrations/0017_phase14_autonomous_report_engine.sql', 'premium_report_auto_email_enabled":false', 'auto email must default off');
includes('supabase/migrations/0018_phase14_pdf_email_delivery.sql', 'email_events_provider_event_uidx', 'webhook event idempotency index must exist');
includes('supabase/migrations/0019_phase14_email_delivery_state_hardening.sql', 'email_provider_events_provider_event_unique', 'provider event ledger must enforce idempotency');
includes('supabase/migrations/0019_phase14_email_delivery_state_hardening.sql', 'processed_at timestamptz', 'provider event ledger must support retry-safe processing');
includes('supabase/migrations/0019_phase14_email_delivery_state_hardening.sql', 'revoke all on table public.email_provider_events from anon, authenticated', 'provider event ledger must deny ordinary writes');

for (const file of ['src/app/api/health/route.ts','src/app/api/system/build-info/route.ts','src/lib/system/build-info.ts']) {
  for (const secret of ['SUPABASE_SERVICE_ROLE_KEY','SUPABASE_JWT_SECRET','ASSESSMENT_TOKEN_PEPPER','RESEND_API_KEY']) {
    excludes(file, secret, `${file} must not expose ${secret}`);
  }
}

if (failures) {
  console.error(`\n${failures} platform-hardening check(s) failed.`);
  process.exit(1);
}
console.log('\nAll platform-hardening and Node 24 compatibility checks passed.');
