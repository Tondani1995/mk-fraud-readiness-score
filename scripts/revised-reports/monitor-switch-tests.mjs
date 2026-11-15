// Production monitoring after the switch-over (DR-01, 15 November 2026). New customers start in the revised review, so
// the monitors check it as they checked the scored start: production mode, the database switch, the approved AI budget
// and the start page; and the signed synthetic start creates a labelled fictional session, never a real one.
// Pure checks with a fake database and source order; no network or deployment.
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/revised-reports/monitor-switch-tests.mjs
import fs from 'node:fs';
import { revisedReviewChecks, evaluateProductionReadiness } from '../../src/lib/monitoring/production-readiness.ts';

const results = [];
const T = async (id, name, fn) => { try { const [ok, detail] = await fn(); results.push({ id, ok, name, detail }); } catch (e) { results.push({ id, ok: false, name, detail: String(e?.stack ?? e).split('\n').slice(0, 3).join(' ') }); } };
const PROD = { NEXT_PUBLIC_MK_READINESS_TRACK: 'review', MK_READINESS_REVIEW_MODE: 'production', VERCEL_ENV: 'production', MK_READINESS_REVIEW_STORE: 'database', NEXT_PUBLIC_SUPABASE_URL: 'https://iszihmmbgsfefawqmnwo.supabase.co', MK_READINESS_REVIEW_DB_PROJECT_REF: 'iszihmmbgsfefawqmnwo', MK_REVISED_CALL_CAMPAIGN: 'prod-1' };
const fakeDb = ({ bridge = true, campaign = { calls: 10, maxCalls: 200, maxCostUsd: 60, committedUsd: 3 }, failBridge = false, failBudget = false } = {}) => ({
  rpc: async (name) => {
    if (name === 'review_commercial_bridge_enabled') return failBridge ? { data: null, error: { message: 'x' } } : { data: bridge, error: null };
    if (name === 'review_generation_accounting') return failBudget ? { data: null, error: { message: 'x' } } : { data: { campaign, orderCalls: 0, orderUnsettled: 0 }, error: null };
    return { data: null, error: { message: 'unexpected' } };
  }
});
const run = async (env, db, production = true) => { const checks = []; await revisedReviewChecks(checks, db, env, production); return Object.fromEntries(checks.map((c) => [c.key, `${c.status}:${c.safeCode}`])); };

