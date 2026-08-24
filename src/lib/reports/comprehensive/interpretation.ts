import { z } from 'zod';
import { generateText, Output } from 'ai';
import { selectNarrativeModel } from '../ai-model-policy';
import type { AssembledReportData } from '../types';
import type { AdvisoryEvidenceModel, Contradiction } from '../evidence-model/types';
import type { ComprehensiveManagementModel } from './management-model';
import type { DomainDiagnosticRow } from './assembly';
import { claimsVerification } from './product-contract';
import {
  adaptiveGraphVersionForAssessment,
  deriveNarrativeOperatingContext,
  type OperatingContextFact
} from '../narrative/operating-context';

/**
 * Bounded interpretation for the Comprehensive management core.
 *
 * The analysis creates the value; this explains it. Six slots, each with its own
 * source authority and its own management question, and none of them permitted
 * to introduce a finding, risk, control, owner, action, measure or number that
 * the deterministic model did not already produce.
 *
 * One structured request returns all six. Six independent calls would cost six
 * times the latency for no reliability gain, and the slots share one brief, so
 * they are generated together and validated apart. A field that fails is
 * repaired on its own; the other five are never regenerated.
 *
 * Nothing here touches the registers. Those are deterministic and stay that way.
 */

export const COMPREHENSIVE_INTERPRETATION_VERSION = 'mk-comprehensive-interpretation-v1' as const;

export type InterpretationSlotId =
  | 'executiveInterpretation'
  | 'whyThisMatters'
  | 'managementImplication'
  | 'controlProgrammeSynthesis'
  | 'implementationSynthesis'
  | 'conclusion';

export interface InterpretationSlotContract {
  id: InterpretationSlotId;
  /** Where this appears in the report. */
  label: string;
  managementQuestion: string;
  responsibility: string;
  mayUse: string[];
  mustNotDo: string[];
  minWords: number;
  maxWords: number;
}

export const INTERPRETATION_CONTRACTS: ReadonlyArray<InterpretationSlotContract> = [
  {
    id: 'executiveInterpretation',
    label: 'Executive interpretation',
    managementQuestion: 'Where does this organisation stand, and what is the most important relationship between its capabilities?',
    responsibility: 'Explain the assessed position and the single most important relationship between capabilities.',
    mayUse: ['overall score', 'maturity band', 'the report posture', 'recorded operating context', 'material question positions', 'prioritised risks', 'material strengths', 'contradiction relationships and evidence references'],
    mustNotDo: ['name the posture as a mode or label', 'list all ten domain scores', 'recite every finding', 'describe control designs', 'restate the roadmap', 'infer an organisational fact absent from the evidence pack'],
    minWords: 110, maxWords: 190
  },
  {
    id: 'whyThisMatters',
    label: 'Why this matters',
    managementQuestion: 'Why does the material exposure pattern matter operationally?',
    // The first live run answered this by walking all six themes in order,
    // each as "X contains N risks, <participle> Y". Every sentence carried a
    // consequence, so nothing was false — it simply read the table aloud at
    // uniform weight. Prioritising is the work; the table already lists.
    responsibility: 'Take the two or three largest exposure concentrations and explain the operating mechanism — how value or trust actually leaves the organisation through normal activity. Prioritise; do not survey.',
    mayUse: ['the largest exposure themes and their risk counts', 'fraud mechanisms named in the themes'],
    mustNotDo: ['walk through every exposure theme in turn', 'give each theme one sentence of equal weight', 'invent an incident', 'invent a financial impact', 'repeat the executive interpretation', 'describe control designs'],
    minWords: 90, maxWords: 170
  },
  {
    id: 'managementImplication',
    label: 'Management implication',
    managementQuestion: 'What response does this require from management?',
    // The first live run produced a list of governance abstractions —
    // "accountable mandates, escalation authority, target standards,
    // sequencing principles" — that would fit any report at any score. The
    // decision agenda holds the specifics; anchor on those instead.
    responsibility: 'Name the specific decisions this organisation has to take, drawn from the decision agenda, and say what each one unblocks. Concrete choices with owners, not governance abstractions.',
    mayUse: ['decision agenda entries and their owners', 'management theme titles', 'control programme priorities'],
    mustNotDo: ['list generic governance activities that would fit any organisation', 'repeat individual roadmap actions', 'repeat detailed control specifications', 'repeat why this matters'],
    minWords: 90, maxWords: 170
  },
  {
    id: 'controlProgrammeSynthesis',
    label: 'Control programme synthesis',
    managementQuestion: 'How do the recommended control programmes work together?',
    responsibility: 'Explain how the programmes reinforce one another and where the dependencies sit.',
    mayUse: ['control programme titles', 'control counts', 'accountable roles', 'evidence volumes'],
    mustNotDo: ['repeat every control blueprint', 'state that a control currently exists', 'claim MK tested anything'],
    minWords: 110, maxWords: 190
  },
  {
    id: 'implementationSynthesis',
    label: 'Implementation synthesis',
    managementQuestion: 'Why is the implementation sequenced this way?',
    responsibility: 'Explain the logic of the sequence and what each horizon unlocks for the next.',
    mayUse: ['phase names', 'action counts per phase', 'programmes advanced per phase', 'decision prerequisites'],
    mustNotDo: ['repeat the action register', 'invent dates', 'invent costs or effort estimates'],
    minWords: 90, maxWords: 170
  },
  {
    id: 'conclusion',
    label: 'Conclusion',
    managementQuestion: 'What would successful progression actually mean?',
    responsibility: 'Close with what good looks like and how management would know it is being achieved.',
    mayUse: ['assessed position', 'programme priorities', 'measurement logic'],
    mustNotDo: ['introduce new analysis', 'repeat the executive interpretation'],
    minWords: 70, maxWords: 150
  }
];

export const interpretationSchema = z.object({
  executiveInterpretation: z.string().min(1),
  whyThisMatters: z.string().min(1),
  managementImplication: z.string().min(1),
  controlProgrammeSynthesis: z.string().min(1),
  implementationSynthesis: z.string().min(1),
  conclusion: z.string().min(1)
}).strict();

export type ComprehensiveInterpretation = z.infer<typeof interpretationSchema>;

