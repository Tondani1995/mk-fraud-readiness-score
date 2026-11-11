// FICTIONAL RESEARCH. The five proposed confirmation relationships (P-1), kept as candidates and tested, not applied:
// for each, the scheme it would confirm, the confirmations the scheme has today, the candidate's own wording, levels,
// format, stage and routing, and whether the candidate is in scope every time the scheme applies across the fictional
// journeys. The judgement on scheme semantics and distinctness is written in CANDIDATE-CONFIRMATIONS.md from this data.
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/research/objectives/candidates.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { runJourney, JOURNEY_PROFILES } from '../../lib/build16-driver.mjs';
import { buildStagedReportInput } from '../../../src/lib/readiness-review/report-input.ts';
import { BANK, COVERAGE } from '../scoring-simulation/lib.mjs';

const CANDIDATES = [['D2-I-01', 'FS-D2-01'], ['D4-P-01', 'FS-D4-05'], ['D5-V-01', 'FS-D5-02'], ['D5-H-01', 'FS-D5-12'], ['D3-A-03', 'FS-D3-10']];
const Q = new Map();
for (const d of BANK.domains) for (const m of d.bank.modules) for (const q of m.questions) Q.set(q.id, { q, m, d });
const SC = new Map(COVERAGE.scenarios.map((s) => [s.id, s]));
const words = (t) => new Set(String(t ?? '').toLowerCase().match(/[a-z]{4,}/g) ?? []);
const jaccard = (a, b) => { const x = words(a), y = words(b); const i = [...x].filter((w) => y.has(w)).length; return x.size + y.size ? Math.round((i / (x.size + y.size - i)) * 100) / 100 : 0; };

const journeys = Object.keys(JOURNEY_PROFILES).map((k) => [k, buildStagedReportInput(runJourney(k).live)]);
const out = CANDIDATES.map(([cand, scn]) => {
  const s = SC.get(scn);
  const c = Q.get(cand);
  const confirms = (s.confirm ?? []).map(([when, id]) => ({ id, when, key: Q.get(id).q.key, text: Q.get(id).q.text, level4: Q.get(id).q.levels?.[4] ?? null, module: Q.get(id).m.id, enterWhen: Q.get(id).m.enterWhen ?? null }));
  const routing = journeys.map(([k, input]) => {
    const scenario = input.scenarios.find((x) => x.id === scn);
    const ctl = input.domains.flatMap((d) => d.controls).find((x) => x.id === cand);
    const applies = scenario && scenario.status !== 'outofscope';
    const candInScope = ctl && !['outofscope', 'precluded'].includes(ctl.state);
    return { journey: k, schemeStatus: scenario?.status ?? null, candidateState: ctl?.state ?? null, candidateAnswered: !!ctl?.answer, aligned: !applies || !!candInScope };
  });
  return {
    candidate: cand, scheme: { id: scn, name: s.name, tier: s.tier, how: s.how ?? null, why: s.why ?? null, appliesWhen: s.expWhen ?? null },
    confirmationsToday: confirms,
    candidateQuestion: { key: c.q.key, text: c.q.text, format: c.q.format, stage: c.q.stage, level4: c.q.levels?.[4] ?? null, module: c.m.id, moduleEnterWhen: c.m.enterWhen ?? null, askWhen: c.q.askWhen ?? null, roleToday: COVERAGE.questionRole[cand] ?? null },
    wordingOverlapWithConfirmations: confirms.map((x) => ({ id: x.id, jaccard: jaccard(c.q.text, x.text) })),
    routing, alignedInEveryJourney: routing.every((r) => r.aligned)
  };
});
const result = { fictional: true, label: 'FICTIONAL RESEARCH: candidates tested, not applied to coverage map 1.3', candidates: out };
const OUT = path.resolve('docs/readiness-review/objectives/candidate-confirmations.json');
if (process.argv.includes('--check')) {
  const same = fs.readFileSync(OUT, 'utf8') === JSON.stringify(result, null, 1);
  console.log(JSON.stringify({ same }));
  process.exit(same ? 0 : 1);
}
fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
for (const x of out) console.log(x.candidate, x.scheme.id, 'aligned', x.alignedInEveryJourney, x.routing.map((r) => `${r.journey}:${r.schemeStatus}/${r.candidateState}`).join(' '), 'overlap', JSON.stringify(x.wordingOverlapWithConfirmations));
