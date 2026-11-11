import type { EssentialReportPresentationModel, EssentialPage } from '@/lib/reports/essential/presentation-model';
import type { AdvisoryEvidenceModel, MaterialFinding } from '@/lib/reports/evidence-model/types';
import { AREA_SHORT, schemeWhere, type RevisedAnalysis } from './evidence-model';

/**
 * FICTIONAL INTEGRATION PROTOTYPE. Reworks the content of the existing Essential presentation model from the revised
 * evidence model, keeping its structure, its validator and its renderer unchanged.
 *
 * Why a rework rather than the existing builder alone: the existing builder composes most customer text from canned
 * content per semantic family (for example "Weak challenge at identity, transaction and sensitive-change points"),
 * which was right for MFRS, where a finding is one headline question. Fed the revised evidence, it discards exactly
 * what the richer assessment adds: the named scheme, the specific controls and answers, the function that answered,
 * the method's own description of the current and target practice, and the records management should keep. This
 * module puts that content into the same exhibits. The overall figure, band and area figures stay those of the base
 * model, which the caller builds from an explicitly labelled test fixture.
 */

type Scheme = RevisedAnalysis['scenarios'][number];
const CLASS_SHORT: Record<string, string> = { full: 'In place', partial: 'Partly', designed: 'Set out, not operating', absent: 'Not in place' };
const lc = (s: string) => (s && !/^[A-Z]{2,}/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const sentence = (s: string) => { const t = String(s ?? '').trim(); return t ? (/[.!?]$/.test(t) ? t : `${t}.`) : ''; };
const joinList = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const keyOf = (m: Scheme['members'][number]) => m.c.key ?? m.c.id;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** A short label from a longer statement: the whole text, else its first clause, else the alternative. Never clipped. */
function shortText(text: string, max: number, alt: string): string {
  const t = text.replace(/\.$/, '');
  if (t.length <= max) return t;
  const clause = t.split(/,\s/)[0];
  return clause.length <= max && clause.split(' ').length >= 4 ? clause : alt.length <= max ? alt : alt.split(/,\s/)[0];
}
/** A list of control names as one phrase: the first keeps its capital, the rest are lower case. */
const keysPhrase = (keys: string[], max: number) => fit(keys.map((k, i) => (i ? lc(k) : k)), max);
/** The in-place standard for any control: the method's level 4 where it has one, otherwise its own test question. */
function targetFor(m: Scheme['members'][number]): string {
  const test = `Every case passes this test: ${m.q?.text ?? m.c.text}`;
  return standardOf(m) ?? (VALIDATOR_CONFLICT.test(test) ? `${keyOf(m)}: in place across everything it should cover.` : test);
}
/**
 * The existing validator treats "AI-generated" as engineering language. The method itself uses it, legitimately, about
 * AI-enabled fraud (deepfakes). Until MK decides how the validator should treat it, method text containing it is not
 * placed in the Essential customer surfaces; the full wording stays in the Comprehensive registers.
 */
const VALIDATOR_CONFLICT = /\bAI-generated\b/i;
const ARTEFACT = /\bRACI\b|\bregister\b|\bchecklist\b|\bcoverage report\b|\bevidence pack\b|\bcallback record\b|\bapproval record\b|\bscreening\b/i;

/** The method's level description for an anchored answer, or the control's short state. */
function stateOf(m: Scheme['members'][number]): string {
  const level = m.c.format === 'anchored' && m.c.answer ? Number(m.c.answer.value) : NaN;
  if (Number.isInteger(level) && m.q?.levels?.[level]) return sentence(m.q.levels[level]);
  return `${keyOf(m)}: ${lc(CLASS_SHORT[m.c.class ?? ''] ?? 'not answered')}.`;
}
function standardOf(m: Scheme['members'][number]): string | null {
  if (m.c.format === 'anchored' && m.q?.levels?.[4]) return sentence(m.q.levels[4]);
  return null;
}
/** Short labels have hard limits in the validator; choose the longest list of items that fits, never clip. */
function fit(items: string[], max: number, join = joinList): string {
  for (let n = items.length; n > 0; n--) { const v = join(items.slice(0, n)); if (v.length <= max) return v; }
  return items[0]?.slice(0, max) ?? '';
}

export function buildRevisedEssentialPresentation(input: {
  base: EssentialReportPresentationModel;
  evidence: AdvisoryEvidenceModel;
  analysis: RevisedAnalysis;
  fixtureLabel: string;
}): EssentialReportPresentationModel {
  const { base, evidence, analysis: a } = input;
  const org = base.reportIdentity.organisationName;
  const schemes = a.scenarios;
  const byId = new Map(schemes.map((s) => [s.id, s]));
  const schemeOf = (f: MaterialFinding) => byId.get(f.linkedScenarioTypes[0])!;
  const t1 = schemes.filter((s) => s.tier === 1);
  const open = schemes.filter((s) => s.kind === 'gap');
  const openT1 = open.filter((s) => s.tier === 1);
  const fc = schemes.filter((s) => s.kind === 'false-comfort');
  const unknown = schemes.filter((s) => s.kind === 'outstanding');
  const covered = schemes.filter((s) => s.kind === 'confirmed');
  const areaName = new Map(evidence.materialFindings.map((f) => [f.domainCode.replace(/^R/, ''), f.domainName]));
  const areaCounts = [...openT1.reduce((m, s) => m.set(s.area, (m.get(s.area) ?? 0) + 1), new Map<string, number>()).entries()].sort((x, y) => y[1] - x[1]);
  const topAreas = areaCounts.slice(0, 3).map(([ar]) => AREA_SHORT[ar] ?? lc(areaName.get(ar) ?? ar));
  const gapFindings = evidence.materialFindings.filter((f) => schemeOf(f)?.kind === 'gap');
  const fcFindings = evidence.materialFindings.filter((f) => schemeOf(f)?.kind === 'false-comfort');
  const out = a.outstandingItems;
  const cc = a.consistency;

  const judgement = openT1.length
    ? `${openT1.length} of the organisation's ${t1.length} first-priority fraud schemes remain open, most of them in ${joinList(topAreas.slice(0, 2))}${fc.length ? `, and ${plural(fc.length, 'control reported in place is', 'controls reported in place are')} not supported in practice` : ''}.`
    : `Every first-priority fraud scheme is reported as covered${fc.length ? `, but ${plural(fc.length, 'control relied on is', 'controls relied on are')} not supported in practice` : ''}.`;

  // ---- Overview commentary: the scheme picture, stated once.
  const overview = `The review asked about ${schemes.length} fraud schemes that apply to the organisation. For ${covered.length}, every control that stops the scheme was reported in place. ${open.length} ${open.length === 1 ? 'has' : 'have'} at least one such control reported as a gap.${fc.length ? ` ${fc.length} ${fc.length === 1 ? 'relies' : 'rely'} on a control reported in place whose own supporting practices were reported as gaps.` : ''}${unknown.length ? ` ${unknown.length} cannot be assessed until outstanding answers are given.` : ''} The figures above are test fixtures for this fictional demonstration, not an approved score.`;

  // ---- Diagnosis: where the open schemes concentrate, and where reported controls may give false comfort.
  const areaRows = areaCounts.slice(0, 3).map(([ar, n]) => {
    const ss = openT1.filter((s) => s.area === ar);
    const gaps = ss.flatMap((s) => s.confirmGaps).slice(0, 3);
    return {
      pattern: `${areaName.get(ar) ?? ar}: ${n} first-priority scheme${n > 1 ? 's' : ''} open`,
      signals: gaps.map((m) => ({ title: keyOf(m), score: CLASS_SHORT[m.c.class ?? ''] as unknown as number })),
      whyItMatters: `${sentence(ss[0].why)}${ss.length > 1 ? ` The same area also leaves open: ${joinList(ss.slice(1, 3).map((s) => lc(s.name.replace(/\.$/, ''))))}.` : ''}`
    };
  });
  const fcRows = fc.slice(0, areaRows.length >= 3 ? 2 : 3).map((s) => ({
    pattern: `${keyOf(s.confirms[0])}: reported in place, not supported by its practices`,
    signals: [s.confirms[0], ...s.supportGaps.slice(0, 2)].map((m) => ({ title: keyOf(m), score: CLASS_SHORT[m.c.class ?? ''] as unknown as number })),
    whyItMatters: `It is relied on to stop ${schemeWhere(s.name)}. One self-reported answer says it is in place; the answers about the practices it depends on say otherwise.`
  }));
  const outcomes = Object.entries(cc.counts ?? {}).filter(([k]) => k !== 'consistent').map(([k, n]) => `${n} ${k.replace(/-/g, ' ')}`);
  const crossCheck = `Of ${cc.eligible} controls reported fully in place that the method can cross-check, ${cc.selected} were cross-checked with one further self-reported answer about a practice they depend on: ${(cc.counts ?? {}).consistent ?? 0} consistent${outcomes.length ? `, ${joinList(outcomes)}` : ''}. The other ${cc.untested} were not cross-checked and nothing is concluded about them. These cross-checks compare the organisation's own answers; they are not tests of operation and they change no figure.`;

  // ---- Priority exposures. One order for the whole report: first-priority schemes with a gap, then first-priority
  // schemes whose reported control is unsupported (false comfort is exposure, not reassurance), then the rest, each
  // group in the evidence model's own order.
  const group = (f: MaterialFinding) => { const s = schemeOf(f); return (s.tier === 1 ? 0 : 2) + (s.kind === 'gap' ? 0 : 1); };
  const ranked = [...gapFindings, ...fcFindings].sort((x, y) => group(x) - group(y) || y.materialityScore - x.materialityScore || x.id.localeCompare(y.id)).slice(0, 4);
  const isFc = (s: Scheme) => s.kind === 'false-comfort';
  const gapsOf = (s: Scheme) => (isFc(s) ? s.supportGaps : [...s.confirmGaps, ...s.supportGaps]);
  const whyOf = (s: Scheme) => sentence(s.why) || (s.risks.length ? `The method links it to ${joinList(s.risks.map((r) => lc(r.name ?? '')).filter(Boolean).slice(0, 2))}.` : sentence(s.how));
  const interruption = (s: Scheme) => {
    const g = gapsOf(s);
    const std = g.map(standardOf).find((x): x is string => !!x && x.length <= 160);
    if (std) return std;
    const test = g.map((m) => `Every case passes this test: ${m.q?.text ?? m.c.text}`).find((x) => x.length <= 160 && !VALIDATOR_CONFLICT.test(x));
    return test ?? `Put in place: ${fit(g.map((m) => lc(keyOf(m))), 140)}.`;
  };
  const exposures = ranked.map((f, i) => {
    const s = schemeOf(f);
    const g = gapsOf(s);
    const answered = s.members.filter((m) => m.c.answer && m.c.class);
    const basis = isFc(s) ? [s.confirms[0], ...g.slice(0, 2)] : g.slice(0, 3);
    return {
      rank: i + 1, family: s.id, exposure: s.name, whyItMatters: whyOf(s),
      assessmentBasis: basis.map((m) => ({ title: keyOf(m), score: CLASS_SHORT[m.c.class ?? ''] as unknown as number })),
      potentialConsequence: f.likelyFinancialImpact, drivers: [], interruptionPoint: interruption(s), priority: `Priority ${i + 1}`,
      priorityBasis: `${s.tier === 1 ? 'First-priority scheme' : 'Second-priority scheme'}; ${isFc(s)
        ? `its control is reported in place, but ${g.length === 1 ? 'a practice it relies on is a gap' : `${g.length} practices it relies on are gaps`}.`
        : `${g.length} of the ${answered.length} controls answered ${g.length === 1 ? 'is a gap' : 'are gaps'}.`}`
    };
  });

  // ---- Scenarios: how the top schemes would work here.
  const scenarios = ranked.slice(0, 3).map((f, i) => {
    const s = schemeOf(f);
    const g = gapsOf(s);
    const risk = s.risks.map((r) => r.name).filter(Boolean) as string[];
    const breakItems = isFc(s) ? [`${keyOf(s.confirms[0])} reported in place`, ...g.map((m) => `${lc(keyOf(m))} ${lc(CLASS_SHORT[m.c.class ?? ''])}`)] : g.map((m, j) => `${j ? lc(keyOf(m)) : keyOf(m)} ${lc(CLASS_SHORT[m.c.class ?? ''])}`);
    return {
      scenarioId: `SCHEME-${i + 1}`, family: s.id, scenarioFamily: s.id, title: s.name,
      entryPoint: sentence(s.how), entryPointShort: shortText(s.how, 90, s.name),
      controlBreak: (isFc(s) ? [s.confirms[0], ...g.slice(0, 2)] : g.slice(0, 3)).map(stateOf).join(' '),
      controlBreakShort: fit(breakItems, 90, (x) => x.join('; ')),
      exposureShort: shortText(risk[0] ?? f.likelyFinancialImpact, 90, 'Loss before the gap is noticed'),
      howItUnfolds: `${sentence(s.how)} ${whyOf(s)} Here, ${isFc(s) ? `${lc(keyOf(s.confirms[0]))} is reported in place, but ` : ''}${g.slice(0, 2).map((m) => lc(stateOf(m)).replace(/\.$/, '')).join('; ')}.`,
      warningIndicators: risk.slice(0, 3),
      immediateInterruption: (evidence.scenarios.find((x) => x.scenarioType === s.id)?.immediateContainment) ?? ''
    };
  });

  // ---- Management priorities: one outcome per scheme in the same order, then outstanding information.
  const owners = (f: MaterialFinding) => (f.accountableOwner === f.processOwner ? f.accountableOwner : `${f.accountableOwner}, with the ${lc(f.processOwner)}`);
  const priorities: EssentialReportPresentationModel['priorities']['rows'] = ranked.slice(0, out.length ? 4 : 5).map((f, i) => {
    const s = schemeOf(f);
    const g = gapsOf(s);
    const target = g.map(standardOf).filter((x): x is string => !!x && !ARTEFACT.test(x));
    if (isFc(s)) {
      return {
        rank: i + 1, outcome: fit([`Confirm that ${lc(keyOf(s.confirms[0]))} works in practice`], 90, (x) => x.join('')),
        whyNow: `Reported in place to stop ${schemeWhere(s.name)}, but ${g.length === 1 ? 'a practice it relies on is a gap' : `${g.length} of the practices it relies on are gaps`}.`,
        accountableRole: owners(f), betterLooksLike: target[0] ?? targetFor(g[0]), evidenceArtefact: f.evidenceToRequest.join(' ')
      };
    }
    return {
      rank: i + 1, outcome: keysPhrase(g.map((m) => keyOf(m)), 90),
      whyNow: `Stops ${schemeWhere(s.name)}. ${g.length === 1 ? 'Its control is a gap today.' : `${g.length} of its controls are gaps today.`}`,
      accountableRole: owners(f), betterLooksLike: target.length ? target.slice(0, 2).join(' ') : targetFor(g[0]), evidenceArtefact: f.evidenceToRequest.join(' ')
    };
  });
  const fcBeyond = fc.filter((s) => !ranked.some((f) => schemeOf(f) === s)).length;
  if (fcBeyond && priorities.length < 6 && !out.length) {
    priorities.push({
      rank: priorities.length + 1, outcome: `Confirm the ${fcBeyond} other unsupported controls`,
      whyNow: `${plural(fcBeyond, 'further control is', 'further controls are')} reported in place while practices ${fcBeyond === 1 ? 'it relies' : 'they rely'} on were reported as gaps.`,
      accountableRole: 'Each process owner named in the supporting register',
      betterLooksLike: 'Every control relied on to stop a first-priority scheme is supported by the practices it depends on, confirmed by the person who runs it.'
    });
  }
  if (out.length) {
    priorities.push({
      rank: priorities.length + 1, outcome: `Obtain the ${out.length} outstanding answers`,
      whyNow: `${out.filter((o) => o.reason === 'declined').length} were declined, ${out.filter((o) => o.reason.startsWith('not-known')).length} were not known and ${out.filter((o) => o.reason === 'waiting').length} are waiting. Until they are answered, the schemes they affect are unknown, not covered.`,
      accountableRole: 'The assessment coordinator, with each function named',
      betterLooksLike: 'Every applicable control has an answer from the person who runs it, or is recorded as an open risk with a named owner and date.'
    });
  }

  // ---- Roadmap: three windows, built from the evidence model's own periods and owners.
  // One page holds three windows of two or three actions; the deliverable names the first record the step leaves.
  const firstRecord = (s: string) => (s.split(/(?<=\.)\s/)[0] ?? s).trim();
  const actionsFor = (period: string, n: number) => evidence.roadmapActions.filter((r) => r.period === period).slice(0, n).map((r) => ({
    action: r.deliverable, owner: r.processOwner, deliverable: firstRecord(r.evidenceOfCompletion || r.successMeasure), completionTest: r.successMeasure, dependsOn: r.dependencyIds
  }));
  const decision = (id: string) => evidence.leadershipDecisions.find((d) => d.id === id);
  const mandate = decision('DEC-MANDATE');
  const all30 = actionsFor('30 days', 12);
  const stage30 = all30.slice(0, 2);
  if (mandate) stage30.unshift({ action: mandate.decisionRequired, owner: mandate.accountableExecutive, deliverable: mandate.immediateNextDeliverable, completionTest: 'Every first-priority scheme has a named executive and a date.', dependsOn: [] });
  // Thirty-day work beyond what one window holds moves to the next window rather than being dropped.
  const stage60 = [...actionsFor('60 days', 2), ...all30.slice(2)].slice(0, 2);
  const stage90 = [...actionsFor('90 days', 1), ...all30.slice(4)].slice(0, 1);
  const cadence = decision('DEC-CADENCE');
  if (cadence && stage90.length < 2) stage90.push({ action: cadence.decisionRequired, owner: cadence.accountableExecutive, deliverable: cadence.immediateNextDeliverable, completionTest: 'Three monthly scheme status reports received and minuted.', dependsOn: [] });
  const fallback = { action: 'Review the scheme status against this report and re-plan the next quarter.', owner: base.priorities.rows[0]?.accountableRole ?? 'Senior management', deliverable: 'An updated scheme status.', completionTest: 'Status reviewed by the oversight body.', dependsOn: [] };
  const stages = [
    { stage: '30 days: Contain and complete the picture', window: '0–30 days', primaryOutcome: out.length ? 'Owners are named, outstanding answers are obtained and the most exposed schemes are contained.' : 'Owners are named and the most exposed schemes are contained.', actions: stage30.slice(0, 3) },
    { stage: '60 days: Close the first-priority gaps', window: '31–60 days', primaryOutcome: 'The controls that stop the first-priority schemes operate for every case.', actions: stage60.length ? stage60 : [fallback] },
    { stage: '90 days: Extend and embed', window: '61–90 days', primaryOutcome: 'Second-priority schemes are addressed and the scheme status is reported each month.', actions: stage90.length ? stage90 : [{ ...fallback, action: 'Confirm every control put in place has operated for a full cycle.' }] }
  ].map((st) => ({ ...st, actions: st.actions.length ? st.actions : [fallback] }));

  // ---- Dashboard: today's reported practice against the in-place standard, in the method's words.
  const dashboard = ranked.slice(0, 4).map((f) => {
    const s = schemeOf(f);
    const m = gapsOf(s)[0];
    return { measure: keyOf(m), current: stateOf(m), expectation: targetFor(m) };
  });
  if (out.length) dashboard.push({ measure: 'Outstanding answers', current: `${out.length} outstanding (${out.filter((o) => o.reason === 'declined').length} declined).`, expectation: 'None outstanding, or each recorded as an open risk with an owner.' });
  if (fc.length) dashboard.push({ measure: 'Controls reported in place but unsupported', current: `${fc.length} of the controls reported in place.`, expectation: 'Each confirmed by its process owner, with its practices in place.' });

  const conclusion = openT1.length
    ? `${org} is not starting from zero: ${covered.length} schemes have every control that stops them reported in place. The work is concentrated. ${openT1.length} first-priority schemes, most of them in ${joinList(topAreas)}, need the specific controls named in this report, owned by the people the method names for them.${fc.length ? ` Management should also not rely on ${fc.length === 1 ? 'the control' : `the ${fc.length} controls`} reported in place whose own practices were reported as gaps until ${fc.length === 1 ? 'its owner confirms how it works' : 'their owners confirm how they work'}.` : ''}`
    : `${org} reports every first-priority scheme as covered.${fc.length ? ` The priority is to make sure the ${plural(fc.length, 'control', 'controls')} whose practices were reported as gaps hold in practice.` : ''}`;
  const reportBasis = `This report is based on the organisation's own answers to the MK Fraud Readiness review, given by the respondent and the accountable functions named in it, and read against the draft review method, which MK has not yet approved. MK has not independently tested whether controls operate in practice, and no evidence was reviewed; evidence review is a separate Advisory service. ${input.fixtureLabel}`;

  const pages: EssentialPage[] = ([
    { page: 1, question: 'What is the overall judgement?', heading: 'Cover', kind: 'cover', exhibitIds: [] },
    { page: 2, question: 'What does the assessment show?', heading: 'Fraud readiness at a glance', kind: 'overview', exhibitIds: [base.readinessScore.exhibitId, base.domainProfile.exhibitId], commentary: overview },
    { page: 3, question: 'Why does the position look like this?', heading: 'What is driving the position', kind: 'diagnosis', exhibitIds: ['EX-DIAGNOSIS-MATRIX'] },
    ...(exposures.length ? [{ page: 4, question: 'Where does fraud exposure matter most?', heading: 'Priority fraud schemes', kind: 'exposure' as const, exhibitIds: ['EX-PRIORITY-EXPOSURE'] }] : []),
    ...(scenarios.length ? [{ page: 5, question: 'How could that exposure materialise?', heading: 'How the schemes would work here', kind: 'scenarios' as const, exhibitIds: ['EX-SCENARIO-PATHWAYS'] }] : []),
    { page: 6, question: 'What does management need to change?', heading: 'What management should change', kind: 'priorities', exhibitIds: ['EX-MANAGEMENT-PRIORITIES'] },
    { page: 7, question: 'What should happen in the first 90 days?', heading: 'The first 90 days', kind: 'roadmap', exhibitIds: ['EX-ROADMAP'] },
    { page: 8, question: 'How will management know whether readiness is improving?', heading: 'What to check at the 90-day point', kind: 'dashboard', exhibitIds: ['EX-MANAGEMENT-METRICS'] }
  ] as EssentialPage[]).map((p, i) => ({ ...p, page: i + 1 }));

  const refs = (fs: MaterialFinding[]) => fs.map((f) => f.id);
  return {
    ...base,
    narrativeMode: evidence.narrativeMode ?? base.narrativeMode,
    cover: { ...base.cover, centralJudgement: judgement },
    materialContrasts: undefined,
    diagnosis: { exhibitId: 'EX-DIAGNOSIS-MATRIX', sourceRefs: refs([...gapFindings, ...fcFindings]).slice(0, 12), title: 'What is driving the position', rows: [...areaRows, ...fcRows], interpretation: crossCheck },
    strengths: undefined, watchpoints: undefined, unownedScenarios: [],
    exposures: exposures.length ? { exhibitId: 'EX-PRIORITY-EXPOSURE', sourceRefs: refs(ranked), title: 'Priority fraud schemes', rows: exposures } : undefined,
    scenarios: scenarios.length ? { exhibitId: 'EX-SCENARIO-PATHWAYS', sourceRefs: refs(ranked.slice(0, 3)), title: 'How the schemes would work here', scenarios, assuranceNote: 'These are plausible schemes for an organisation with the controls it reported. They are not allegations that these events have occurred.' } : undefined,
    priorities: { exhibitId: 'EX-MANAGEMENT-PRIORITIES', sourceRefs: refs(ranked), title: 'What management should change', rows: priorities },
    roadmap: { exhibitId: 'EX-ROADMAP', sourceRefs: evidence.roadmapActions.map((r) => r.id).slice(0, 12), title: 'The first 90 days', stages },
    dashboard: { exhibitId: 'EX-MANAGEMENT-METRICS', sourceRefs: refs(ranked), title: 'What to check at the 90-day point', rows: dashboard, baselineSource: 'assessed-condition' },
    conclusion, reportBasis, pages
  };
}

/** Wraps the unchanged renderer's output: a visible fixture banner, and the exposure caption corrected for scheme order. */
export function labelRevisedEssentialHtml(html: string, banner: string): string {
  return html
    .replace('<body>', `<body><div style="position:fixed;top:0;left:0;right:0;z-index:9;background:#7a1f1f;color:#fff;font:600 7.5pt/1.4 sans-serif;padding:1.2mm 4mm;text-align:center">${banner}</div>`)
    .replace('Ordered by the weakest capability supporting each exposure. The order indicates where to act first; it is not a risk rating, and closely ranked exposures may warrant similar attention.',
      'Ordered by the draft method\'s scheme priority and the number of controls reported as gaps. The order indicates where to act first; it is not a risk rating.');
}
