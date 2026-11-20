// Revised funnel version 2 (20 November 2026): customer figures from the review store, internal checks separate,
// strict parsing, unavailable never zero, fulfilment "not recorded", and the monitor records it on its heartbeat.
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/revised-reports/revised-funnel-v2-tests.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseRevisedFunnel, readRevisedFunnel, REVISED_FUNNEL_FIELDS } from '../../src/lib/monitoring/revised-funnel.ts';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20261120090000_revised_funnel_monitor_v2.sql');
const monitor = read('src/lib/monitoring/production-monitor.ts');
const page = read('src/app/score/admin/monitoring/page.tsx');
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log('PASS ' + name); };
const sample = Object.fromEntries([['version', 2], ...REVISED_FUNNEL_FIELDS.map((f, i) => [f, i])]);

await check('RV2-01 aggregate is service-role only, additive and private', () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /revoke all on function public\.review_monitor_funnel_v2\(timestamptz\) from public, anon, authenticated;/);
  assert.match(migration, /grant execute on function public\.review_monitor_funnel_v2\(timestamptz\) to service_role;/);
  assert.doesNotMatch(migration, /drop function|review_monitor_funnel\(/i);
  assert.doesNotMatch(migration, /link_tokens|full_name|organisation_label|'email'|question_id|select \*/i);
  for (const f of REVISED_FUNNEL_FIELDS) assert.ok(migration.includes(`'${f}'`), f);
});
await check('RV2-02 customers exclude fictional, synthetic and MK internal sessions; payments are not orders', () => {
  assert.match(migration, /s\.fictional is false/);
  assert.match(migration, /@mkfraud\.co\.za/);
  assert.match(migration, /where internal is false/);
  assert.match(migration, /'customerOrdersRecorded'/);
  assert.match(migration, /status in \('payment_received', 'verified'\)/);
});
await check('RV2-03 parsing is strict: wrong version, a missing, negative or fractional field makes the read unavailable', () => {
  assert.deepEqual(Object.keys(parseRevisedFunnel(sample)), [...REVISED_FUNNEL_FIELDS]);
  assert.equal(parseRevisedFunnel({ ...sample, version: 1 }), null);
  const missing = { ...sample }; delete missing.customerPaymentsReceived;
  assert.equal(parseRevisedFunnel(missing), null);
  assert.equal(parseRevisedFunnel({ ...sample, customerRespondentAnswers: -1 }), null);
  assert.equal(parseRevisedFunnel({ ...sample, customerRespondentAnswers: 1.5 }), null);
  assert.equal(parseRevisedFunnel({ ...sample, customerRespondentAnswers: '3' }), null);
});
await check('RV2-04 an error or a throw is unavailable, never zero; fulfilment is always "not recorded"', async () => {
  const ok = await readRevisedFunnel({ rpc: async () => ({ data: sample, error: null }) }, '2026-11-20T00:00:00Z');
  assert.equal(ok.status, 'available'); assert.equal(ok.fulfilment, 'not_recorded');
  const failed = await readRevisedFunnel({ rpc: async () => ({ data: null, error: { code: 'PGRST202' } }) }, 'x');
  assert.deepEqual(failed, { status: 'unavailable', metrics: null, fulfilment: 'not_recorded' });
  const thrown = await readRevisedFunnel({ rpc: async () => { throw new Error('down'); } }, 'x');
  assert.equal(thrown.status, 'unavailable'); assert.equal(thrown.metrics, null);
});
await check('RV2-05 the production monitor records the revised funnel on its heartbeat, separate from the legacy events', () => {
  assert.match(monitor, /readRevisedFunnel\(db, since\)/);
  assert.match(monitor, /revised_funnel_24h: revisedFunnel\.status === 'available' \? \{ \.\.\.revisedFunnel\.metrics, fulfilment: revisedFunnel\.fulfilment \} : 'unavailable'/);
  assert.match(monitor, /db\.from\('assessment_events'\)/);
});
await check('RV2-06 the dashboard shows customer figures, internal checks apart, and delivery as not recorded', () => {
  assert.match(page, /'Payments received', v2\.customerPaymentsReceived/);
  assert.match(page, /MK internal check sessions started/);
  assert.match(page, /Not recorded \(delivered manually\)/);
  assert.match(page, /Previous-method assessment signals, last 24 hours/);
});
console.log(`\nRevised funnel v2: ${passed} checks passed`);
