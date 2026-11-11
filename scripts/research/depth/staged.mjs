// HYPOTHETICAL RESEARCH ONLY. Three assessment designs on the vendored review engine (build 1.5) with bank 1.3:
//   D0  the current interview, 95 respondent screens, no further stage;
//   D1  the same interview with no screen limit (confirmations to the plan's own end);
//   D2  a staged assessment in one session: core (tier 1, with a fixed consistency sample), breadth (tier 2 and 3, by
//       the respondent or delegated by area), and depth packages for accountable functions (diagnostic practices for the
//       priority gaps, practices for objectives no confirmation covers, and the owners' answers to "I don't know").
// The consistency sample and the depth stage are simulated by research hooks around the engine; the vendored engine
// is not changed. Fictional records only; every rule and number is a hypothesis for MK.
import { BANK, COVERAGE, ENGINE, EXTENDED_CEILING, PRODUCTION_CEILING, PROFILES, POLICIES, QI, SCENARIOS, draw, factValue, practiceValue, withUnknown } from '../scoring-simulation/lib.mjs';
import { classifyDepth } from './classify.mjs';

const ROLE = COVERAGE.questionRole;
const ORDER = new Map(COVERAGE.scenarios.map((s, i) => [s.id, i]));
const LEVEL_CLASS = { 0: 'absent', 1: 'partial', 2: 'partial', 3: 'partial', 4: 'full', 5: 'full' };
export const DEPTH = classifyDepth();
const SEVERITY = { absent: 0, designed: 1, partial: 2 };
export function rankGaps(e) {
  return e.report().scenarios.filter((s) => s.status !== 'outofscope').map((s) => ({ id: s.id, tier: s.tier, worst: s.confirmations.map((c) => ansClass(e, c.id)).filter((k) => k in SEVERITY).sort((a, b) => SEVERITY[a] - SEVERITY[b])[0] }))
    .filter((x) => x.worst).sort((a, b) => a.tier - b.tier || SEVERITY[a.worst] - SEVERITY[b.worst] || ORDER.get(a.id) - ORDER.get(b.id));
}
const DEPTH_BY_ID = new Map(DEPTH.map((r) => [r.id, r]));
const ansClass = (e, id) => { const a = e.S.ans[id]; if (!a || a.stale) return null; if (a.v === 'unknown') return 'unknown'; return QI.get(id).format === 'anchored' && /^[0-5]$/.test(String(a.v)) ? LEVEL_CLASS[a.v] : a.cls; };

// ------------------------------------------------------------------------------------------------ consistency samples
// One follow-up for a tier 1 confirmation reported fully in place. "universal": the first tier 1 scenario with
// follow-ups in each domain whose tier 1 scenarios need no exposure fact (D1, D2, D3, D6, D9, D10), so every
// organisation is tested on the same six; "perDomain": one per domain (ten); "all": every tier 1 scenario with follow-ups.
const T1F = COVERAGE.scenarios.filter((s) => s.tier === 1 && (s.followups || []).length);
const firstPerDomain = (pred) => { const out = []; for (const d of BANK.domains.map((x) => x.id)) { const s = T1F.find((x) => x.domain === d && pred(x)); if (s) out.push(s.id); } return out; };
const UNIVERSAL = firstPerDomain((s) => !s.expWhen);
export const SAMPLES = {
  none: [],
  universal: UNIVERSAL,
  perDomain: BANK.domains.map((d) => UNIVERSAL.find((id) => SCENARIOS.get(id).domain === d.id) ?? T1F.find((s) => s.domain === d.id)?.id).filter(Boolean),
  all: T1F.map((s) => s.id)
};

