import crypto from 'node:crypto';
import type { AssembledReportData, RoadmapItem } from '../types';
import type { AdvisoryEvidenceModel, CommercialQualityIssue } from '../evidence-model';
import { bandForScore } from '../select-content-blocks';
import {
  PREMIUM_REPORT_SCHEMA_VERSION,
  type PremiumReportEvidencePack,
  type ReportEvidenceItem
} from './types';

function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalise(item)])
  );
}

export function canonicalEvidenceJson(evidence: PremiumReportEvidencePack) {
  return JSON.stringify(canonicalise(evidence));
}

export function evidenceChecksum(evidence: PremiumReportEvidencePack) {
  return crypto.createHash('sha256').update(canonicalEvidenceJson(evidence)).digest('hex');
}

function coreEvidence(data: AssembledReportData): ReportEvidenceItem[] {
  const score = data.scoreRun;
  return [
    { id: 'score:overall', kind: 'overall_score', label: 'Overall readiness score', value: score.overallScore },
    { id: 'score:calculated_maturity', kind: 'calculated_maturity', label: 'Calculated maturity', value: score.calculatedMaturity },
    { id: 'score:final_maturity', kind: 'final_maturity', label: 'Final maturity', value: score.finalMaturity },
    { id: 'score:exposure', kind: 'exposure_score', label: 'Exposure score', value: score.exposureScore },
    { id: 'score:exposure_band', kind: 'exposure_band', label: 'Exposure band', value: score.exposureBand },
    { id: 'score:coverage', kind: 'coverage', label: 'Assessment coverage percentage', value: score.coveragePct },
    { id: 'gaps:critical_count', kind: 'gap_count', label: 'Critical gap count', value: score.criticalGapCount },
    { id: 'gaps:major_count', kind: 'gap_count', label: 'Major gap count', value: score.majorGapCount }
  ];
}

function domainEvidence(data: AssembledReportData): ReportEvidenceItem[] {
  return data.domainResults.map((domain) => ({
    id: `domain:${domain.domainCode}`,
    kind: 'domain' as const,
    domainCode: domain.domainCode,
    label: domain.domainName,
    value: {
      domainName: domain.domainName,
      weightPct: domain.weightPct,
      rawScore: domain.rawScore,
      maturityBand: bandForScore(domain.rawScore),
      coveragePct: domain.coveragePct,
      criticalGapCount: domain.criticalGapCount
    }
  }));
}

function gapEvidence(data: AssembledReportData): ReportEvidenceItem[] {
  return data.criticalMajorGaps.map((gap) => ({
    id: `gap:${gap.questionCode}`,
    kind: 'gap' as const,
    domainCode: gap.domainCode,
    questionCode: gap.questionCode,
    label: gap.prompt,
    value: {
      responseValue: gap.responseValue,
      isCritical: gap.isCritical,
      isHardGate: gap.isHardGate,
      isCriticalGap: gap.isCriticalGap,
      isMajorGap: gap.isMajorGap
    }
  }));
}

function questionEvidence(data: AssembledReportData): ReportEvidenceItem[] {
  return data.questionTraces.map((trace) => ({
    id: `question:${trace.questionCode}`,
    kind: 'question_response' as const,
    domainCode: trace.domainCode,
    questionCode: trace.questionCode,
    label: trace.prompt,
    value: {
      responseValue: trace.responseValue,
      isCritical: trace.isCritical,
      isHardGate: trace.isHardGate,
      isCriticalGap: trace.isCriticalGap,
      isMajorGap: trace.isMajorGap,
      applicable: trace.applicable
    },
    evidenceRefs: [`domain:${trace.domainCode}`]
  }));
}

function maturityCapEvidence(data: AssembledReportData): ReportEvidenceItem[] {
  return data.maturityCapEvents.map((event) => ({
    id: `cap:${event.ruleCode}:${event.relatedQuestionCode ?? event.relatedDomainCode ?? 'global'}`,
    kind: 'maturity_cap' as const,
    domainCode: event.relatedDomainCode ?? undefined,
    questionCode: event.relatedQuestionCode ?? undefined,
    ruleCode: event.ruleCode,
    label: event.reason,
    value: {
      capTo: event.capTo,
      relatedQuestionCode: event.relatedQuestionCode,
      relatedDomainCode: event.relatedDomainCode
    },
    evidenceRefs: event.relatedQuestionCode ? [`question:${event.relatedQuestionCode}`] : event.relatedDomainCode ? [`domain:${event.relatedDomainCode}`] : []
  }));
}

