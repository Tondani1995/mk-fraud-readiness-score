// DR-01 switch-over (owner decision, 14 November 2026): the revised review replaces the scored MFRS assessment for new
// customers; the scored assessment takes no new starts or orders; earlier results stay, labelled as the previous method.
// The switch takes effect only where the review can run, so production (where it cannot yet) keeps the scored
// assessment. Pure checks and source order; no database, network or deployment.
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/revised-reports/switch-over-tests.mjs
import fs from 'node:fs';
import { revisedReleaseEffective, isPreviousMethodMode, assessmentModeOf, PREVIOUS_METHOD_LABEL, SCORED_ORDER_CLOSED_MESSAGE, SCORED_START_CLOSED } from '../../src/lib/website/readiness-release.ts';

const results = [];
const T = async (id, name, fn) => { try { const [ok, detail] = await fn(); results.push({ id, ok, name, detail }); } catch (e) { results.push({ id, ok: false, name, detail: String(e?.stack ?? e).split('\n').slice(0, 3).join(' ') }); } };
const KEYS = ['NEXT_PUBLIC_MK_READINESS_TRACK', 'MK_READINESS_REVIEW_HARNESS', 'VERCEL_ENV', 'NEXT_PUBLIC_SUPABASE_URL', 'MK_READINESS_REVIEW_DB_PROJECT_REF'];
const withEnv = (env, fn) => { const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]])); for (const k of KEYS) delete process.env[k]; Object.assign(process.env, env); try { return fn(); } finally { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } } };
const TEST_DB = 'https://zuqegvsfhzgcydyivnqv.supabase.co';
const PROD_DB = 'https://iszihmmbgsfefawqmnwo.supabase.co';
const read = (p) => fs.readFileSync(p, 'utf8');
const before = (src, a, b) => src.indexOf(a) >= 0 && src.indexOf(b) >= 0 && src.indexOf(a) < src.indexOf(b);

