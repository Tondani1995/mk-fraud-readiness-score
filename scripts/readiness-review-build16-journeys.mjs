// Respondent and accountable-function journeys for the fictional profiles, through the real session layer with
// review engine build 1.6. Writes docs/readiness-review/staged-assessment/JOURNEYS.md and journeys.json.
// Run: node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/readiness-review-build16-journeys.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JOURNEY_PROFILES, runJourney, makeClock, newStagedSession, runRespondent, act } from './lib/build16-driver.mjs';
import { replay } from '../src/lib/readiness-review/session.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs/readiness-review/staged-assessment');
const KEYS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6b'];
const res = { generated: 'Fictional organisations only. Build 1.6 is inactive for customers and produces no score.', profiles: {} };

for (const pk of KEYS) {
  const timeline = [];
  const decline = pk === 'P3' ? (fn, step, live) => (fn === 'Procurement' && live.engine.S.assign[step.q.id]?.origin === 'depth' ? 'Fictional: supplier vetting is run by the operations team, not procurement' : null) : null;
  const j = runJourney(pk, { timeline, decline });
  const e = j.live.engine;
  const st = j.final.staged;
  const at = (n) => timeline.find((t) => t.screen >= n) ?? timeline.at(-1);
  const coreDone = timeline.find((t) => t.stage !== 'core');
  const items = Object.values(e.S.assign);
  const fnRows = e.FUNCTIONS.map((fn) => {
    const mine = items.filter((a) => a.fn === fn);
    const k = (f) => mine.filter(f).length;
    return {
      fn,
      area: Object.entries(e.S.domainAssign).filter(([, a]) => e.functionOf(a.owner) === fn).map(([d]) => d),
      areaAnswered: j.live.record.actions.filter((a) => a.type === 'owner.answer' && a.fn === fn && !e.S.assign[a.q]).length + k((a) => a.origin === 'area'),
      unknown: k((a) => /did not know/.test(a.why || '')),
      depth: k((a) => a.origin === 'depth'),
      depthKinds: mine.filter((a) => a.origin === 'depth').reduce((m, a) => { m[a.kind] = (m[a.kind] || 0) + 1; return m; }, {}),
      screens: st.workload[fn] || 0,
      declined: k((a) => a.status === 'declined'),
      ownerUnknown: k((a) => a.status === 'owner-unknown')
    };
  }).filter((r) => r.screens || r.declined || r.unknown || r.depth || r.area.length);
  // Combined workload per person under stated fictional staffing.
  const w = st.workload;
  const fnTotal = Object.entries(w).filter(([k]) => k !== 'respondent').reduce((a, [, v]) => a + v, 0);
  const staffing = pk === 'P4'
    ? [{ person: 'Owner-manager (respondent and every function)', screens: w.respondent + fnTotal }]
    : [
        { person: 'Financial controller (respondent, also holds Finance)', screens: w.respondent + (w.Finance || 0) },
        ...Object.entries(w).filter(([k]) => !['respondent', 'Finance'].includes(k)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => ({ person: `${k} lead`, screens: v }))
      ];
  res.profiles[pk] = {
    name: JOURNEY_PROFILES[pk].name,
    respondentScreens: e.respondentScreens(), kinds: j.respondent.kinds,
    coreCompleteAtScreen: coreDone?.screen ?? null,
    at95: at(95), atEnd: timeline.at(-1),
    milestones: [25, 50, 75, 95, 125, 150].map((n) => (timeline.some((t) => t.screen >= n) ? at(n) : null)).filter(Boolean),
    afterInterview: { core: j.afterInterview.stages.core, breadth: j.afterInterview.stages.breadth },
    sends: j.sends, functions: fnRows, staffing,
    final: { stage: st.stages.current, breadth: st.stages.breadth, packagesOpen: st.stages.packages.open, outstanding: { withFunctions: st.stages.breadth.withFunctions, declined: st.stages.packages.functions.reduce((a, f) => a + f.declined.length, 0), unknownToFunction: st.stages.packages.functions.reduce((a, f) => a + f.unknownByOwner, 0) } },
    consistency: { eligible: st.consistency.eligible, selected: st.consistency.selected, tested: st.consistency.answered, untested: st.consistency.untested, counts: st.consistency.counts },
    actions: j.live.record.actions.length
  };
}

// A completed stage resumed after a correction (P3).
{
  const clock = makeClock();
  const live = newStagedSession('Fictional Mixed Co', clock);
  runRespondent(live, clock, 'P3');
  const e = live.engine;
  const before = e.stages();
  const fact = Object.entries(e.S.ans).filter(([id, a]) => !a.stale && a.via === 'respondent' && e.QI[id]?.type !== 'practice' && JSON.stringify(a.v) === '"no"' && e.QI[id].options.some((o) => o[0] === 'yes')).map(([id]) => id).find((id) => {
    const copy = replay(live.record);
    act(copy, makeClock('2026-11-11T12:00:00Z'), { type: 'respondent.correct', q: id, value: 'yes' });
    return copy.engine.stages().breadth.applicableSoFar > before.breadth.applicableSoFar;
  });
  act(live, clock, { type: 'respondent.correct', q: fact, value: 'yes' });
  const reopened = e.stages();
  const served = live.respondentStep?.q.id;
  const r = runRespondent(live, clock, 'P3');
  const after = e.stages();
  res.correction = { fact, factText: e.QI[fact].text, before: { stage: before.current, breadth: before.breadth }, reopened: { stage: reopened.current, core: reopened.core, breadth: reopened.breadth, firstQuestion: served, firstQuestionText: e.QI[served]?.text }, answeredAfter: Object.values(r.kinds).reduce((a, b) => a + b, 0), after: { stage: after.current, breadth: after.breadth } };
}

