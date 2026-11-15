// Production mode for the revised review (release step, 15 November 2026). The mode is off unless every condition
// holds; it never runs outside a production runtime; test settings can never be carried into it; the fictional harness
// and fault injection stay impossible there; reports become customer editions; the restricted test is unchanged.
// Pure checks and composition; no database, network, model or deployment.
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/revised-reports/production-mode-tests.mjs
import fs from 'node:fs';
import { reviewProductionStatus, revisedCommercialStatus, reportEdition, RESTRICTED_TEST_LABEL, RESTRICTED_TEST_REPORT_LABEL } from '../../src/lib/readiness-review/commercial-environment.ts';
import { reviewDatabaseConfig, DatabaseConfigRefused } from '../../src/lib/readiness-review/database-config.ts';
import { reviewHarnessStatus, reviewHarnessFaultsEnabled, reviewEngineBuild } from '../../src/lib/readiness-review/harness.ts';
import { revisedReleaseEffective } from '../../src/lib/website/readiness-release.ts';
import { editionPresentation, lengthGateMode } from '../../src/lib/reports/revised/live/produce.ts';
import { revisedGenerationNote } from '../../src/lib/reports/revised/live/manual-generation.ts';
import { composeRevisedReportHtml } from '../../src/lib/reports/revised/manuscript/compose.ts';
import { loadFixture, fixturePack } from './lib/b5-fixtures.mjs';
import { deterministicManuscript } from './lib/writer-double.mjs';

const results = [];
const T = async (id, name, fn) => { try { const [ok, detail] = await fn(); results.push({ id, ok, name, detail }); } catch (e) { results.push({ id, ok: false, name, detail: String(e?.stack ?? e).split('\n').slice(0, 3).join(' ') }); } };
const PROD_URL = 'https://iszihmmbgsfefawqmnwo.supabase.co';
const TEST_URL = 'https://zuqegvsfhzgcydyivnqv.supabase.co';
const PROD = { MK_READINESS_REVIEW_MODE: 'production', VERCEL_ENV: 'production', MK_READINESS_REVIEW_STORE: 'database', NEXT_PUBLIC_SUPABASE_URL: PROD_URL, MK_READINESS_REVIEW_DB_PROJECT_REF: 'iszihmmbgsfefawqmnwo' };
const RESTRICTED = { MK_REVISED_COMMERCIAL_PATH: 'restricted-test', MK_READINESS_REVIEW_HARNESS: 'fictional-local', MK_READINESS_REVIEW_STORE: 'database', NEXT_PUBLIC_SUPABASE_URL: TEST_URL, MK_READINESS_REVIEW_DB_PROJECT_REF: 'zuqegvsfhzgcydyivnqv', VERCEL_ENV: 'preview' };
const KEYS = ['MK_READINESS_REVIEW_MODE', 'VERCEL_ENV', 'MK_READINESS_REVIEW_STORE', 'NEXT_PUBLIC_SUPABASE_URL', 'MK_READINESS_REVIEW_DB_PROJECT_REF', 'MK_READINESS_REVIEW_HARNESS', 'MK_REVISED_COMMERCIAL_PATH', 'MK_READINESS_REVIEW_FAULTS', 'MK_READINESS_REVIEW_ENGINE', 'NEXT_PUBLIC_MK_READINESS_TRACK'];
const withEnv = (env, fn) => { const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]])); for (const k of KEYS) delete process.env[k]; Object.assign(process.env, env); try { return fn(); } finally { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } } };
const plain = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