/**
 * The deterministic brief.
 *
 * Deliberately small: theme and programme summaries, not registers. Sending 34
 * control designs and 139 evidence items would cost tokens to produce prose that
 * must not mention them anyway.
 */
export interface InterpretationBrief {
  organisationName: string;
  score: number;
  maturity: string;
  narrativeMode: string;
  domains: Array<{ name: string; score: number; band: string }>;
  managementThemes: Array<{ title: string; findings: number; critical: number; hardGate: number; question: string }>;
  exposureThemes: Array<{ title: string; risks: number; question: string }>;
  controlProgrammes: Array<{ title: string; controls: number; evidence: number; measures: number; owner: string; horizons: string[] }>;
  governance: Array<{ role: string; type: string; controls: number; decisions: number }>;
  decisions: Array<{ decision: string; whyNow: string; owner: string; targetPeriod: string }>;
  phases: Array<{ phase: string; actions: number; programmes: string[] }>;
  totals: { findings: number; risks: number; controls: number; evidenceItems: number; actions: number };
  /**
   * Curated executive evidence. This is intentionally bounded: it carries the
   * recorded operating context and the material relationships needed to explain
   * the result, never the raw assessment payload.
   */
  evidencePack: InterpretationEvidencePack;
}

export interface InterpretationEvidencePack {
  assessment: {
    methodologyVersionId: string;
    graphVersion: string;
    graphFingerprint: string;
    coveragePct: number;
    uncertaintyRatePct: number;
    exposureScore: number | null;
    exposureBand: string | null;
    capApplied: boolean;
    capReason: string | null;
    criticalGapCount: number;
    majorGapCount: number;
  };
  operatingContext: {
    /** Technical trace retained for the evidence register; never used as semantic input to AI. */
    gatewayAnswers: Array<{ gatewayCode: string; recordedValue: string }>;
    /** Canonical semantic facts used for any operating-context interpretation. */
    facts?: OperatingContextFact[];
    exposureFactors: Array<{ factorCode: string; factor: string; selectedValue: string; pointsAwarded: number; maxPoints: number }>;
  };
  materialQuestionPositions: Array<{
    questionCode: string;
    domain: string;
    prompt: string;
    recordedResponse: string;
    responseValue: number | null;
    normalisedScore: number | null;
    materiality: string;
    critical: boolean;
    hardGate: boolean;
    selectionReasons: string[];
    linkedFindingIds: string[];
    linkedRiskIds: string[];
    linkedControlIds: string[];
    evidenceRefs: string[];
  }>;
  prioritisedFindings: Array<{
    findingId: string;
    questionCode: string;
    title: string;
    diagnosis: string;
    materiality: string;
    priorityScore: number;
    selectionReasons: string[];
    linkedRiskIds: string[];
    linkedControlIds: string[];
    evidenceRefs: string[];
  }>;
  prioritisedRisks: Array<{
    riskId: string;
    statement: string;
    priority: string;
    likelihood: string;
    impact: string;
    currentControlPosition: string;
    requiredTreatment: string;
    linkedFindingIds: string[];
    linkedScenarioIds: string[];
    evidenceRefs: string[];
  }>;
  materialStrengths: Array<{
    questionCode: string;
    domain: string;
    prompt: string;
    recordedResponse: string;
    normalisedScore: number | null;
    evidenceRefs: string[];
  }>;
  domainDiagnostics: DomainDiagnosticRow[];
  contradictions: Array<{
    id: string;
    pattern: string;
    title: string;
    drivingResponses: string;
    whyItMatters: string;
    falseComfortRisk: string;
    whatLeadershipShouldVerify: string;
    fraudPathwayEnabled: string;
    linkedFindingIds: string[];
    linkedRiskId: string | null;
    evidenceRefs: string[];
  }>;
  evidenceReferences: string[];
}

const uniqueStrings = (values: readonly unknown[]): string[] => [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];

