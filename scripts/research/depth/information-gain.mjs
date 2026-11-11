// HYPOTHETICAL RESEARCH ONLY. Depth selection by information gain (build 1.6) against the earlier priority-eight
// selection, a re-ranking test, and the consistency checks per profile. Every run goes through the real session layer
// with build 1.6 and the shipped bank and coverage map. Fictional organisations only; no rule here is approved.
// Run: node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/research/depth/information-gain.mjs [--check]
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { JOURNEY_PROFILES, makeClock, newStagedSession, act, runRespondent, runOwners } from '../../lib/build16-driver.mjs';
import { COVERAGE, POLICIES, ROOT, HYPOTHETICAL, BANK } from '../scoring-simulation/lib.mjs';

const OUT = path.join(ROOT, 'docs/readiness-review/staged-assessment');
const ROLE = COVERAGE.questionRole;
const SCN = new Map(COVERAGE.scenarios.map((s) => [s.id, s]));
const ORDER = new Map(COVERAGE.scenarios.map((s, i) => [s.id, i]));
const GAP = ['absent', 'partial', 'designed'];
const LEVEL = { 0: 'absent', 1: 'partial', 2: 'partial', 3: 'partial', 4: 'full', 5: 'full' };

// P6c: strong everywhere except the practices of objectives no confirmation covers (see the objectives review).
const confirmObjectives = new Set(Object.keys(ROLE).filter((id) => ROLE[id].role === 'confirm').flatMap((id) => ROLE[id].objectives || []));
JOURNEY_PROFILES.P6c = { name: 'Weak only where no confirmation looks', profile: 'R', practice: (q, seed) => ((ROLE[q.id]?.objectives || []).some((o) => !confirmObjectives.has(o)) ? POLICIES.weak(q, seed) : POLICIES.strong(q, seed)) };
const PROFILE_KEYS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6b', 'P6c'];

const clsOf = (e, id) => { const a = e.S.ans[id]; if (!a || a.stale) return null; if (a.v === 'unknown') return 'unknown'; const q = e.QI[id]; return q?.format === 'anchored' && /^[0-5]$/.test(String(a.v)) ? LEVEL[a.v] : a.cls; };

// ------------------------------------------------------------------------------------------------ issue rankings
// Ranking is an open MK decision. Two candidate rankings are used only to test whether further answers change which
// issues deserve attention:
//   R1 confirmations only: scenarios with a confirmation gap, by tier, then the worst confirmation, then method order;
//   R2 answers-aware: every answer counts. Points = worst confirmation (not in place 3, designed 2, partly 1.5) plus,
//      for its supporting practices (follow-ups and related), 1 per practice not in place and 0.5 per partial or
//      designed (at most 3), plus 2 for tier 1 and 1 for tier 2. A scenario whose confirmations are in place can rank.
const SEV = { absent: 3, designed: 2, partial: 1.5 };
function issues(e) {
  const rep = e.report();
  return rep.scenarios.filter((s) => s.status !== 'outofscope').map((s) => {
    const sc = SCN.get(s.id);
    const conf = s.confirmations.map((c) => clsOf(e, c.id)).filter((k) => k in SEV);
    const worst = conf.sort((a, b) => SEV[b] - SEV[a])[0] ?? null;
    const support = [...(sc.followups || []), ...(sc.related || [])].map((id) => clsOf(e, id)).filter((k) => GAP.includes(k));
    const supportPts = Math.min(3, support.reduce((a, k) => a + (k === 'absent' ? 1 : 0.5), 0));
    const pts = (worst ? SEV[worst] : 0) + supportPts + (s.tier === 1 ? 2 : s.tier === 2 ? 1 : 0);
    return { id: s.id, tier: s.tier, worst, supportGaps: support.length, pts: worst || support.length ? pts : 0 };
  });
}
const R1 = (list) => list.filter((x) => x.worst).sort((a, b) => a.tier - b.tier || SEV[b.worst] - SEV[a.worst] || ORDER.get(a.id) - ORDER.get(b.id)).map((x) => x.id);
const R2 = (list) => list.filter((x) => x.pts > 0).sort((a, b) => b.pts - a.pts || a.tier - b.tier || ORDER.get(a.id) - ORDER.get(b.id)).map((x) => x.id);
const top = (ids, n = 8) => ids.slice(0, n);
const diff = (a, b) => b.filter((x) => !a.includes(x));

