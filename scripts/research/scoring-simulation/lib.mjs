// HYPOTHETICAL RESEARCH ONLY. Shared helpers for the scoring simulation: the vendored review engine (build 1.5) with
// bank 1.3 and coverage map 1.3, fictional profiles, and deterministic answer policies. Nothing here is imported by
// anything under src, and nothing here is a production value.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const require = createRequire(import.meta.url);
export const ENGINE = require(path.join(ROOT, 'src/lib/readiness-review/vendor/review-engine-build-1.5.cjs'));
export const BANK = JSON.parse(readFileSync(path.join(ROOT, 'src/lib/readiness-review/data/bank-v1.3.json'), 'utf8'));
export const COVERAGE = JSON.parse(readFileSync(path.join(ROOT, 'src/lib/readiness-review/data/coverage-map-v1.3.json'), 'utf8'));
export const PRODUCTION_CEILING = 95; // createReviewEngine in src/lib/readiness-review/engine.ts
export const EXTENDED_CEILING = 2000; // research only: lets the interview run until its own plan ends
export const HYPOTHETICAL = 'HYPOTHETICAL: research simulation, not an approved or production value';

export const QUESTIONS = (() => {
  const out = [];
  for (const d of BANK.domains) for (const m of d.bank.modules) for (const q of m.questions) out.push({ ...q, domain: d.id, module: m.id, owner: m.owner });
  return out;
})();
export const QI = new Map(QUESTIONS.map((q) => [q.id, q]));
export const DOMAINS = BANK.domains.map((d) => ({ id: d.id, name: d.name }));
export const SCENARIOS = new Map(COVERAGE.scenarios.map((s) => [s.id, s]));

// ------------------------------------------------------------------------------------------------ fictional profiles
// Personas A to D are the bank's own fictional personas. Persona D records PR-03 as "yes", which is not one of the
// question's options (pfma, mfma, no); it is read as "pfma" here and reported as a data observation.
const persona = (k) => ({ ...BANK.profileAnswers[k], ...(BANK.profileAnswers[k]['PR-03'] === 'yes' ? { 'PR-03': 'pfma' } : {}) });
export const PROFILES = {
  A: { label: 'Persona A: Manufacturer (bank persona)', answers: persona('A'), facts: 'open' },
  B: { label: 'Persona B: Professional services firm (bank persona)', answers: persona('B'), facts: 'open' },
  C: { label: 'Persona C: Non-profit (bank persona)', answers: persona('C'), facts: 'open' },
  D: { label: 'Persona D: Public entity (bank persona)', answers: persona('D'), facts: 'open' },
  R: { label: 'Fictional Retail Group (golden-session profile)', answers: { 'PR-01': '50to250', 'PR-12': '50to250m', 'PR-02': 'private', 'PR-13': 'retail', 'PR-04': 'board', 'PR-03': 'no', 'PR-05': 'no', 'PR-06': 'no', 'PR-07': 'no', 'PR-08': 'yes', 'PR-09': 'no', 'PR-10': 'no', 'PR-11': 'yes' }, facts: 'open' },
  S: { label: 'Fictional small owner-managed firm (limited applicability)', answers: { 'PR-01': 'lt50', 'PR-12': 'lt10m', 'PR-02': 'private', 'PR-13': 'other', 'PR-04': 'owners', 'PR-05': 'no', 'PR-06': 'no', 'PR-07': 'no', 'PR-08': 'no', 'PR-09': 'no', 'PR-10': 'no', 'PR-11': 'no' }, facts: 'closed' }
};

