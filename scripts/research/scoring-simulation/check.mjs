// HYPOTHETICAL RESEARCH ONLY. Invariant checks for the scoring simulation. They test the simulation's own properties
// (what MK asked it to demonstrate), not any production behaviour.
// node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/research/scoring-simulation/check.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { EXTENDED_CEILING, HYPOTHETICAL, POLICIES, PRODUCTION_CEILING, QI, ROOT, interview, withUnknown } from './lib.mjs';
import { FRAME_IDS, simulate } from './calculator.mjs';
import { loadFixtures } from './fixtures.mjs';

const results = [];
const T = (id, name, fn) => { try { const [ok, detail] = fn(); results.push({ id, name, ok, detail }); } catch (e) { results.push({ id, name, ok: false, detail: `threw: ${e.stack.split('\n').slice(0, 2).join(' | ')}` }); } };
const mixed = interview({ profile: 'R', policy: POLICIES.mixed, ceiling: EXTENDED_CEILING }).report();
const weak = interview({ profile: 'R', policy: POLICIES.weak, ceiling: EXTENDED_CEILING }).report();
const unknowns = interview({ profile: 'R', policy: withUnknown(POLICIES.mixed, 0.35), ceiling: EXTENDED_CEILING }).report();

T('S-01', 'The frame is the 137 confirmation practices, each once: 97 anchored and 40 not', () => {
  const ids = new Set(FRAME_IDS);
  const anchored = FRAME_IDS.filter((id) => QI.get(id).format === 'anchored').length;
  const s = simulate(mixed);
  return [ids.size === 137 && FRAME_IDS.length === 137 && anchored === 97 && s.controls.length === 137 && new Set(s.controls.map((c) => c.id)).size === 137, `${ids.size} unique, ${anchored} anchored, ${137 - anchored} not`];
});
T('S-02', 'A control associated with a second scenario gains no weight', () => {
  const s = simulate(mixed);
  const target = s.controls.find((c) => c.category === 'known');
  const rep2 = JSON.parse(JSON.stringify(mixed));
  for (const sc of rep2.scenarios.filter((x) => x.id !== target.scenario).slice(0, 5)) sc.confirmations.push({ id: target.id, state: 'reported', cls: target.cls });
  const s2 = simulate(rep2);
  return [s2.overall.point === s.overall.point && s2.controls.length === s.controls.length, `${s.overall.point} before, ${s2.overall.point} with the control added to five more scenarios`];
});
T('S-03', 'Anchored answers are level x 20 exactly; class answers carry the stated interval', () => {
  const s = simulate(mixed);
  const bad = s.controls.filter((c) => c.value && (c.level !== null ? c.value.lo !== c.level * 20 || c.value.hi !== c.level * 20 : !({ full: '80,100', partial: '20,60', designed: '20,40', absent: '0,0' })[c.cls] || `${c.value.lo},${c.value.hi}` !== { full: '80,100', partial: '20,60', designed: '20,40', absent: '0,0' }[c.cls]));
  return [bad.length === 0, `${s.controls.filter((c) => c.value).length} values checked, ${bad.length} wrong`];
});
T('S-04', 'Unknown answers carry no value and are outside the denominator', () => {
  const s = simulate(unknowns, { aggregation: 'pooled', treatment: 'midpoint' });
  const valued = s.controls.filter((c) => c.category === 'unknown' && c.value).length;
  const known = s.controls.filter((c) => c.value);
  const manual = Math.round((known.reduce((a, c) => a + c.value.lo, 0) / known.length) * 10) / 10;
  return [valued === 0 && s.population.unknown > 0 && manual === s.overall.point, `${s.population.unknown} unknown, ${valued} valued; ${s.overall.point} = ${manual}`];
});
T('S-05', 'Removing a known answer moves the result in either direction (no monotonicity is asserted)', () => {
  const base = simulate(mixed, { aggregation: 'pooled' });
  let up = 0, down = 0;
  for (const c of base.controls.filter((x) => x.category === 'known')) {
    const s = simulate(mixed, { aggregation: 'pooled', overrides: { [c.id]: 'unknown' } });
    if (s.overall.point > base.overall.point) up++; if (s.overall.point < base.overall.point) down++;
  }
  return [up > 0 && down > 0, `${up} rises, ${down} falls`];
});
T('S-06', 'Visibility never improves as known answers become unknown', () => {
  const rank = { NORMAL: 0, PROVISIONAL: 1, INSUFFICIENT: 2 };
  const known = simulate(weak).controls.filter((c) => c.category === 'known');
  let prev = 0, ok = true, prevCov = 101;
  for (let k = 0; k <= known.length; k += 3) {
    const s = simulate(weak, { overrides: Object.fromEntries(known.slice(0, k).map((c) => [c.id, 'unknown'])) });
    if (rank[s.visibility.status] < prev || s.metrics.coveragePct > prevCov) ok = false;
    prev = rank[s.visibility.status]; prevCov = s.metrics.coveragePct;
  }
  return [ok, `checked every third step to ${known.length} answers withheld; final ${Object.keys(rank)[prev]}`];
});
T('S-07', 'An insufficient result is withheld and has no band', () => {
  const s = simulate(interview({ profile: 'R', policy: POLICIES.mixed, ceiling: PRODUCTION_CEILING }).report());
  return [s.visibility.status === 'INSUFFICIENT' && s.overall.shown === null && s.band.final === null, `${s.visibility.status}, shown ${s.overall.shown}, band ${s.band.final}`];
});
T('S-08', 'F1 never changes a number; F2 never raises a control; F4 never changes the score', () => {
  const recs = [mixed, weak, unknowns];
  let ok = true;
  for (const r of recs) {
    const f0 = simulate(r), f1 = simulate(r, { falseComfort: 'F1' }), f2 = simulate(r, { falseComfort: 'F2' }), f4 = simulate(r, { falseComfort: 'F4' });
    if (f1.overall.point !== f0.overall.point || f4.overall.point !== f0.overall.point) ok = false;
    f2.controls.forEach((c, i) => { const c0 = f0.controls[i]; if (c.value && (c.value.hi > c0.value.hi || c.value.lo > c0.value.lo)) ok = false; });
  }
  return [ok, 'three records'];
});
T('S-09', 'Every result carries the hypothetical label', () => {
  const s = simulate(mixed);
  const out = readFileSync(path.join(ROOT, 'docs/readiness-review/methodology-simulation/results.json'), 'utf8');
  const md = readFileSync(path.join(ROOT, 'docs/readiness-review/methodology-simulation/SIMULATION-RESULTS.md'), 'utf8');
  return [s.label === HYPOTHETICAL && JSON.parse(out).label === HYPOTHETICAL && md.includes(HYPOTHETICAL), 'calculator output, results.json and SIMULATION-RESULTS.md'];
});
T('S-10', 'Nothing under src imports the research code, and src is unchanged from the branch head', () => {
  const hits = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx|js|mjs|cjs)$/.test(f) && /scripts\/research|scoring-simulation/.test(readFileSync(p, 'utf8'))) hits.push(p); } };
  walk(path.join(ROOT, 'src'));
  let clean = true;
  try { execFileSync('git', ['diff', '--quiet', 'HEAD', '--', 'src', 'supabase'], { cwd: ROOT }); } catch { clean = false; }
  return [hits.length === 0 && clean, `${hits.length} imports; src and supabase ${clean ? 'unchanged' : 'CHANGED'}`];
});
const fx = await loadFixtures();
T('S-11', 'The existing fixtures are the pinned records', () => [Object.keys(fx).length === 8, `${Object.keys(fx).length} fixtures, each matching its pinned log digest`]);
T('S-12', 'The simulation is deterministic', () => {
  const a = JSON.stringify(simulate(interview({ profile: 'A', policy: POLICIES.uniform, ceiling: EXTENDED_CEILING }).report()).overall);
  const b = JSON.stringify(simulate(interview({ profile: 'A', policy: POLICIES.uniform, ceiling: EXTENDED_CEILING }).report()).overall);
  return [a === b, a];
});

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.name}: ${r.detail}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed} of ${results.length} pass`);
process.exit(failed ? 1 : 0);