// ------------------------------------------------------------------------------------------------ the two selections
function priorityEight(e) {
  // The earlier design: questions only for the top eight gaps under R1, chosen before any depth answer.
  const eight = new Set(top(R1(issues(e))));
  const perScen = {}, perObj = {};
  return e.depthCandidates().filter((c) => {
    if (c.kind === 'coverage') { const k = c.objective || c.id; if ((perObj[k] || 0) >= 2) return false; perObj[k] = (perObj[k] || 0) + 1; return true; }
    if (!eight.has(c.scenario) || c.kind === 'gate') return false;
    const cap = c.kind === 'follow-up' ? 2 : 4;
    const key = `${c.scenario}/${c.kind}`;
    if ((perScen[key] || 0) >= cap) return false;
    perScen[key] = (perScen[key] || 0) + 1;
    return true;
  }).map((c) => c.id);
}

function journey(pk, method) {
  const clock = makeClock();
  const live = newStagedSession(`Fictional ${pk}`, clock);
  const e = live.engine;
  const p = JOURNEY_PROFILES[pk];
  runRespondent(live, clock, pk, { onStep: p.delegate ? (_s, l) => (l.engine.stages().core.complete ? 'pause' : null) : null });
  if (p.delegate) { for (const [domain, owner] of p.delegate) act(live, clock, { type: 'respondent.assignArea', domain, owner }); runRespondent(live, clock, pk); }
  runOwners(live, clock, pk); // areas and "I don't know" answers first, in both methods
  const before = issues(e);
  const candidatesFirst = e.depthCandidates();
  const recommendedFirst = e.selectDepth();
  const sends = [];
  if (method === 'priority') {
    const ids = priorityEight(e);
    act(live, clock, { type: 'organisation.sendToOwners', depth: ids }, 'organisation');
    sends.push(e.S.v16.sends.at(-1).assigned.length);
    runOwners(live, clock, pk);
  } else {
    for (let i = 0; i < 5; i++) {
      act(live, clock, { type: 'organisation.sendToOwners' }, 'organisation');
      const made = e.S.v16.sends.at(-1).assigned.length;
      sends.push(made);
      runOwners(live, clock, pk);
      if (!made) break;
    }
  }
  const after = issues(e);
  const depth = Object.values(e.S.assign).filter((a) => a.origin === 'depth');
  const confirmedInPlace = (sid) => { const s = e.report().scenarios.find((x) => x.id === sid); return s && s.confirmations.length > 0 && s.confirmations.every((c) => clsOf(e, c.id) === 'full'); };
  const hidden = depth.filter((a) => GAP.includes(clsOf(e, a.qid)) && a.kind !== 'gate' && confirmedInPlace(a.scenario));
  const coverageGaps = depth.filter((a) => a.kind === 'coverage' && GAP.includes(clsOf(e, a.qid)));
  // A gap reported under a confirmation already reported not in place repeats what is known: the recommendation is the
  // same whatever the answer.
  const worstOf = (sid) => { const s = e.report().scenarios.find((x) => x.id === sid); return s ? s.confirmations.map((c) => clsOf(e, c.id)) : []; };
  const expectedGaps = depth.filter((a) => a.kind !== 'coverage' && GAP.includes(clsOf(e, a.qid)) && worstOf(a.scenario).includes('absent'));
  const gatesAsked = depth.filter((a) => a.kind === 'gate').length;
  const kinds = depth.reduce((m, a) => { m[a.kind] = (m[a.kind] || 0) + 1; return m; }, {});
  const perFn = depth.reduce((m, a) => { m[a.fn] = (m[a.fn] || 0) + 1; return m; }, {});
  const r1b = top(R1(before)), r1a = top(R1(after)), r2b = top(R2(before)), r2a = top(R2(after));
  const visibleBefore = new Set(R2(before)), visibleAfter = R2(after);
  return {
    pk, method, sends, depthAsked: depth.length, kinds, perFunctionMax: Math.max(0, ...Object.values(perFn)),
    answered: depth.filter((a) => a.status === 'returned').length,
    gapsFound: depth.filter((a) => GAP.includes(clsOf(e, a.qid))).length, expectedGaps: expectedGaps.length,
    hiddenGaps: hidden.length, hiddenScenarios: [...new Set(hidden.map((a) => a.scenario))].length,
    coverageGaps: coverageGaps.length, gatesAsked,
    scenariosTouched: new Set(depth.map((a) => a.scenario)).size,
    r1: { before: r1b, after: r1a, entered: diff(r1b, r1a) },
    r2: { before: r2b, after: r2a, entered: diff(r2b, r2a) },
    issuesOnlyAfter: visibleAfter.filter((id) => !visibleBefore.has(id)).length,
    issuesBefore: visibleBefore.size, issuesAfter: visibleAfter.length,
    outsideFirstEight: depth.filter((a) => !r1b.includes(a.scenario) && GAP.includes(clsOf(e, a.qid))).length,
    candidatesFirst: candidatesFirst.length, recommendedFirst: recommendedFirst.length,
    excluded: {
      belowMinGain: candidatesFirst.filter((c) => c.gain < 3).length,
      byLimits: candidatesFirst.filter((c) => c.gain >= 3).length - recommendedFirst.length
    },
    consistency: (() => { const c = e.consistencySummary(); return { eligible: c.eligible, selected: c.selected, tested: c.answered, untested: c.untested, counts: c.counts, checks: c.checks.map((x) => ({ scenario: x.scenario, tier: x.tier, confirmation: x.confirmation, followup: x.followup, outcome: x.outcome })) }; })(),
    respondentScreens: e.respondentScreens(),
    functionScreens: live.record.actions.filter((a) => a.type === 'owner.answer').length,
    workload: e.report().staged.workload
  };
}