// ------------------------------------------------------------------------------------------------ profiles
// P6b models overstated confirmations: the organisation reports its confirmations in place while its own answers on the
// related operating practices (follow-ups and depth) are weak. No correction trick is needed to reveal it; only asking does.
export const STAGED_PROFILES = {
  P1: { name: 'Strong controls', profile: 'R', practice: POLICIES.strong },
  P2: { name: 'Weak controls', profile: 'R', practice: POLICIES.weak },
  P3: { name: 'Mixed controls', profile: 'R', practice: POLICIES.mixed },
  P4: { name: 'Limited applicability (small owner-managed firm)', profile: 'S', practice: POLICIES.mixed },
  P5: { name: 'Extensive unanswered information (35% "I don\'t know")', profile: 'R', practice: withUnknown(POLICIES.mixed, 0.35), truth: POLICIES.mixed },
  P6b: { name: 'Overstated confirmations (confirmations in place, related practices weak)', profile: 'R', practice: (q, seed) => (ROLE[q.id]?.role === 'confirm' ? POLICIES.strong(q, seed) : POLICIES.weak(q, seed)) }
};

// ------------------------------------------------------------------------------------------------ the interview
export function runDesign({ design, profileKey, sample = 'none', depth = 'none', depthCap = 4, priorityN = 8, coverage = false, operatingModel = false, ownersReturnUnknowns = false, deferFollowups = design === 'D2', seed = 'mk-sim' }) {
  const prof = STAGED_PROFILES[profileKey];
  const p = PROFILES[prof.profile];
  const ceiling = design === 'D0' ? PRODUCTION_CEILING : EXTENDED_CEILING;
  // D2 defers gap follow-ups from the respondent to the accountable functions (the engine queues none; stage 3 asks them).
  const e = ENGINE.create(BANK, COVERAGE, { ceiling, followups: deferFollowups ? 0 : 2, now: () => '2026-11-11T08:00:00.000Z' });
  const sampleSet = new Set(SAMPLES[sample]);
  const consistency = new Set();
  const answerAs = (q) => practiceValue(q, prof.practice(QI.get(q.id), seed));
  // Consistency hook: after a sampled tier 1 confirmation is reported fully in place, its first applicable follow-up is
  // queued next. The engine's own reserve still protects every open tier 1 confirmation under a screen limit.
  const answer = e.answer;
  e.answer = (q, v, kind, extra) => {
    answer(q, v, kind, extra);
    const r = ROLE[q.id];
    if (r?.role === 'confirm' && sampleSet.has(r.scenario) && ansClass(e, q.id) === 'full') {
      const f = (SCENARIOS.get(r.scenario).followups || []).find((id) => !e.S.ans[id] && !e.S.queue.some((x) => x.q === id));
      if (f) { e.S.queue.unshift({ q: f, s: r.scenario, name: SCENARIOS.get(r.scenario).name }); consistency.add(f); }
    }
  };
  const stage = { core: null, breadth: null };
  let snapshotCore = null;
  const kinds = {};
  for (let n = 0; n < 6000; n++) {
    const st = e.next({ respondentOnly: true });
    if (!st || !st.q) break;
    const q = st.q;
    if (stage.core === null && st.kind === 'coverage') { stage.core = e.respondentScreens(); snapshotCore = e.report(); }
    kinds[st.kind] = (kinds[st.kind] || 0) + 1;
    let v;
    if (q.id === '__assumptions__') v = ['none'];
    else if (q.id.startsWith('PR-')) v = p.answers[q.id] ?? factValue(q, 'open');
    else if (q.type !== 'practice') v = factValue(q, p.facts);
    else v = answerAs(q);
    e.answer(q, v, st.kind);
  }
  if (stage.core === null) { stage.core = e.respondentScreens(); snapshotCore = e.report(); }
  stage.breadth = e.respondentScreens();
  const afterInterview = e.report();
  const owner = {};
  const addOwner = (id, kind) => { const fn = e.functionOf(QI.get(id).owner || 'Senior manager'); owner[fn] ??= { total: 0 }; owner[fn].total++; owner[fn][kind] = (owner[fn][kind] || 0) + 1; };
  // Accountable owners answer what the respondent did not know; in this model they know their own area.
  if (ownersReturnUnknowns) {
    const truth = prof.truth || prof.practice;
    for (const [id, a] of Object.entries(e.S.ans)) if (a.v === 'unknown' && QI.get(id)?.type === 'practice' && !a.stale) { e.ownerReturn(id, practiceValue(QI.get(id), truth(QI.get(id), seed)), { by: 'Fictional owner' }); addOwner(id, 'unknown returned'); }
  }
  // Depth packages for accountable functions.
  const asked = [];
  const askOne = (id, kind, scenario) => {
    if (e.S.ans[id] || e.scope(QI.get(id)).st !== 'applicable') return false;
    const truth = prof.truth || prof.practice;
    e.ownerReturn(id, practiceValue(QI.get(id), truth(QI.get(id), seed)), { by: 'Fictional owner' });
    asked.push({ id, kind, scenario, fn: e.functionOf(QI.get(id).owner || 'Senior manager'), cls: ansClass(e, id), tier: SCENARIOS.get(scenario).tier });
    addOwner(id, kind);
    return true;
  };
  // The report priority set: scenarios with a gap, by tier, then not in place before set out before partly, then method
  // order (the ranking is itself an MK decision, M-3). Essential presents up to eight; Comprehensive designs five.
  const priority = rankGaps(e);
  // With operatingModel, the follow-ups of governance (D1) and response (D10) gaps are added: they describe who owns,
  // operates, investigates and escalates, which the Comprehensive target operating model needs.
  const followTargets = depth === 'priority' ? [...priority.slice(0, priorityN), ...(operatingModel ? priority.slice(priorityN).filter((g) => ['D1', 'D10'].includes(SCENARIOS.get(g.id).domain)) : [])] : deferFollowups ? priority : [];
  for (const g of followTargets) { let n = 0; for (let pass = 0; pass < 2; pass++) for (const f of SCENARIOS.get(g.id).followups || []) { if (n >= 2) break; if (askOne(f, 'follow-up', g.id)) n++; } }
  const diagTargets = (depth === 'priority' ? priority.slice(0, priorityN) : depth === 'all' ? priority : []).filter((g) => g.worst !== 'absent');
  for (const g of diagTargets) {
    const cands = DEPTH.filter((r) => r.scenario === g.id && r.role === 'related' && r.value !== 'coverage').sort((a, b) => (a.stage === 'core' ? 0 : 1) - (b.stage === 'core' ? 0 : 1)).map((r) => r.id);
    const cap = depth === 'all' ? Infinity : depthCap;
    let n = 0;
    for (let pass = 0; pass < 3 && n < cap; pass++) for (const id of cands) { if (n >= cap) break; if (askOne(id, 'diagnostic', g.id)) n++; }
  }
  if (coverage) {
    const rep = e.report();
    const perObjective = {};
    for (let pass = 0; pass < 3; pass++) for (const r of DEPTH.filter((x) => x.value === 'coverage')) {
      const o = r.objectives[0];
      if (depth === 'priority' && (perObjective[o] || 0) >= 2) continue;
      if (rep.scenarios.find((x) => x.id === r.scenario)?.status === 'outofscope') continue;
      if (askOne(r.id, 'coverage', r.scenario)) perObjective[o] = (perObjective[o] || 0) + 1;
    }
  }
  // Breadth screens if the respondent delegated each area to its accountable function instead.
  const breadthByFn = {};
  e.S.log.filter((x) => x.via === 'respondent' && QI.has(x.q)).slice(stage.core).forEach((x) => { const fn = e.functionOf(QI.get(x.q).owner || 'Senior manager'); breadthByFn[fn] = (breadthByFn[fn] || 0) + 1; });
  return { e, design, profileKey, sample, depth, stage, kinds, snapshotCore, afterInterview, final: e.report(), consistency: [...consistency], owner, asked, breadthByFn, priority: rankGaps(e), ansClass: (id) => ansClass(e, id) };
}