await T('PM-01', 'Production mode only with every condition: explicit mode, production runtime, database store, one project, no test setting', async () => {
  const cases = {
    on: PROD,
    noMode: { ...PROD, MK_READINESS_REVIEW_MODE: undefined },
    preview: { ...PROD, VERCEL_ENV: 'preview' },
    local: { ...PROD, VERCEL_ENV: undefined },
    fileStore: { ...PROD, MK_READINESS_REVIEW_STORE: 'files' },
    noDatabase: { ...PROD, NEXT_PUBLIC_SUPABASE_URL: undefined },
    mismatch: { ...PROD, MK_READINESS_REVIEW_DB_PROJECT_REF: 'zuqegvsfhzgcydyivnqv' },
    harnessFlag: { ...PROD, MK_READINESS_REVIEW_HARNESS: 'fictional-local' },
    restrictedFlag: { ...PROD, MK_REVISED_COMMERCIAL_PATH: 'restricted-test' },
    faultsFlag: { ...PROD, MK_READINESS_REVIEW_FAULTS: 'enabled' }
  };
  const out = Object.fromEntries(Object.entries(cases).map(([k, env]) => { const st = reviewProductionStatus(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined))); return [k, st.enabled ? 'on' : st.reason]; }));
  const ok = out.on === 'on' && out.noMode === 'not-configured' && out.preview === 'not-production-runtime' && out.local === 'not-production-runtime' && out.fileStore === 'store-not-database'
    && out.noDatabase === 'no-database' && out.mismatch === 'database-mismatch' && ['harnessFlag', 'restrictedFlag', 'faultsFlag'].every((k) => out[k] === 'test-settings-present');
  return [ok, JSON.stringify(out)];
});
await T('PM-02', 'The commercial path: production mode in production; the restricted test unchanged elsewhere and still refused in any production runtime', async () => {
  const prod = revisedCommercialStatus(PROD);
  const restricted = revisedCommercialStatus(RESTRICTED);
  const restrictedInProd = revisedCommercialStatus({ ...RESTRICTED, VERCEL_ENV: 'production' });
  const restrictedOnProdDb = revisedCommercialStatus({ ...RESTRICTED, NEXT_PUBLIC_SUPABASE_URL: PROD_URL, MK_READINESS_REVIEW_DB_PROJECT_REF: 'iszihmmbgsfefawqmnwo' });
  const ok = prod.enabled && prod.mode === 'production' && restricted.enabled && restricted.mode === 'restricted-test'
    && !restrictedInProd.enabled && restrictedInProd.reason === 'production-runtime' && !restrictedOnProdDb.enabled && restrictedOnProdDb.reason === 'production-database';
  return [ok, `production ${prod.mode}; restricted ${restricted.mode}; restricted in production runtime ${restrictedInProd.reason}; restricted on production DB ${restrictedOnProdDb.reason}`];
});
await T('PM-03', 'The review track runs in production mode; the fictional harness never runs in a production runtime; fault injection never in production', async () => {
  const prod = withEnv(PROD, () => ({ st: reviewHarnessStatus(), faults: reviewHarnessFaultsEnabled() }));
  const harnessInProd = withEnv({ ...RESTRICTED, VERCEL_ENV: 'production' }, reviewHarnessStatus);
  const test = withEnv({ ...RESTRICTED, MK_READINESS_REVIEW_FAULTS: 'enabled' }, () => ({ st: reviewHarnessStatus(), faults: reviewHarnessFaultsEnabled() }));
  const engine = withEnv({ ...PROD, MK_READINESS_REVIEW_ENGINE: '1.6' }, reviewEngineBuild);
  const ok = prod.st.enabled && prod.st.reason === 'production' && prod.faults === false && !harnessInProd.enabled && harnessInProd.reason === 'production-runtime'
    && test.st.reason === 'fictional-local' && test.faults === true && engine === '1.6';
  return [ok, `production ${prod.st.reason}, faults ${prod.faults}; harness in production runtime ${harnessInProd.reason}; test faults ${test.faults}; engine ${engine}`];
});
await T('PM-04', 'Reports are customer editions only in production mode; the length minimum blocks there and is record-only in the restricted test', async () => {
  return [reportEdition(PROD) === 'customer' && reportEdition(RESTRICTED) === 'restricted-test' && reportEdition({}) === 'restricted-test' && lengthGateMode(PROD) === 'block' && lengthGateMode(RESTRICTED) === 'record',
    `production ${reportEdition(PROD)} (${lengthGateMode(PROD)}); restricted ${reportEdition(RESTRICTED)} (${lengthGateMode(RESTRICTED)})`];
});
await T('PM-05', 'A customer edition carries no test label, prototype notice or fictional wording; it is prepared for the organisation and keeps the score', async () => {
  const K = loadFixture('kestrel');
  const { fp, plan } = fixturePack(K, 'essential');
  const md = deterministicManuscript(fp, plan);
  const c = editionPresentation('customer', 33), r = editionPresentation('restricted-test', 33);
  const customer = plain(composeRevisedReportHtml({ md, fp, plan, dateLabel: '15 November 2026', prototype: c.prototype, restrictedNotice: c.restrictedNotice }).html);
  const restricted = plain(composeRevisedReportHtml({ md, fp, plan, dateLabel: '15 November 2026', prototype: r.prototype, restrictedNotice: r.restrictedNotice }).html);
  const ok = !/RESTRICTED TEST|not for customer release|Prototype notice|Fictional prototype|test fixture/i.test(customer) && customer.includes(`Prepared for ${fp.organisation.name}`)
    && /MK Fraud Readiness score/.test(customer) && /RESTRICTED TEST/.test(restricted) && !/RESTRICTED/.test(c.workbookNotice) && /RESTRICTED TEST/.test(r.workbookNotice)
    && c.restricted === null && r.restricted === RESTRICTED_TEST_REPORT_LABEL && c.tag === '' && /customer/i.test(c.briefLabel);
  return [ok, `customer footer: ${customer.includes(`Prepared for ${fp.organisation.name}`)}; restricted label in customer edition: ${/RESTRICTED/.test(customer)}`];
});
await T('PM-06', 'The operator note drops "(restricted test)" only for a customer edition', async () => {
  const ai = { models: { writer: 'w', repair: 'r' }, calls: 1, repairUsed: false, resumedFrom: null };
  const order = { binding: { engineBuild: '1.6', outstandingTotal: 2 } };
  const customer = revisedGenerationNote(ai, order, 94, true), restricted = revisedGenerationNote(ai, order, 94, false);
  return [!/restricted test/.test(customer) && /^Revised report written by/.test(customer) && /\(restricted test\)/.test(restricted), customer.slice(0, 80)];
});
await T('PM-07', 'The switch-over takes effect in production mode once the track is selected, and not before', async () => {
  const on = withEnv({ ...PROD, NEXT_PUBLIC_MK_READINESS_TRACK: 'review' }, revisedReleaseEffective);
  const trackOnly = withEnv({ VERCEL_ENV: 'production', NEXT_PUBLIC_MK_READINESS_TRACK: 'review', NEXT_PUBLIC_SUPABASE_URL: PROD_URL }, revisedReleaseEffective);
  const modeOnly = withEnv(PROD, revisedReleaseEffective);
  return [on && !trackOnly && !modeOnly, `mode + track ${on}; track only ${trackOnly}; mode only ${modeOnly}`];
});
await T('PM-08', 'Snapshot wording: live ordering states the half-covered rule and has no test wording; the restricted test keeps its label; no em dashes', async () => {
  const doc = fs.readFileSync('src/components/readiness-review/SnapshotDocument.tsx', 'utf8');
  const page = fs.readFileSync('src/app/review/s/[token]/snapshot/page.tsx', 'utf8');
  const live = doc.slice(doc.indexOf("ordering === 'live'"), doc.indexOf(": ordering === 'restricted-test'"));
  const ok = /COVERAGE_RULE/.test(live) && !/restricted/i.test(live) && /carries the MK Fraud Readiness score/.test(live) && !/carries no score/.test(doc)
    && /notice=\{ordering === 'restricted-test' \? RESTRICTED_TEST_LABEL : undefined\}/.test(page) && /commercial\.mode === 'production' \? 'live'/.test(page) && !/—/.test(doc) && !/not approved|no readiness score/i.test(RESTRICTED_TEST_LABEL);
  return [ok, 'live, restricted-test and none'];
});
await T('PM-09', 'The database switch accepts "production" but no migration ever sets it', async () => {
  const dir = 'supabase/migrations';
  const sw = fs.readFileSync(`${dir}/20261115090000_readiness_review_production_switch.sql`, 'utf8');
  const inserts = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).filter((f) => /insert\s+into\s+readiness_review\.environment_flags/i.test(fs.readFileSync(`${dir}/${f}`, 'utf8').replace(/^\s*--.*$/gm, '')));
  return [/flag_value in \('restricted_test', 'production'\)/.test(sw) && inserts.length === 0 && /grant execute on function public\.review_commercial_bridge_enabled\(\) to service_role/.test(sw), `migrations that insert the flag: ${inserts.length}`];
});