function advisoryEvidence(model: AdvisoryEvidenceModel): ReportEvidenceItem[] {
  return [
    ...model.materialFindings.map((finding) => ({
      id: `finding:${finding.id}`, kind: 'material_finding' as const, domainCode: finding.domainCode,
      questionCode: finding.questionCode, label: finding.title, value: finding,
      evidenceRefs: [`question:${finding.questionCode}`, `domain:${finding.domainCode}`]
    })),
    ...model.riskRegister.map((risk) => ({ id: `risk:${risk.id}`, kind: 'risk' as const, label: risk.title, value: risk, evidenceRefs: risk.evidenceRefs })),
    ...model.contradictions.map((item) => ({ id: `contradiction:${item.id}`, kind: 'contradiction' as const, label: item.title, value: item, evidenceRefs: item.evidenceRefs })),
    ...model.scenarios.map((scenario) => ({ id: `scenario:${scenario.id}`, kind: 'plausible_scenario' as const, label: scenario.title, value: scenario, evidenceRefs: scenario.evidenceRefs })),
    ...model.controlImprovements.map((control) => ({ id: `control:${control.id}`, kind: 'control_improvement' as const, questionCode: control.linkedQuestionCode, label: control.controlObjective, value: control, evidenceRefs: control.evidenceRefs })),
    ...model.evidenceChecklist.map((item) => ({ id: item.evidenceRef, kind: 'evidence_checklist' as const, label: item.artefact, value: item, evidenceRefs: [...item.linkedFindingIds.map((id) => `finding:${id}`), ...item.linkedRiskIds.map((id) => `risk:${id}`), ...item.linkedQuestionCodes.map((code) => `question:${code}`)].sort() })),
    ...model.leadershipDecisions.map((decision) => ({ id: `decision:${decision.id}`, kind: 'leadership_decision' as const, label: decision.decisionRequired, value: decision, evidenceRefs: decision.evidenceRefs })),
    ...model.roadmapActions.map((action) => ({ id: `roadmap:${action.id}`, kind: 'roadmap_action' as const, domainCode: action.domainCode, label: action.deliverable, value: action, evidenceRefs: action.evidenceRefs })),
    { id: 'limitation:self_assessment', kind: 'assessment_limitation' as const, label: 'Assessment limitation', value: 'Self-assessment only, not independently verified.', evidenceRefs: [] }
  ];
}

function roadmapEvidence(roadmap: { agenda: RoadmapItem[] }): ReportEvidenceItem[] {
  return roadmap.agenda.map((item) => ({
    id: `roadmap:${item.domainCode ?? item.ruleCode}`,
    kind: 'roadmap' as const,
    domainCode: item.domainCode ?? undefined,
    ruleCode: item.ruleCode,
    label: item.domainName,
    value: {
      ownerRole: item.ownerRole,
      rationale: item.rationale,
      severity: item.severity,
      action30: item.action30,
      action60: item.action60,
      action90: item.action90,
      priorityScore: item.priorityScore
    }
  }));
}

/**
 * Every other evidence field is deterministic/MK-authored (question prompts, domain names,
 * product names, generated references). organisationName is the one field that ultimately
 * traces back to customer-entered free text (organisations.legal_name / trading_name / the
 * manual-order organisation_name field), and it is embedded verbatim into the AI prompt via
 * JSON.stringify(evidence). This is the actual, narrow prompt-injection surface for Phase 14 --
 * respondent assessment answers are numeric (see AssembledReportData['criticalMajorGaps']
 * responseValue: number), so they never carry attacker-controlled text into the model.
 *
 * This sanitiser is defense-in-depth, not the primary control. The primary control is that
 * validatePremiumReportNarrative (validation.ts) fact-checks every claim in AI-authored body
 * text against the deterministic evidence pack regardless of what organisationName says, so an
 * injected instruction cannot manufacture a score, band, or fact that survives validation. This
 * function strips characters commonly used to smuggle instructions past a casual review
 * (control characters, bidi override characters, zero-width characters), applies Unicode NFKC
 * normalisation (closes full-width/homoglyph obfuscation of the same kind normaliseAiIdentifier
 * already closes for AI-returned identifiers), and bounds length.
 */
const UNTRUSTED_TEXT_STRIP_PATTERN = new RegExp(
  [
    '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', // C0 controls except \t \n \r
    '[\\u200B-\\u200F]', // zero-width space/joiners, LRM/RLM
    '[\\u202A-\\u202E]', // bidi embedding/override
    '[\\u2060-\\u2069]', // word joiner / invisible operators
    '\\uFEFF' // BOM
  ].join('|'),
  'g'
);

export function sanitiseUntrustedEvidenceText(value: string, maxLength = 200): string {
  // Replace (not delete) stripped characters with a space. Zero-width/invisible characters are a
  // known technique for defeating keyword scanners by removing the whitespace between words in an
  // injected instruction (e.g. "Ignore<ZWSP>all<ZWSP>previous<ZWSP>instructions") -- deleting them
  // outright would silently reassemble the words into "Ignoreallpreviousinstructions" and hide the
  // pattern from scanForPromptInjection below. Collapsing to a single space afterwards keeps the
  // display text clean either way.
  const normalised = value.normalize('NFKC').replace(UNTRUSTED_TEXT_STRIP_PATTERN, ' ');
  const collapsed = normalised.replace(/\s+/g, ' ').trim();
  return collapsed.length > maxLength ? `${collapsed.slice(0, maxLength).trim()}...` : collapsed;
}

