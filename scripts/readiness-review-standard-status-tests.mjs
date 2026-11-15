// The standard assessment's status after MK's correction of 11 November (18:33): completion is defined by the
// self-reported assessment and its outstanding information; evidence review and reviewer conclusions are Advisory and
// never a completion step; interview, function packages, information and report eligibility are separate statements;
// a declined question, an unanswered question and a function's "I don't know" are never treated as resolved.
// Fictional sessions only, through the real session layer and the fictional file service.
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/readiness-review-standard-status-tests.mjs
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { replay } from '../src/lib/readiness-review/session.ts';
import { snapshotView, managementView, respondentView, reportFor, assessmentStatusView, stageProgressView } from '../src/lib/readiness-review/view-model.ts';
import { buildStagedReportInput } from '../src/lib/readiness-review/report-input.ts';
import { buildRevisedEvidenceModel } from '../src/lib/reports/revised/evidence-model.ts';
import { createReviewEngine } from '../src/lib/readiness-review/engine.ts';
import { makeClock, newStagedSession, act, runRespondent, runOwners, runJourney, respondentAnswer, ownerAnswer } from './lib/build16-driver.mjs';

const results = [];
const T = async (id, name, fn) => {
  try { const [ok, detail] = await fn(); results.push({ id, ok, name, detail }); } catch (error) { results.push({ id, ok: false, name, detail: error.stack.split('\n').slice(0, 3).join(' ') }); }
};
const facet = (status, key) => status.assessment.facets.find((f) => f.key === key);
const REVIEWER = /reviewer|evidence review|authorised|examined evidence|concluded on/i;

await T('SS-01', 'No standard surface makes evidence review or a reviewer conclusion part of completing the assessment (1.5 and 1.6 sessions, and the page sources)', async () => {
  const offenders = [];
  for (const build of ['1.5', '1.6']) {
    const clock = makeClock();
    const live = newStagedSession(`Fictional Status ${build}`, clock, build);
    runRespondent(live, clock, 'P3', { maxScreens: 30 });
    const surfaces = { snapshot: snapshotView(live).status, management: managementView(live).completion, respondent: respondentView(live).status };
    for (const [k, v] of Object.entries(surfaces)) {
      const facets = Array.isArray(v) ? v : v.assessment.facets;
      if (facets.some((f) => REVIEWER.test(`${f.label} ${f.state} ${f.detail}`))) offenders.push(`${build}:${k}`);
      if (!Array.isArray(v) && ('completeWhy' in v || 'reviewStatus' in v)) offenders.push(`${build}:${k}:reviewer field`);
    }
  }
  for (const file of ['src/components/readiness-review/SnapshotDocument.tsx', 'src/components/readiness-review/ManagementDocument.tsx', 'src/components/readiness-review/ReviewInterview.tsx', 'src/app/review/page.tsx']) {
    const src = readFileSync(file, 'utf8');
    if (/Is the review complete|authorised MK reviewer|until an MK reviewer has examined|What a completed review would need|Evidence still to review/.test(src)) offenders.push(file);
  }
  return [offenders.length === 0, offenders.length ? `offending: ${offenders.join(', ')}` : 'four separate statements on every standard surface; no reviewer or evidence condition; page sources clean'];
});

await T('SS-02', 'A completed journey: interview completed, packages returned, nothing outstanding, eligibility not decided; report input 1.3.0 agrees', async () => {
  const j = runJourney('P3');
  const s = snapshotView(j.live).status;
  const input = buildStagedReportInput(j.live);
  const ok = facet(s, 'interview').state === 'Completed' && facet(s, 'packages').state === 'Returned' && facet(s, 'information').settled === true
    && facet(s, 'eligibility').settled === null && /not determined/i.test(facet(s, 'eligibility').state)
    && input.method.completeness.complete === true && input.assessmentStatus.outstanding.total === 0 && !REVIEWER.test(input.method.completeness.why.replace('Evidence review is a separate Advisory service and is not a condition', ''));
  return [ok, s.assessment.facets.map((f) => `${f.label}: ${f.state}`).join('; ') + `; input complete ${input.method.completeness.complete}`];
});