// ------------------------------------------------------------------------------------------------ run
const res = { generated: HYPOTHETICAL, bank: BANK.bankVersion, engine: '1.6', profiles: {} };
for (const pk of PROFILE_KEYS) res.profiles[pk] = { name: JOURNEY_PROFILES[pk].name, ig: journey(pk, 'ig'), priority: journey(pk, 'priority') };

// ------------------------------------------------------------------------------------------------ report
mkdirSync(OUT, { recursive: true });
const md = [];
const p = (t = '') => md.push(t);
const tbl = (head, rows) => { p(`| ${head.join(' | ')} |`); p(`|${head.map(() => '---').join('|')}|`); rows.forEach((r) => p(`| ${r.join(' | ')} |`)); p(); };
const R = (pk) => res.profiles[pk];
p('# Depth by information gain, re-ranking and consistency checks (generated)');
p();
p(`> ${HYPOTHETICAL}. Generated by \`scripts/research/depth/information-gain.mjs\` through the session layer with review engine build 1.6, bank ${BANK.bankVersion} and coverage map 1.3. Fictional organisations only. P6c is strong everywhere except the practices of the objectives no confirmation covers.`);
p();
p('## 1. How build 1.6 chooses depth questions');
p();
p('Every candidate is valued by what its answer could change, never by its place in a ranking of findings. A coverage question (the only question on an objective no confirmation covers) starts at 3; a diagnostic of a partly reported control at 2; a follow-up at 2 where the confirmation is partly in place and 1 where it is not in place (what else exists matters less than the gap itself). Tier 1 adds 1 and tier 2 adds 0.5; a question other practices depend on adds 1, because its answer decides what is asked next; a question on an objective with no known answer adds 1, and a detail question on an objective already answered twice loses 1. Two further rules follow the existing relationships and the answers already given: a scenario whose confirmations are reported in place is investigated when one of its supporting practices has already been reported as a gap (a consistency check or a function\'s answer), and a question that cannot yet be asked because a fact decides whether it applies is replaced by that fact, valued at the best question it would open less 0.5. Questions at 3 or more are recommended, at most 15 per function, 4 diagnostics per scenario and 2 coverage questions per objective. The selection is recomputed on every send, so each round of answers changes the next.');
p();
p('## 2. Information gain against the earlier priority-eight selection');
p();
p('Both methods start from the same session after the respondent interview and the functions\' answers to "I don\'t know" and delegated areas. The priority-eight method sends one round: questions only for the eight gaps ranked first by R1 before any depth answer, plus up to two coverage questions per objective. Information gain sends recommended rounds until nothing further qualifies.');
p();
tbl(['Profile', 'Method', 'Rounds', 'Depth questions', 'Most for one function', 'Gaps found', 'Of which under a control already not in place', 'Gaps behind confirmations in place', 'Coverage gaps', 'Gaps outside the first eight', 'Scenarios touched'], PROFILE_KEYS.flatMap((pk) => ['ig', 'priority'].map((m) => {
  const x = R(pk)[m];
  return [m === 'ig' ? `${pk} ${R(pk).name}` : '', m === 'ig' ? 'Information gain' : 'Priority eight', x.sends.join(' + '), String(x.depthAsked), String(x.perFunctionMax), String(x.gapsFound), String(x.expectedGaps), `${x.hiddenGaps} (${x.hiddenScenarios} scenarios)`, String(x.coverageGaps), String(x.outsideFirstEight), String(x.scenariosTouched)];
})));
p('"Gaps behind confirmations in place" are answers reporting a supporting practice not in place, partly in place or set out only, on a scenario whose confirmations were all reported in place. They are where a self-reported confirmation and the organisation\'s own further answers disagree. The priority-eight method reaches them only through its coverage questions, because a scenario whose confirmations are in place never enters its eight. Gaps found under a control already reported not in place repeat what is known; the priority-eight method finds more of those (it asks two follow-ups per gap whatever the answer), which is why it can find more gaps in total for some profiles while adding less to any conclusion.');
p();
{
  const lower = PROFILE_KEYS.filter((pk) => R(pk).ig.gapsFound < R(pk).priority.gapsFound);
  if (lower.length) p(`Where information gain found fewer gaps (${lower.map((pk) => `${pk}: ${R(pk).ig.gapsFound} against ${R(pk).priority.gapsFound}`).join('; ')}), its threshold left out diagnostics of tier 2 and tier 3 scenarios whose objective already has an answer, which for an organisation with few applicable confirmations are most of the gaps that remain. Whether the threshold or the limits should relax when few confirmations apply is a burden decision for MK; it is recorded in the decision register.`);
}
p();
p('## 3. Do further answers change which issues deserve attention?');
p();
p('Ranking is an open MK decision, so the test uses two candidate rankings. R1 uses confirmation answers only. R2 counts every answer: the worst confirmation, the gaps among the scenario\'s supporting practices and the tier. "Entered" counts the issues in the top eight after the depth answers that were not in the top eight before them.');
p();
tbl(['Profile', 'Issues before / after depth (R2)', 'Issues visible only after depth', 'R1 top eight: entered after depth', 'R2 top eight: entered after depth (information gain)', 'R2 top eight: entered after depth (priority eight)'], PROFILE_KEYS.map((pk) => {
  const ig = R(pk).ig, pr = R(pk).priority;
  return [`${pk} ${R(pk).name}`, `${ig.issuesBefore} / ${ig.issuesAfter}`, String(ig.issuesOnlyAfter), `${ig.r1.entered.length}${ig.r1.entered.length ? ` (${ig.r1.entered.join(', ')})` : ''}`, `${ig.r2.entered.length}${ig.r2.entered.length ? ` (${ig.r2.entered.join(', ')})` : ''}`, `${pr.r2.entered.length}`];
}));
{
  const more = PROFILE_KEYS.filter((pk) => R(pk).ig.r2.entered.length > R(pk).priority.r2.entered.length);
  const fewer = PROFILE_KEYS.filter((pk) => R(pk).ig.r2.entered.length < R(pk).priority.r2.entered.length);
  const same = PROFILE_KEYS.filter((pk) => R(pk).ig.r2.entered.length === R(pk).priority.r2.entered.length);
  const changed = PROFILE_KEYS.filter((pk) => R(pk).ig.r2.entered.length > 0);
  p(`Reading the table: under R1 the top eight never changes in these runs, because R1 looks only at confirmations and every confirmation was answered before depth began; measuring depth against the eight chosen before it is circular. Under R2 the depth answers change the top eight for ${changed.length} of ${PROFILE_KEYS.length} profiles (${changed.join(', ')}). Information gain changes it by more issues than the priority-eight method for ${more.join(', ') || 'no profile'}, by the same number for ${same.join(', ') || 'no profile'} and by fewer for ${fewer.join(', ') || 'no profile'}. Where the priority-eight method moves the ranking as much, its first eight already pointed at the weak scenarios; it still cannot look beyond them except through coverage questions.`);
  p();
}
p('## 4. Burden and what is not asked');
p();
tbl(['Profile', 'Respondent screens', 'Function screens (information gain)', 'Candidates at the first send', 'Recommended', 'Below the threshold', 'Held back by limits'], PROFILE_KEYS.map((pk) => {
  const x = R(pk).ig;
  return [`${pk}`, String(x.respondentScreens), String(x.functionScreens), String(x.candidatesFirst), String(x.recommendedFirst), String(x.excluded.belowMinGain), String(x.excluded.byLimits)];
}));
p('Questions below the threshold are mainly follow-ups of controls reported not in place (the gap is already the finding) and detail questions on objectives already answered twice. Diagnostics are never put to a function where the confirmation is reported not in place: there is nothing in place to describe, and the recommendation does not depend on the answer.');
p();
p('## 5. Consistency checks per profile');
p();
p('The rule (deterministic and applicability-aware): after a tier 1 or tier 2 confirmation is reported fully in place, the first of its follow-ups that applies and has not been asked is asked straight away, at most one per area and ten in all, in the order the confirmations were answered. The population is every tier 1 and tier 2 confirmation reported fully in place that has at least one follow-up in scope. A check is counted as tested only when its follow-up has an answer other than "I don\'t know".');
p();
const OUT_ORDER = ['consistent', 'narrower-scope', 'partial-operation', 'not-yet-operating', 'conflicting', 'no-case-yet', 'missing-information', 'pending', 'not-applicable', 'superseded'];
tbl(['Profile', 'Population', 'Selected', 'Tested', 'Not tested', 'Consistent', 'Narrower scope', 'Partial operation', 'Not yet operating', 'Conflicting', 'Untested in practice', 'Missing information'], PROFILE_KEYS.map((pk) => {
  const c = R(pk).ig.consistency;
  const n = (k) => String(c.counts[k] || 0);
  return [`${pk} ${R(pk).name}`, String(c.eligible), String(c.selected), String(c.tested), String(c.untested), n('consistent'), n('narrower-scope'), n('partial-operation'), n('not-yet-operating'), n('conflicting'), n('no-case-yet'), n('missing-information')];
}));
p('What a check is and is not. Each check is one further self-reported answer about a practice that supports a confirmation the organisation reported in place. It is not a test of operation and it is not evidence; evidence review belongs to Advisory. "Not tested" counts the confirmations in the population that were not selected: nothing is known about their consistency, and no report may say otherwise. A conflicting answer is a disagreement between two answers, which may mean the confirmation is overstated or that the follow-up was read more strictly; narrower scope and partial operation are not contradictions. No score, band or cap is changed by any outcome: F2 (score ceiling) and F4 (band limit) stay inactive until MK approves their definitions and proportionality.');
p();
p(`P6b and P6c show why the checks matter. Their scoring frames are identical (every confirmation reported in place), but P6b\'s checks find ${R('P6b').ig.consistency.counts.conflicting || 0} conflicting answers and P6c\'s find ${R('P6c').ig.consistency.counts.conflicting || 0}: only the checks distinguish an overstated confirmation from weaknesses that sit where no confirmation looks.`);
p();
writeFileSync(path.join(OUT, 'INFORMATION-GAIN-AND-CONSISTENCY.md'), md.join('\n'));
writeFileSync(path.join(OUT, 'information-gain.json'), JSON.stringify(res, null, 2) + '\n');

