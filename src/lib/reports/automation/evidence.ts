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
    organisationName: data.organisationName,
    packageName: data.packageName,
    scoreRunId: data.scoreRun.id,
    methodologyAuthority: 'deterministic',
    items
  };
}
