import type { EssentialReportPresentationModel, EssentialPage } from '@/lib/reports/essential/presentation-model';
import { AREA_SHORT, concentration, joinList, outstandingPhrase, schemeWhere, type ControlView, type RevisedReport, type SchemeView } from './evidence-model';
import { controlName } from './answer-text';

/**
 * FICTIONAL INTEGRATION PROTOTYPE. The Essential report's content from the revised report model, in the existing
 * presentation model, validated by the existing validator and drawn by the existing renderer.
 *
 * What it answers, page by page: what the organisation's answers indicate (cover, overview, diagnosis), why the issues
 * matter (schemes and how they would work here), what management should address first (management priorities) and
 * what to do in the first 90 days (roadmap), with the measures that show progress.
 *
 * Corrections on MK's direction of 12 November: no "false comfort" wording (answers are classified, and only answers
 * that conflict or rely on a weaker practice are called unresolved); no priority, likelihood, impact, difficulty or
 * deadline derived from tier or answer class; standards and states worded per response format; the calculated figure
 * is labelled as a test fixture and, under R-1, does not lead the cover when unresolved answers are substantial.
 */

const lc = (s: string) => (s && !/^[A-Z]{2,}|^I\b/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const sentence = (s: string) => { const t = String(s ?? '').trim(); return t ? (/[.!?]$/.test(t) ? t : `${t}.`) : ''; };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const isAre = (n: number) => (n === 1 ? 'is' : 'are');
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
  const clause = t.split(/,\s/)[0];
  return clause.length <= max && clause.split(' ').length >= 4 ? clause : alt.length <= max ? alt : fit([alt], max);
}
const clean = (s: string | null | undefined) => (s && !VALIDATOR_CONFLICT.test(s) ? s : null);
const stateOf = (v: ControlView) => (v.format === 'anchored' && v.level !== null ? v.reported : `${v.key}: ${lc(v.stateShort)}.`);

