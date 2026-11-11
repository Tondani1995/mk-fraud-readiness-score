// HYPOTHETICAL RESEARCH ONLY. Invariant checks for the staged-assessment simulation.
// node scripts/research/depth/check.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { COVERAGE, HYPOTHETICAL, POLICIES, PRODUCTION_CEILING, QI, ROOT, interview } from '../scoring-simulation/lib.mjs';
import { simulate } from '../scoring-simulation/calculator.mjs';
import { DEPTH, SAMPLES, STAGED_PROFILES, runDesign } from './staged.mjs';

const ROLE = COVERAGE.questionRole;
const out = [];
const T = (id, name, fn) => { try { const [ok, d] = fn(); out.push([ok, id, name, d]); } catch (e) { out.push([false, id, name, `threw ${e.message}`]); } };
const digest = (rep) => JSON.stringify(rep.domains.flatMap((d) => d.rows).map((r) => [r.id, r.state, r.cls ?? null]));

T('D-01', 'D0 is the current interview: the same record as the production engine path for the same answers', () => {
  const a = runDesign({ design: 'D0', profileKey: 'P3' }).final;
  const b = interview({ profile: 'R', policy: POLICIES.mixed, ceiling: PRODUCTION_CEILING }).report();
  return [digest(a) === digest(b), 'P3 at 95 screens'];
});
T('D-02', 'Every follow-up and related practice is classified once; the classes cover 674 practices', () => [DEPTH.length === 674 && new Set(DEPTH.map((r) => r.id)).size === 674, `${DEPTH.length}`]);
T('D-03', 'The staged design never asks a question twice and never asks one outside scope', () => {
  let ok = true, n = 0;
  for (const pk of Object.keys(STAGED_PROFILES)) {
    const r = runDesign({ design: 'D2', profileKey: pk, sample: 'perDomain', depth: 'all', coverage: true, operatingModel: true, ownersReturnUnknowns: true });
    const ids = r.asked.map((a) => a.id);
    if (new Set(ids).size !== ids.length) ok = false;
    const respondent = r.e.S.log.filter((x) => x.via === 'respondent' && QI.has(x.q) && x.kind !== 'correction').map((x) => x.q);
    if (new Set(respondent).size !== respondent.length) ok = false;
    if (ids.some((id) => respondent.includes(id))) ok = false;
    for (const row of r.final.domains.flatMap((d) => d.rows)) if (ids.includes(row.id) && ['outofscope', 'proportion', 'precluded'].includes(row.state)) ok = false;
    n += ids.length;
  }
  return [ok, `${n} depth answers across six profiles`];
});
T('D-04', 'A consistency question is asked only after a sampled tier 1 confirmation reported fully in place', () => {
  const r = runDesign({ design: 'D2', profileKey: 'P3', sample: 'all' });
  const bad = r.consistency.filter((f) => { const s = COVERAGE.scenarios.find((x) => (x.followups || []).includes(f) && SAMPLES.all.includes(x.id)); return !s || !s.routes.flatMap((x) => x.questions).some((c) => r.ansClass(c) === 'full'); });
  return [bad.length === 0 && r.consistency.length > 0, `${r.consistency.length} asked, ${bad.length} without an in-place confirmation`];
});
T('D-05', 'At the production limit the consistency sample never reduces tier 1 completion', () => {
  let ok = true;
  for (const pk of ['P1', 'P3', 'P6b', 'P2']) for (const sample of ['universal', 'perDomain', 'all']) {
    const s = simulate(runDesign({ design: 'D0', profileKey: pk, sample }).final, { frame: 'A1', visibility: 'recommended' });
    if (s.population.notReached !== 0) ok = false;
  }
  return [ok, 'four profiles, three samples'];
});
T('D-06', 'A fixed sample gives the same contradictions at 95 screens and staged', () => {
  const a = runDesign({ design: 'D0', profileKey: 'P6b', sample: 'perDomain' }), b = runDesign({ design: 'D2', profileKey: 'P6b', sample: 'perDomain' });
  const ca = simulate(a.final, { frame: 'A1' }).contradictions.filter((c) => c.kind.startsWith('in-place')).map((c) => c.confirmation).sort().join();
  const cb = simulate(b.final, { frame: 'A1' }).contradictions.filter((c) => c.kind.startsWith('in-place')).map((c) => c.confirmation).sort().join();
  return [ca === cb && ca.length > 0, ca];
});
T('D-07', 'Depth answers never change the frame A or A1 result except through a contradiction', () => {
  let ok = true;
  for (const pk of ['P1', 'P2', 'P3']) {
    const a = runDesign({ design: 'D2', profileKey: pk, sample: 'none', depth: 'none' }), b = runDesign({ design: 'D2', profileKey: pk, sample: 'none', depth: 'all', coverage: true });
    for (const frame of ['A', 'A1']) { const sa = simulate(a.final, { frame, falseComfort: 'F0' }), sb = simulate(b.final, { frame, falseComfort: 'F0' }); if (sa.overall.point !== sb.overall.point) ok = false; }
  }
  return [ok, 'P1, P2, P3 with no depth against full depth, untreated'];
});
T('D-08', 'Outputs carry the hypothetical label; src and supabase unchanged', () => {
  const md = readFileSync(path.join(ROOT, 'docs/readiness-review/staged-assessment/RESULTS.md'), 'utf8');
  let clean = true;
  try { execFileSync('git', ['diff', '--quiet', 'HEAD', '--', 'src', 'supabase'], { cwd: ROOT }); } catch { clean = false; }
  return [md.includes(HYPOTHETICAL) && clean, `label present; src and supabase ${clean ? 'unchanged' : 'CHANGED'}`];
});
T('D-09', 'The vendored engine file is unchanged by the research hooks', () => {
  let clean = true;
  try { execFileSync('git', ['diff', '--quiet', 'HEAD', '--', 'src/lib/readiness-review/vendor'], { cwd: ROOT }); } catch { clean = false; }
  return [clean, 'hooks wrap an engine instance only'];
});
for (const [ok, id, name, d] of out) console.log(`${ok ? 'PASS' : 'FAIL'} ${id} ${name}: ${d}`);
console.log(`${out.filter((x) => x[0]).length} of ${out.length} pass`);
process.exit(out.every((x) => x[0]) ? 0 : 1);
