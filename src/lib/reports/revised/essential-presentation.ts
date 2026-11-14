import type { EssentialReportPresentationModel, EssentialPage } from '@/lib/reports/essential/presentation-model';
import { AREA_SHORT, INCONSISTENT, joinList, methodOrder, outstandingPhrase, schemeWhere, type ControlView, type RevisedReport, type SchemeView } from './evidence-model';
import { controlContent } from './control-content/index';
import { scenarioAccount, type PositionStatement } from './position';

/**
 * FICTIONAL INTEGRATION PROTOTYPE. The Essential report's content from the revised report model, in the existing
 * presentation model, validated by the existing validator and drawn by the existing renderer.
 *
 * Corrections on MK's direction of 12 November (second direction):
 *  - The position is stated as four separate statements (position.ts) on the cover and on page 2, for every
 *    organisation; no band is shown and no threshold changes the presentation.
 *  - No materiality or priority language: scenarios are "fraud scenarios the answers point to", selected by a stated,
 *    neutral rule and listed in the method's order; the renderer's rank numbers are removed after rendering.
 *  - Control guidance comes from the control-content library: target practice, records and success measure.
 *  - The 30/60/90 windows are proposed planning stages, not deadlines or estimates.
 */

const lc = (s: string) => (s && !/^[A-Z]{2,}|^I\b/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const sentence = (s: string) => { const t = String(s ?? '').trim(); return t ? (/[.!?]$/.test(t) ? t : `${t}.`) : ''; };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** The validator flags some method wording in its engineering sense; such wording stays in the Comprehensive registers. */
const VALIDATOR_CONFLICT = /\bAI-generated\b/i;
const ARTEFACT = /\bRACI\b|\bregister\b|\bchecklist\b|\bcoverage report\b|\bevidence pack\b|\bcallback record\b|\bapproval record\b|\bscreening\b/i;
/** Short labels have hard limits in the validator; choose the longest list of items that fits, never clip. */
function fit(items: string[], max: number, join: (x: string[]) => string = joinList): string {
  for (let n = items.length; n > 0; n--) { const v = join(items.slice(0, n)); if (v.length <= max) return v; }
  const first = items[0] ?? '';
  return first.length <= max ? first : first.split(/,\s|;\s/)[0].slice(0, max);
}
function shortText(text: string, max: number, alt: string): string {
  const t = text.replace(/\.$/, '');
  if (t.length <= max) return t;
  const clause = t.split(/,\s|;\s/)[0];
  return clause.length <= max && clause.split(' ').length >= 4 ? clause : alt.length <= max ? alt : fit([alt], max);
}
const clean = (s: string | null | undefined) => (s && !VALIDATOR_CONFLICT.test(s) ? s : null);
const stateOf = (v: ControlView) => (v.format === 'anchored' && v.level !== null ? v.reported : `${v.key}: ${lc(v.stateShort)}.`);
const target = (id: string) => clean(controlContent(id).target);

export function buildRevisedEssentialPresentation(input: {
  base: EssentialReportPresentationModel;
  report: RevisedReport;
  fixtureLabel: string;
  position: PositionStatement[];
}): EssentialReportPresentationModel {
  const { base, report: r } = input;
  const org = base.reportIdentity.organisationName;
  const S = r.schemes;
  const k = r.summary.byKind;
  const gapSchemes = S.filter((s) => s.kind === 'gap');
  const inconsistent = S.filter((s) => INCONSISTENT.includes(s.kind));
  const clarify = S.filter((s) => s.kind === 'clarify');
  const qualified = S.filter((s) => s.kind === 'qualified');
  const out = r.outstanding;
  const suff = r.sufficiency;
  const reportedInPlace = k.confirmed + k.qualified + k.clarify + k.contradiction + k.dependency;
  const gapAreas = [...new Set(gapSchemes.map((s) => s.area))];
  const statementOf = (s: SchemeView) => s.relations.find((x) => x.type === 'direct-contradiction')?.statement ?? s.relations.find((x) => x.type === 'necessary-dependency')?.statement ?? s.relations.find((x) => x.type === 'not-established' && x.question)?.statement ?? '';
  const questionOf = (s: SchemeView) => s.relations.find((x) => x.type === 'not-established' && x.question)?.question ?? '';

  // ---- Cover: what the answers indicate, in one sentence, the same form for every organisation.
  const judgement = scenarioAccount(r).sentence;

  // ---- Page 2 commentary: what was asked and answered. The four statements carry the position.
  const cov = suff.coverage;
  const overview = [
    scenarioAccount(r).sentence,
    `${suff.stages.core === 'complete' && suff.stages.breadth === 'complete' ? 'The core and breadth stages are complete' : `The core stage is ${suff.stages.core} and the breadth stage is ${suff.stages.breadth}`}: ${cov.all.answered} of the ${cov.all.applicable} confirmations that apply were answered${out.length ? `, and ${plural(out.length, 'question is', 'questions are')} outstanding (${outstandingPhrase(out)})` : ', and no question is outstanding'}.`,
    `Area figures below are calculated test results from the same research simulation, shown in the method's order; they are not scores and do not rank the areas.`
  ].join(' ');

  // ---- Diagnosis: answers to settle, questions to clarify, gaps by area in the method's order, related practices.
  const sig = (v: ControlView) => ({ title: v.key, score: v.stateShort as unknown as number });
  const relRow = (s: SchemeView, kindText: string) => {
    const rel = s.relations.find((x) => x.type === 'direct-contradiction') ?? s.relations.find((x) => x.type === 'necessary-dependency') ?? s.relations.find((x) => x.type === 'not-established' && x.question)!;
    const conf = s.confirmations.find((c) => c.id === rel.confirmation)!;
    const prac = r.analysis.view(r.analysis.byId.get(rel.practice)!);
    return { pattern: `${s.name.replace(/\.$/, '')}: ${kindText}`, signals: [sig(conf), sig(prac)], whyItMatters: rel.statement };
  };
  const inconsistentRows = inconsistent.slice(0, 2).map((s) => relRow(s, 'answers to settle'));
  const clarifyRows = clarify.slice(0, Math.max(0, 3 - inconsistentRows.length)).map((s) => relRow(s, 'a question to clarify'));
  const furtherClarify = clarify.length - clarifyRows.length;
  const areaRows = gapAreas.slice(0, Math.max(1, 4 - inconsistentRows.length - clarifyRows.length)).map((ar) => {
    const ss = gapSchemes.filter((s) => s.area === ar);
    return {
      pattern: `${ss[0].areaName}: ${plural(ss.length, 'scenario', 'scenarios')} with a control reported as a gap`,
      signals: ss.flatMap((s) => s.confirmationGaps).slice(0, 3).map(sig),
      whyItMatters: `${sentence(ss[0].why ?? ss[0].how ?? ss[0].name)}${ss.length > 1 ? ` The area also has: ${joinList(ss.slice(1, 3).map((s) => lc(s.name.replace(/\.$/, ''))))}${ss.length > 3 ? `, and ${ss.length - 3} more in the register` : ''}.` : ''}`
    };
  });
  const moreAreas = gapAreas.length - areaRows.length;
  const qualifiedRow = qualified.length ? [{
    pattern: `${plural(qualified.length, 'scenario', 'scenarios')}: control in place, a related practice weaker`,
    signals: qualified.slice(0, 3).map((s) => sig(s.supportingGaps[0])),
    whyItMatters: 'Where the relationship has been reviewed, the related practice is a further defence and the reported control stands as given. Where it has not, nothing is concluded from it. Each pair is in the register.'
  }] : [];
  const pairs = r.relations.filter((x) => x.type !== 'missing-information' && x.type !== 'untested-practice');
  const reviewedComplementary = pairs.filter((x) => x.type === 'complementary-weakness').length;
  const notReviewed = pairs.filter((x) => x.basis === 'not-reviewed' || x.basis === 'semantics-not-met').length;
  const comparison = !pairs.length ? '' : [
    `Where a control was reported fully in place and a related practice of the same scenario weaker, the two answers were compared using MK's reviewed relationships: ${plural(pairs.length, 'pair', 'pairs')} in ${plural(new Set(pairs.map((x) => x.schemeRef)).size, 'scenario', 'scenarios')}.`,
    joinList([
      k.contradiction ? `in ${k.contradiction} the answers cannot both be right` : '',
      k.dependency ? `in ${k.dependency} the reported control lacks an input it needs` : '',
      k.clarify ? `in ${k.clarify} the answers leave a question open` : '',
      reviewedComplementary ? `${plural(reviewedComplementary, 'pair is a further defence', 'pairs are further defences')} and the reported control stands as given` : '',
      notReviewed ? `${plural(notReviewed, 'pair has', 'pairs have')} not been reviewed, and nothing is concluded from ${notReviewed === 1 ? 'it' : 'them'}` : ''
    ].filter(Boolean)).replace(/^./, (c) => c.toUpperCase()) + '.'
  ].join(' ');
  const checks = r.consistency.checks ?? [];
  const interpretation = [
    comparison,
    checks.length ? `Separately, ${checks.length} of ${r.consistency.eligible} controls that can be cross-checked were asked one further question; these compare the organisation's own answers, are not tests of operation and change no figure.` : '',
    furtherClarify > 0 ? `${plural(furtherClarify, 'further scenario raises a question', 'further scenarios raise questions')} to clarify, listed in the register.` : '',
    moreAreas > 0 ? `${plural(moreAreas, 'further area has', 'further areas have')} scenarios with a control reported as a gap, listed in the register.` : ''
  ].filter(Boolean).join(' ');

  // ---- Fraud scenarios the answers point to. Selection rule, stated on the page: every scenario whose answers must be
  // settled or clarified (up to three), then one scenario with a control reported as a gap from each area, in the
  // method's order, up to five in all. Selection by kind reflects what must be known first, never seriousness.
  const listed: SchemeView[] = [...inconsistent, ...clarify].slice(0, 3);
  for (const ar of gapAreas) { if (listed.length >= 5) break; const s = gapSchemes.find((x) => x.area === ar); if (s) listed.push(s); }
  for (const s of gapSchemes) { if (listed.length >= 5) break; if (!listed.includes(s)) listed.push(s); }
  const gapsOf = (s: SchemeView) => (s.kind === 'gap' ? s.confirmationGaps : s.relations.filter((x) => x.type === 'direct-contradiction' || x.type === 'necessary-dependency' || (x.type === 'not-established' && x.question)).map((x) => r.analysis.view(r.analysis.byId.get(x.practice)!)));
  const interruption = (s: SchemeView) => {
    if (s.kind === 'clarify') return shortText(questionOf(s), 160, 'Answering the question the answers leave open');
    if (s.kind !== 'gap') return 'Settling which answer is right; the register then gives the target practice for each control';
    const g = gapsOf(s);
    const b = g.map((v) => clean(controlContent(v.id).brief)).find((x): x is string => !!x);
    return b && b.length <= 160 ? b : fit(g.map((v) => `${v.key}: in place`), 150, (x) => x.join('; '));
  };
  const consequence = (s: SchemeView) => sentence(clean(s.why) ?? (s.methodRisks.length ? `The method links it to ${joinList(s.methodRisks.slice(0, 2).map(lc))}` : s.how ?? s.name));
  const exposures = listed.map((s, i) => ({
    rank: i + 1, family: s.id, exposure: s.name, whyItMatters: sentence(s.how ?? s.name),
    assessmentBasis: (s.kind === 'gap' ? s.confirmationGaps.slice(0, 3) : [s.confirmations[0], ...gapsOf(s).slice(0, 2)]).map(sig),
    potentialConsequence: consequence(s), drivers: [], interruptionPoint: interruption(s),
    priority: s.kind === 'gap' ? `Control ${lc(s.confirmationGaps[0].stateShort)}` : s.kind === 'clarify' ? 'Question to clarify' : 'Answers to settle',
    priorityBasis: s.kind === 'gap'
      ? (s.confirmations.length === 1 ? 'The control that stops it is reported as a gap.' : `${s.confirmationGaps.length} of its ${s.confirmations.length} controls are reported as gaps.`)
      : s.kind === 'clarify' ? 'The answers leave open whether the reported control covers the scenario.' : 'The answers must be settled before the scenario is treated as covered.'
  }));

  // ---- Illustrative exposure mechanisms: how the scenarios could occur here.
  const scenarioSchemes = listed.filter((s, i, xs) => xs.findIndex((y) => gapsOf(y)[0]?.id === gapsOf(s)[0]?.id) === i).slice(0, 3);
  const scenarios = scenarioSchemes.map((s, i) => {
    const g = gapsOf(s);
    const t = g.map((v) => target(v.id)).find(Boolean);
    return {
      scenarioId: `SCENARIO-${i + 1}`, family: s.id, scenarioFamily: s.id, title: s.name,
      entryPoint: sentence(s.how ?? s.name), entryPointShort: shortText(s.how ?? s.name, 90, s.name),
      controlBreak: (s.kind === 'gap' ? g.slice(0, 2) : [s.confirmations[0], ...g.slice(0, 1)]).map(stateOf).join(' '),
      controlBreakShort: fit((s.kind === 'gap' ? g : [s.confirmations[0], ...g]).map((v, j) => `${j ? lc(v.key) : v.key} ${lc(v.stateShort)}`), 90, (x) => x.join('; ')),
      exposureShort: shortText(s.methodRisks[0] ?? consequence(s), 90, 'Loss before the gap is noticed'),
      howItUnfolds: `${sentence(s.how ?? s.name)} ${clean(s.why) ? sentence(s.why!) : ''} Here, ${s.kind === 'gap' ? g.slice(0, 2).map((v) => lc(stateOf(v)).replace(/\.$/, '')).join('; ') : lc(statementOf(s)).replace(/\.$/, '')}.`.replace(/\s+/g, ' '),
      warningIndicators: s.methodRisks.slice(0, 3),
      immediateInterruption: s.kind === 'clarify'
        ? `Answering the open question: ${lc(questionOf(s))}`
        : s.kind !== 'gap' ? 'Establishing which answer is right. Until then, the scenario is not treated as covered.'
          : t ? `Until the control operates, the ${lc(g[0].ownerRole)} checks new cases by hand. The target: ${lc(t)}` : `Until the control operates, the ${lc(g[0]?.ownerRole ?? 'process owner')} checks new cases by hand.`
    };
  });

  // ---- Management matters requiring attention: facts and ownership before controls; then the controls themselves.
  const priorities: EssentialReportPresentationModel['priorities']['rows'] = [];
  const row = (x: Omit<EssentialReportPresentationModel['priorities']['rows'][number], 'rank'>) => priorities.push({ rank: priorities.length + 1, ...x });
  if (inconsistent.length) {
    row({
      outcome: fit([`Settle the answers for ${plural(inconsistent.length, 'scenario', 'scenarios')}`], 90),
      whyNow: `${k.contradiction ? `${plural(k.contradiction, 'scenario has', 'scenarios have')} answers that cannot both be right` : ''}${k.contradiction && k.dependency ? ', and ' : ''}${k.dependency ? `${plural(k.dependency, 'scenario relies', 'scenarios rely')} on a control that lacks an input it needs` : ''}. Until settled, none of them is treated as covered.`,
      accountableRole: joinList([...new Set(inconsistent.map((s) => s.confirmations[0].ownerRole))].slice(0, 3).map((x, i) => (i ? lc(x) : x))),
      betterLooksLike: 'The answers for each scenario agree with each other and with how the process runs, so the reported control can be relied on.'
    });
  }
  if (clarify.length) {
    row({
      outcome: fit([`Answer the ${plural(clarify.length, 'open question', 'open questions')}`], 90),
      whyNow: `For ${plural(clarify.length, 'scenario', 'scenarios')} the answers leave open whether the reported control covers the scenario. This is not a finding that the control fails; the register states each question.`,
      accountableRole: joinList([...new Set(clarify.map((s) => s.confirmations[0].ownerRole))].slice(0, 3).map((x, i) => (i ? lc(x) : x))),
      betterLooksLike: 'Each question has a written answer from the person who runs the process, added to the assessment record.'
    });
  }
  if (out.length) {
    row({
      outcome: fit([`Obtain the ${out.length} outstanding answers`], 90),
      whyNow: `Of these, ${outstandingPhrase(out)}. Until they are answered, the scenarios they affect are unknown rather than covered.`,
      accountableRole: 'Chief executive, with each function named in the register',
      betterLooksLike: 'Every applicable control has an answer from the person who runs it, or an open item with a named owner.'
    });
  }
  if (gapSchemes.length) {
    row({
      outcome: 'Name an owner for each area and decide the order of work',
      whyNow: `MK has not approved a method for rating fraud risks, so this report does not rank the ${gapSchemes.length} scenarios with a gap. Their order is management's decision, made on explicit factors.`,
      accountableRole: 'Chief executive',
      betterLooksLike: 'Each area has one accountable executive, and the order of work is recorded with its factors: the control\'s position, whether money or goods can leave, activity volume, detective cover and controls shared.'
    });
  }
  for (const s of listed.filter((x) => x.kind === 'gap').sort(methodOrder)) {
    if (priorities.length >= 6) break;
    const g = s.confirmationGaps;
    const targets = g.map((v) => target(v.id)).filter((x): x is string => !!x && !ARTEFACT.test(x));
    const rec = g.map((v) => controlContent(v.id).recordName).filter(Boolean) as string[];
    row({
      outcome: fit(g.map((v, i) => (i ? lc(v.key) : `Put in place: ${lc(v.key)}`)), 90),
      whyNow: `It stops ${schemeWhere(s.name)}. ${g.length === 1 ? 'The control is reported as' : `${g.length} of its controls are reported as`} ${g.length === 1 ? lc(g[0].stateShort) : 'gaps'}.`,
      accountableRole: g[0].ownerRole,
      betterLooksLike: targets.slice(0, 2).join(' ') || `${g[0].key} in place across everything it should cover.`,
      evidenceArtefact: rec.length ? `Records management should keep: ${joinList(rec)}.` : ''
    });
  }

  // ---- The first 90 days, as proposed planning stages. No deadline comes from tier or answers; no estimate is made.
  const owners = [...new Set([...inconsistent, ...clarify].map((s) => s.confirmations[0].ownerRole))];
  const prereqs = r.controls.filter((c) => c.purpose === 'put-in-place' && c.dependentRefs.length);
  const stage30 = [
    ...(inconsistent.length || clarify.length ? [{ action: `${joinList([inconsistent.length ? `Settle the answers for ${plural(inconsistent.length, 'scenario', 'scenarios')}` : '', clarify.length ? `${inconsistent.length ? 'answer' : 'Answer'} the ${plural(clarify.length, 'open question', 'open questions')}` : ''].filter(Boolean))}.`, owner: joinList(owners.slice(0, 2).map((x, i) => (i ? lc(x) : x))), deliverable: 'A settled answer, or a written answer to each question, added to the assessment record.', completionTest: 'The answers for each scenario agree with how the process runs.', dependsOn: [] }] : []),
    ...(out.length ? [{ action: `Obtain the ${out.length} outstanding answers from the functions named in the register.`, owner: 'Chief executive', deliverable: 'An answer, or an open item with a named owner, for each question.', completionTest: 'No question is left declined or unanswered without an owner.', dependsOn: [] }] : []),
    ...(gapSchemes.length ? [{ action: 'Name the accountable executive for each area, and decide the order of work using explicit factors.', owner: 'Chief executive', deliverable: 'Named executives and a recorded order of work, with the factors behind it.', completionTest: 'Every open scenario is selected, deferred with a reason or accepted at the right level.', dependsOn: [] }] : [])
  ].slice(0, 3);
  const stage60 = [
    ...(prereqs.length ? [{ action: `Design first the controls that supply an input to others: ${joinList(prereqs.slice(0, 2).map((c) => lc(c.key)))}.`, owner: prereqs[0].ownerRole, deliverable: 'An approved design for each, with the records it will keep.', completionTest: 'The controls that depend on them can be designed against something that exists.', dependsOn: [] }] : []),
    ...(gapSchemes.length ? [{ action: 'Approve the target design for each selected control, using the target practice, records and measure in the register, and begin putting the first designs in place.', owner: 'Each accountable executive', deliverable: 'Approved designs, each with an owner and the records it will keep.', completionTest: 'Each selected control has an approved design and a named owner.', dependsOn: [] }] : []),
    ...(!gapSchemes.length && qualified.length ? [{ action: `Decide which of the ${qualified.length} weaker related practices to strengthen.`, owner: 'Chief executive', deliverable: 'A recorded decision for each.', completionTest: 'Each is scheduled, deferred with a reason or accepted.', dependsOn: [] }] : [])
  ].slice(0, 2);
  const stage90 = [
    { action: 'Start operating the approved designs, and begin each control\'s first full operating cycle.', owner: 'Each process owner', deliverable: 'A start date and an operating record for each control.', completionTest: 'Each control has started operating; its success measure is checked when its first full cycle ends.', dependsOn: [] },
    { action: `Report the status of each open scenario to ${lc(r.oversight)}.`, owner: 'Chief executive', deliverable: 'A one-page status per scenario: owner, controls in place, controls outstanding, next step.', completionTest: 'The status is received and minuted.', dependsOn: [] }
  ];
  const fallback = { action: 'Confirm that the controls reported in place still operate as reported.', owner: 'Each process owner', deliverable: 'A written confirmation for each.', completionTest: 'Each confirmation is received and recorded.', dependsOn: [] };
  const stages = [
    { stage: '30 days, proposed: establish the facts and owners', window: '0–30 days', primaryOutcome: 'Answers that conflict are settled, open questions and outstanding answers are answered, and each area with open scenarios has an accountable executive.', actions: stage30.length ? stage30 : [fallback] },
    { stage: '60 days, proposed: approve designs and begin', window: '31–60 days', primaryOutcome: `Approved designs exist for the controls management selected${prereqs.length ? ', with the controls that supply an input to others designed first' : ''}, and the first are being put in place.`, actions: stage60.length ? stage60 : [{ ...fallback, action: 'Agree how each control reported in place will be confirmed each year.' }] },
    { stage: '90 days, proposed: start operating and report', window: '61–90 days', primaryOutcome: 'The first approved controls have started operating and the oversight body has the status of every open scenario. Whether a control works is known only after its first full cycle, which for many controls ends after 90 days.', actions: stage90 }
  ];

  // ---- What to check at the 90-day point. Expectations are about starting, not about proven operation.
  const dashboard = [
    ...(inconsistent.length ? [{ measure: 'Scenarios with answers to settle', current: `${inconsistent.length}.`, expectation: 'None: each settled, with the corrected answer recorded.' }] : []),
    ...(clarify.length ? [{ measure: 'Open questions', current: `${clarify.length}.`, expectation: 'Each answered in writing and added to the assessment record.' }] : []),
    ...(out.length ? [{ measure: 'Outstanding answers', current: `${out.length}: ${outstandingPhrase(out)}.`, expectation: 'Each answered, or recorded as an open item with an owner.' }] : []),
    ...listed.filter((s) => s.kind === 'gap').slice(0, 3).map((s) => {
      const c = r.controls.find((x) => x.id === s.confirmationGaps[0].id)!;
      return { measure: c.key, current: stateOf(s.confirmationGaps[0]), expectation: `Design approved and operating started. After its first full cycle: ${lc(clean(c.successMeasure) ?? `${c.key} operating for every case in scope.`)}` };
    }),
    ...(gapSchemes.length ? [{ measure: 'Open scenarios with a named owner and a decision', current: `None recorded in the assessment (${gapSchemes.length} open).`, expectation: 'Each selected, deferred with a reason or accepted at the right level.' }] : [])
  ].slice(0, 6);

  const conclusion = [
    `${scenarioAccount(r).sentence}${gapSchemes.length ? ` The gaps sit across ${plural(gapAreas.length, 'area', 'areas')}.` : ''}`,
    inconsistent.length || clarify.length ? `Before the reported position is relied on, management should ${joinList([inconsistent.length ? `settle the answers for ${plural(inconsistent.length, 'scenario', 'scenarios')}` : '', clarify.length ? `answer the ${plural(clarify.length, 'open question', 'open questions')}` : ''].filter(Boolean))}.` : '',
    'MK has not approved a readiness method, so this report draws no readiness conclusion and does not rank fraud risks; the order of the remaining work is management\'s decision, and the supporting register lists every scenario, control and record behind this report.'
  ].filter(Boolean).join(' ');
  const reportBasis = `This report is based on the organisation's own answers to the MK Fraud Readiness review, given by the respondent and the accountable functions named in it, and read against the draft review method, which MK has not yet approved. MK has not independently tested whether controls operate in practice, and no evidence was reviewed; evidence review is a separate Advisory service. The records named in this report are records management should maintain; MK has not requested or examined them. ${input.fixtureLabel}`;

  const pages: EssentialPage[] = ([
    { page: 1, question: 'What do the answers indicate?', heading: 'Cover', kind: 'cover', exhibitIds: [] },
    { page: 2, question: 'What does the assessment establish?', heading: 'What the assessment establishes', kind: 'overview', exhibitIds: [base.readinessScore.exhibitId, base.domainProfile.exhibitId], commentary: overview },
    { page: 3, question: 'What do the answers show?', heading: 'What the answers show', kind: 'diagnosis', exhibitIds: ['EX-DIAGNOSIS-MATRIX'] },
    ...(exposures.length ? [{ page: 4, question: 'Which fraud scenarios do the answers point to?', heading: 'Fraud scenarios the answers point to', kind: 'exposure' as const, exhibitIds: ['EX-PRIORITY-EXPOSURE'] }] : []),
    ...(scenarios.length ? [{ page: 5, question: 'How could these scenarios occur?', heading: 'How these scenarios could occur here', kind: 'scenarios' as const, exhibitIds: ['EX-SCENARIO-PATHWAYS'] }] : []),
    { page: 6, question: 'What should management address?', heading: 'Management matters requiring attention', kind: 'priorities', exhibitIds: ['EX-MANAGEMENT-PRIORITIES'] },
    { page: 7, question: 'What could happen in the first 90 days?', heading: 'Proposed stages for the first 90 days', kind: 'roadmap', exhibitIds: ['EX-ROADMAP'] },
    { page: 8, question: 'How will management know the work is taking effect?', heading: 'What to check at the 90-day point', kind: 'dashboard', exhibitIds: ['EX-MANAGEMENT-METRICS'] }
  ] as EssentialPage[]).map((p, i) => ({ ...p, page: i + 1 }));

  const refs = (ss: SchemeView[]) => ss.map((s) => r.findings.find((f) => f.schemeRef === s.ref)?.ref ?? s.ref);
  const diagnosisRows = [...inconsistentRows, ...clarifyRows, ...areaRows, ...qualifiedRow];
  return {
    ...base,
    narrativeMode: gapSchemes.length >= 3 || inconsistent.length ? 'REMEDIATION' : gapSchemes.length || qualified.length || clarify.length ? 'MIXED' : 'SUSTAINMENT',
    cover: { ...base.cover, centralJudgement: judgement },
    materialContrasts: undefined,
    diagnosis: { exhibitId: 'EX-DIAGNOSIS-MATRIX', sourceRefs: refs([...inconsistent, ...clarify, ...gapSchemes, ...qualified]).slice(0, 12), title: 'What the answers show', rows: diagnosisRows.length ? diagnosisRows : [{ pattern: 'Controls reported in place', signals: [], whyItMatters: 'Every control asked about was reported in place.' }], interpretation },
    strengths: undefined, watchpoints: undefined, unownedScenarios: [],
    exposures: exposures.length ? { exhibitId: 'EX-PRIORITY-EXPOSURE', sourceRefs: refs(listed), title: 'Fraud scenarios the answers point to', rows: exposures } : undefined,
    scenarios: scenarios.length ? { exhibitId: 'EX-SCENARIO-PATHWAYS', sourceRefs: refs(scenarioSchemes), title: 'How these scenarios could occur here', scenarios, assuranceNote: 'These are illustrative exposure mechanisms for an organisation with the controls it reported. They are not allegations that any event has occurred, and their order is not a ranking.' } : undefined,
    priorities: { exhibitId: 'EX-MANAGEMENT-PRIORITIES', sourceRefs: refs(listed).length ? refs(listed) : ['ASSESSMENT'], title: 'Management matters requiring attention', rows: priorities.length ? priorities : [{ rank: 1, outcome: 'Confirm the controls reported in place', whyNow: 'Every control asked about was reported in place.', accountableRole: 'Chief executive', betterLooksLike: 'Each control reported in place is confirmed each year by the person who runs it.' }] },
    roadmap: { exhibitId: 'EX-ROADMAP', sourceRefs: r.actions.map((x) => x.ref).slice(0, 12).length ? r.actions.map((x) => x.ref).slice(0, 12) : ['ASSESSMENT'], title: 'Proposed stages for the first 90 days', interpretation: 'These are proposed planning stages for starting the work, not deadlines, contractual dates or estimates. Each window shows when a stage could begin once what it depends on is known and decided. How long a control takes to design, put in place and show to be operating depends on the organisation, and management sets its own dates.', stages },
    dashboard: { exhibitId: 'EX-MANAGEMENT-METRICS', sourceRefs: refs(listed).length ? refs(listed) : ['ASSESSMENT'], title: 'What to check at the 90-day point', rows: dashboard.length ? dashboard : [{ measure: 'Controls reported in place', current: 'All reported in place.', expectation: 'Each confirmed by the person who runs it.' }], baselineSource: 'assessed-condition' },
    conclusion, reportBasis, pages
  } as EssentialReportPresentationModel;
}

// ------------------------------------------------------------------------------------------------ after rendering

const escHtml = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unescHtml = (v: string) => v.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

/**
 * Post-processing of the unchanged renderer's output (the renderer is protected): the fixture banner, the four
 * position statements in place of the score tiles and band, the area figures in the method's order without bands,
 * neutral question labels, no rank numbers, and the stated selection and ordering rules.
 */
export function labelRevisedEssentialHtml(html: string, input: { banner: string; position: PositionStatement[]; areaOrder: string[] }): string {
  const { banner, position, areaOrder } = input;
  const coverGrid = `<div style="border-top:2px solid var(--brass);padding-top:4mm;display:grid;grid-template-columns:1fr 1fr;gap:3mm 9mm;max-width:168mm">${position.map((p) => `<div><div style="font-size:6.6pt;letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.55)">${escHtml(p.label)}</div><div style="font-size:9.6pt;font-weight:600;color:#fff;margin-top:1mm;line-height:1.3">${escHtml(p.value)}</div></div>`).join('')}</div><div style="height:9mm"></div>`;
  const pageGrid = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:4mm 8mm;border-top:2px solid var(--navy-900);border-bottom:1px solid var(--rule);padding:4.5mm 0">${position.map((p) => `<div><div style="font-size:6.8pt;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:600">${escHtml(p.label)}</div><div style="font-size:10.5pt;font-weight:700;color:var(--navy-900);margin-top:1.2mm;line-height:1.25">${escHtml(p.value)}</div><div style="font-size:7.9pt;line-height:1.5;color:var(--ink,#1f2937);margin-top:1.2mm">${escHtml(p.text)}</div></div>`).join('')}</div>`;
  let out = html
    .replace('</head>', '<style>.bars .fill{background:#8A94A6 !important}.bars .band{display:none}</style></head>')
    .replace('<body>', `<body><div style="position:fixed;top:0;left:0;right:0;z-index:9;background:#7a1f1f;color:#fff;font:600 7.5pt/1.4 sans-serif;padding:1.2mm 4mm;text-align:center">${banner}</div>`)
    // Cover: the four statements replace the score and band.
    .replace(/<div class="scorebox">[\s\S]*?<\/div>\s*<div style="height:9mm"><\/div>/, coverGrid)
    // Page 2: the four statements replace the score tiles; the area figures lose their bands and are in method order.
    .replace('<h1>Fraud readiness at a glance</h1>', '<h1>What the assessment establishes</h1>')
    .replace(/<div class="stats">[\s\S]*?<\/div>\s*(?=<div class="gap"><\/div><p class="lede">)/, `${pageGrid}\n    `)
    .replace('<h2>Domain readiness profile</h2>', '<h2>Calculated area figures (test fixtures)</h2>')
    .replace(/<div class="cap" style="margin-top:2.5mm">Ordered weakest first\.[^<]*<\/div>/, '<div class="cap" style="margin-top:2.5mm">Areas in the method\'s order. Each figure is a calculated test result from a research simulation of the draft method: not a score, a band or a ranking.</div>')
    // Neutral question labels.
    .replace('<div class="q">What does the assessment show?</div>', '<div class="q">What does the assessment establish?</div>')
    .replace('<div class="q">Why does the position look like this?</div>', '<div class="q">What do the answers show?</div>')
    .replace('<div class="q">Where does fraud exposure matter most?</div>', '<div class="q">Which fraud scenarios do the answers point to?</div>')
    .replace('<div class="q">How could that exposure materialise?</div>', '<div class="q">How could these scenarios occur?</div>')
    .replace('<div class="q">What does management need to change?</div>', '<div class="q">What should management address?</div>')
    .replace('<div class="q">How will management know whether readiness is improving?</div>', '<div class="q">How will management know the work is taking effect?</div>')
    .replace('<div class="q">What should happen in the first 90 days?</div>', '<div class="q">What could the first 90 days cover?</div>')
    // No rank numbers and no priority headings.
    .replace(/<th style="width:4%">#<\/th>/g, '')
    .replace(/<td class="rank">\d+<\/td>/g, '')
    .replace('<th style="width:20%">Priority exposure</th>', '<th style="width:22%">Fraud scenario</th>')
    .replace('<th style="width:14%">Priority order</th>', '<th style="width:16%">Why it is included</th>')
    .replace('Ordered by the weakest capability supporting each exposure. The order indicates where to act first; it is not a risk rating, and closely ranked exposures may warrant similar attention.',
      'Included: every scenario whose answers must be settled or clarified (up to three), then one scenario with a control reported as a gap from each area, in the method\'s order, up to five in all. Inclusion and order are not a ranking: MK has not approved a method for rating fraud risks, and every scenario is in the register.')
    .replace(/<span class="win">(0–30|31–60|61–90) days<\/span>/g, '<span class="win">Proposed window · $1 days</span>');
  // Area figures in the method's order.
  out = out.replace(/<div class="bars">([\s\S]*?)<\/div>\s*(?=<div class="cap" style="margin-top:2.5mm">Areas in the method)/, (_m, inner: string) => {
    const rows = inner.match(/<div class="row">[\s\S]*?<div class="band">[^<]*<\/div>\s*<\/div>/g) ?? [];
    const idx = (row: string) => { const nm = unescHtml((row.match(/<div class="nm">([^<]*)<\/div>/) ?? [])[1] ?? ''); const i = areaOrder.indexOf(nm); return i < 0 ? 99 : i; };
    return `<div class="bars">${[...rows].sort((x, y) => idx(x) - idx(y)).join('')}</div>`;
  });
  // No band label survives anywhere, visible or hidden, and every bar has the same neutral colour.
  out = out.replace(/<div class="band">[^<]*<\/div>/g, '<div class="band"></div>').replace(/class="fill (strong|weak|mid)?\s*"/g, 'class="fill"');
  // The priorities table: a stated ordering rule, after the table.
  out = out.replace(/(<h1>Management matters requiring attention<\/h1>[\s\S]*?<\/table>)/, '$1<div class="cap" style="margin-top:2.5mm">Listed in the order the work depends on: facts and decisions first, then the controls for the scenarios above, in the method\'s area order. The list is not a risk ranking.</div>');
  return out;
}