await T('SS-03', 'Declined questions stay outstanding with the function and its reason, in the interface, the report input and the revised evidence model', async () => {
  let n = 0;
  const j = runJourney('P3', { decline: (fn, step) => (fn === 'Finance' && n++ < 2 ? 'Handled by the group treasury, not by us' : null) });
  const s = snapshotView(j.live).status;
  const input = buildStagedReportInput(j.live);
  const { analysis } = buildRevisedEvidenceModel(input);
  const declinedItems = analysis.outstandingItems.filter((o) => o.reason === 'declined');
  const ok = s.assessment.outstanding.declined === 2 && facet(s, 'information').settled === false && /2 declined/.test(facet(s, 'information').detail)
    && input.method.completeness.complete === false && declinedItems.length === 2 && declinedItems.every((o) => o.fn === 'Finance' && /group treasury/.test(o.declineReason));
  return [ok, `declined ${s.assessment.outstanding.declined}; information "${facet(s, 'information').state}"; complete ${input.method.completeness.complete}; evidence model outstanding declined ${declinedItems.length}`];
});

await T('SS-04', 'Unanswered and "I don\'t know": waiting questions and a function\'s "I don\'t know" are outstanding, never answered, and the revised Essential states them', async () => {
  const clock = makeClock();
  const live = newStagedSession('Fictional Unknown-Heavy', clock);
  runRespondent(live, clock, 'P5');
  const mid = snapshotView(live).status;
  act(live, clock, { type: 'organisation.sendToOwners' }, 'organisation');
  runOwners(live, clock, 'P5');
  const end = snapshotView(live).status;
  const input = buildStagedReportInput(live);
  const { analysis } = buildRevisedEvidenceModel(input);
  const notKnown = analysis.outstandingItems.filter((o) => o.reason === 'not-known-by-function');
  const answeredByOwner = input.domains.flatMap((d) => d.controls).filter((c) => c.answer?.value === 'unknown' && c.answer.by !== 'Respondent' && c.class === 'full');
  const ok = mid.assessment.outstanding.withFunctions > 0 && facet(mid, 'information').settled === false
    && end.assessment.outstanding.unknownToFunction > 0 && notKnown.length === end.assessment.outstanding.unknownToFunction && answeredByOwner.length === 0 && input.method.completeness.complete === false;
  return [ok, `before packages: ${mid.assessment.outstanding.withFunctions} with functions; after: ${end.assessment.outstanding.unknownToFunction} not known by the function, ${notKnown.length} in the evidence model, none treated as in place`];
});

await T('SS-05', 'Stage reopening: a correction that brings questions into scope reopens the interview and the information statement, and both settle again when answered', async () => {
  const clock = makeClock();
  const live = newStagedSession('Fictional Reopen', clock);
  runRespondent(live, clock, 'P4');
  const e = live.engine;
  const done = assessmentStatusView(reportFor(live), stageProgressView(reportFor(live)));
  const facts = Object.entries(e.S.ans).filter(([id, a]) => !a.stale && a.via === 'respondent' && e.QI[id]?.type !== 'practice' && JSON.stringify(a.v) === '"no"' && e.QI[id]?.options?.some((o) => o[0] === 'yes')).map(([id]) => id);
  let fact = null;
  for (const id of facts) { const copy = replay(live.record); act(copy, makeClock('2026-11-11T12:00:00Z'), { type: 'respondent.correct', q: id, value: 'yes' }); if (copy.engine.stages().breadth.applicableSoFar > e.stages().breadth.applicableSoFar) { fact = id; break; } }
  if (!fact) return [false, 'no correction opened scope'];
  act(live, clock, { type: 'respondent.correct', q: fact, value: 'yes' });
  const reopened = snapshotView(live).status;
  runRespondent(live, clock, 'P4');
  const again = snapshotView(live).status;
  const ok = done.facets[0].state === 'Completed' && facet(reopened, 'interview').state === 'In progress' && reopened.assessment.outstanding.notReached > 0
    && facet(again, 'interview').state === 'Completed' && again.assessment.outstanding.notReached === 0;
  return [ok, `completed, then ${fact} corrected: interview "${facet(reopened, 'interview').state}" with ${reopened.assessment.outstanding.notReached} not reached; answered again: "${facet(again, 'interview').state}"`];
});