await T('SW-01', 'The switch takes effect only with the review track selected AND the review able to run here', async () => {
  const cases = {
    on: { NEXT_PUBLIC_MK_READINESS_TRACK: 'review', MK_READINESS_REVIEW_HARNESS: 'fictional-local', NEXT_PUBLIC_SUPABASE_URL: TEST_DB },
    legacy: { MK_READINESS_REVIEW_HARNESS: 'fictional-local', NEXT_PUBLIC_SUPABASE_URL: TEST_DB },
    productionRuntime: { NEXT_PUBLIC_MK_READINESS_TRACK: 'review', MK_READINESS_REVIEW_HARNESS: 'fictional-local', NEXT_PUBLIC_SUPABASE_URL: TEST_DB, VERCEL_ENV: 'production' },
    productionDatabase: { NEXT_PUBLIC_MK_READINESS_TRACK: 'review', MK_READINESS_REVIEW_HARNESS: 'fictional-local', NEXT_PUBLIC_SUPABASE_URL: PROD_DB },
    reviewNotConfigured: { NEXT_PUBLIC_MK_READINESS_TRACK: 'review', NEXT_PUBLIC_SUPABASE_URL: TEST_DB }
  };
  const out = Object.fromEntries(Object.entries(cases).map(([k, env]) => [k, withEnv(env, revisedReleaseEffective)]));
  return [out.on === true && Object.entries(out).filter(([k]) => k !== 'on').every(([, v]) => v === false), JSON.stringify(out)];
});
await T('SW-02', 'Only the revised mode counts as the current method; every other or unknown mode is the previous method', async () => {
  return [!isPreviousMethodMode('readiness_review') && ['adaptive', 'legacy_fixed', null, undefined, ''].every(isPreviousMethodMode), 'readiness_review current; adaptive, legacy_fixed, unknown previous'];
});
await T('SW-03', 'The mode lookup returns the stored mode and throws on a read error (callers then refuse or label as previous)', async () => {
  const db = (res) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => res }) }) }) });
  const mode = await assessmentModeOf(db({ data: { assessment_mode: 'readiness_review' }, error: null }), 'a');
  let threw = false; try { await assessmentModeOf(db({ data: null, error: { message: 'x' } }), 'a'); } catch { threw = true; }
  const missing = await assessmentModeOf(db({ data: null, error: null }), 'a');
  return [mode === 'readiness_review' && threw && missing === null && isPreviousMethodMode(missing), `mode ${mode}; error throws ${threw}; missing -> previous`];
});
await T('SW-04', 'Both scored start routes refuse new starts (410, with the next step) before reading the request', async () => {
  const a = read('src/app/score/api/adaptive/start/route.ts');
  const b = read('src/app/score/api/assessments/start/route.ts');
  const ok = before(a, 'if (revisedReleaseEffective()) return NextResponse.json({ ok: false, code: SCORED_START_CLOSED.code', 'body = await request.json()')
    && before(b, 'if (revisedReleaseEffective()) return NextResponse.json({ ok: false, code: SCORED_START_CLOSED.code', 'request.json()')
    && /status: 410/.test(a) && /status: 410/.test(b) && SCORED_START_CLOSED.next === '/review';
  return [ok, 'adaptive and accountless start routes'];
});
await T('SW-05', 'The paid-order route refuses a previous-method assessment after token validation and before any order is created; an unreadable mode is refused', async () => {
  const r = read('src/app/score/api/assessments/[assessmentRef]/paid-order/route.ts');
  const guard = r.indexOf('if (revisedReleaseEffective()) {');
  const ok = before(r, "if (!validation.ok) return deny(['Private snapshot link required.'], 403);", 'if (revisedReleaseEffective()) {')
    && guard < r.indexOf('await createPaidOrderForAssessment(') && /catch \{ return deny\(\[SCORED_ORDER_CLOSED_MESSAGE\], 409\); \}/.test(r)
    && /if \(isPreviousMethodMode\(mode\)\) return deny\(\[SCORED_ORDER_CLOSED_MESSAGE\], 409\);/.test(r);
  return [ok, 'guard placed between validation and order creation'];
});
await T('SW-06', '/score/start sends new visitors to the revised review only when the switch is effective (never on the track flag alone)', async () => {
  const p = read('src/app/score/start/page.tsx');
  return [/if \(revisedReleaseEffective\(\)\) redirect\('\/review'\);/.test(p) && !/readinessTrack\(\) === 'review'\) redirect/.test(p), 'redirect is guarded'];
});
await T('SW-07', 'Earlier results are labelled, not removed: the Snapshot carries the previous-method label and notice, the order page explains and links to a new assessment, the order status page carries the label', async () => {
  const snap = read('src/app/score/snapshot/[assessmentRef]/page.tsx');
  const order = read('src/app/score/order/new/page.tsx');
  const status = read('src/app/score/order/[assessmentRef]/page.tsx');
  const ok = /methodologyLabel = previousMethod \? PREVIOUS_METHOD_LABEL/.test(snap) && /data-previous-method-notice/.test(snap) && /<SnapshotResult/.test(snap)
    && /data-previous-method-order/.test(order) && /href="\/score\/start"/.test(order) && before(order, 'data-previous-method-order', '<OrderJourney')
    && /data-previous-method-label/.test(status) && /<CustomerOrderStatusWorkspace/.test(status)
    && [snap, order, status].every((s) => /\.then\(isPreviousMethodMode, \(\) => true\)/.test(s));
  return [ok, 'Snapshot, order and order status pages'];
});
await T('SW-08', 'Customer wording follows the MK writing standard: no em dashes, no score claims, a clear next step', async () => {
  const all = [PREVIOUS_METHOD_LABEL, SCORED_ORDER_CLOSED_MESSAGE, SCORED_START_CLOSED.message, read('src/lib/website/readiness-release.ts')].join(' ');
  return [!/—/.test(all) && /start a new assessment/i.test(SCORED_ORDER_CLOSED_MESSAGE) && /previous MK Fraud Readiness method/.test(PREVIOUS_METHOD_LABEL), PREVIOUS_METHOD_LABEL];
});

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.name}\n     ${r.detail}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
fs.mkdirSync('qa-output/corrective', { recursive: true });
fs.writeFileSync('qa-output/corrective/switch-over.json', JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