await T('MS-01', 'No revised checks while the scored assessment is still the start (track not selected)', async () => {
  const out = await run({ ...PROD, NEXT_PUBLIC_MK_READINESS_TRACK: undefined }, fakeDb());
  return [Object.keys(out).length === 0, JSON.stringify(out)];
});
await T('MS-02', 'All healthy: production mode on, bridge switch on, budget with room for a report', async () => {
  const out = await run(PROD, fakeDb());
  return [out.review_production_mode === 'PASS:review_production_mode_on' && out.review_bridge_switch === 'PASS:review_bridge_on' && out.review_generation_budget === 'PASS:review_budget_available', JSON.stringify(out)];
});
await T('MS-03', 'Track selected without production mode fails: customers would silently stay on the scored assessment', async () => {
  const out = await run({ ...PROD, MK_READINESS_REVIEW_MODE: undefined }, fakeDb());
  return [out.review_production_mode === 'FAIL:review_production_mode_off_not-configured', out.review_production_mode];
});
await T('MS-04', 'Database switch off or unreadable fails', async () => {
  const off = await run(PROD, fakeDb({ bridge: false })), err = await run(PROD, fakeDb({ failBridge: true }));
  return [off.review_bridge_switch === 'FAIL:review_bridge_off' && err.review_bridge_switch === 'FAIL:review_bridge_query_failed', `${off.review_bridge_switch}; ${err.review_bridge_switch}`];
});
await T('MS-05', 'Budget: missing, unconfigured or exhausted fails; low warns (room for less than one full repair)', async () => {
  const missing = await run(PROD, fakeDb({ campaign: null }));
  const unconfigured = await run({ ...PROD, MK_REVISED_CALL_CAMPAIGN: undefined }, fakeDb());
  const exhausted = await run(PROD, fakeDb({ campaign: { calls: 200, maxCalls: 200, maxCostUsd: 60, committedUsd: 3 } }));
  const low = await run(PROD, fakeDb({ campaign: { calls: 10, maxCalls: 200, maxCostUsd: 60, committedUsd: 59.5 } }));
  const failed = await run(PROD, fakeDb({ failBudget: true }));
  const ok = missing.review_generation_budget === 'FAIL:review_budget_missing' && unconfigured.review_generation_budget === 'FAIL:review_budget_unconfigured'
    && exhausted.review_generation_budget === 'FAIL:review_budget_exhausted' && low.review_generation_budget === 'WARN:review_budget_low' && failed.review_generation_budget === 'FAIL:review_budget_query_failed';
  return [ok, [missing, unconfigured, exhausted, low, failed].map((x) => x.review_generation_budget).join('; ')];
});
await T('MS-09', 'DR-15: an uncapped production campaign passes (the per-order limit is the only cap)', async () => {
  const out = await run(PROD, fakeDb({ campaign: { calls: 900, maxCalls: null, maxCostUsd: null, committedUsd: 400 } }));
  return [out.review_generation_budget === 'PASS:review_budget_uncapped', out.review_generation_budget];
});
await T('MS-10', 'The scored start pin is retired after the switch-over: a deploy on a new commit passes the activation checks; before the switch-over a stale pin still fails', async () => {
  const OLD = 'a'.repeat(40), NEW = 'b'.repeat(40);
  const rows = { adaptive_activation_policies: [{ policy_key: 'customer_start', environment: 'production', supabase_project: 'iszihmmbgsfefawqmnwo', enabled: true, activation_sha: OLD, graph_version: 'g', graph_fingerprint: 'f' }] };
  const db = {
    from(table) { const q = { select: () => q, eq: () => q, in: () => q, limit: () => q, maybeSingle: async () => ({ data: rows[table]?.[0] ?? null, error: null }), then: (ok, ko) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(ok, ko) }; return q; },
    rpc: fakeDb().rpc
  };
  const env = { ...PROD, VERCEL_GIT_COMMIT_SHA: NEW, NEXT_PUBLIC_SUPABASE_URL: 'https://iszihmmbgsfefawqmnwo.supabase.co' };
  const keyOf = async (e) => { const r = await evaluateProductionReadiness({ db, env: e, origin: null }); const c = Object.fromEntries(r.checks.map((x) => [x.key, `${x.status}:${x.safeCode}`])); return [c.adaptive_activation_exists, c.adaptive_activation_binding].join(' / '); };
  const after = await keyOf(env);
  const before = await keyOf({ ...env, NEXT_PUBLIC_MK_READINESS_TRACK: undefined });
  return [after === 'PASS:scored_start_retired / PASS:scored_start_retired' && before === 'PASS:adaptive_policy_present / FAIL:adaptive_policy_binding_checked', `after: ${after}; before: ${before}`];
});
await T('MS-06', 'Outside production a misconfiguration warns instead of failing', async () => {
  const out = await run({ ...PROD, MK_READINESS_REVIEW_MODE: undefined }, fakeDb({ bridge: false }), false);
  return [out.review_production_mode.startsWith('WARN') && out.review_bridge_switch.startsWith('WARN'), JSON.stringify(out)];
});
await T('MS-07', 'The readiness run adds the /review start page check and the revised checks; review alerts are P1', async () => {
  const r = fs.readFileSync('src/lib/monitoring/production-readiness.ts', 'utf8');
  const m = fs.readFileSync('src/lib/monitoring/production-monitor.ts', 'utf8');
  const ok = /NEXT_PUBLIC_MK_READINESS_TRACK === 'review' \? \[publicRouteCheck\(checks, fetchImpl, origin, '\/review', 'public_review_start'/.test(r) && /await revisedReviewChecks\(checks, db, env, production\);\n  await publicChecks/.test(r)
    && /category === 'review'/.test(m) && /category\.includes\('public_review_start'\)/.test(m) && /route\?\.includes\('\/review\/api\/sessions'\)\) return 'P1'/.test(m);
  return [ok, 'wired and prioritised'];
});
await T('MS-08', 'The signed synthetic start creates a labelled fictional session (no options: never real), returns no links, and runs before the request body is read', async () => {
  const route = fs.readFileSync('src/app/review/api/sessions/route.ts', 'utf8');
  const signed = route.slice(route.indexOf('const monitoringRunId'), route.indexOf('  try {\n    const body'));
  const ok = /createSession\(`MK synthetic monitor \$\{monitoringRunId\}`\.slice\(0, 80\)\)/.test(signed) && !/fictional:/.test(signed) && !/links/.test(signed.replace(/No\s+\/\/.*|links are returned/g, ''))
    && route.indexOf('isAuthorisedSyntheticMonitorRequest(request)') < route.indexOf('readJson(request') && /stage: 'review_start', outcome: 'fail'/.test(signed);
  return [ok, 'signed path checked'];
});

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.name}\n     ${r.detail}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
fs.mkdirSync('qa-output/corrective', { recursive: true });
fs.writeFileSync('qa-output/corrective/monitor-switch.json', JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
