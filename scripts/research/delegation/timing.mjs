// FICTIONAL RESEARCH. When should a respondent hand an area to its accountable function? The same fictional
// organisations are run through the real build 1.6 session layer with area delegation at three moments, and the effect
// on the respondent, the whole organisation and the information left outstanding is measured from the action log.
//
//   after-core   the current journey default: areas are handed over once the core stage is complete
//   area-entry   the area is handed over at its first question (the offer build 1.6 now makes at area entry)
//   at-start     the areas are handed over before the first area question, straight after the profile
//
// No screen limit is set in any variant. Every variant keeps one assessment, one action log and one task per question;
// the measures below check that rather than assume it.
//
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs \
//     scripts/research/delegation/timing.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import { makeClock, newStagedSession, act, runRespondent, runOwners, JOURNEY_PROFILES } from '../../lib/build16-driver.mjs';
import { buildStagedReportInput } from '../../../src/lib/readiness-review/report-input.ts';
import { assessmentStatusView, stageProgressView } from '../../../src/lib/readiness-review/view-model.ts';

const OUT = path.resolve('docs/readiness-review/staged-assessment/delegation');
// Who would hand which areas over. P5 is the unknown-heavy retail group (its own two delegations); P3 is the mixed
// retail group handing over the three areas it reported weakest; P4 is the small firm handing over digital.
const CASES = [
  { key: 'P5', areas: [['D4', 'Procurement manager'], ['D9', 'IT manager']] },
  { key: 'P3', areas: [['D4', 'Procurement manager'], ['D5', 'HR or payroll manager'], ['D9', 'IT manager']] },
  { key: 'P4', areas: [['D9', 'Head of IT or IT provider']] }
];
const TIMINGS = ['none', 'after-core', 'area-entry', 'at-start'];

function journey(key, areas, timing) {
  const clock = makeClock();
  const live = newStagedSession(`Fictional ${key} ${timing}`, clock);
  const e = live.engine;
  const pending = new Map(timing === 'none' ? [] : areas);
  const handOver = (domain) => { const owner = pending.get(domain); pending.delete(domain); return { type: 'respondent.assignArea', domain, owner }; };
  const onStep = (step, l) => {
    const domain = l.engine.DOM[step.q.id];
    if (timing === 'at-start' && domain && pending.size) return handOver([...pending.keys()][0]);
    if (timing === 'area-entry' && domain && pending.has(domain)) return handOver(domain);
    if (timing === 'after-core' && pending.size && l.engine.stages().core.complete) return 'pause';
    return null;
  };
  runRespondent(live, clock, key, { onStep });
  if (timing === 'after-core' && pending.size) {
    for (const domain of [...pending.keys()]) act(live, clock, handOver(domain));
    runRespondent(live, clock, key);
  }
  const respondentScreens = e.respondentScreens();
  const coreScreens = (() => { let n = 0; for (const a of live.record.actions) { if (a.actor === 'respondent' && a.input?.type === 'respondent.answer') n++; } return n; })();
  const stagesAfterInterview = e.stages();
  // Functions work their areas and packages until nothing is left (the same rounds as the journeys).
  const owners = runOwners(live, clock, key);
  for (let i = 0; i < 4; i++) {
    const before = Object.keys(e.S.assign).length;
    act(live, clock, { type: 'organisation.sendToOwners' }, 'organisation');
    const r = runOwners(live, clock, key);
    for (const [k, v] of Object.entries(r.screens)) owners.screens[k] = (owners.screens[k] || 0) + v;
    if (Object.keys(e.S.assign).length === before) break;
  }
  if (live.respondentStep) runRespondent(live, clock, key);
  const report = e.report();
  const status = assessmentStatusView(report, stageProgressView(report));
  const input = buildStagedReportInput(live);
  // One question, one task: no question is answered by two different actors, and no assignment repeats a question.
  const answerers = new Map();
  for (const a of live.record.actions) {
    const q = a.input?.q;
    if (!q || !['respondent.answer', 'owner.answer'].includes(a.input?.type)) continue;
    const who = a.input.type === 'owner.answer' ? `fn:${a.input.fn}` : 'respondent';
    if (!answerers.has(q)) answerers.set(q, new Set());
    answerers.get(q).add(who);
  }
  const answeredByTwo = [...answerers.values()].filter((s) => s.size > 1).length;
  const assignIds = Object.values(e.S.assign).map((x) => x.qid);
  const duplicateAssignments = assignIds.length - new Set(assignIds).size;
  const ownerScreens = Object.values(owners.screens).reduce((x, y) => x + y, 0);
  const corrections = live.record.actions.filter((a) => a.input?.type === 'respondent.correct').length;
  return {
    key, timing, areas: timing === 'none' ? [] : areas.map(([d]) => d),
    respondentScreens, ownerScreens, organisationScreens: respondentScreens + ownerScreens, byFunction: owners.screens,
    coreCompleteAfterInterview: stagesAfterInterview.core.complete, breadthCompleteAfterInterview: stagesAfterInterview.breadth.complete,
    sessions: 1, actionLog: live.record.actions.length,
    duplicateAssignments, answeredByTwoActors: answeredByTwo, corrections,
    outstandingAtEnd: status.outstanding, interview: status.facets[0].state, information: status.facets[2].state,
    confirmationsAnsweredByFunctions: input.domains.flatMap((d) => d.controls).filter((c) => c.role === 'confirm' && c.answer?.by && c.answer.by !== 'Respondent').length,
    confirmationsAnsweredByRespondent: input.domains.flatMap((d) => d.controls).filter((c) => c.role === 'confirm' && c.answer?.by === 'Respondent').length
  };
}

const rows = [];
for (const c of CASES) for (const t of TIMINGS) rows.push(journey(c.key, c.areas, t));
const result = { fictional: true, label: 'FICTIONAL RESEARCH: deterministic simulated answers, not people', engineBuild: '1.6', cases: CASES, rows };

if (process.argv.includes('--check')) {
  const saved = JSON.parse(fs.readFileSync(path.join(OUT, 'timing.json'), 'utf8'));
  const same = JSON.stringify(saved.rows) === JSON.stringify(rows);
  const invariants = rows.every((r) => r.duplicateAssignments === 0 && r.answeredByTwoActors === 0 && r.sessions === 1);
  console.log(JSON.stringify({ same, invariants }));
  process.exit(same && invariants ? 0 : 1);
}
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'timing.json'), JSON.stringify(result, null, 1));
console.table(rows.map((r) => ({ key: r.key, timing: r.timing, resp: r.respondentScreens, fn: r.ownerScreens, org: r.organisationScreens, dup: r.duplicateAssignments, two: r.answeredByTwoActors, out: r.outstandingAtEnd.total, coreDone: r.coreCompleteAfterInterview, cfFn: r.confirmationsAnsweredByFunctions })));