// ------------------------------------------------------------------------------------------------ deterministic draws
export function draw(seed, id) {
  let h = 2166136261;
  const s = `${seed}|${id}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000003) / 1000003;
}

// An answer for a practice question from a target: a level 0 to 5 for anchored questions, a class otherwise.
const LEVEL_FOR_CLASS = { full: '4', partial: '2', designed: '2', absent: '0' };
const CLASS_FALLBACK = { full: ['full', 'partial'], partial: ['partial', 'designed', 'absent'], designed: ['designed', 'partial', 'absent'], absent: ['absent', 'partial'] };
export function practiceValue(q, target) {
  if (target === 'unknown') return q.format === 'multi' ? ['unknown'] : 'unknown';
  const cls = typeof target === 'number' ? (target === 0 ? 'absent' : target >= 4 ? 'full' : 'partial') : target;
  if (q.format === 'anchored') return typeof target === 'number' ? String(target) : LEVEL_FOR_CLASS[cls];
  if (q.format === 'practice') return cls;
  if (q.format === 'choicePractice') {
    for (const c of CLASS_FALLBACK[cls]) { const k = Object.keys(q.practiceMap).find((x) => q.practiceMap[x] === c); if (k) return k; }
    return Object.keys(q.practiceMap)[0];
  }
  if (q.format === 'multi' && q.subPractices) {
    const subs = Object.keys(q.subPractices);
    if (cls === 'full') return subs;
    if (cls === 'absent') return q.options.some((o) => o[0] === 'none') ? ['none'] : [subs[0]];
    return [subs[0]];
  }
  return q.options.find((o) => o[0] !== 'unknown')[0];
}

// A factual answer: "open" answers yes (the activity exists), "closed" answers no where the question allows it.
export function factValue(q, mode) {
  const opts = (q.options || []).map((o) => o[0]).filter((x) => x !== 'unknown');
  const pickOpen = opts.includes('yes') ? 'yes' : opts[0];
  const pickClosed = opts.includes('no') ? 'no' : opts.includes('none') ? 'none' : opts[opts.length - 1];
  const v = mode === 'closed' ? pickClosed : pickOpen;
  return q.format === 'multi' ? [v] : v;
}

// ------------------------------------------------------------------------------------------------ answer policies
// Each policy returns a target for a practice question: a level (anchored) or a class, or 'unknown'. Policies are keyed
// by question id and seed, so the same fictional organisation gives the same answer whatever path reaches the question.
export const POLICIES = {
  strong: (q, seed) => { const u = draw(seed, q.id); return q.format === 'anchored' ? (u < 0.55 ? 4 : 5) : u < 0.9 ? 'full' : 'partial'; },
  weak: (q, seed) => { const u = draw(seed, q.id); return q.format === 'anchored' ? (u < 0.3 ? 0 : u < 0.65 ? 1 : u < 0.9 ? 2 : 3) : u < 0.45 ? 'absent' : u < 0.8 ? 'partial' : 'designed'; },
  // Governance, risk assessment, ethics, finance and detection reported strong; third parties, people, customers, assets
  // and digital reported weak.
  mixed: (q, seed) => (['D1', 'D2', 'D3', 'D6', 'D10'].includes(q.domain) ? POLICIES.strong(q, seed) : POLICIES.weak(q, seed)),
  // Every level and class equally likely.
  uniform: (q, seed) => { const u = draw(seed, q.id); return q.format === 'anchored' ? Math.min(5, Math.floor(u * 6)) : ['full', 'partial', 'designed', 'absent'][Math.min(3, Math.floor(u * 4))]; }
};
export const withUnknown = (base, rate, salt = 'unknown') => (q, seed) => (draw(`${seed}|${salt}`, q.id) < rate ? 'unknown' : base(q, seed));

// ------------------------------------------------------------------------------------------------ interviews
// Runs the respondent interview on the raw engine. kindPolicy(q, st) may override the answer by the step kind.
export function interview({ profile, policy, seed = 'mk-sim', ceiling = PRODUCTION_CEILING, assumptions = 'none', stopAfter = null, kindPolicy = null, engine = null }) {
  const e = engine ?? ENGINE.create(BANK, COVERAGE, { ceiling, followups: 2, now: () => '2026-11-11T08:00:00.000Z' });
  const p = PROFILES[profile];
  for (let n = 0; n < 6000; n++) {
    if (stopAfter !== null && e.respondentScreens() >= stopAfter) { e.stop(); break; }
    const st = e.next({ respondentOnly: true });
    if (!st || !st.q) break;
    const q = st.q;
    let v;
    if (q.id === '__assumptions__') v = assumptions === 'all' ? q.facts : ['none'];
    else if (q.id.startsWith('PR-')) v = p.answers[q.id] ?? factValue(q, 'open');
    else if (q.type !== 'practice') v = factValue(q, p.facts);
    else { const t = (kindPolicy && kindPolicy(q, st, seed)) ?? policy(QI.get(q.id), seed); v = practiceValue(q, t); }
    e.answer(q, v, st.kind);
  }
  return e;
}