export function buildRevisedEssentialPresentation(input: {
  base: EssentialReportPresentationModel;
  report: RevisedReport;
  fixtureLabel: string;
  figure: { score: number | null; band: string | null };
}): EssentialReportPresentationModel {
  const { base, report: r } = input;
  const org = base.reportIdentity.organisationName;
  const S = r.schemes;
  const k = r.summary.byKind;
  const gapSchemes = S.filter((s) => s.kind === 'gap');
  const unresolved = S.filter((s) => s.kind === 'contradiction' || s.kind === 'dependency');
  const qualified = S.filter((s) => s.kind === 'qualified');
  const out = r.outstanding;
  const suff = r.sufficiency;
  const reported = k.confirmed + k.qualified;
  // Where the gap schemes concentrate: a factual count by area, used to describe, never to rate.
  const areaCounts = [...gapSchemes.reduce((m, s) => m.set(s.area, (m.get(s.area) ?? 0) + 1), new Map<string, number>()).entries()].sort((x, y) => y[1] - x[1]);
  const topAreas = areaCounts.slice(0, 2).map(([ar]) => AREA_SHORT[ar] ?? ar);
  const whereGaps = concentration(areaCounts, gapSchemes.length);
  const unresolvedStatement = (s: SchemeView) => s.relations.find((x) => x.type === 'direct-contradiction')?.statement ?? s.relations.find((x) => x.type === 'necessary-dependency')?.statement ?? '';

  // ---- Cover: what the answers indicate, in one sentence.
  const judgement = unresolved.length && r.r1.substantial
    ? `In ${plural(unresolved.length, 'fraud scheme', 'fraud schemes')} the organisation's own answers conflict or rely on a practice reported as weaker${gapSchemes.length ? `, and in ${gapSchemes.length} a control is reported as a gap` : ''}.`
    : gapSchemes.length
      ? `${gapSchemes.length} of the ${S.length} fraud schemes that apply have a control reported as a gap, ${whereGaps}.`
      : `Every applicable fraud scheme has the controls that stop it reported in place${qualified.length ? `, with further defences weaker in ${qualified.length}` : ''}.`;

  // ---- Overview commentary.
  const figureNote = r.r1.substantial
    ? `The calculated figure above is a test fixture from a research simulation. It is not an approved score, and it is not a readiness conclusion while ${plural(unresolved.length, 'scheme has', 'schemes have')} answers still to resolve.`
    : 'The calculated figure above is a test fixture from a research simulation, not an approved score or readiness conclusion.';
  const overview = [
    `${S.length} fraud schemes apply to the organisation${k['not-expected'] ? `, ${k['not-expected']} of which the method does not ask about at its size` : ''}. For ${k.confirmed}, every control asked about was reported in place${k.qualified ? `, and for ${k.qualified} the control that stops the scheme is reported in place while a further defence is weaker` : ''}.`,
    gapSchemes.length ? `${gapSchemes.length} ${gapSchemes.length === 1 ? 'has' : 'have'} a control reported as a gap, ${r.summary.tier1Gap ? `${r.summary.tier1Gap} of them` : 'none of them'} in tier 1, the schemes the draft method confirms in its core stage.` : '',
    unresolved.length ? `In ${unresolved.length} the answers need resolving: ${k.contradiction ? `${k.contradiction} ${k.contradiction === 1 ? 'has answers' : 'have answers'} that cannot both be right` : ''}${k.contradiction && k.dependency ? ' and ' : ''}${k.dependency ? `${k.dependency} ${k.dependency === 1 ? 'relies' : 'rely'} on a practice reported as weaker` : ''}.` : '',
    `The core stage is ${suff.stages.core}; ${out.length ? `${plural(out.length, 'answer is', 'answers are')} outstanding, and ` : ''}${suff.analytical.schemes.analysable === suff.analytical.schemes.applicable ? `all ${suff.analytical.schemes.applicable} schemes asked about` : `${suff.analytical.schemes.analysable} of the ${suff.analytical.schemes.applicable} schemes asked about`} can be analysed in full from the answers given.`,
    figureNote
  ].filter(Boolean).join(' ');

  // ---- Diagnosis: answers to resolve, where the gaps concentrate, and further defences.
  const sig = (v: ControlView) => ({ title: v.key, score: v.stateShort as unknown as number });
  const unresolvedRows = unresolved.slice(0, 2).map((s) => {
    const rel = s.relations.find((x) => x.type === 'direct-contradiction') ?? s.relations.find((x) => x.type === 'necessary-dependency')!;
    const conf = s.confirmations.find((c) => c.id === rel.confirmation)!;
    const prac = r.analysis.view(r.analysis.byId.get(rel.practice)!);
    return { pattern: `${s.name.replace(/\.$/, '')}: answers to resolve`, signals: [sig(conf), sig(prac)], whyItMatters: rel.statement };
  });
  const areaRows = areaCounts.slice(0, unresolvedRows.length ? 2 : 3).map(([ar, n]) => {
    const ss = gapSchemes.filter((s) => s.area === ar);
    return {
      pattern: `${ss[0].areaName}: ${plural(n, 'scheme', 'schemes')} with a control reported as a gap`,
      signals: ss.flatMap((s) => s.confirmationGaps).slice(0, 3).map(sig),
      whyItMatters: `${sentence(ss[0].why ?? ss[0].how ?? ss[0].name)}${ss.length > 1 ? ` The same area also has open: ${joinList(ss.slice(1, 3).map((s) => lc(s.name.replace(/\.$/, ''))))}.` : ''}`
    };
  });
  const qualifiedRow = qualified.length ? [{
    pattern: `${plural(qualified.length, 'scheme', 'schemes')}: control in place, a further defence weaker`,
    signals: qualified.slice(0, 3).map((s) => sig(s.supportingGaps[0])),
    whyItMatters: 'Each weaker practice is a separate defence against the same scheme. The control that stops the scheme stands as reported; the practices are listed in the register.'
  }] : [];
  const checks = r.consistency.checks ?? [];
  const checkTypes = checks.filter((c) => c.outcome !== 'consistent' && c.outcome !== 'pending').map((c) => r.relations.find((x) => x.confirmation === c.confirmation && x.practice === c.followup)?.type ?? 'complementary-weakness');
  const compared = k.contradiction + k.dependency + k.qualified;
  const comparison = !compared ? ''
    : !unresolved.length
      ? `${compared === 1 ? 'In the one scheme' : `In each of the ${compared} schemes`} where a control was reported fully in place and a practice of the same scheme weaker, the method's wording shows the practice is a separate defence, so the reported control stands as given.`
      : `In ${compared} schemes a control was reported fully in place and a practice of the same scheme weaker, and the two answers were compared using the method's wording. ${k.contradiction ? `In ${k.contradiction} they cannot both be right` : ''}${k.contradiction && k.dependency ? ' and in ' : k.dependency ? 'In ' : ''}${k.dependency ? `${k.dependency} the reported control relies on the weaker practice` : ''}${k.qualified ? `; in the other ${k.qualified} the practice is a separate defence and the reported control stands as given` : ''}.`;
  const interpretation = [
    comparison,
    checks.length ? `Separately, ${checks.length} of ${r.consistency.eligible} controls that can be cross-checked were asked one further question: ${(r.consistency.counts ?? {}).consistent ?? 0} consistent, ${checkTypes.filter((t) => t === 'direct-contradiction').length} conflicting and ${checkTypes.filter((t) => t !== 'direct-contradiction').length} with a separate practice reported weaker. These compare the organisation's own answers; they are not tests of operation and change no figure.` : ''
  ].filter(Boolean).join(' ');

  // ---- Schemes to address: presentation convention PC-1, never a risk ranking. Answers to resolve first, then one
  // scheme with a control reported as a gap from each area, areas in order of how many such schemes they hold.
  const listed: SchemeView[] = [...unresolved.slice(0, 2)];
  for (const [ar] of areaCounts) { if (listed.length >= 5) break; const s = gapSchemes.find((x) => x.area === ar); if (s) listed.push(s); }
  for (const s of gapSchemes) { if (listed.length >= 5) break; if (!listed.includes(s)) listed.push(s); }
  const gapsOf = (s: SchemeView) => (s.kind === 'gap' ? s.confirmationGaps : s.relations.filter((x) => x.type !== 'complementary-weakness').map((x) => r.analysis.view(r.analysis.byId.get(x.practice)!)));
  const interruption = (s: SchemeView) => {
    const g = gapsOf(s);
    const std = g.map((v) => clean(v.standard)).find((x): x is string => !!x && x.length <= 160);
    return std ?? fit(g.map((v) => `${v.key}: in place`), 150, (x) => x.join('; '));
  };
  const consequence = (s: SchemeView) => sentence(clean(s.why) ?? (s.methodRisks.length ? `The method links it to ${joinList(s.methodRisks.slice(0, 2).map(lc))}` : s.how ?? s.name));
  const exposures = listed.map((s, i) => ({
    rank: i + 1, family: s.id, exposure: s.name, whyItMatters: sentence(s.how ?? s.name),
    assessmentBasis: (s.kind === 'gap' ? s.confirmationGaps.slice(0, 3) : [s.confirmations[0], ...gapsOf(s).slice(0, 2)]).map(sig),
    potentialConsequence: consequence(s), drivers: [], interruptionPoint: interruption(s),
    priority: s.kind === 'gap' ? `Gap, tier ${s.tier}` : 'To resolve',
    priorityBasis: s.kind === 'gap'
      ? (s.confirmations.length === 1 ? `Its control is reported as ${lc(s.confirmationGaps[0].stateShort)}.` : `${s.confirmationGaps.length} of its ${s.confirmations.length} controls reported as gaps.`)
      : 'Answers to resolve before the scheme is treated as covered.'
  }));

  // ---- How the schemes would work here.
  const scenarioSchemes = listed.filter((s, i, xs) => xs.findIndex((y) => gapsOf(y)[0]?.id === gapsOf(s)[0]?.id) === i).slice(0, 3);
  const scenarios = scenarioSchemes.map((s, i) => {
    const g = gapsOf(s);
    const standard = g.map((v) => clean(v.standard)).find(Boolean);
    return {
      scenarioId: `SCHEME-${i + 1}`, family: s.id, scenarioFamily: s.id, title: s.name,
      entryPoint: sentence(s.how ?? s.name), entryPointShort: shortText(s.how ?? s.name, 90, s.name),
      controlBreak: (s.kind === 'gap' ? g.slice(0, 2) : [s.confirmations[0], ...g.slice(0, 1)]).map(stateOf).join(' '),
      controlBreakShort: fit((s.kind === 'gap' ? g : [s.confirmations[0], ...g]).map((v, j) => `${j ? lc(v.key) : v.key} ${lc(v.stateShort)}`), 90, (x) => x.join('; ')),
      exposureShort: shortText(s.methodRisks[0] ?? consequence(s), 90, 'Loss before the gap is noticed'),
      howItUnfolds: `${sentence(s.how ?? s.name)} ${clean(s.why) ? sentence(s.why!) : ''} Here, ${s.kind === 'gap' ? g.slice(0, 2).map((v) => lc(stateOf(v)).replace(/\.$/, '')).join('; ') : lc(unresolvedStatement(s)).replace(/\.$/, '')}.`.replace(/\s+/g, ' '),
      warningIndicators: s.methodRisks.slice(0, 3),
      immediateInterruption: s.kind !== 'gap'
        ? 'Establishing which answer is right. Until then, the scheme is treated as not covered.'
        : standard ? `A check of new cases by hand against the method's standard, until the control operates. ${standard}` : `A check of new cases by hand by the ${lc(g[0]?.ownerRole ?? 'process owner')}, until the control operates.`
    };
  });

  // ---- What management should address first: facts and ownership before controls; then the controls themselves.
  const priorities: EssentialReportPresentationModel['priorities']['rows'] = [];
  const row = (x: Omit<EssentialReportPresentationModel['priorities']['rows'][number], 'rank'>) => priorities.push({ rank: priorities.length + 1, ...x });
  if (unresolved.length) {
    row({
      outcome: fit([`Resolve the answers for ${plural(unresolved.length, 'scheme', 'schemes')}`], 90),
      whyNow: `${k.contradiction ? `${plural(k.contradiction, 'scheme has', 'schemes have')} answers that cannot both be right` : ''}${k.contradiction && k.dependency ? ', and ' : ''}${k.dependency ? `${plural(k.dependency, 'scheme relies', 'schemes rely')} on a practice reported as weaker` : ''}. Until resolved, none of them is treated as covered.`,
      accountableRole: joinList([...new Set(unresolved.map((s) => s.confirmations[0].ownerRole))].slice(0, 3).map((x, i) => (i ? lc(x) : x))),
      betterLooksLike: 'The answers for each scheme agree with each other and with how the process runs, so the reported control can be relied on.'
    });
  }
  if (out.length) {
    row({
      outcome: fit([`Obtain the ${out.length} outstanding answers`], 90),
      whyNow: `Of these, ${outstandingPhrase(out)}. Until they are answered, the schemes they affect are unknown rather than covered.`,
      accountableRole: 'Chief executive, with each function named in the register',
      betterLooksLike: 'Every applicable control has an answer from the person who runs it, or an open item with a named owner.'
    });
  }
  if (gapSchemes.length) {
    row({
      outcome: 'Name an owner for each area and decide the order of work',
      whyNow: `The draft method does not rank fraud risks by likelihood or impact, so this report does not either. Which of the ${gapSchemes.length} open schemes to address first is management's decision, informed by its own volumes and values.`,
      accountableRole: 'Chief executive',
      betterLooksLike: 'Each area with open schemes has one accountable executive, and the order of work is recorded with the reason for each choice.'
    });
  }
  for (const s of listed.filter((x) => x.kind === 'gap')) {
    if (priorities.length >= 6) break;
    const g = s.confirmationGaps;
    const target = g.map((v) => clean(v.standard)).filter((x): x is string => !!x && !ARTEFACT.test(x));
    row({
      outcome: fit(g.map((v, i) => (i ? lc(v.key) : `Put in place: ${lc(v.key)}`)), 90),
      whyNow: `Stops ${schemeWhere(s.name)}. ${g.length === 1 ? 'Its control is reported as' : `${g.length} of its controls are reported as`} ${g.length === 1 ? lc(g[0].stateShort) : 'gaps'}.`,
      accountableRole: g[0].ownerRole,
      betterLooksLike: target.slice(0, 2).join(' ') || `${g[0].key} in place across everything it should cover.`,
      evidenceArtefact: g.map((v) => v.records).filter(Boolean).join(' ')
    });
  }

  // ---- The first 90 days. Ordered by what must be known and decided first; no deadline comes from tier or answers.
  const owners = [...new Set(unresolved.map((s) => s.confirmations[0].ownerRole))];
  const prereqs = r.controls.filter((c) => c.purpose === 'put-in-place' && c.dependentRefs.length);
  const stage30 = [
    ...(unresolved.length ? [{ action: `Resolve the answers for ${plural(unresolved.length, 'scheme', 'schemes')}${k.contradiction ? `, starting with the ${k.contradiction} whose answers cannot both be right` : ''}.`, owner: joinList(owners.slice(0, 2).map((x, i) => (i ? lc(x) : x))), deliverable: 'A corrected answer for each scheme, or a recorded decision to put the missing practice in place.', completionTest: 'The answers for each scheme agree with how the process runs.', dependsOn: [] }] : []),
    ...(out.length ? [{ action: `Obtain the ${out.length} outstanding answers from the functions named in the register.`, owner: 'Chief executive', deliverable: 'An answer, or an open item with a named owner, for each question.', completionTest: 'No question is left declined or unanswered without an owner.', dependsOn: [] }] : []),
    ...(gapSchemes.length ? [{ action: 'Name the accountable executive for each area with open schemes, and decide which schemes to address this cycle.', owner: 'Chief executive', deliverable: 'Named executives and a recorded order of work.', completionTest: 'Every open scheme is selected, deferred with a reason or accepted at the right level.', dependsOn: [] }] : [])
  ].slice(0, 3);
  const stage60 = [
    ...(prereqs.length ? [{ action: `Design first the controls others rely on: ${joinList(prereqs.slice(0, 2).map((c) => lc(c.key)))}.`, owner: prereqs[0].ownerRole, deliverable: 'An approved design for each, with the records it will keep.', completionTest: 'The controls that rely on them can be designed against something that exists.', dependsOn: [] }] : []),
    ...(gapSchemes.length ? [{ action: 'Approve the target design for each selected scheme, using the standards in this report.', owner: 'Each accountable executive', deliverable: 'Approved designs, each with an owner and the records it will keep.', completionTest: 'Each selected control has an approved design and a named owner.', dependsOn: [] }] : []),
    ...(!gapSchemes.length && qualified.length ? [{ action: `Decide which of the ${qualified.length} weaker further defences to strengthen.`, owner: 'Chief executive', deliverable: 'A recorded decision for each.', completionTest: 'Each is scheduled, deferred with a reason or accepted.', dependsOn: [] }] : [])
  ].slice(0, 2);
  const stage90 = [
    { action: 'Start operating the approved designs and review the first full cycle against the success measures.', owner: 'Each process owner', deliverable: 'A first-cycle review for each control, with exceptions and their resolution.', completionTest: 'Each control has met its success measure for one cycle, or has a recorded correction.', dependsOn: [] },
    { action: `Report the status of each open and unresolved scheme to ${lc(r.oversight)}.`, owner: 'Chief executive', deliverable: 'A one-page status per scheme: owner, controls in place, controls outstanding, next step.', completionTest: 'The status is received and minuted.', dependsOn: [] }
  ];
  const fallback = { action: 'Confirm that the controls reported in place still operate as reported.', owner: 'Each process owner', deliverable: 'A written confirmation for each.', completionTest: 'Each confirmation is received and recorded.', dependsOn: [] };
  const stages = [
    { stage: '30 days: Establish the facts and owners', window: '0–30 days', primaryOutcome: 'Answers that conflict are resolved, outstanding answers are obtained and each area with open schemes has an accountable executive.', actions: stage30.length ? stage30 : [fallback] },
    { stage: '60 days: Design the controls, prerequisites first', window: '31–60 days', primaryOutcome: 'Approved designs exist for the schemes management selected, with the controls others rely on designed first.', actions: stage60.length ? stage60 : [{ ...fallback, action: 'Agree how each control reported in place will be confirmed each year.' }] },
    { stage: '90 days: Start operating and report', window: '61–90 days', primaryOutcome: 'The first designed controls operate for a full cycle and the oversight body sees the status of every scheme.', actions: stage90 }
  ];

  // ---- What to check at the 90-day point.
  const dashboard = [
    ...(unresolved.length ? [{ measure: 'Schemes with answers to resolve', current: `${unresolved.length}.`, expectation: 'None: each resolved, with the corrected answer recorded.' }] : []),
    ...(out.length ? [{ measure: 'Outstanding answers', current: `${out.length}: ${outstandingPhrase(out)}.`, expectation: 'Each answered, or recorded as an open item with an owner.' }] : []),
    ...listed.filter((s) => s.kind === 'gap').slice(0, 3).map((s) => {
      const c = r.controls.find((x) => x.id === s.confirmationGaps[0].id)!;
      return { measure: c.key, current: stateOf(s.confirmationGaps[0]), expectation: clean(c.successMeasure) ?? `${c.key} operating for every case in scope.` };
    }),
    ...(gapSchemes.length ? [{ measure: 'Open schemes with a named owner and a decision', current: `None recorded in the assessment (${gapSchemes.length} open).`, expectation: 'Each selected, deferred with a reason or accepted at the right level.' }] : [])
  ].slice(0, 6);

  const conclusion = [
    `${org}'s answers show ${plural(reported, 'scheme', 'schemes')} with the controls that stop them reported in place${gapSchemes.length ? ` and ${gapSchemes.length} with a control reported as a gap, ${whereGaps}` : ''}.`,
    unresolved.length ? `Before relying on the reported position, management should resolve the ${plural(unresolved.length, 'scheme', 'schemes')} whose answers conflict or rely on a weaker practice${r.r1.substantial ? '; until then the calculated figure is not a readiness conclusion' : ''}.` : '',
    gapSchemes.length ? 'The draft method does not yet rank fraud risks, so the order of the remaining work is management\'s decision; the supporting register lists every scheme, control and record behind this report.' : ''
  ].filter(Boolean).join(' ');
  const reportBasis = `This report is based on the organisation's own answers to the MK Fraud Readiness review, given by the respondent and the accountable functions named in it, and read against the draft review method, which MK has not yet approved. MK has not independently tested whether controls operate in practice, and no evidence was reviewed; evidence review is a separate Advisory service. The records named in this report are records management should maintain; MK has not requested or examined them. ${input.fixtureLabel}`;

  const pages: EssentialPage[] = ([
    { page: 1, question: 'What do the answers indicate?', heading: 'Cover', kind: 'cover', exhibitIds: [] },
    { page: 2, question: 'What does the assessment show?', heading: 'The position at a glance', kind: 'overview', exhibitIds: [base.readinessScore.exhibitId, base.domainProfile.exhibitId], commentary: overview },
    { page: 3, question: 'Why does the position look like this?', heading: 'What the answers show', kind: 'diagnosis', exhibitIds: ['EX-DIAGNOSIS-MATRIX'] },
    ...(exposures.length ? [{ page: 4, question: 'Which fraud schemes do the answers point to?', heading: 'Fraud schemes the answers point to', kind: 'exposure' as const, exhibitIds: ['EX-PRIORITY-EXPOSURE'] }] : []),
    ...(scenarios.length ? [{ page: 5, question: 'Why do these issues matter?', heading: 'How the schemes would work here', kind: 'scenarios' as const, exhibitIds: ['EX-SCENARIO-PATHWAYS'] }] : []),
    { page: 6, question: 'What should management address first?', heading: 'What management should address first', kind: 'priorities', exhibitIds: ['EX-MANAGEMENT-PRIORITIES'] },
    { page: 7, question: 'What should happen in the first 90 days?', heading: 'The first 90 days', kind: 'roadmap', exhibitIds: ['EX-ROADMAP'] },
    { page: 8, question: 'How will management know whether readiness is improving?', heading: 'What to check at the 90-day point', kind: 'dashboard', exhibitIds: ['EX-MANAGEMENT-METRICS'] }
  ] as EssentialPage[]).map((p, i) => ({ ...p, page: i + 1 }));

  const refs = (ss: SchemeView[]) => ss.map((s) => r.findings.find((f) => f.schemeRef === s.ref)?.ref ?? s.ref);
  const diagnosisRows = [...unresolvedRows, ...areaRows, ...qualifiedRow];
  return {
    ...base,
    narrativeMode: gapSchemes.length >= 3 || unresolved.length ? 'REMEDIATION' : gapSchemes.length || qualified.length ? 'MIXED' : 'SUSTAINMENT',
    cover: { ...base.cover, centralJudgement: judgement },
    materialContrasts: undefined,
    diagnosis: { exhibitId: 'EX-DIAGNOSIS-MATRIX', sourceRefs: refs([...unresolved, ...gapSchemes, ...qualified]).slice(0, 12), title: 'What the answers show', rows: diagnosisRows.length ? diagnosisRows : [{ pattern: 'Controls reported in place', signals: [], whyItMatters: 'Every control asked about was reported in place.' }], interpretation },
    strengths: undefined, watchpoints: undefined, unownedScenarios: [],
    exposures: exposures.length ? { exhibitId: 'EX-PRIORITY-EXPOSURE', sourceRefs: refs(listed), title: 'Fraud schemes the answers point to', rows: exposures } : undefined,
    scenarios: scenarios.length ? { exhibitId: 'EX-SCENARIO-PATHWAYS', sourceRefs: refs(scenarioSchemes), title: 'How the schemes would work here', scenarios, assuranceNote: 'These are plausible schemes for an organisation with the controls it reported. They are not allegations that these events have occurred.' } : undefined,
    priorities: { exhibitId: 'EX-MANAGEMENT-PRIORITIES', sourceRefs: refs(listed).length ? refs(listed) : ['ASSESSMENT'], title: 'What management should address first', rows: priorities.length ? priorities : [{ rank: 1, outcome: 'Confirm the controls reported in place', whyNow: 'Every control asked about was reported in place.', accountableRole: 'Chief executive', betterLooksLike: 'Each control reported in place is confirmed each year by the person who runs it.' }] },
    roadmap: { exhibitId: 'EX-ROADMAP', sourceRefs: r.actions.map((x) => x.ref).slice(0, 12).length ? r.actions.map((x) => x.ref).slice(0, 12) : ['ASSESSMENT'], title: 'The first 90 days', interpretation: 'The windows order the work by what must be known and decided before controls are designed. They set no deadline from a scheme\'s tier or the answers given; dates are management\'s decision.', stages },
    dashboard: { exhibitId: 'EX-MANAGEMENT-METRICS', sourceRefs: refs(listed).length ? refs(listed) : ['ASSESSMENT'], title: 'What to check at the 90-day point', rows: dashboard.length ? dashboard : [{ measure: 'Controls reported in place', current: 'All reported in place.', expectation: 'Each confirmed by the person who runs it.' }], baselineSource: 'assessed-condition' },
    conclusion, reportBasis, pages
  } as EssentialReportPresentationModel;
}