function buildInterpretationEvidencePack(input: {
  model: ComprehensiveManagementModel;
  assembled?: AssembledReportData;
  evidenceModel?: AdvisoryEvidenceModel;
}): InterpretationEvidencePack {
  const { model, assembled, evidenceModel } = input;
  const operatingContextFacts = assembled?.adaptiveGatewayAnswers && Object.keys(assembled.adaptiveGatewayAnswers).length > 0
    ? deriveNarrativeOperatingContext({
      graphVersion: assembled ? adaptiveGraphVersionForAssessment(assembled) : undefined,
      gatewayAnswers: assembled.adaptiveGatewayAnswers
    })
    : [];
  const adaptive = assembled?.scoreRun.adaptiveMetrics ?? assembled?.adaptiveScope;
  const traces = assembled?.questionTraces ?? [];
  const traceByQuestion = new Map(traces.map((trace) => [trace.questionCode, trace]));
  const sourceFindings = evidenceModel?.materialFindings ?? [];
  const sourceFindingById = new Map(sourceFindings.map((finding) => [finding.id, finding]));
  const controlsByFinding = new Map<string, string[]>();
  for (const control of model.registers.controls) {
    const current = controlsByFinding.get(control.linkedFindingId) ?? [];
    current.push(control.controlId);
    controlsByFinding.set(control.linkedFindingId, current);
  }
  const risksByFinding = new Map<string, string[]>();
  for (const risk of model.registers.risks) {
    for (const findingId of risk.linkedFindingIds) {
      const current = risksByFinding.get(findingId) ?? [];
      current.push(risk.riskId);
      risksByFinding.set(findingId, current);
    }
  }
  const refsForFinding = (findingId: string, questionCode: string, riskIds: string[], controlIds: string[]): string[] => uniqueStrings([
    `finding:${findingId}`, `question:${questionCode}`, ...riskIds.map((id) => `risk:${id}`), ...controlIds.map((id) => `control:${id}`)
  ]);
  const findingRows = [...model.registers.findings].sort((left, right) => right.materialityScore - left.materialityScore || left.findingId.localeCompare(right.findingId));
  const materialQuestionPositions = findingRows.map((finding) => {
    const trace = traceByQuestion.get(finding.questionCode);
    const source = sourceFindingById.get(finding.findingId);
    const riskIds = uniqueStrings([...(risksByFinding.get(finding.findingId) ?? []), ...source?.linkedExposureFactorCodes?.map((code) => `exposure:${code}`) ?? []]);
    const controlIds = uniqueStrings(controlsByFinding.get(finding.findingId) ?? []);
    return {
      questionCode: finding.questionCode,
      domain: finding.domainName,
      prompt: trace?.prompt ?? finding.questionCode,
      recordedResponse: finding.assessedPosition,
      responseValue: trace?.responseValue ?? null,
      normalisedScore: trace?.normalisedScore ?? null,
      materiality: finding.materialityClass,
      critical: finding.isCriticalControl,
      hardGate: finding.isHardGate,
      selectionReasons: [...(source?.selectionReasons ?? [])],
      linkedFindingIds: [finding.findingId],
      linkedRiskIds: riskIds.filter((id) => id.startsWith('RISK-')),
      linkedControlIds: controlIds,
      evidenceRefs: refsForFinding(finding.findingId, finding.questionCode, riskIds.filter((id) => id.startsWith('RISK-')), controlIds)
    };
  }).slice(0, 40);
  const prioritisedFindings = findingRows.slice(0, 16).map((finding) => {
    const source = sourceFindingById.get(finding.findingId);
    const riskIds = uniqueStrings(risksByFinding.get(finding.findingId) ?? []);
    const controlIds = uniqueStrings(controlsByFinding.get(finding.findingId) ?? []);
    return {
      findingId: finding.findingId,
      questionCode: finding.questionCode,
      title: finding.assessedDiagnosis || finding.questionCode,
      diagnosis: finding.assessedDiagnosis,
      materiality: finding.materialityClass,
      priorityScore: finding.materialityScore,
      selectionReasons: [...(source?.selectionReasons ?? [])],
      linkedRiskIds: riskIds,
      linkedControlIds: controlIds,
      evidenceRefs: refsForFinding(finding.findingId, finding.questionCode, riskIds, controlIds)
    };
  });
  const prioritisedRisks = [...model.registers.risks]
    .sort((left, right) => `${right.priority}:${right.impact}`.localeCompare(`${left.priority}:${left.impact}`) || left.riskId.localeCompare(right.riskId))
    .slice(0, 16)
    .map((risk) => ({
      riskId: risk.riskId,
      statement: risk.riskStatement,
      priority: risk.priority,
      likelihood: risk.likelihood,
      impact: risk.impact,
      currentControlPosition: risk.currentControlPosition,
      requiredTreatment: risk.requiredTreatment,
      linkedFindingIds: [...risk.linkedFindingIds],
      linkedScenarioIds: [...risk.linkedScenarioIds],
      evidenceRefs: uniqueStrings([`risk:${risk.riskId}`, ...risk.linkedFindingIds.map((id) => `finding:${id}`), ...risk.linkedScenarioIds.map((id) => `scenario:${id}`)])
    }));
  const materialStrengths = traces
    .filter((trace) => trace.applicable && typeof trace.normalisedScore === 'number' && trace.normalisedScore >= 80)
    .sort((left, right) => (right.normalisedScore ?? 0) - (left.normalisedScore ?? 0) || left.questionCode.localeCompare(right.questionCode))
    .slice(0, 8)
    .map((trace) => ({
      questionCode: trace.questionCode,
      domain: trace.domainName,
      prompt: trace.prompt,
      recordedResponse: `Response value ${trace.responseValue ?? 'not recorded'}`,
      normalisedScore: trace.normalisedScore,
      evidenceRefs: [`question:${trace.questionCode}`]
    }));
  const contradictions = (model.registers.contradictions ?? []).map((contradiction: Contradiction) => ({
    id: contradiction.id,
    pattern: contradiction.pattern,
    title: contradiction.title,
    drivingResponses: contradiction.drivingResponses,
    whyItMatters: contradiction.whyItMatters,
    falseComfortRisk: contradiction.falseComfortRisk,
    whatLeadershipShouldVerify: contradiction.whatLeadershipShouldVerify,
    fraudPathwayEnabled: contradiction.fraudPathwayEnabled,
    linkedFindingIds: [...contradiction.linkedFindingIds],
    linkedRiskId: contradiction.linkedRiskId,
    evidenceRefs: [...contradiction.evidenceRefs]
  }));
  const evidenceReferences = uniqueStrings([
    ...materialQuestionPositions.flatMap((item) => item.evidenceRefs),
    ...prioritisedFindings.flatMap((item) => item.evidenceRefs),
    ...prioritisedRisks.flatMap((item) => item.evidenceRefs),
    ...materialStrengths.flatMap((item) => item.evidenceRefs),
    ...contradictions.flatMap((item) => item.evidenceRefs),
    ...model.core.domainDiagnostics.flatMap((item) => item.traceability)
  ]).slice(0, 180);
  return {
    assessment: {
      methodologyVersionId: assembled?.scoreRun.methodologyVersionId ?? '',
      graphVersion: adaptive?.graphVersion ?? '',
      graphFingerprint: adaptive?.graphFingerprint ?? '',
      coveragePct: assembled?.scoreRun.coveragePct ?? 0,
      uncertaintyRatePct: assembled?.scoreRun.nARatePct ?? 0,
      exposureScore: assembled?.scoreRun.exposureScore ?? null,
      exposureBand: assembled?.scoreRun.exposureBand ?? null,
      capApplied: assembled?.scoreRun.capApplied ?? false,
      capReason: assembled?.scoreRun.capReason ?? null,
      criticalGapCount: assembled?.scoreRun.criticalGapCount ?? 0,
      majorGapCount: assembled?.scoreRun.majorGapCount ?? 0
    },
    operatingContext: {
      gatewayAnswers: Object.entries(assembled?.adaptiveGatewayAnswers ?? {}).map(([gatewayCode, recordedValue]) => ({ gatewayCode, recordedValue: String(recordedValue) })),
      facts: operatingContextFacts,
      exposureFactors: (assembled?.exposureAnswers ?? []).map((answer) => ({ factorCode: answer.factorCode, factor: answer.name, selectedValue: answer.selectedLabel, pointsAwarded: answer.pointsAwarded, maxPoints: answer.maxPoints }))
    },
    materialQuestionPositions,
    prioritisedFindings,
    prioritisedRisks,
    materialStrengths,
    domainDiagnostics: model.core.domainDiagnostics,
    contradictions,
    evidenceReferences
  };
}