await T('SS-06', 'Concurrent saves: a function\'s decline and its answer to the same question submitted together; one applies, the other is told the session changed, and nothing is counted twice', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'mk-status-'));
  process.env.MK_READINESS_REVIEW_HARNESS = 'fictional-local';
  process.env.MK_READINESS_REVIEW_HARNESS_DIR = dir;
  process.env.MK_READINESS_REVIEW_ENGINE = '1.6';
  const service = await import('../src/lib/readiness-review/service.ts');
  const QI = createReviewEngine({ now: '2026-11-11T08:00:00Z' }, '1.6').QI;
  let n = 0;
  const aid = () => `ss-${String(++n).padStart(6, '0')}`;
  const s = await service.createSession('Fictional Concurrency (Pty) Ltd');
  const t = s.tokens.respondent;
  let v = (await service.viewFor(t)).view;
  for (let i = 0; i < 30 && v.step; i++) {
    const unknown = i === 25;
    const value = v.step.q === '__assumptions__' ? ['none'] : unknown ? (QI[v.step.q].format === 'multi' ? ['unknown'] : 'unknown') : respondentAnswer('P3', QI[v.step.q]);
    await service.submit(t, { actionId: aid(), expectedSeq: v.seq, action: { type: 'respondent.answer', q: v.step.q, value } });
    v = (await service.viewFor(t)).view;
  }
  const live = replay(JSON.parse(readFileSync(path.join(dir, 'sessions', `${s.sessionId}.json`), 'utf8')));
  const assigned = Object.values(live.engine.S.assign).find((a) => a.status === 'assigned');
  if (!assigned) return [false, 'no assignment made'];
  const ft = s.tokens.owners[assigned.fn];
  const ov = (await service.viewFor(ft)).view;
  const both = await Promise.allSettled([
    service.submit(ft, { actionId: aid(), expectedSeq: ov.seq, action: { type: 'owner.decline', fn: assigned.fn, q: ov.step.q, reason: 'Not ours' } }),
    service.submit(ft, { actionId: aid(), expectedSeq: ov.seq, action: { type: 'owner.answer', fn: assigned.fn, q: ov.step.q, value: ownerAnswer('P3', QI[ov.step.q]) } })
  ]);
  const applied = both.filter((r) => r.status === 'fulfilled').length;
  const conflicts = both.filter((r) => r.status === 'rejected' && r.reason instanceof service.SaveConflict).length;
  const rebuilt = replay(JSON.parse(readFileSync(path.join(dir, 'sessions', `${s.sessionId}.json`), 'utf8')));
  const a = rebuilt.engine.S.assign[ov.step.q];
  const status = snapshotView(rebuilt).status;
  const declined = status.assessment.outstanding.declined;
  const exactlyOne = (a.status === 'declined' && declined === 1 && !rebuilt.engine.S.ans[ov.step.q]?.via?.startsWith?.('owner')) || (a.status === 'returned' && declined === 0);
  return [applied === 1 && conflicts === 1 && exactlyOne, `${applied} applied, ${conflicts} conflict; stored outcome ${a.status}; declined counted ${declined}`];
});

await T('SS-07', 'Multi-function assignments: one question is one task; areas handed over and packages sent to several functions never overlap, and the function counts add up to the tasks', async () => {
  const j = runJourney('P5');
  const e = j.live.engine;
  const servedBy = new Map();
  for (const a of j.live.record.actions) if (a.type === 'owner.serve' && a.q) { if (!servedBy.has(a.q)) servedBy.set(a.q, new Set()); servedBy.get(a.q).add(a.fn); }
  const multi = [...servedBy.entries()].filter(([, fns]) => fns.size > 1).map(([q]) => q);
  const ownerAnswers = new Map();
  for (const a of j.live.record.actions) if (a.type === 'owner.answer') ownerAnswers.set(a.q, (ownerAnswers.get(a.q) ?? 0) + 1);
  const twice = [...ownerAnswers.values()].filter((x) => x > 1).length;
  const assignIds = Object.keys(e.S.assign);
  const st = snapshotView(j.live).status.stages;
  const functionsWithWork = st.functions.filter((f) => f.answered + f.open + f.declined + f.unknownToFunction > 0).length;
  const ok = multi.length === 0 && twice === 0 && new Set(assignIds).size === assignIds.length && functionsWithWork >= 3 && Object.keys(e.S.domainAssign).length === 2;
  return [ok, `${servedBy.size} questions served to functions, ${multi.length} to more than one; ${twice} answered twice; ${assignIds.length} tasks, all distinct; ${functionsWithWork} functions with work; areas handed over ${Object.keys(e.S.domainAssign).join(', ')}`];
});