if (process.argv.includes('--check')) {
  const errors = [];
  for (const pk of PROFILE_KEYS) {
    const x = R(pk).ig;
    if (x.perFunctionMax > 15) errors.push(`${pk}: more than 15 depth questions for one function`);
    if (x.consistency.selected > 10) errors.push(`${pk}: more than ten consistency checks`);
    if (x.consistency.tested > x.consistency.selected) errors.push(`${pk}: more tested than selected`);
  }
  if (!(R('P6b').ig.hiddenGaps > R('P6b').priority.hiddenGaps)) errors.push('information gain did not find more gaps behind confirmations in place than the priority-eight method for P6b');
  if (!((R('P6b').ig.consistency.counts.conflicting || 0) > (R('P6c').ig.consistency.counts.conflicting || 0))) errors.push('consistency checks did not separate P6b from P6c');
  if (!PROFILE_KEYS.some((pk) => R(pk).ig.r2.entered.length > 0)) errors.push('no profile showed depth answers changing the top eight under R2');
  console.log(errors.length ? `FAIL ${errors.join('; ')}` : `PASS information gain: ${PROFILE_KEYS.length} profiles; P6b gaps behind confirmations in place ${R('P6b').ig.hiddenGaps} (priority eight ${R('P6b').priority.hiddenGaps}); conflicting checks P6b ${R('P6b').ig.consistency.counts.conflicting || 0}, P6c ${R('P6c').ig.consistency.counts.conflicting || 0}`);
  if (errors.length) process.exitCode = 1;
} else console.log('written');