// ------------------------------------------------------------------------------------------------ report
mkdirSync(OUT, { recursive: true });
const md = [];
const p = (t = '') => md.push(t);
const tbl = (head, rows) => { p(`| ${head.join(' | ')} |`); p(`|${head.map(() => '---').join('|')}|`); rows.forEach((r) => p(`| ${r.join(' | ')} |`)); p(); };
const P = (pk) => res.profiles[pk];
p('# Staged assessment journeys (generated)');
p();
p('> Generated by `scripts/readiness-review-build16-journeys.mjs` through the real session layer (commit, serve and replay) with review engine build 1.6, bank 1.3 and coverage map 1.3. Fictional organisations only. Build 1.6 is inactive for customers and produces no score. The same journeys are pinned as golden fixtures in `scripts/fixtures/readiness-review-build16-golden.json` and checked by `scripts/readiness-review-build16-tests.mjs`.');
p();
p('## Respondent journeys: every applicable confirmation, no screen ceiling');
p();
p('"Reached" counts confirmations answered by the respondent or now with an accountable function (delegated areas and "I don\'t know"). At screen 95, where build 1.5 stops, the breadth column shows how much would have been left.');
p();
tbl(['Profile', 'Respondent screens', 'Core complete at screen', 'At screen 95: core / breadth reached', 'End: core / breadth reached', 'Screens by kind'], KEYS.map((pk) => {
  const x = P(pk);
  return [`${pk} ${x.name}`, String(x.respondentScreens), String(x.coreCompleteAtScreen ?? 'n/a'), x.respondentScreens >= 95 ? `${x.at95.core} / ${x.at95.breadth}` : 'ended before 95', `${x.atEnd.core} / ${x.atEnd.breadth}`, Object.entries(x.kinds).map(([k, v]) => `${k} ${v}`).join(', ')];
}));
p('Stage progress as the respondent sees it (core and breadth reached so far; counts grow as answers bring questions into scope):');
p();
tbl(['Profile', ...[25, 50, 75, 95, 125, 150].map((n) => `Screen ${n}`)], KEYS.map((pk) => [pk, ...[25, 50, 75, 95, 125, 150].map((n) => { const m = P(pk).milestones.find((t) => t.screen >= n && t.screen < n + 25); return m ? `${m.stage === 'core' ? 'Core' : 'Breadth'} stage: ${m.core} core, ${m.breadth} in all` : ''; })]));
p('## Accountable-function journeys');
p();
p('Each function answers only its own questions: delegated areas, questions the respondent did not know, and depth questions sent as packages. Rounds are the package sends, recomputed after each round of answers.');
p();
KEYS.forEach((pk) => {
  const x = P(pk);
  p(`**${pk} ${x.name}.** Package rounds: ${x.sends.join(' + ')}. Final stage: ${x.final.stage}; outstanding: ${x.final.outstanding.withFunctions} with a function, ${x.final.outstanding.declined} declined, ${x.final.outstanding.unknownToFunction} not known by the function.`);
  p();
  tbl(['Function', 'Areas delegated', '"I don\'t know" answers', 'Depth questions (by kind)', 'Screens', 'Declined', 'Answered "I don\'t know"'], x.functions.map((f) => [f.fn, f.area.join(', ') || '', String(f.unknown), `${f.depth}${f.depth ? ` (${Object.entries(f.depthKinds).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}`, String(f.screens), String(f.declined), String(f.ownerUnknown)]));
});
p('## Combined workload per person');
p();
p('Screens are counted from the action log: every answer a person gives, in breadth and in function packages together. The staffing is stated for each fictional organisation; a real organisation would map its own people.');
p();
tbl(['Profile', 'Person', 'Screens in total'], KEYS.flatMap((pk) => P(pk).staffing.map((s, i) => [i === 0 ? pk : '', s.person, String(s.screens)])));
p('## A completed stage resumed by a correction');
p();
const c = res.correction;
p(`P3 completed its interview with ${c.before.breadth.applicableSoFar} confirmations reached (stage "${c.before.stage}"). The respondent then corrected ${c.fact} ("${c.factText}") from "no" to "yes". The stage reopened ("${c.reopened.stage}", ${c.reopened.breadth.open} confirmation open) and the next question served was ${c.reopened.firstQuestion} ("${c.reopened.firstQuestionText}"). After ${c.answeredAfter} further answer${c.answeredAfter === 1 ? '' : 's'} the stage was "${c.after.stage}" again with ${c.after.breadth.applicableSoFar} confirmations reached. Every earlier answer that still applied was kept; answers that a correction takes out of scope are kept in history as stale and asked again, not silently reused, if they come back into scope (test B16-03).`);
p();
writeFileSync(path.join(OUT, 'JOURNEYS.md'), md.join('\n'));
writeFileSync(path.join(OUT, 'journeys.json'), JSON.stringify(res, null, 2) + '\n');
console.log('written', KEYS.map((pk) => `${pk}:${P(pk).respondentScreens}`).join(' '));