export function buildInterpretationBrief(input: {
  model: ComprehensiveManagementModel;
  organisationName: string;
  score: number;
  maturity: string;
  domains: Array<{ name: string; score: number; band: string }>;
  assembled?: AssembledReportData;
  evidenceModel?: AdvisoryEvidenceModel;
}): InterpretationBrief {
  const { model } = input;
  const roleName = new Map(model.core.governanceRoles.map((role) => [role.canonicalRoleId, role.displayRole]));
  return {
    organisationName: input.organisationName,
    score: input.score,
    maturity: input.maturity,
    narrativeMode: model.narrativeMode,
    domains: input.domains,
    managementThemes: model.core.managementThemes.map((theme) => ({ title: theme.title, findings: theme.findingIds.length, critical: theme.criticalFindingCount, hardGate: theme.hardGateFindingCount, question: theme.managementQuestion })),
    exposureThemes: model.core.exposureThemes.map((theme) => ({ title: theme.title, risks: theme.riskIds.length, question: theme.managementQuestion })),
    controlProgrammes: model.core.controlProgrammes.map((programme) => ({ title: programme.title, controls: programme.controlIds.length, evidence: programme.evidenceItemCount, measures: programme.measureCount, owner: roleName.get(programme.accountableRoleId) ?? '', horizons: programme.targetPeriods })),
    governance: model.core.governanceRoles.map((role) => ({ role: role.displayRole, type: role.roleType, controls: role.controls.length, decisions: role.decisions.length })),
    decisions: model.core.decisionAgenda.map((decision) => ({ decision: decision.decisionRequired, whyNow: decision.whyNow, owner: decision.ownerRole, targetPeriod: decision.targetPeriod })),
    phases: model.core.implementationPhases.map((phase) => ({ phase: phase.phase, actions: phase.actionIds.length, programmes: phase.programmeIds })),
    totals: {
      findings: model.registers.findings.length, risks: model.registers.risks.length,
      controls: model.registers.controls.length,
      evidenceItems: model.registers.evidence.reduce((sum, group) => sum + group.items.length, 0),
      actions: model.registers.actions.length
    },
    evidencePack: buildInterpretationEvidencePack({ model, assembled: input.assembled, evidenceModel: input.evidenceModel })
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type InterpretationIssueKind = 'HARD_TRUTH' | 'SEMANTIC' | 'QUALITY';
export interface InterpretationIssue { slot: InterpretationSlotId; kind: InterpretationIssueKind; code: string; detail: string }

const words = (value: string): number => value.trim().split(/\s+/).filter(Boolean).length;

/** Every number the brief authorises, as bare tokens. */
function authorisedNumbers(brief: InterpretationBrief): Set<string> {
  const out = new Set<string>();
  const add = (value: unknown) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    out.add(String(num));
    out.add(num.toFixed(2));
    out.add(String(Math.round(num)));
  };
  add(brief.score);
  for (const domain of brief.domains) add(domain.score);
  for (const theme of brief.managementThemes) { add(theme.findings); add(theme.critical); add(theme.hardGate); }
  for (const theme of brief.exposureThemes) add(theme.risks);
  for (const programme of brief.controlProgrammes) { add(programme.controls); add(programme.evidence); add(programme.measures); }
  for (const phase of brief.phases) add(phase.actions);
  for (const value of Object.values(brief.totals)) add(value);
  add(brief.managementThemes.length); add(brief.exposureThemes.length);
  add(brief.controlProgrammes.length); add(brief.decisions.length); add(brief.phases.length);
  add(brief.governance.length); add(brief.domains.length);
  // Ordinals and durations that appear in phase names are part of the brief.
  for (const phase of brief.phases) for (const token of phase.phase.match(/\d+/g) ?? []) out.add(token);
  // The curated evidence contract may contain recorded exposure and response
  // values that the writer is allowed to cite. Walk only the bounded pack, not
  // the raw assessment payload.
  const walk = (value: unknown): void => {
    if (typeof value === 'number') { add(value); return; }
    if (Array.isArray(value)) { for (const item of value) walk(item); return; }
    if (value && typeof value === 'object') for (const item of Object.values(value as Record<string, unknown>)) walk(item);
  };
  walk(brief.evidencePack);
  return out;
}

/** Language that only makes sense if someone examined the organisation. */
const OBSERVATION_VOICE = [
  /\bwe (?:observed|found|noted|saw)\b/i,
  /\bour (?:review|testing|fieldwork)\b/i,
  /\bwas found to\b/i,
  /\bevidence (?:showed|confirmed|demonstrated)\b/i
];

/** Consultancy filler that adds length without meaning. */
const FILLER = [
  /\bin today's (?:business )?environment\b/i,
  /\bit is important to note\b/i,
  /\bbest[- ]in[- ]class\b/i,
  /\bworld[- ]class\b/i,
  /\bleverage synergies\b/i,
  /\bat the end of the day\b/i,
  /\bgoing forward,? it\b/i
];

/** Remediation language a sustainment report must not use about itself. */
const MANUFACTURED_WEAKNESS = [
  /\bcritical (?:gap|weakness|failure)\b/i,
  /\bmaterial weakness\b/i,
  /\bcontrol failure\b/i,
  /\bseverely\b/i,
  /\bremediate the (?:failure|breakdown)\b/i
];

const NEGATOR = /\b(?:no|not|never|none|without|nothing)\b/i;

/** Internal construct names that must never reach a customer-facing page. */
const ENGINE_VOCABULARY = [
  /\b(?:SUSTAINMENT|REMEDIATION|MIXED)\b/,
  /\b(?:sustainment|remediation|mixed)\s+mode\b/i,
  /\bnarrative\s+mode\b/i,
  /\bsemantic\s+famil(?:y|ies)\b/i,
  /\bfact\s+pack\b/i,
  /\bhard[- ]gate\b/i,
  /\bbounded\s+(?:slot|section|narrative)\b/i,
  /\bmanagement\s+model\b/i
];

/**
 * Executive abbreviations mapped to the canonical label they stand in for.
 *
 * Deliberately a short explicit list rather than derived initials: the canonical
 * "Chief Executive / Managing Director" yields no acronym a reader would guess,
 * so derivation would miss the exact drift that prompted the rule.
 */
const EXECUTIVE_ABBREVIATIONS: Record<string, string> = {
  CEO: 'chief executive',
  CFO: 'chief financial',
  COO: 'chief operating',
  CTO: 'chief technology',
  CIO: 'chief information',
  CRO: 'chief risk',
  CISO: 'chief information security',
  CPO: 'chief people'
};

export function validateInterpretation(result: Partial<ComprehensiveInterpretation>, brief: InterpretationBrief): InterpretationIssue[] {
  const issues: InterpretationIssue[] = [];
  const allowed = authorisedNumbers(brief);
  const entries = INTERPRETATION_CONTRACTS.map((contract) => [contract, String(result[contract.id] ?? '')] as const);

  for (const [contract, text] of entries) {
    const slot = contract.id;
    if (!text.trim()) { issues.push({ slot, kind: 'HARD_TRUTH', code: 'EMPTY', detail: 'no text returned' }); continue; }

    // HARD TRUTH — every number must be one the deterministic model produced.
    //
    // Not \b\d+: there is no word boundary between the R and the digits of
    // "R450000", so a word-boundary pattern let every invented rand figure —
    // the single most damaging fabrication this product could make — through
    // untouched. Anchor on "a digit not preceded by a digit" instead, and
    // strip separators before comparing so "450,000" cannot hide either.
    for (const raw of text.match(/(?<![\d.])\d[\d,]*(?:\.\d+)?/g) ?? []) {
      const token = raw.replace(/,/g, '');
      if (!allowed.has(token)) issues.push({ slot, kind: 'HARD_TRUTH', code: 'UNSUPPORTED_NUMBER', detail: `"${raw}" is not in the deterministic brief` });
    }
    // HARD TRUTH — no assurance claim, no claim of observation.
    const verification = claimsVerification(text);
    if (verification.violation) issues.push({ slot, kind: 'HARD_TRUTH', code: 'ASSURANCE_CLAIM', detail: verification.matched ?? '' });
    for (const pattern of OBSERVATION_VOICE) {
      if (pattern.test(text)) issues.push({ slot, kind: 'HARD_TRUTH', code: 'CLAIMS_OBSERVATION', detail: String(pattern) });
    }
    // HARD TRUTH — the maturity band and mode may not be contradicted.
    for (const band of ['Reactive', 'Developing', 'Structured', 'Strategic']) {
      if (band === brief.maturity) continue;
      const pattern = new RegExp(`\\b${band}\\b\\s+maturity|maturity\\s+(?:band\\s+)?(?:of\\s+)?${band}\\b`, 'i');
      if (pattern.test(text)) issues.push({ slot, kind: 'HARD_TRUTH', code: 'MATURITY_CONTRADICTION', detail: `states ${band}; assessed band is ${brief.maturity}` });
    }
    // HARD TRUTH — a sustainment report must not manufacture weakness.
    if (brief.narrativeMode === 'SUSTAINMENT') {
      for (const pattern of MANUFACTURED_WEAKNESS) {
        const match = text.match(pattern);
        if (!match) continue;
        const lead = text.slice(Math.max(0, (match.index ?? 0) - 40), match.index ?? 0);
        if (NEGATOR.test(lead)) continue;
        issues.push({ slot, kind: 'HARD_TRUTH', code: 'MANUFACTURED_WEAKNESS', detail: match[0] });
      }
    }
    // HARD TRUTH — the machinery must not appear on the customer's page.
    //
    // Defence in depth behind withholding the token from the prompt: a
    // sustainment report still described itself as being "in SUSTAINMENT mode".
    // Bare "mixed" is ordinary English, so only the engine's own casing and the
    // "<label> mode" construction count.
    for (const pattern of ENGINE_VOCABULARY) {
      const match = text.match(pattern);
      if (match) issues.push({ slot, kind: 'HARD_TRUTH', code: 'ENGINE_VOCABULARY', detail: match[0] });
    }

    // SEMANTIC — one accountability, one label.
    //
    // C3 collapsed 55-72 raw role labels to a canonical set so that a reader
    // meets each accountability under exactly one name. An early live run
    // wrote "CFO" and "CEO / Managing Director" against a register saying
    // "Chief Financial Officer" and "Chief Executive / Managing Director" —
    // nothing invented, but two names for one office in one document.
    for (const [abbreviation, prefix] of Object.entries(EXECUTIVE_ABBREVIATIONS)) {
      if (!new RegExp(`\\b${abbreviation}\\b`).test(text)) continue;
      const canonical = brief.governance.find((entry) => entry.role.toLowerCase().startsWith(prefix));
      if (canonical) issues.push({ slot, kind: 'SEMANTIC', code: 'ROLE_LABEL_DRIFT', detail: `"${abbreviation}" should be "${canonical.role}"` });
    }

    // QUALITY — structural monotony.
    //
    // Not a keyword rule: it counts sentences built to the same shape,
    // "<subject> <verb> <number>". Three or more in one slot is the register
    // being read aloud in sequence rather than interpreted.
    const recitations = (text.match(/\b(?:contains|has|carries|includes|comprises|adds|holds)\s+\d/gi) ?? []).length;
    if (recitations >= 3) issues.push({ slot, kind: 'QUALITY', code: 'REGISTER_RECITATION', detail: `${recitations} count-listing clauses; the table already lists them` });
    if (slot === 'executiveInterpretation') {
      const domainMentions = brief.domains.filter((domain) => domain.name && new RegExp(`\\b${domain.name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\b`, 'i').test(text)).length;
      const scorePairs = (text.match(/\b\d{1,3}(?:\.\d+)?\s*(?:\/|out of)\s*100\b/gi) ?? []).length;
      if (domainMentions >= 4 || scorePairs >= 4) issues.push({ slot, kind: 'QUALITY', code: 'DOMAIN_SCORE_RECITATION', detail: 'Executive interpretation recites the domain profile; it must prioritise one relationship.' });
    }

    // QUALITY
    const count = words(text);
    if (count < contract.minWords) issues.push({ slot, kind: 'QUALITY', code: 'TOO_SHORT', detail: `${count} words, minimum ${contract.minWords}` });
    if (count > contract.maxWords) issues.push({ slot, kind: 'QUALITY', code: 'TOO_LONG', detail: `${count} words, maximum ${contract.maxWords}` });
    for (const pattern of FILLER) {
      if (pattern.test(text)) issues.push({ slot, kind: 'QUALITY', code: 'FILLER', detail: String(pattern) });
    }
  }

  // SEMANTIC — no two slots may carry the same sentence, and none may be a
  // paraphrase of another. Shared role and programme names are expected, so
  // similarity is measured on content words with those stripped.
  const stop = new Set('the a an and or of to in for on with is are as that this it its by be should must can will not from at their which where what how one any each every management fraud risk organisation control controls'.split(' '));
  const tokens = (text: string) => new Set(text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((word) => word.length > 3 && !stop.has(word)));
  const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim().toLowerCase()).filter((sentence) => sentence.split(/\s+/).length >= 8);
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const [left, leftText] = entries[i]!;
      const [right, rightText] = entries[j]!;
      if (!leftText.trim() || !rightText.trim()) continue;
      const shared = sentences(leftText).filter((sentence) => sentences(rightText).includes(sentence));
      if (shared.length) issues.push({ slot: right.id, kind: 'SEMANTIC', code: 'DUPLICATE_SENTENCE', detail: `repeats ${left.id}` });
      const a = tokens(leftText); const b = tokens(rightText);
      const inter = [...a].filter((token) => b.has(token)).length;
      const union = new Set([...a, ...b]).size;
      const similarity = union ? inter / union : 0;
      if (similarity > 0.55) issues.push({ slot: right.id, kind: 'SEMANTIC', code: 'DUPLICATE_RESPONSIBILITY', detail: `${(similarity * 100).toFixed(0)}% content overlap with ${left.id}` });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

function contractBlock(contract: InterpretationSlotContract): string {
  return [
    `### ${contract.id}`,
    `Question it answers: ${contract.managementQuestion}`,
    `Your responsibility: ${contract.responsibility}`,
    `You may draw on: ${contract.mayUse.join('; ')}.`,
    `You must not: ${contract.mustNotDo.join('; ')}.`,
    `Length: ${contract.minWords}-${contract.maxWords} words.`
  ].join('\n');
}

/**
 * How the report's posture reads to a customer.
 *
 * The engine's mode token must not travel to the writer. Given the raw string,
 * a sustainment report opened with "The report is in SUSTAINMENT mode" — the
 * machinery's own vocabulary on a customer's page. A sentence of plain English
 * is also better guidance than a label the writer has to decode.
 */
const POSTURE: Record<string, string> = {
  REMEDIATION: 'This assessment calls for remediation: material weaknesses must be closed before the reported position can be relied on.',
  MIXED: 'This assessment is uneven: real capability exists alongside material weaknesses, and both are true at once.',
  SUSTAINMENT: 'This assessment is strong: the priority is sustaining and independently confirming the reported position, not remediating failure. Do not manufacture weakness that the analysis does not show.'
};

export function buildInterpretationPrompt(brief: InterpretationBrief, only?: InterpretationSlotId[]): string {
  const contracts = INTERPRETATION_CONTRACTS.filter((contract) => !only || only.includes(contract.id));
  // narrativeMode is retained on the brief for validation and withheld here.
  const { narrativeMode, ...visible } = brief;
  // Keep the raw gateway trace available on the returned evidence pack for technical audit, but
  // do not put positional answers in the provider payload. The provider receives the canonical
  // provenance-carrying facts instead, so it cannot silently apply a V1.1 meaning to a V1.2 G-code.
  const promptEvidencePack = {
    ...visible.evidencePack,
    operatingContext: {
      ...visible.evidencePack.operatingContext,
      gatewayAnswers: []
    }
  };
  const promptBrief = { ...visible, evidencePack: promptEvidencePack, posture: POSTURE[narrativeMode] ?? '' };
  return [
    'You are writing the management interpretation for an MK Fraud Readiness Comprehensive report.',
    '',
    'The analysis below is already complete and is the only authority you have. Your job is to explain what it means to an executive — to connect, prioritise and give significance. You are not summarising and you are not adding analysis.',
    '',
    'ABSOLUTE RULES',
    '- Every number you use must appear in the analysis below. Do not compute new ones, including percentages.',
    '- Do not invent a finding, risk, control, owner, action, measure, date, cost, incident or organisational fact. If the curated evidence pack does not record it, do not infer it.',
    '- The evidencePack is a curated executive evidence contract: use it to ground the interpretation, but do not treat technical IDs as customer prose and do not ask for or reconstruct the omitted raw assessment.',
    '- Use operatingContext.facts for operating-context meaning. The technical gateway trace is not a semantic mapping and is intentionally withheld from the writer payload.',
    '- Domain diagnostics are deterministic anchors for choosing the most important relationships. Use them selectively; do not write ten mini-essays or recite the domain table.',
    '- Never state or imply that MK examined evidence, tested a control, interviewed anyone or verified anything. The assessment is self-reported by the organisation.',
    '- Never state that a control currently exists or currently operates. Recommended designs are what good practice requires, not what the organisation does.',
    '- Write for a CFO or Head of Risk. Plain, specific, unhedged. No consultancy filler.',
    '- Each field below answers a different question. Do not repeat another field.',
    '- The executive interpretation must identify one important relationship between exposure, control position, strength or contradiction and explain the priority it creates. Do not list the ten domain scores or walk every finding.',
    '',
    '================ THE ANALYSIS ================',
    JSON.stringify(promptBrief),
    '',
    '================ WHAT TO WRITE ================',
    contracts.map(contractBlock).join('\n\n'),
    '',
    '================ OUTPUT ================',
    `Return exactly one JSON object with exactly these keys and no others: ${contracts.map((contract) => contract.id).join(', ')}.`,
    'Each value is a plain string of prose. No Markdown, no code fences, no commentary, no additional keys.'
  ].join('\n');
}

export interface InterpretationAccounting {
  calls: number;
  repairs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costMicros: number;
  durationMs: number;
  model: string;
  repairedSlots: InterpretationSlotId[];
}

export type ComprehensiveInterpretationFailureStage =
  | 'CREDENTIAL_VALIDATION'
  | 'PRE_DISPATCH'
  | 'PROVIDER_DISPATCH'
  | 'PROVIDER_RESPONSE'
  | 'RESPONSE_PARSE_OR_SCHEMA'
  | 'SAFETY_VALIDATION'
  | 'POST_PROCESSING'
  | 'UNKNOWN';

export type ComprehensiveInterpretationFailureReasonCode =
  | 'ai_gateway_credential_unavailable'
  | 'provider_call_failed_before_confirmed_response'
  | 'provider_or_gateway_returned_error'
  | 'provider_response_not_parseable_json'
  | 'provider_response_schema_invalid'
  | 'provider_response_missing_required_interpretation_slots'
  | 'interpretation_safety_unpublishable'
  | 'final_output_safety_evaluation_failed'
  | 'final_output_safety_unpublishable'
  | 'interpretation_accounting_persistence_failed'
  | 'management_report_render_failed'
  | 'report_artifact_construction_failed'
  | 'unclassified_comprehensive_failure';

export type DiagnosticTriState = 'yes' | 'no' | 'unknown';

/**
 * Bounded safety evidence retained only when an explicit non-production owner
 * acceptance seam needs to explain why a paid provider response was held. It
 * contains the parsed six-slot response and the cascade ledger, never the raw
 * prompt, headers or provider error object. Normal customer routes do not
 * expose this optional field.
 */
export interface ComprehensiveSafetyFailureEvidence {
  interpretation: ComprehensiveInterpretation;
  issues: Array<{
    slot: InterpretationSlotId;
    kind: InterpretationIssueKind;
    code: string;
    detail: string;
  }>;
  repairs: Array<{
    kind: string;
    slots: InterpretationSlotId[];
    replacements: number;
  }>;
  cascade: {
    policyVersion: string;
    publishable: boolean;
    blockingCodes: string[];
    heldForReviewCodes: string[];
    warningCodes: string[];
    repairCodes: string[];
    candidates: Array<{
      id: string;
      ruleCode: string;
      severity: string;
      path: string;
      span: string;
      spanHash: string;
      finalDisposition: string;
      decisions: Array<{
        layer: string;
        disposition: string;
        reasonCode: string;
      }>;
    }>;
  };
  candidateTrace: Array<{
    slot: InterpretationSlotId;
    path: string;
    spanHash: string;
    disposition: 'ALLOW' | 'REPAIR' | 'REJECT' | 'HOLD';
    reasonCode: string;
  }>;
}

/**
 * Bounded operational evidence for a failed Comprehensive interpretation.
 *
 * This deliberately contains no provider error text, headers, prompts, response
 * content or customer data. A gateway call can fail before the physical provider
 * boundary, so the dispatch/response fields remain tri-state rather than guessing.
 */
export interface ComprehensiveInterpretationFailureDiagnostics {
  stage: ComprehensiveInterpretationFailureStage;
  reasonCode: ComprehensiveInterpretationFailureReasonCode;
  provider: string;
  model: string;
  providerAttempted: DiagnosticTriState;
  providerDispatched: DiagnosticTriState;
  providerResponseReceived: DiagnosticTriState;
  gatewayResponseReceived: DiagnosticTriState;
  accountingAvailable: boolean;
  retryable: boolean;
  statusCode?: number;
  accounting: InterpretationAccounting;
  /** Present only for the explicit synthetic Preview owner-diagnostic seam. */
  safetyEvidence?: ComprehensiveSafetyFailureEvidence;
}

export class ComprehensiveInterpretationFailure extends Error {
  readonly diagnostics: ComprehensiveInterpretationFailureDiagnostics;

  constructor(diagnostics: ComprehensiveInterpretationFailureDiagnostics) {
    super(`Comprehensive interpretation failed at ${diagnostics.stage}.`);
    this.name = 'ComprehensiveInterpretationFailure';
    this.diagnostics = diagnostics;
  }
}

export function isComprehensiveInterpretationFailure(error: unknown): error is ComprehensiveInterpretationFailure {
  return error instanceof ComprehensiveInterpretationFailure;
}

export interface InterpretationRun {
  interpretation: ComprehensiveInterpretation;
  issues: InterpretationIssue[];
  accounting: InterpretationAccounting;
}

/**
 * Same credential rule as the Essential bounded writer: the model string carries
 * the provider, and the gateway is pinned to it so a silent substitution cannot
 * change who wrote the report.
 */
function requireCredential(model: string): { model: string; provider: string } {
  if (!model || !(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY)) {
    throw new Error('No AI gateway credential is available for Comprehensive interpretation.');
  }
  return { model, provider: model.split('/')[0]?.trim() || 'vercel-ai-gateway' };
}

const SYSTEM = 'You are the MK Fraud Readiness Comprehensive interpretation writer. The deterministic analysis you are given is the only authority. RETURN EXACTLY ONE JSON OBJECT as plain text: no commentary, no Markdown, no code fences, no additional keys.';

function parseObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object in provider output.');
  return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
}

function boundedStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as { statusCode?: unknown; responseStatusCode?: unknown };
  const value = typeof candidate.statusCode === 'number' ? candidate.statusCode : candidate.responseStatusCode;
  return typeof value === 'number' && Number.isInteger(value) && value >= 400 && value <= 599 ? value : undefined;
}

function retryableStatusCode(statusCode: number | undefined): boolean {
  return statusCode === 408 || statusCode === 425 || statusCode === 429 || (statusCode !== undefined && statusCode >= 500);
}

/**
 * One structured call for all six slots, then targeted repair of any slot that
 * fails. A failing slot never causes the other five to be regenerated.
 */
export async function generateComprehensiveInterpretation(brief: InterpretationBrief, options?: {
  model?: string;
  maxRepairsPerSlot?: number;
  timeoutMs?: number;
}): Promise<InterpretationRun> {
  const selection = selectNarrativeModel();
  const requestedModel = options?.model ?? selection.fallbackModels[0] ?? 'openai/gpt-5.6-luna';
  const maxRepairs = options?.maxRepairsPerSlot ?? 2;
  const timeoutMs = options?.timeoutMs ?? 240_000;
  const provider = requestedModel.split('/')[0]?.trim() || 'vercel-ai-gateway';
  const accounting: InterpretationAccounting = { calls: 0, repairs: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, costMicros: 0, durationMs: 0, model: requestedModel, repairedSlots: [] };
  const startedAt = Date.now();

  const fail = (input: Omit<ComprehensiveInterpretationFailureDiagnostics, 'provider' | 'model' | 'accounting'>): ComprehensiveInterpretationFailure => {
    accounting.durationMs = Date.now() - startedAt;
    return new ComprehensiveInterpretationFailure({
      ...input,
      provider,
      model: requestedModel,
      accounting: { ...accounting, repairedSlots: [...accounting.repairedSlots] }
    });
  };

  let resolved: { model: string; provider: string };
  try {
    resolved = requireCredential(requestedModel);
  } catch {
    throw fail({
      stage: 'CREDENTIAL_VALIDATION',
      reasonCode: 'ai_gateway_credential_unavailable',
      providerAttempted: 'no',
      providerDispatched: 'no',
      providerResponseReceived: 'no',
      gatewayResponseReceived: 'no',
      accountingAvailable: false,
      retryable: false
    });
  }

  const call = async (prompt: string) => {
    accounting.calls += 1;
    let response: any;
    try {
      response = await generateText({
        model: resolved.model,
        system: SYSTEM,
        prompt,
        output: Output.text(),
        maxOutputTokens: 6_000,
        maxRetries: 0,
        providerOptions: { gateway: { only: [resolved.provider] } },
        abortSignal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      const statusCode = boundedStatusCode(error);
      throw fail({
        stage: statusCode === undefined ? 'PROVIDER_DISPATCH' : 'PROVIDER_RESPONSE',
        reasonCode: statusCode === undefined ? 'provider_call_failed_before_confirmed_response' : 'provider_or_gateway_returned_error',
        providerAttempted: 'yes',
        providerDispatched: 'unknown',
        providerResponseReceived: 'unknown',
        gatewayResponseReceived: statusCode === undefined ? 'unknown' : 'yes',
        accountingAvailable: false,
        retryable: retryableStatusCode(statusCode),
        ...(statusCode === undefined ? {} : { statusCode })
      });
    }

    const inputTokens = Number(response?.usage?.inputTokens ?? 0);
    const outputTokens = Number(response?.usage?.outputTokens ?? 0);
    const totalTokens = Number(response?.usage?.totalTokens ?? 0);
    const cost = Number(response?.providerMetadata?.gateway?.cost ?? 0);
    accounting.inputTokens += Number.isFinite(inputTokens) ? inputTokens : 0;
    accounting.outputTokens += Number.isFinite(outputTokens) ? outputTokens : 0;
    accounting.totalTokens += Number.isFinite(totalTokens) ? totalTokens : 0;
    if (Number.isFinite(cost)) accounting.costMicros += Math.round(cost * 1e6);
    const text = typeof response.output === 'string' ? response.output : typeof response.text === 'string' ? response.text : '';
    try {
      return parseObject(text);
    } catch {
      throw fail({
        stage: 'RESPONSE_PARSE_OR_SCHEMA',
        reasonCode: 'provider_response_not_parseable_json',
        providerAttempted: 'yes',
        providerDispatched: 'yes',
        providerResponseReceived: 'yes',
        gatewayResponseReceived: 'yes',
        accountingAvailable: Boolean(inputTokens || outputTokens || totalTokens || cost),
        retryable: false
      });
    }
  };

  const initial = await call(buildInterpretationPrompt(brief));
  let current: Partial<ComprehensiveInterpretation>;
  try {
    current = interpretationSchema.partial().parse(initial) as Partial<ComprehensiveInterpretation>;
  } catch {
    throw fail({
      stage: 'RESPONSE_PARSE_OR_SCHEMA',
      reasonCode: 'provider_response_schema_invalid',
      providerAttempted: 'yes',
      providerDispatched: 'yes',
      providerResponseReceived: 'yes',
      gatewayResponseReceived: 'yes',
      accountingAvailable: Boolean(accounting.inputTokens || accounting.outputTokens || accounting.totalTokens || accounting.costMicros),
      retryable: false
    });
  }
  let issues = validateInterpretation(current, brief);

  for (let attempt = 1; attempt <= maxRepairs; attempt += 1) {
    const failing = [...new Set(issues.map((issue) => issue.slot))];
    if (!failing.length) break;
    const reasons = failing.map((slot) => `- ${slot}: ${issues.filter((issue) => issue.slot === slot).map((issue) => `${issue.code} (${issue.detail})`).join('; ')}`).join('\n');
    const prompt = [
      buildInterpretationPrompt(brief, failing),
      '',
      '================ REPAIR ================',
      'Your previous attempt at these fields was rejected. Correct only these reasons. Keep the meaning; change what the reasons name.',
      reasons,
      '',
      'PREVIOUS TEXT:',
      JSON.stringify(Object.fromEntries(failing.map((slot) => [slot, current[slot] ?? '']))),
      '',
      `Return exactly one JSON object with exactly these keys: ${failing.join(', ')}.`
    ].join('\n');
    const repaired = await call(prompt);
    accounting.repairs += 1;
    for (const slot of failing) {
      const value = repaired[slot];
      if (typeof value === 'string' && value.trim()) {
        current = { ...current, [slot]: value };
        if (!accounting.repairedSlots.includes(slot)) accounting.repairedSlots.push(slot);
      }
    }
    issues = validateInterpretation(current, brief);
  }

  accounting.durationMs = Date.now() - startedAt;
  try {
    return { interpretation: interpretationSchema.parse(current), issues, accounting };
  } catch {
    throw fail({
      stage: 'RESPONSE_PARSE_OR_SCHEMA',
      reasonCode: 'provider_response_missing_required_interpretation_slots',
      providerAttempted: 'yes',
      providerDispatched: 'yes',
      providerResponseReceived: 'yes',
      gatewayResponseReceived: 'yes',
      accountingAvailable: Boolean(accounting.inputTokens || accounting.outputTokens || accounting.totalTokens || accounting.costMicros),
      retryable: false
    });
  }
}

/** Map the six slots onto the renderer's commentary keys. */
export function interpretationToCommentary(interpretation: ComprehensiveInterpretation): Record<string, string> {
  return {
    'EXECUTIVE-POSITION': interpretation.executiveInterpretation,
    DIAGNOSIS: interpretation.whyThisMatters,
    EXPOSURE: interpretation.managementImplication,
    'CONTROL-PROGRAMMES': interpretation.controlProgrammeSynthesis,
    IMPLEMENTATION: interpretation.implementationSynthesis,
    CONCLUSION: interpretation.conclusion
  };
}