await T('PM-13', 'The review store binds to the production project only in production mode; everywhere else it is refused, and a malformed address is refused in every mode', async () => {
  const store = { MK_READINESS_REVIEW_DB_URL: PROD_URL, MK_READINESS_REVIEW_DB_SERVICE_KEY: 'k' };
  const tryConfig = (env) => { try { return reviewDatabaseConfig(env).projectRef; } catch (e) { return e instanceof DatabaseConfigRefused ? 'refused' : `error ${e.message}`; } };
  const inProduction = tryConfig({ ...PROD, ...store });
  const preview = tryConfig({ ...PROD, ...store, VERCEL_ENV: 'preview' });
  const noMode = tryConfig({ ...PROD, ...store, MK_READINESS_REVIEW_MODE: undefined });
  const testFlag = tryConfig({ ...PROD, ...store, MK_READINESS_REVIEW_HARNESS: 'fictional-local' });
  const bareHost = tryConfig({ ...PROD, ...store, MK_READINESS_REVIEW_DB_URL: 'iszihmmbgsfefawqmnwo.supabase.co' });
  const isolated = tryConfig({ ...RESTRICTED, MK_READINESS_REVIEW_DB_URL: TEST_URL, MK_READINESS_REVIEW_DB_SERVICE_KEY: 'k' });
  return [inProduction === 'iszihmmbgsfefawqmnwo' && preview === 'refused' && noMode === 'refused' && testFlag === 'refused' && bareHost === 'refused' && isolated === 'zuqegvsfhzgcydyivnqv',
    JSON.stringify({ inProduction, preview, noMode, testFlag, bareHost, isolated })];
});

