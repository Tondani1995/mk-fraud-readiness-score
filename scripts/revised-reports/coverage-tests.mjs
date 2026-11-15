// DR-04 (owner decision, 14 November 2026): a report is sold and released only when at least half of the assessment is
// covered, measured on the score's base: applicable scenarios counted (every core answer known) out of those that apply.
// Exact bound fixtures and shortened replays of the Kestrel answer log; no database, model or network.
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/revised-reports/coverage-tests.mjs
import fs from 'node:fs';
import { loadFixture } from './lib/b5-fixtures.mjs';
import { replay } from '../../src/lib/readiness-review/session.ts';
import { buildStagedReportInput } from '../../src/lib/readiness-review/report-input.ts';
import { buildRevisedReport } from '../../src/lib/reports/revised/evidence-model.ts';
import { revisedScore, reportCoverage, coverageShortfallMessage, REPORT_COVERAGE_MINIMUM } from '../../src/lib/reports/revised/score.ts';
import { coverageRefusal, BindingRefused } from '../../src/lib/readiness-review/commercial-bridge.ts';
import { REVISED_OPERATOR_GUIDANCE } from '../../src/lib/reports/revised/live/produce.ts';

const results = [];
const T = async (id, name, fn) => { try { const [ok, detail] = await fn(); results.push({ id, ok, name, detail }); } catch (e) { results.push({ id, ok: false, name, detail: String(e?.stack ?? e).split('\n').slice(0, 3).join(' ') }); } };
const K = loadFixture('kestrel');
const M = loadFixture('marula');
const staged = (n) => buildStagedReportInput(replay({ ...K.f.record, actions: K.f.record.actions.slice(0, n) }));
const fakeScore = (counted, applicable) => ({ counted, applicable });

await T('CV-01', 'Both test organisations meet the rule: Kestrel 57 of 69 (83%), Marula 90 of 90', async () => {
  const k = reportCoverage(revisedScore(K.report)), m = reportCoverage(revisedScore(M.report));
  return [k.meets && k.counted === 57 && k.applicable === 69 && m.meets && m.share === 1 && REPORT_COVERAGE_MINIMUM === 0.5, `Kestrel ${k.share}, Marula ${m.share}`];
});
await T('CV-02', '"At least half": exactly half meets the rule, just under does not; nothing applicable or no score does not', async () => {
  const at = (c, a) => reportCoverage(fakeScore(c, a)).meets;
  return [at(50, 100) && at(51, 100) && !at(49, 100) && at(1, 2) && !at(0, 0) && !reportCoverage(null).meets && !reportCoverage(null, 10).meets, 'boundary holds'];
});
await T('CV-03', 'The order bridge refuses shortened Kestrel sessions below half (22%, 37%) and accepts 58% and the full session', async () => {
  const out = [80, 120, 160, K.f.record.actions.length].map((n) => { const input = staged(n); const c = reportCoverage(revisedScore(buildRevisedReport(input))); const r = coverageRefusal(input); return { n, share: c.share, refused: r?.code ?? null, status: r?.status ?? null }; });
  const ok = out[0].refused === 'coverage_insufficient' && out[1].refused === 'coverage_insufficient' && out[0].status === 409 && out[2].refused === null && out[3].refused === null;
  return [ok, out.map((x) => `${x.n} actions ${Math.round(x.share * 100)}% ${x.refused ?? 'accepted'}`).join('; ')];
});
await T('CV-04', 'The customer message states the rule and the current count, and tells them what to do', async () => {
  const r = coverageRefusal(staged(120));
  const none = coverageShortfallMessage({ counted: 0, applicable: 10, share: 0, meets: false });
  const ok = r instanceof BindingRefused && r.message === 'A paid report needs complete answers for at least half of the fraud scenarios that apply. 25 of 68 have them now. Answer the outstanding questions, then request the report again.'
    && /none has complete answers yet/.test(none) && !/—/.test(r.message + none);
  return [ok, r?.message];
});
await T('CV-05', 'The operator guidance says the report cannot be produced or released, that no AI call was made, and not to retry', async () => {
  const g = REVISED_OPERATOR_GUIDANCE.coverage_insufficient;
  return [/cannot be produced or released/.test(g) && /No AI call was made/.test(g) && /Do not retry/.test(g), g];
});

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.name}\n     ${r.detail}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
fs.mkdirSync('qa-output/corrective', { recursive: true });
fs.writeFileSync('qa-output/corrective/coverage.json', JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