const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  /\bignore\s+(all|any|the)?\s*(previous|prior|above)\s+instructions?\b/i,
  /\bdisregard\s+(all|any|the)?\s*(previous|prior|above)\s+(instructions?|prompt)\b/i,
  /\byou\s+are\s+now\b/i,
  /\bnew\s+instructions?\s*:/i,
  /\bsystem\s*:\s*/i,
  /\bact\s+as\s+(a|an)\b/i,
  /\bdo\s+not\s+mention\b/i,
  /\breveal\s+your\s+(system\s+)?(prompt|instructions)\b/i,
  /\boutput\s+the\s+following\s+exactly\b/i,
  /\bchange\s+the\s+(score|maturity|rating|band)\b/i,
  /\bset\s+the\s+(score|maturity|rating|band)\s+to\b/i,
  /\bemail\s+(the\s+report|this)\s+to\b/i,
  /\bsend\s+(the\s+report|this)\s+to\b/i
];

export interface PromptInjectionScan {
  suspicious: boolean;
  matchedPattern?: string;
}

/**
 * A cheap, maintainable heuristic -- not a substitute for output validation. If it fires, the
 * caller (narrative-pipeline.ts) skips AI generation entirely for that run and goes straight to
 * the deterministic fallback rather than spending an AI call on input it does not trust. Even if
 * this heuristic is evaded, validatePremiumReportNarrative still blocks any resulting unsupported
 * claim from reaching the report.
 */
export function scanForPromptInjection(value: string): PromptInjectionScan {
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(value)) return { suspicious: true, matchedPattern: pattern.source };
  }
  return { suspicious: false };
}

export function buildPremiumReportEvidencePack(
  data: AssembledReportData,
  roadmapOrModel: { agenda: RoadmapItem[] } | AdvisoryEvidenceModel,
  schemaVersion = PREMIUM_REPORT_SCHEMA_VERSION
): PremiumReportEvidencePack {
  const advisoryModel = 'roadmapActions' in roadmapOrModel ? roadmapOrModel : undefined;
  const items = [
    ...coreEvidence(data),
    ...domainEvidence(data),
    ...gapEvidence(data),
    ...(advisoryModel ? questionEvidence(data) : []),
    ...maturityCapEvidence(data),
    ...(advisoryModel ? advisoryEvidence(advisoryModel) : roadmapEvidence(roadmapOrModel as { agenda: RoadmapItem[] }))
  ].sort((left, right) => left.id.localeCompare(right.id));

  return {
    schemaVersion,
    assessmentReference: data.assessmentReference,
    organisationName: sanitiseUntrustedEvidenceText(data.organisationName, 200),
    packageName: sanitiseUntrustedEvidenceText(data.packageName, 200),
    scoreRunId: data.scoreRun.id,
    methodologyVersionId: data.scoreRun.methodologyVersionId,
    generatedAt: data.generatedAt,
    selfAssessmentLimitation: 'Self-assessment only, not independently verified.',
    methodologyAuthority: 'deterministic',
    narrativeAuthority: 'ai_optional_validated',
    advisoryModel,
    items
  };
}

/** Mechanical Checkpoint D validation of the closed evidence-reference and privacy boundary. */
export function validatePremiumReportEvidencePack(
  evidence: PremiumReportEvidencePack,
  sensitiveValues: string[] = []
): CommercialQualityIssue[] {
  const issues: CommercialQualityIssue[] = [];
  const ids = evidence.items.map((item) => item.id);
  const known = new Set(ids);
  if (known.size !== ids.length) {
    issues.push({ code: 'QG_AI_EVIDENCE_REF_DUPLICATE', severity: 'violation', message: 'AI evidence pack contains duplicate evidence IDs.', source: 'ai-evidence' });
  }
  for (const item of evidence.items) {
    for (const ref of item.evidenceRefs ?? []) {
      if (!known.has(ref)) {
        issues.push({ code: 'QG_AI_EVIDENCE_REF_UNRESOLVED', severity: 'violation', message: `Evidence item ${item.id} contains unresolved reference ${ref}.`, entityId: item.id, source: 'ai-evidence' });
      }
    }
  }
  const canonical = canonicalEvidenceJson(evidence);
  const prohibitedKey = /"(?:customerEmail|respondentName|adminNotes|eft|token|secret|password|authorization)"\s*:/i;
  const leakedValue = sensitiveValues.filter((value) => value.trim().length > 0).some((value) => canonical.includes(value));
  if (prohibitedKey.test(canonical) || leakedValue) {
    issues.push({ code: 'QG_AI_EVIDENCE_CONTAINS_PII', severity: 'violation', message: 'AI evidence pack contains a prohibited sensitive field or value.', source: 'ai-evidence' });
  }
  return issues;
}