/**
 * Wraps the unchanged renderer's output: a visible fixture banner, neutral column headings and caption for the scheme
 * list, and the R-1 cover treatment of the calculated figure.
 */
export function labelRevisedEssentialHtml(html: string, banner: string, r1: { substantial: boolean; unresolved: number }): string {
  let out = html
    .replace('<body>', `<body><div style="position:fixed;top:0;left:0;right:0;z-index:9;background:#7a1f1f;color:#fff;font:600 7.5pt/1.4 sans-serif;padding:1.2mm 4mm;text-align:center">${banner}</div>`)
    .replace('Readiness score<br>out of 100', 'Calculated figure<br>(test fixture)')
    .replace(/Ordered weakest first\. Overall readiness ([0-9.]+) \/ 100\./, 'Ordered weakest first. Calculated figures from a research simulation (test fixtures), not approved scores.')
    .replace('<th style="width:20%">Priority exposure</th>', '<th style="width:20%">Fraud scheme</th>')
    .replace('<th style="width:14%">Priority order</th>', '<th style="width:14%">Why it is listed</th>')
    .replace('Ordered by the weakest capability supporting each exposure. The order indicates where to act first; it is not a risk rating, and closely ranked exposures may warrant similar attention.',
      'Listed with answers to resolve first, then one scheme with a control reported as a gap from each area, areas with the most such schemes first. This is a presentation order: MK has not approved a method for rating fraud risks, and every scheme is in the register.');
  // R-1: the calculated figure stays on the cover but is labelled; it does not lead when unresolved answers are substantial.
  out = out.replace(/<div class="scorebox">([\s\S]*?)<\/div>\s*<div style="height:9mm"><\/div>/, (_m, inner: string) => {
    const n = (inner.match(/<span class="n">([^<]*)<\/span>/) ?? [])[1] ?? '';
    const band = (inner.match(/<div class="m">([^<]*)<\/div>/) ?? [])[1] ?? '';
    if (r1.substantial) {
      return `<div style="border-top:1px solid rgba(255,255,255,.35);padding-top:3.5mm;font-size:8.6pt;line-height:1.55;color:rgba(255,255,255,.82);max-width:150mm">Calculated figure ${n} / 100 (${band}), a test fixture. It is not a readiness conclusion while ${r1.unresolved} schemes have answers still to resolve; see page 2.</div><div style="height:9mm"></div>`;
    }
    return `<div class="scorebox">${inner}</div><div style="font-size:7.4pt;color:rgba(255,255,255,.65);margin-top:1.5mm">Calculated figure, a test fixture. Not an approved score or readiness conclusion.</div><div style="height:9mm"></div>`;
  });
  return out;
}
