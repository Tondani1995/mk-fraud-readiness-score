import crypto from 'node:crypto';
import type { AssembledReportData, RoadmapItem } from '../types';
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

function maturityCapEvidence(data: AssembledReportData): ReportEvidenceItem[] {
  return data.maturityCapEvents.map((event) => ({
    id: `cap:${event.ruleCode}`,
    kind: 'maturity_cap' as const,
    domainCode: event.relatedDomainCode ?? undefined,
    questionCode: event.relatedQuestionCode ?? undefined,
    ruleCode: event.ruleCode,
    label: event.reason,
    value: {
      capTo: event.capTo,
      relatedQuestionCode: event.relatedQuestionCode,
      relatedDomainCode: event.relatedDomainCode
    }
  }));
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
  roadmap: { agenda: RoadmapItem[] },
  schemaVersion = PREMIUM_REPORT_SCHEMA_VERSION
): PremiumReportEvidencePack {
  const items = [
    ...coreEvidence(data),
    ...domainEvidence(data),
    ...gapEvidence(data),
    ...maturityCapEvidence(data),
    ...roadmapEvidence(roadmap)
  ].sort((left, right) => left.id.localeCompare(right.id));

  return {
    schemaVersion,
    assessmentReference: data.assessmentReference,
    organisationName: sanitiseUntrustedEvidenceText(data.organisationName, 200),
    packageName: sanitiseUntrustedEvidenceText(data.packageName, 200),
    scoreRunId: data.scoreRun.id,
    methodologyAuthority: 'deterministic',
    items
  };
}