await T('SS-08', 'Earlier delegation: the offer appears at the first question of an area in staged sessions only; accepting it hands the area over without the respondent answering it, and the core stage still completes', async () => {
  const clock = makeClock();
  const live = newStagedSession('Fictional Early Hand-over', clock);
  let offered = null;
  runRespondent(live, clock, 'P5', { onStep: (step, l) => { const v = respondentView(l); if (v.areaHandoff?.domain === 'D4' && !offered) { offered = v.areaHandoff; return { type: 'respondent.assignArea', domain: 'D4', owner: v.areaHandoff.owner }; } return null; } });
  const e = live.engine;
  const respondentInD4 = live.record.actions.filter((a) => a.type === 'respondent.answer' && e.DOM[a.q] === 'D4').length;
  const core = e.stages().core;
  const c15 = makeClock();
  const l15 = newStagedSession('Fictional 1.5', c15, '1.5');
  let offered15 = false;
  runRespondent(l15, c15, 'P5', { maxScreens: 60, onStep: (step, l) => { if (respondentView(l).areaHandoff) offered15 = true; return null; } });
  const ok = !!offered && offered.fn === 'Procurement' && respondentInD4 === 0 && !!e.S.domainAssign.D4 && core.complete && !offered15;
  return [ok, `offered at area entry: ${offered ? `${offered.areaName} to ${offered.fn}` : 'no'}; respondent answers in the area afterwards ${respondentInD4}; core complete ${core.complete}; offered in build 1.5 ${offered15}`];
});

await T('SS-09', 'The reports and the interface count the same outstanding information for every fictional journey', async () => {
  const rows = [];
  for (const k of ['P1', 'P2', 'P3', 'P4', 'P5', 'P6b']) {
    let n = 0;
    const j = runJourney(k, k === 'P3' ? { decline: (fn) => (fn === 'Finance' && n++ < 2 ? 'Fictional: handled by group treasury' : null) } : {});
    const s = snapshotView(j.live).status.assessment.outstanding;
    const { analysis } = buildRevisedEvidenceModel(buildStagedReportInput(j.live));
    rows.push([k, s.total, analysis.outstandingItems.length]);
  }
  return [rows.every(([, a, b]) => a === b), rows.map(([k, a, b]) => `${k}: interface ${a}, evidence model ${b}`).join('; ')];
});

await T('SS-10', 'Corrections after an early hand-over: questions a correction brings into a handed-over area go to its function, never back to the respondent, and are counted once', async () => {
  const clock = makeClock();
  const live = newStagedSession('Fictional Early Hand-over Correction', clock);
  runRespondent(live, clock, 'P3', { onStep: (step, l) => { const v = respondentView(l); return v.areaHandoff && ['D4', 'D5', 'D9'].includes(v.areaHandoff.domain) ? { type: 'respondent.assignArea', domain: v.areaHandoff.domain, owner: v.areaHandoff.owner } : null; } });
  const e = live.engine;
  const handed = new Set(Object.keys(e.S.domainAssign));
  const facts = Object.entries(e.S.ans).filter(([id, a]) => !a.stale && a.via === 'respondent' && e.QI[id]?.type !== 'practice' && JSON.stringify(a.v) === '"no"' && e.QI[id]?.options?.some((o) => o[0] === 'yes')).map(([id]) => id);
  let tried = 0, opened = 0, servedHanded = 0, duplicates = 0;
  for (const id of facts) {
    const copy = replay(live.record);
    const c2 = makeClock('2026-11-11T12:00:00Z');
    const before = copy.engine.stages().breadth.applicableSoFar;
    act(copy, c2, { type: 'respondent.correct', q: id, value: 'yes' });
    tried++;
    if (copy.engine.stages().breadth.applicableSoFar > before) opened++;
    runRespondent(copy, c2, 'P3', { onStep: (step, l) => { if (handed.has(l.engine.DOM[step.q.id])) servedHanded++; return null; } });
    const assigns = Object.values(copy.engine.S.assign).map((x) => x.qid);
    duplicates += assigns.length - new Set(assigns).size;
  }
  return [tried > 0 && opened > 0 && servedHanded === 0 && duplicates === 0, `areas handed over at entry ${[...handed].join(', ')}; ${tried} fact corrections tried, ${opened} opened new confirmations; respondent served a handed-over question ${servedHanded} times; duplicate tasks ${duplicates}`];
});

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.name}\n     ${r.detail}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
