import coverage from '@/lib/readiness-review/data/coverage-map-v1.3.json' with { type: 'json' };
import bank from '@/lib/readiness-review/data/bank-v1.3.json' with { type: 'json' };
import type { StagedReportInput, ControlRecord } from '@/lib/readiness-review/report-input';
import { contentRegistry, type RevisedQuestionContent } from '@/lib/reports/methodology-content';
import { essentialSelectionScore } from '@/lib/reports/essential-projection';
import type {
  AdvisoryEvidenceModel, Contradiction, ContradictionPattern, ControlImprovementEntry, EvidenceChecklistItem, FunctionalAgendaItem,
  ImplementationDifficulty, LeadershipDecision, MaterialFinding, MaterialFindingSelectionReason, PlausibleScenario, RiskRegisterEntry,
  RoadmapAction, SustainmentPriority, TargetPeriod, VisibilityGap
} from '@/lib/reports/evidence-model/types';
import { familyFor } from './semantic-map';

/**
 * FICTIONAL INTEGRATION PROTOTYPE. Not used by any customer path.
 *
 * Builds the existing `AdvisoryEvidenceModel` from a staged review session (report input 1.3.0) and the draft method's
 * own content (bank 1.3, coverage map 1.3), so that the unchanged Essential and Comprehensive engines can be fed the
 * richer assessment. The unit of analysis is the fraud scheme (the method's scenario), not the single question: a
 * finding names the scheme, the controls that stop it, the answers given for each of them, who gave those answers and
 * what the method says management should hold. Nothing is scored; no maturity cap, penalty or weighting is applied,
 * and consistency outcomes are reported as self-reported cross-checks, never as test results.
 *
 * Presentation conventions used here that MK has not approved (listed in REPORT-COMPARISON.md, section 6): the mapping
 * of scenario tier and answer class to the existing selection reasons, risk priority, likelihood and impact labels, and
 * the 30, 60 and 90-day sequencing. They order and label a fictional report; they are not a risk rating.
 */

export const REVISED_EVIDENCE_MODEL_VERSION = 'revised-evidence-model-prototype-0.1.0';
export const REVISED_METHOD_LABEL = 'Review bank 1.3 (draft, not approved by MK)';

type Cov = {
  scenarios: { id: string; domain: string; name: string; tier: number; how?: string; why?: string; confirm?: [unknown, string][]; followups?: string[]; related?: string[] }[];
  crossObjectives: { id: string; name: string; questions: string[] }[];
};
type BankShape = { domains: { id: string; name: string; bank: { risks?: Record<string, string>; modules: { id: string; owner?: string; questions: { id: string }[] }[] } }[] };
const COV = coverage as unknown as Cov;
const BANK = bank as unknown as BankShape;
const REG = contentRegistry('revised-review');

const GAP = new Set(['absent', 'partial', 'designed']);
const CLASS_RANK: Record<string, number> = { absent: 0, designed: 1, partial: 2, full: 3 };
const CLASS_SHORT: Record<string, string> = {
  full: 'in place',
  partial: 'only in some areas, cases or periods',
  designed: 'set out but not yet working in practice',
  absent: 'not in place'
};
/** Who is accountable for an area: the owner the method names for the area's opening module. */
const AREA_EXECUTIVE = new Map(BANK.domains.map((d) => [d.id, d.bank.modules[0]?.owner ?? 'Senior management']));
const AREA_NAME = new Map(BANK.domains.map((d) => [d.id, d.name]));
const SCENARIO = new Map(COV.scenarios.map((s) => [s.id, s]));

/** The domain code used inside the existing engines. Namespaced so MFRS domain weights can never apply to a bank area. */
export const revisedDomainCode = (bankArea: string) => `R${bankArea}`;

/** How often a control in a module operates, in the method's terms; a plain default where the module has no natural cycle. */
const MODULE_CYCLE: Record<string, string> = {
  onboarding: 'Every new supplier, customer or employee before activation', bankdetails: 'Every change to banking details, before the next payment',
  payment: 'Every payment run', orders: 'Every order before commitment', receiving: 'Every delivery or service before payment', contracts: 'Every contract and variation',
  payrun: 'Every pay run', payroll: 'Every pay run', leavers: 'Every leaver, before the next pay run', recruitment: 'Every appointment',
  cash: 'Every shift or banking cycle', stock: 'Every count cycle', counts: 'Every count cycle', access: 'Every joiner, mover and leaver, and quarterly review',
  email: 'Continuous, with monthly review', impersonation: 'Every payment or change instruction received electronically', speakup: 'Continuous, with quarterly reporting',
  intake: 'Every report received', investigation: 'Every case', evidence: 'Every case', monitoring: 'Monthly', detection: 'Monthly', platform: 'Every payment batch',
  accounts: 'Every change to accounts or signatories', manual: 'Every manual payment or journal', ownership: 'Annual review of mandates', oversight: 'Each governance meeting'
};
/** What a successful scheme costs, by the existing engines' fraud-pathway family. Plain statements, no amounts. */
const PATHWAY_IMPACT: Record<string, { financial: string; operational: string }> = {
  SUPPLIER_PAYMENT_DIVERSION: { financial: 'Funds paid to a diverted, fictitious or overbilling supplier, often unrecoverable once released.', operational: 'Supplier relationships, payment runs and the supplier master file would need to be investigated and corrected.' },
  THIRD_PARTY_COLLUSION: { financial: 'Inflated prices, kickbacks or undisclosed interests that cost the organisation over the life of the relationship.', operational: 'Procurement decisions and contracts may need to be reopened, and staff conduct investigated.' },
  PAYROLL_MANIPULATION: { financial: 'Salaries paid to fictitious, departed or overpaid employees, recurring every pay run until found.', operational: 'Payroll records, leave and overtime would need to be reconstructed and corrected.' },
  PRIVILEGED_ACCESS_MISUSE: { financial: 'Records, payments or assets changed by someone with more access than their role needs.', operational: 'Access, approvals and transaction history would need to be reviewed across the affected systems.' },
  IDENTITY_IMPERSONATION: { financial: 'Payments, credit or goods released to someone impersonating a supplier, customer, employee or executive.', operational: 'Accounts and instructions would need to be revalidated and affected parties contacted.' },
  CASH_CUSTODY_MISUSE: { financial: 'Cash taken before or after it is recorded, typically in small amounts over a long period.', operational: 'Cash records, banking and till reconciliations would need to be rebuilt for the affected period.' },
  STOCK_ASSET_MISUSE: { financial: 'Stock or assets removed, written off or misstated without detection.', operational: 'Counts, write-offs and stock records would need to be reconciled and adjusted.' },
  DETECTION_EVASION: { financial: 'Losses grow because unusual activity is not seen or challenged in time.', operational: 'Management would learn of the loss late, from a third party, an audit or a complaint.' },
  INCIDENT_CONCEALMENT: { financial: 'Recoveries are lost because a case is not reported, contained or evidenced.', operational: 'Cases may be handled inconsistently, evidence may be lost and legal reporting duties missed.' }
};