await T('PM-10', 'Starting a review: production mode requires terms acceptance and creates a real session; every other environment stays fictional whatever the caller sends', async () => {
  const route = fs.readFileSync('src/app/review/api/sessions/route.ts', 'utf8');
  const service = fs.readFileSync('src/lib/readiness-review/service.ts', 'utf8');
  const form = fs.readFileSync('src/components/readiness-review/ReviewStartForm.tsx', 'utf8');
  const ok = /if \(production && body\?\.termsAccepted !== true\)/.test(route) && /if \(!production && body\?\.fictionalConfirmed !== true\)/.test(route) && /createSession\(String\(body\?\.organisationLabel \?\? ''\), \{ fictional: reviewHarnessStatus\(\)\.reason !== 'production' \}\)/.test(route)
    && /const fictional = reviewHarnessStatus\(\)\.reason === 'production' \? options\.fictional === false \? false : true : true;/.test(service)
    && /termsAccepted: true/.test(form) && /Fraud Readiness Assessment Terms/.test(form) && /'Organisation name'/.test(form);
  return [ok, 'route, service and form'];
});
await T('PM-11', 'A real organisation sees no fictional wording and never receives the MK reviewer link; the export is not named fictional', async () => {
  const service = fs.readFileSync('src/lib/readiness-review/service.ts', 'utf8');
  const links = fs.readFileSync('src/components/readiness-review/SessionLinks.tsx', 'utf8');
  const mgmt = fs.readFileSync('src/components/readiness-review/ManagementDocument.tsx', 'utf8');
  const snap = fs.readFileSync('src/components/readiness-review/SnapshotDocument.tsx', 'utf8');
  const exp = fs.readFileSync('src/app/review/api/s/[token]/export/route.ts', 'utf8');
  const start = fs.readFileSync('src/app/review/page.tsx', 'utf8');
  const ok = /tokens: live\.record\.fictional \? live\.record\.tokens : \{ \.\.\.live\.record\.tokens, reviewer: '' \}/.test(service) && /view\.tokens\.reviewer \? row\('MK reviewer workspace'/.test(links)
    && /view\.fictional === false \? 'Fraud Readiness review' : 'Fictional review session'/.test(links) && /view\.fictional \? 'Management view · fictional session' : 'Management view'/.test(mgmt)
    && /view\.fictional \? 'Fraud Readiness Snapshot · fictional session' : 'Fraud Readiness Snapshot'/.test(snap) && !/In this fictional harness each function/.test(snap)
    && /body\.session\.fictional \? 'fictional-review' : 'fraud-readiness-review'/.test(exp) && /'Start your Fraud Readiness review'/.test(start) && /ReviewStartForm production=\{production\}/.test(start);
  return [ok, 'links, management, Snapshot, export and start page'];
});
await T('PM-12', 'The database accepts a real session only under the production switch; no migration sets that switch', async () => {
  const m = fs.readFileSync('supabase/migrations/20261115110000_readiness_review_real_sessions.sql', 'utf8');
  return [/drop constraint sessions_fictional_check/.test(m) && /flag_key = 'commercial_bridge' and flag_value = 'production'/.test(m) && /raise exception 'review_real_session_refused'/.test(m) && !/insert\s+into\s+readiness_review\.environment_flags/i.test(m.replace(/^\s*--.*$/gm, '')), 'trigger, refusal and no flag insert'];
});

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.name}\n     ${r.detail}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
fs.mkdirSync('qa-output/corrective', { recursive: true });
fs.writeFileSync('qa-output/corrective/production-mode.json', JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