type Member = { c: ControlRecord; q: RevisedQuestionContent | null };
type ScenarioPicture = {
  id: string; name: string; tier: number; area: string; how: string; why: string;
  members: Member[]; confirms: Member[]; confirmGaps: Member[]; supportGaps: Member[]; inPlace: Member[]; outstanding: Member[];
  precludes: { by: Member; keys: string[] }[]; risks: { id: string; name: string | null }[]; cross: { id: string; name: string }[];
  consistency: { outcome: string; outcomeLabel: string; confirmation: string; followup: string } | null;
  kind: 'gap' | 'false-comfort' | 'confirmed' | 'outstanding' | 'none';
};

/** A scheme name is a sentence ("Ghost employees are paid"); this lets it sit inside another sentence. */
export const schemeWhere = (name: string) => `the scheme where ${lc(String(name).replace(/\.$/, ''))}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** Short area names for prose, so a list of areas does not nest the commas inside their full names. */
export const AREA_SHORT: Record<string, string> = { D1: 'governance', D2: 'risk assessment', D3: 'ethics and anti-corruption', D4: 'procurement and third parties', D5: 'people and payroll', D6: 'finance and banking', D7: 'customers and revenue', D8: 'cash, stock and assets', D9: 'digital and identity', D10: 'detection and response' };
const lc = (s: string) => (s && !/^[A-Z]{2,}/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const sentence = (s: string) => { const t = String(s ?? '').trim(); return t ? (/[.!?]$/.test(t) ? t : `${t}.`) : ''; };
const unique = <T,>(xs: T[]) => [...new Set(xs.filter((x) => x !== null && x !== undefined && x !== '' as unknown))];
const joinList = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const keyOf = (m: Member) => m.c.key ?? m.q?.key ?? m.c.id;

function levelOf(m: Member): number | null {
  if (m.c.format !== 'anchored' || !m.c.answer) return null;
  const n = Number(m.c.answer.value);
  return Number.isInteger(n) && n >= 0 && n <= 5 ? n : null;
}
/** What the organisation reported, in the method's own words where the method has them. */
function reportedState(m: Member): string {
  const level = levelOf(m);
  if (level !== null && m.q?.levels?.[level]) return sentence(m.q.levels[level]);
  return `${keyOf(m)}: ${CLASS_SHORT[m.c.class ?? ''] ?? m.c.answer?.label ?? 'not answered'}.`;
}
/** The standard at which the method treats the control as in place (level 4), or the in-place answer for a practice. */
function standardOf(m: Member): string {
  if (m.c.format === 'anchored' && m.q?.levels?.[4]) return sentence(m.q.levels[4]);
  return `${keyOf(m)}: the answer to "${m.q?.text ?? m.c.text}" is yes, across everything it should cover.`;
}
/** The improving level beyond in place (level 5), where the method describes one. */
function targetOf(m: Member): string {
  if (m.c.format === 'anchored' && m.q?.levels?.[5]) return sentence(m.q.levels[5]);
  return standardOf(m);
}
function recordsOf(m: Member): string[] {
  const r = m.q?.recordsManagementShouldHold;
  if (!r) return [];
  return (Array.isArray(r) ? r : [r]).map((x) => sentence(String(x))).filter(Boolean);
}
const answeredBy = (m: Member) => (m.c.answer?.by && m.c.answer.by !== 'Respondent' ? m.c.answer.by : null);

/**
 * Information that was asked for and not given: a question waiting for a function, a function's or the respondent's
 * "I don't know", or (counted by the caller) a decline. A supporting practice that sits in an area handed to a function
 * but that nobody is ever asked (the function's area screen serves only what the method asks) is not outstanding: it is
 * not established, exactly as it would be in an area the respondent kept. This matches the interface's count.
 * A question whose applicability depends on an outstanding answer is not counted separately.
 */
function outstandingOf(c: ControlRecord): boolean {
  // A question whose applicability waits on another outstanding answer is counted once, through that answer.
  const kind = (c.waiting?.provenance as { kind?: string } | undefined)?.kind;
  if (c.waiting) return kind !== 'scope-waiting' && (c.role === 'confirm' || kind !== 'area' || !!c.answer);
  return !!c.answer && (c.answer.value === 'unknown' || (Array.isArray(c.answer.value) && (c.answer.value as unknown[]).includes('unknown')));
}

export type RevisedAnalysis = ReturnType<typeof analyseStagedInput>;

/** The scheme-level picture: every applicable scenario with its confirmations, supporting practices and open items. */
export function analyseStagedInput(input: StagedReportInput) {
  const controls = (input.domains as { controls: ControlRecord[] }[]).flatMap((d) => d.controls);
  const byId = new Map(controls.map((c) => [c.id, c]));
  const member = (c: ControlRecord): Member => ({ c, q: REG.question(c.id) });
  const declined = new Map((input.staged.packages as { id: string; status: string; function: string; declineReason: string | null }[]).filter((p) => p.status === 'declined').map((p) => [p.id, p]));
  const precluded = (input.openWork.precluded ?? []) as { by: string; byKey: string; controls: string[] }[];
  const checks = (input.staged.consistency.checks ?? []) as { scenario: string; outcome: string; outcomeLabel: string; confirmation: string; followup: string }[];
  const crossOf = (id: string) => COV.crossObjectives.filter((o) => o.questions.includes(id)).map((o) => ({ id: o.id, name: o.name }));

  const scenarios: ScenarioPicture[] = (input.scenarios as { id: string; status: string; tier: number; domain: string; name: string; confirmations: { id: string }[] }[])
    .filter((s) => s.status !== 'outofscope')
    .map((s) => {
      const def = SCENARIO.get(s.id);
      const members = controls.filter((c) => c.scenario?.id === s.id && c.type === 'practice' && ['confirm', 'related', 'followup'].includes(c.role ?? '')).map(member);
      const confirmIds = new Set(s.confirmations.map((x) => x.id));
      const confirms = members.filter((m) => confirmIds.has(m.c.id));
      const known = members.filter((m) => m.c.answer && !outstandingOf(m.c) && m.c.class);
      const confirmGaps = confirms.filter((m) => known.includes(m) && GAP.has(m.c.class!)).sort((a, b) => CLASS_RANK[a.c.class!] - CLASS_RANK[b.c.class!]);
      const supportGaps = members.filter((m) => !confirmIds.has(m.c.id) && known.includes(m) && GAP.has(m.c.class!)).sort((a, b) => CLASS_RANK[a.c.class!] - CLASS_RANK[b.c.class!]);
      const inPlace = known.filter((m) => m.c.class === 'full');
      const outstanding = members.filter((m) => outstandingOf(m.c) || declined.has(m.c.id));
      const confirmsKnownFull = confirms.length > 0 && confirms.every((m) => known.includes(m) && m.c.class === 'full');
      const confirmsOutstanding = confirms.some((m) => outstanding.includes(m));
      const kind: ScenarioPicture['kind'] = confirmGaps.length ? 'gap'
        : confirmsKnownFull && supportGaps.length ? 'false-comfort'
          : confirmsKnownFull ? 'confirmed'
            : confirmsOutstanding ? 'outstanding' : 'none';
      const precludes = precluded.filter((p) => members.some((m) => m.c.id === p.by)).map((p) => ({ by: member(byId.get(p.by)!), keys: p.controls.map((id) => byId.get(id)?.key ?? id) }));
      const anyQ = members.find((m) => m.q)?.q;
      const risks = unique(members.flatMap((m) => (m.q?.risks ?? []).map((r) => JSON.stringify(r)))).map((r) => JSON.parse(r) as { id: string; name: string | null });
      const check = checks.find((c) => c.scenario === s.id) ?? null;
      return {
        id: s.id, name: def?.name ?? s.name, tier: s.tier, area: s.domain, how: def?.how ?? anyQ?.scenario?.how ?? '', why: def?.why ?? anyQ?.scenario?.why ?? '',
        members, confirms, confirmGaps, supportGaps, inPlace, outstanding, precludes, risks,
        cross: unique(members.flatMap((m) => crossOf(m.c.id).map((o) => JSON.stringify(o)))).map((o) => JSON.parse(o)),
        consistency: check, kind
      };
    });

  // Outstanding information, across every applicable confirmation and supporting practice that was asked.
  const outstandingItems = controls.filter((c) => c.type === 'practice' && c.state !== 'outofscope' && (outstandingOf(c) || declined.has(c.id))).map((c) => {
    const d = declined.get(c.id);
    const reason = d ? 'declined' : c.answer && c.answer.value === 'unknown' ? (c.answer.by && c.answer.by !== 'Respondent' ? 'not-known-by-function' : 'not-known-by-respondent') : 'waiting';
    return { c, q: REG.question(c.id), reason, fn: d?.function ?? c.waiting?.function ?? (c.answer?.by !== 'Respondent' ? c.answer?.by : null) ?? null, declineReason: d?.declineReason ?? null };
  });
  const consistency = input.staged.consistency as { eligible: number; selected: number; answered: number; untested: number; counts: Record<string, number>; limitation: string };
  return { scenarios, outstandingItems, consistency, profile: input.profile as { id: string; value: unknown; label: string }[], controls, byId };
}

// ------------------------------------------------------------------------------------------------ evidence model

export function buildRevisedEvidenceModel(input: StagedReportInput): { model: AdvisoryEvidenceModel; analysis: RevisedAnalysis } {
  const a = analyseStagedInput(input);
  const governance = String(a.profile.find((p) => p.id === 'PR-04')?.value ?? '');
  const oversight = governance === 'board' ? 'The board or its audit committee' : governance === 'owners' ? 'The owners' : 'Senior management';
  const pathwayOf = (s: ScenarioPicture) => familyFor(s.area, s.members[0]?.c.module?.id).pathways[0] ?? 'DETECTION_EVASION';
  const subject = (s: ScenarioPicture) => (s.kind === 'gap' ? s.confirmGaps[0] : s.confirms[0]);

  const findingScenarios = a.scenarios.filter((s) => s.kind === 'gap' || s.kind === 'false-comfort');
  const findings: MaterialFinding[] = [];
  const risks: RiskRegisterEntry[] = [];
  const improvements: ControlImprovementEntry[] = [];
  const checklist: EvidenceChecklistItem[] = [];
  const scenarios: PlausibleScenario[] = [];
  const contradictions: Contradiction[] = [];
  const roadmap: RoadmapAction[] = [];
  const agenda: FunctionalAgendaItem[] = [];

  for (const s of findingScenarios) {
    const anchor = subject(s);
    const fam = familyFor(s.area, anchor.c.module?.id);
    const gaps = s.kind === 'gap' ? [...s.confirmGaps, ...s.supportGaps] : s.supportGaps;
    const answered = s.members.filter((m) => m.c.answer && !outstandingOf(m.c));
    const absentConfirm = s.confirmGaps.some((m) => m.c.class === 'absent');
    const reasons: MaterialFindingSelectionReason[] = [];
    if (s.kind === 'gap') {
      if (s.tier === 1) reasons.push('CRITICAL_GAP');
      if (s.tier === 2) reasons.push('MAJOR_GAP');
      if (absentConfirm) reasons.push('ABSENT_CONTROL');
      if (s.tier === 1 && absentConfirm) reasons.push('CRITICAL_CONTROL_FAILURE');
    } else reasons.push('MATERIAL_CONTRADICTION');
    if (gaps.length >= 3) reasons.push('PRIORITY_SCENARIO_ENABLER');
    if (s.cross.length) reasons.push('CROSS_DOMAIN_DEPENDENCY');
    const id = `MF-${s.id}`;
    const riskId = `RISK-${s.id}`;
    const ciId = `CI-${s.id}`;
    const level = levelOf(anchor);
    const area = AREA_NAME.get(s.area) ?? s.area;
    const sources = unique(answered.map((m) => answeredBy(m) ?? 'the respondent'));
    const shownGaps = gaps.slice(0, 5);
    const diagnosis = s.kind === 'gap'
      ? `${gaps.length} of the ${plural(answered.length, 'control', 'controls')} answered for this scheme ${gaps.length === 1 ? 'was reported as a gap' : 'were reported as gaps'}. ${shownGaps.map(reportedState).join(' ')}${gaps.length > shownGaps.length ? ` ${gaps.length - shownGaps.length} further gaps are listed in the register.` : ''} Reported by ${joinList(sources)}; not independently tested.`
      : `${joinList(s.confirms.map((m) => lc(keyOf(m))))} ${s.confirms.length > 1 ? 'were' : 'was'} reported in place, but ${plural(s.supportGaps.length, 'practice', 'practices')} that ${s.confirms.length > 1 ? 'they rely' : 'it relies'} on ${s.supportGaps.length > 1 ? 'were' : 'was'} reported as ${s.supportGaps.length > 1 ? 'gaps' : 'a gap'}. ${s.supportGaps.slice(0, 4).map(reportedState).join(' ')} The confirmation may therefore give more comfort than the practice supports. Reported by ${joinList(sources)}; not independently tested.`;
    const precludeText = s.precludes.filter((p) => gaps.some((g) => g.c.id === p.by.c.id)).map((p) => `${keyOf(p.by)} is ${CLASS_SHORT[p.by.c.class ?? ''] ?? 'a gap'}, so ${joinList(p.keys.map(lc))} cannot operate`);
    const crossText = s.cross.map((o) => `Part of a requirement that spans several areas: ${lc(o.name)}`);
    const records = unique([...gaps, anchor, ...s.confirms].flatMap(recordsOf));
    const standards = unique(gaps.slice(0, 5).map(standardOf));
    const impact = PATHWAY_IMPACT[pathwayOf(s)] ?? PATHWAY_IMPACT.DETECTION_EVASION;
    const period: TargetPeriod = s.tier === 1 && (absentConfirm || s.kind === 'false-comfort') ? '30 days' : s.tier === 1 ? '60 days' : '90 days';
    const difficulty: ImplementationDifficulty = gaps.length >= 4 ? 'High' : gaps.length >= 2 ? 'Moderate' : 'Low';
    const owner = anchor.q?.module.owner ?? AREA_EXECUTIVE.get(s.area) ?? 'Process owner';
    const executive = AREA_EXECUTIVE.get(s.area) ?? 'Senior management';
    const supporting = unique([...answered.map(answeredBy), ...s.outstanding.map((m) => m.c.waiting?.function ?? null)].filter(Boolean) as string[]);
    const cycle = MODULE_CYCLE[anchor.c.module?.id ?? ''] ?? 'As each case arises, with a monthly review by the process owner';
    const riskNames = s.risks.map((r) => r.name).filter(Boolean) as string[];
    const responseLabel = anchor.c.answer?.label ?? 'Not answered';

    const finding: MaterialFinding = {
      id, title: s.kind === 'gap' ? s.name : `${s.name}: the reported control is not supported by its practices`,
      domainCode: revisedDomainCode(s.area), domainName: area, questionCode: anchor.c.id, questionPrompt: anchor.q?.text ?? anchor.c.text,
      methodologyVersionId: REVISED_METHOD_LABEL, responseValue: level, responseLabel,
      responseOperationalMeaning: s.kind === 'gap' ? reportedState(anchor) : `Reported in place; ${s.supportGaps.length} supporting practice${s.supportGaps.length > 1 ? 's' : ''} reported as gaps.`,
      normalisedScore: null, responseMeaning: `${responseLabel}: ${reportedState(anchor)}`,
      materialityClass: s.kind === 'false-comfort' ? 'assurance_priority' : absentConfirm ? 'control_failure' : 'control_gap',
      selectionReasons: reasons, materialityScore: 0,
      isCriticalControl: s.tier === 1, isHardGate: false, gapClassification: s.tier === 1 ? 'critical' : s.tier === 2 ? 'major' : 'none',
      maturityCapStatus: 'not_capping', relatedCapRuleCodes: [], relatedCapRuleCode: null, linkedExposureFactorCodes: [], linkedScenarioTypes: [s.id],
      primarySemanticFamily: fam.primary, secondarySemanticFamilies: [], fraudPathwayFamilies: fam.pathways,
      diagnosis, whyItMatters: sentence(s.why || `${s.name} is a scheme the method asks about for organisations with this profile`),
      fraudMechanism: `${sentence(s.how)}${riskNames.length ? ` The method links it to ${joinList(riskNames.map(lc))}.` : ''}`,
      likelyFinancialImpact: impact.financial, likelyOperationalImpact: impact.operational,
      expectedControlStandard: standards[0] ?? standardOf(anchor), evidenceToRequest: records,
      recommendedControl: standards.join(' '), accountableOwner: executive, processOwner: owner, oversightFunction: oversight, supportingFunctions: supporting,
      operatingFrequency: cycle, minimumEvidenceCharacteristics: ['Covers every case in the period, not a selection', 'Shows who performed the step and when', 'Exceptions are recorded with their resolution'],
      dependencies: [...precludeText, ...crossText], implementationDifficulty: difficulty, targetPeriod: period,
      effectivenessMeasure: (gaps[0] ?? anchor).c.format === 'anchored' && (gaps[0] ?? anchor).q?.levels?.[4]
        ? `Management's own records show, for every case in the period: ${lc(standardOf(gaps[0] ?? anchor))}`
        : `Management's own records show that every case in the period passes this test: ${(gaps[0] ?? anchor).q?.text ?? (gaps[0] ?? anchor).c.text}`,
      escalationThreshold: `Any suspected case of ${schemeWhere(s.name)}, or any case processed without this control: ${lc(keyOf(gaps[0] ?? anchor))}.`,
      playbookSource: REVISED_METHOD_LABEL, fallbackStatus: 'exact_question_playbook',
      selfAssessmentLimitation: 'Reported by the organisation and its accountable functions. Not tested or validated; MK evidence review is a separate Advisory service.'
    };
    finding.materialityScore = essentialSelectionScore(finding);
    findings.push(finding);

    const priority: RiskRegisterEntry['priority'] = s.tier === 1 ? (absentConfirm ? 'Critical' : 'High') : s.tier === 2 ? 'Medium' : 'Low';
    const cause = s.kind === 'gap'
      ? `the controls that stop it were reported as gaps: ${joinList(gaps.slice(0, 4).map((m) => `${lc(keyOf(m))} (${CLASS_SHORT[m.c.class!]})`))}`
      : `its control is reported in place while ${joinList(s.supportGaps.slice(0, 3).map((m) => `${lc(keyOf(m))} (${CLASS_SHORT[m.c.class!]})`))}`;
    risks.push({
      id: riskId, title: s.name, cause, riskEvent: lc(s.how.replace(/\.$/, '')), financialImpact: impact.financial, operationalImpact: impact.operational,
      riskStatement: `Because ${cause}, there is a risk that ${lc(s.how.replace(/\.$/, ''))}. ${sentence(s.why)}`,
      linkedFindingIds: [id], linkedQuestionCodes: gaps.map((m) => m.c.id), linkedScenarioIds: [`SC-${s.id}`], affectedDomains: [area], affectedDomain: area,
      likelihood: s.kind === 'gap' && absentConfirm ? 'High' : 'Moderate',
      likelihoodRationale: 'Presentation label from the reported answers (a control reported not in place reads High, otherwise Moderate). Not an approved likelihood rating; test fixture for rendering.',
      impact: s.tier === 1 ? 'High' : 'Moderate', impactRationale: 'Presentation label from the scheme tier in the draft method. Not an approved impact rating; test fixture for rendering.',
      priority, currentControlPosition: shownGaps.map(reportedState).join(' '), requiredTreatment: standards.join(' '),
      accountableExecutive: executive, processOwner: owner, oversightFunction: oversight, targetPeriod: period, accountableOwner: executive, targetDate: period,
      effectivenessMeasure: finding.effectivenessMeasure, evidenceRefs: [`finding:${id}`, ...gaps.map((m) => `question:${m.c.id}`)],
      assessmentConfidence: 'Self-assessment only, not independently verified', remainingLimitation: 'Self-reported; not tested.'
    });

    improvements.push({
      id: ciId, linkedFindingId: id, linkedRiskId: riskId, linkedRiskIds: [riskId], linkedQuestionCode: anchor.c.id,
      currentState: shownGaps.map(reportedState).join(' '), targetState: unique(gaps.slice(0, 5).map(targetOf)).join(' '),
      controlObjective: `Stop ${schemeWhere(s.name)}.`,
      controlDesign: gaps.slice(0, 6).map((m, i) => `${i + 1}. ${keyOf(m)}: ${standardOf(m).replace(new RegExp(`^${keyOf(m)}: `), '')}`).join(' '),
      accountableExecutive: executive, processOwner: owner, oversightFunction: oversight, accountableOwner: owner, oversightOwner: oversight,
      supportingFunctions: supporting, operatingFrequency: cycle, completePopulationCoverage: `Every case in scope: ${lc(cycle)}.`,
      evidenceRetained: records, requiredEvidence: records, minimumEvidenceCharacteristics: finding.minimumEvidenceCharacteristics,
      dependencies: finding.dependencies, implementationDependency: finding.dependencies[0] ?? 'None recorded', implementationDifficulty: difficulty, targetPeriod: period,
      effectivenessTest: finding.effectivenessMeasure, escalationThreshold: finding.escalationThreshold,
      failureResponse: `Stop the affected ${lc(cycle.split(',')[0])}, review the cases processed since the last clean record and report to ${lc(oversight)}.`,
      evidenceRefs: [`finding:${id}`]
    });

    for (const m of gaps.slice(0, 6)) {
      for (const record of recordsOf(m)) {
        const eid = `REC-${m.c.id}`;
        if (checklist.some((e) => e.id === eid)) continue;
        checklist.push({
          id: eid, artefact: record, linkedFindingIds: [id], linkedRiskIds: [riskId], linkedQuestionCodes: [m.c.id], linkedFindingId: id, linkedRiskId: riskId,
          likelyOwner: m.q?.module.owner ?? owner, provesWhat: `That ${lc(standardOf(m)).replace(/\.$/, '')}`, expectedRecency: cycle,
          requiredPopulation: 'Every case in the period, held by the process owner', samplingExpectation: 'Management reviews its own records; MK does not request or review them in this product.',
          minimumAcceptableCharacteristics: finding.minimumEvidenceCharacteristics, reviewStatus: 'Not yet requested', evidenceRef: `record:${eid}`
        });
      }
    }

    scenarios.push({
      id: `SC-${s.id}`, scenarioType: s.id, scenarioBasis: s.kind === 'gap' ? 'control_gap' : 'assurance_validation', title: s.name,
      confirmedOperatingContext: a.profile.filter((p) => ['PR-13', 'PR-01'].includes(p.id)).map((p) => p.label),
      entryPoint: sentence(s.how), linkedControlWeaknesses: gaps.map((m) => `${keyOf(m)}: ${CLASS_SHORT[m.c.class!]}`),
      fraudSequence: `${sentence(s.how)} ${sentence(s.why)}`.trim(), controlsExpected: standards,
      concealmentMechanism: s.kind === 'false-comfort'
        ? `${keyOf(s.confirms[0])} is reported in place, so management may not look further while ${joinList(s.supportGaps.slice(0, 2).map((m) => lc(keyOf(m))))} ${s.supportGaps.length > 1 ? 'are' : 'is'} not.`
        : `Without ${joinList(gaps.slice(0, 2).map((m) => lc(keyOf(m))))}, the activity is processed as routine and nothing records the exception.`,
      whyControlsMayNotCatchIt: gaps.slice(0, 3).map(reportedState).join(' '),
      earlyWarningIndicators: riskNames.length ? riskNames : [`Exceptions to ${lc(keyOf(anchor))}`],
      likelyImpact: [impact.financial, impact.operational], financialImpact: impact.financial, operationalImpact: impact.operational,
      immediateContainment: (gaps[0] ?? anchor).c.format === 'anchored' && (gaps[0] ?? anchor).q?.levels?.[4]
        ? `Until the design operates, the process owner checks every new case and the recent ones by hand against this standard: ${lc(standardOf(gaps[0] ?? anchor))}`
        : `Until the design operates, the process owner puts every new case and the recent ones to this test by hand: ${(gaps[0] ?? anchor).q?.text ?? (gaps[0] ?? anchor).c.text}`,
      longerTermResponse: unique(gaps.slice(0, 3).map(targetOf)).join(' '),
      linkedFindingIds: [id], linkedQuestionCodes: gaps.map((m) => m.c.id), linkedRiskIds: [riskId], linkedRiskId: riskId,
      evidenceRefs: [`finding:${id}`], disclaimer: 'A plausible scheme for an organisation with the reported controls. It is not an allegation that it has occurred.'
    });

    if (s.kind === 'false-comfort') {
      contradictions.push({
        id: `CX-${s.id}`, pattern: 'revised_reported_confirmation_unsupported' as unknown as ContradictionPattern,
        title: `${keyOf(s.confirms[0])} is reported in place, but its supporting practices are not`,
        drivingResponses: [...s.confirms, ...s.supportGaps.slice(0, 3)].map((m) => `${keyOf(m)}: ${m.c.answer?.label ?? ''}`).join('; '),
        whyItMatters: `A control reported in place stops ${schemeWhere(s.name)} only if the practices it relies on also operate.`,
        falseComfortRisk: `Management may treat ${schemeWhere(s.name)} as covered on the strength of one self-reported answer.`,
        whatLeadershipShouldVerify: `Ask ${owner} to confirm how ${lc(keyOf(s.confirms[0]))} works when ${joinList(s.supportGaps.slice(0, 2).map((m) => lc(keyOf(m))))} ${s.supportGaps.length > 1 ? 'are' : 'is'} not in place.`,
        fraudPathwayEnabled: sentence(s.how), linkedFindingIds: [id], linkedRiskId: riskId, evidenceRefs: [`finding:${id}`, `risk:${riskId}`], materialityScore: finding.materialityScore
      });
    }

    roadmap.push({
      id: `RA-${s.id}`, period, domainCode: revisedDomainCode(s.area), domainName: area,
      deliverable: s.kind === 'false-comfort'
        ? `Confirm with ${owner} how ${lc(keyOf(s.confirms[0]))} operates and put in place ${joinList(s.supportGaps.slice(0, 3).map((m) => lc(keyOf(m))))}.`
        : `Close ${schemeWhere(s.name)}: put in place ${joinList(gaps.slice(0, 4).map((m) => lc(keyOf(m))))}.`,
      accountableExecutive: executive, processOwner: owner, oversightFunction: oversight, supportingFunctions: supporting,
      linkedFindingIds: [id], linkedRiskIds: [riskId], dependencyIds: [], escalationThreshold: finding.escalationThreshold, evidenceRefs: [`finding:${id}`],
      accountableOwner: owner, linkedFindingId: id, linkedRiskId: riskId, dependency: finding.dependencies[0] ?? 'None', implementationDifficulty: difficulty,
      successMeasure: finding.effectivenessMeasure, evidenceOfCompletion: records.join(' ') || `${owner} confirms in writing that the controls operate for every case.`
    });

    agenda.push({
      id: `AGENDA-${s.id}`, function: owner,
      question: `Who will put in place ${joinList(gaps.slice(0, 3).map((m) => lc(keyOf(m))))} to stop ${schemeWhere(s.name)}, by when, and which records will show it operating?`,
      linkedFindingId: id, linkedRiskId: riskId, evidenceRefs: [`finding:${id}`]
    });
  }

  // Outstanding information: never resolved silently. One visibility gap per outstanding confirmation, and a first-30-day
  // roadmap action that obtains the answers before any conclusion is drawn on the schemes they affect.
  const visibilityGaps: VisibilityGap[] = a.outstandingItems.filter((o) => o.c.role === 'confirm').map((o) => {
    const s = SCENARIO.get(o.c.scenario?.id ?? '');
    const status = o.reason === 'declined' ? `declined by ${o.fn}${o.declineReason ? ` (${o.declineReason})` : ''}` : o.reason === 'not-known-by-function' ? `not known by ${o.fn}` : o.reason === 'not-known-by-respondent' ? 'not known by the respondent' : `waiting for ${o.fn ?? 'an accountable function'}`;
    return {
      id: `VG-${o.c.id}`, questionCode: o.c.id, domainCode: revisedDomainCode(o.c.domain.id), prompt: o.q?.text ?? o.c.text,
      statement: `${o.c.key ?? o.c.id}: ${status}. The control that stops "${s?.name ?? 'this scheme'}" is unanswered, so nothing is concluded about it.`,
      whyVisibilityMatters: sentence(s?.why ?? ''), evidenceNeeded: `An answer from ${o.fn ?? o.q?.module.owner ?? 'the accountable function'}.`,
      likelyEvidenceOwner: o.fn ?? o.q?.module.owner ?? 'Accountable function', recommendedVerificationAction: `Obtain the answer from ${o.q?.module.owner ?? o.fn ?? 'the accountable function'}.`,
      priority: (s?.tier ?? 3) === 1 ? 'High' : 'Medium', targetTiming: '30 days', evidenceRef: `outstanding:${o.c.id}`
    };
  });
  if (a.outstandingItems.length) {
    const fns = unique(a.outstandingItems.map((o) => o.fn ?? o.q?.module.owner ?? null).filter(Boolean) as string[]);
    roadmap.unshift({
      id: 'RA-OUTSTANDING', period: '30 days', domainCode: revisedDomainCode('D1'), domainName: AREA_NAME.get('D1') ?? 'Governance',
      deliverable: `Obtain the ${a.outstandingItems.length} outstanding answers (${visibilityGaps.length} on controls that stop a scheme) from ${joinList(fns.slice(0, 4))}${fns.length > 4 ? ` and ${fns.length - 4} other functions` : ''}, and record any that cannot be answered as an open risk.`,
      accountableExecutive: AREA_EXECUTIVE.get('D1') ?? 'Senior management', processOwner: 'Assessment coordinator', oversightFunction: oversight, supportingFunctions: fns,
      linkedFindingIds: [], linkedRiskIds: [], dependencyIds: [], escalationThreshold: 'Any outstanding answer on a first-priority scheme still open after 30 days.',
      evidenceRefs: visibilityGaps.map((v) => v.evidenceRef), accountableOwner: 'Assessment coordinator', linkedFindingId: '', linkedRiskId: '', dependency: 'None',
      implementationDifficulty: 'Low', successMeasure: 'Every outstanding answer is given or recorded as an open risk with a named owner.', evidenceOfCompletion: 'The completed function packages.'
    });
  }

  // Sustainment: schemes whose confirmations and supporting practices were all reported in place.
  const confirmed = a.scenarios.filter((s) => s.kind === 'confirmed' && s.tier === 1);
  const sustainmentPriorities: SustainmentPriority[] = confirmed.slice(0, 6).map((s) => {
    const m = s.confirms[0];
    const fam = familyFor(s.area, m.c.module?.id);
    return {
      id: `SP-${s.id}`, sourceFindingId: `SP-${s.id}`, questionCode: m.c.id, title: `${keyOf(m)} (stops: ${lc(s.name)})`, domainCode: revisedDomainCode(s.area), domainName: AREA_NAME.get(s.area) ?? s.area,
      primarySemanticFamily: fam.primary, responseLabel: m.c.answer?.label ?? '', responseOperationalMeaning: reportedState(m), currentStrongStandard: reportedState(m),
      managementFocus: sentence(s.why), accountableExecutive: AREA_EXECUTIVE.get(s.area) ?? '', processOwner: m.q?.module.owner ?? '', operatingFrequency: MODULE_CYCLE[m.c.module?.id ?? ''] ?? '',
      proofRetained: recordsOf(m), deteriorationTrigger: `${keyOf(m)} is bypassed or no longer applied to every case.`, effectivenessIndicator: standardOf(m), dependencies: []
    };
  });

  const decisions = buildDecisions(a, findings, findingScenarios, oversight);
  const tier1Gaps = findingScenarios.filter((s) => s.tier === 1 && s.kind === 'gap').length;
  const narrativeMode = tier1Gaps >= 3 ? 'REMEDIATION' : tier1Gaps > 0 || findingScenarios.length ? 'MIXED' : 'SUSTAINMENT';
  findings.sort((x, y) => y.materialityScore - x.materialityScore || x.id.localeCompare(y.id));

  return {
    analysis: a,
    model: {
      narrativeMode, sustainmentPriorities, materialFindings: findings, contradictions, scenarios, riskRegister: risks, controlImprovements: improvements,
      evidenceChecklist: checklist, leadershipDecisions: decisions, roadmapActions: roadmap, functionalAgenda: agenda, visibilityGaps
    }
  };
}

function buildDecisions(a: RevisedAnalysis, findings: MaterialFinding[], schemes: ScenarioPicture[], oversight: string): LeadershipDecision[] {
  const out: LeadershipDecision[] = [];
  // First-priority schemes that need an owner: those with a gap, and those relying on a control its practices do not support.
  const tier1 = schemes.filter((s) => s.tier === 1 && (s.kind === 'gap' || s.kind === 'false-comfort'));
  const fc = schemes.filter((s) => s.kind === 'false-comfort');
  const byArea = new Map<string, ScenarioPicture[]>();
  tier1.forEach((s) => byArea.set(s.area, [...(byArea.get(s.area) ?? []), s]));
  const areas = [...byArea.entries()].sort((x, y) => y[1].length - x[1].length);
  const ids = (ss: ScenarioPicture[]) => ss.map((s) => `MF-${s.id}`);
  const rids = (ss: ScenarioPicture[]) => ss.map((s) => `RISK-${s.id}`);
  const base = (d: Omit<LeadershipDecision, 'evidenceRefs'>): LeadershipDecision => ({ ...d, evidenceRefs: d.linkedFindingIds.map((x) => `finding:${x}`) });
  if (areas.length) {
    out.push(base({
      id: 'DEC-MANDATE', decisionCategory: 'accountable_executive_mandate',
      decisionRequired: `Name one accountable executive for each area with first-priority schemes open or unsupported: ${joinList(areas.map(([ar, ss]) => `${AREA_SHORT[ar] ?? AREA_NAME.get(ar)} (${ss.length})`))}.`,
      evidenceDrivingIt: `${tier1.filter((s) => s.kind === 'gap').length} first-priority schemes have a control that stops them reported as a gap, and ${tier1.filter((s) => s.kind === 'false-comfort').length} rely on a control whose own practices were reported as gaps.`,
      whyNow: 'Each scheme needs one person with authority over the process, the system and the people involved.',
      recommendedDecision: joinList(areas.slice(0, 4).map(([ar]) => `${AREA_EXECUTIVE.get(ar)} for ${AREA_SHORT[ar] ?? lc(AREA_NAME.get(ar) ?? ar)}`)) + '.',
      accountableExecutive: AREA_EXECUTIVE.get('D1') ?? 'Chief executive', implementationOwner: AREA_EXECUTIVE.get(areas[0][0]) ?? '', oversightFunction: oversight,
      targetPeriod: '30 days', deadline: '30 days', consequenceOfDelay: 'Schemes with no owner stay open, and the gaps that let them happen stay unassigned.',
      immediateNextDeliverable: 'A signed list of schemes, their accountable executives and target dates.', linkedFindingIds: ids(tier1), linkedRiskIds: rids(tier1)
    }));
  }
  const programme = areas[0];
  if (programme) {
    const ss = programme[1];
    const lead = findings.find((f) => f.id === `MF-${ss[0].id}`);
    out.push(base({
      id: 'DEC-DESIGN', decisionCategory: 'control_design_standard',
      decisionRequired: `Approve the target design for ${AREA_SHORT[programme[0]] ?? lc(AREA_NAME.get(programme[0]) ?? '')}, where ${plural(ss.length, 'first-priority scheme is', 'first-priority schemes are')} open or unsupported.`,
      evidenceDrivingIt: ss.slice(0, 3).map((s) => s.name).join('; '),
      whyNow: ss.length > 1 ? 'The schemes share processes and owners; designing them together avoids separate partial fixes.' : 'One design, owned once, avoids a partial fix.',
      recommendedDecision: lead?.recommendedControl ?? '', accountableExecutive: AREA_EXECUTIVE.get(programme[0]) ?? '', implementationOwner: lead?.processOwner ?? '',
      oversightFunction: oversight, targetPeriod: '60 days', deadline: '60 days', consequenceOfDelay: 'Controls are added one at a time and the scheme stays open through the gaps between them.',
      immediateNextDeliverable: 'An approved control design with owners, operating cycle and the records each step leaves.', linkedFindingIds: ids(ss), linkedRiskIds: rids(ss)
    }));
  }
  const seq = schemes.flatMap((s) => s.precludes.filter((p) => GAP.has(p.by.c.class ?? '')).map((p) => ({ s, p })));
  if (seq.length) {
    out.push(base({
      id: 'DEC-SEQUENCE', decisionCategory: 'sequencing_dependency',
      decisionRequired: 'Put first the controls that other controls depend on.',
      evidenceDrivingIt: seq.slice(0, 3).map(({ p }) => `${keyOf(p.by)} is ${CLASS_SHORT[p.by.c.class ?? '']}, so ${joinList(p.keys.map(lc))} cannot operate`).join('; ') + '.',
      whyNow: 'Building the dependent checks first produces controls that cannot run.',
      recommendedDecision: `Sequence ${joinList(unique(seq.slice(0, 4).map(({ p }) => lc(keyOf(p.by)))))} ahead of the checks that rely on them.`,
      accountableExecutive: AREA_EXECUTIVE.get(seq[0].s.area) ?? '', implementationOwner: seq[0].p.by.q?.module.owner ?? '', oversightFunction: oversight,
      targetPeriod: '30 days', deadline: '30 days', consequenceOfDelay: 'Effort is spent on checks that cannot operate.', immediateNextDeliverable: 'A sequenced implementation plan.',
      linkedFindingIds: unique(seq.map(({ s }) => `MF-${s.id}`)), linkedRiskIds: unique(seq.map(({ s }) => `RISK-${s.id}`))
    }));
  }
  if (fc.length) {
    out.push(base({
      id: 'DEC-RELIANCE', decisionCategory: 'risk_acceptance_or_remediation',
      decisionRequired: `Decide whether to keep relying on ${fc.length} control${fc.length > 1 ? 's' : ''} reported in place whose supporting practices were reported as gaps.`,
      evidenceDrivingIt: fc.slice(0, 3).map((s) => `${keyOf(s.confirms[0])}: ${s.supportGaps.length} supporting practice${s.supportGaps.length > 1 ? 's' : ''} reported as gaps`).join('; ') + '.',
      whyNow: 'A self-reported control that its own practices do not support can give management comfort it has not earned.',
      recommendedDecision: 'Ask each process owner to confirm in writing how the control works without the missing practices, and close the practices in the next 60 days.',
      accountableExecutive: AREA_EXECUTIVE.get(fc[0].area) ?? '', implementationOwner: fc[0].confirms[0].q?.module.owner ?? '', oversightFunction: oversight,
      targetPeriod: '30 days', deadline: '30 days', consequenceOfDelay: 'The scheme is treated as covered when it may not be.', immediateNextDeliverable: 'Written confirmation from each process owner.',
      linkedFindingIds: ids(fc), linkedRiskIds: rids(fc)
    }));
  }
  if (a.outstandingItems.length) {
    out.push(base({
      id: 'DEC-OUTSTANDING', decisionCategory: 'sequencing_dependency',
      decisionRequired: `Require the ${a.outstandingItems.length} outstanding answers within 30 days, and treat any that cannot be given as an open risk.`,
      evidenceDrivingIt: `${a.outstandingItems.filter((o) => o.reason === 'declined').length} declined, ${a.outstandingItems.filter((o) => o.reason.startsWith('not-known')).length} not known and ${a.outstandingItems.filter((o) => o.reason === 'waiting').length} waiting.`,
      whyNow: 'Nothing is concluded about a control nobody has answered for; until it is answered the scheme it stops is unknown, not covered.',
      recommendedDecision: 'Assign each outstanding answer to a named person with a date.', accountableExecutive: AREA_EXECUTIVE.get('D1') ?? '', implementationOwner: 'Assessment coordinator',
      oversightFunction: oversight, targetPeriod: '30 days', deadline: '30 days', consequenceOfDelay: 'Schemes stay unknown and cannot be prioritised.', immediateNextDeliverable: 'Completed function packages.',
      linkedFindingIds: [], linkedRiskIds: []
    }));
  }
  if (tier1.length) {
    out.push(base({
      id: 'DEC-CADENCE', decisionCategory: 'governance_reporting_cadence',
      decisionRequired: `Have ${lc(oversight)} receive the status of the ${tier1.length} first-priority schemes each month until they are closed.`,
      evidenceDrivingIt: `${tier1.length} first-priority schemes open or unsupported across ${areas.length} ${areas.length === 1 ? 'area' : 'areas'}.`,
      whyNow: 'Monthly reporting keeps the schemes visible to the people who can remove blockers.',
      recommendedDecision: 'A one-page scheme status: owner, controls in place, controls outstanding, next date.', accountableExecutive: AREA_EXECUTIVE.get('D1') ?? '', implementationOwner: AREA_EXECUTIVE.get('D2') ?? '',
      oversightFunction: oversight, targetPeriod: '30 days', deadline: '30 days', consequenceOfDelay: 'Progress is not visible until the next assessment.', immediateNextDeliverable: 'The first monthly scheme status.',
      linkedFindingIds: ids(tier1), linkedRiskIds: rids(tier1)
    }));
  }
  return out.slice(0, 6);
}

/** Bank IDs, scenario IDs and risk codes must never reach customer prose. */
export const REVISED_RAW_ID = /\b(?:D\d{1,2}-[A-Z]{1,2}-\d{2}|FS-D\d{1,2}-\d{2}|OBJ-[A-Z0-9-]+|PR-\d{2}|R\d{1,2}\b(?=[,.;: ]))/;
