import { assembleReportData } from '@/lib/reports/assemble-report-data';
import { buildAdvisoryEvidenceModel } from '@/lib/reports/evidence-model';
import type { AssembledReportData } from '@/lib/reports/types';

export const COMPREHENSIVE_RECORD_TYPES = ['finding', 'risk', 'control_design', 'decision', 'management_action'] as const;
export type ComprehensiveRecordType = (typeof COMPREHENSIVE_RECORD_TYPES)[number];

export type ComprehensiveSubject = {
  subjectKey: string;
  title: string;
  detail: string;
  domain?: string;
  materiality?: number;
  priority?: string;
  evidenceRefs: string[];
  linkedFindingIds: string[];
  linkedRiskIds: string[];
};

export type ComprehensiveSubjectAuthority = {
  assessmentId: string;
  scoreRunId: string;
  findings: ComprehensiveSubject[];
  risks: ComprehensiveSubject[];
  controlDesigns: ComprehensiveSubject[];
  decisions: ComprehensiveSubject[];
  managementActions: ComprehensiveSubject[];
  allEvidenceRefs: string[];
};

const unique = (values: string[]) => [...new Set(values.filter((value) => value.trim() !== '').map((value) => value.trim()))].sort();

function findingEvidenceRefs(findingId: string, evidenceModel: ReturnType<typeof buildAdvisoryEvidenceModel>) {
  return unique(evidenceModel.evidenceChecklist
    .filter((item) => item.linkedFindingIds.includes(findingId))
    .map((item) => item.evidenceRef));
}

/**
 * Builds the reviewer subject authority from the same persisted score run used by the
 * Comprehensive report. The returned fields are intentionally bounded display fields; callers do
 * not receive raw assessment answers, storage paths, or customer identity.
 */
export function buildComprehensiveSubjectAuthority(data: AssembledReportData): ComprehensiveSubjectAuthority {
  const evidenceModel = buildAdvisoryEvidenceModel(data);
  const findings = evidenceModel.materialFindings.map((finding) => ({
    subjectKey: finding.id,
    title: finding.title,
    detail: finding.whyItMatters,
    domain: finding.domainName,
    materiality: finding.materialityScore,
    evidenceRefs: findingEvidenceRefs(finding.id, evidenceModel),
    linkedFindingIds: [finding.id],
    linkedRiskIds: evidenceModel.riskRegister.filter((risk) => risk.linkedFindingIds.includes(finding.id)).map((risk) => risk.id)
  }));
  const risks = evidenceModel.riskRegister.map((risk) => ({
    subjectKey: risk.id,
    title: risk.title,
    detail: risk.riskStatement,
    priority: risk.priority,
    evidenceRefs: unique(risk.evidenceRefs),
    linkedFindingIds: unique(risk.linkedFindingIds),
    linkedRiskIds: [risk.id]
  }));
  const controlDesigns = evidenceModel.controlImprovements.map((control) => ({
    subjectKey: control.id,
    title: control.controlObjective,
    detail: control.controlDesign,
    evidenceRefs: unique(control.evidenceRefs),
    linkedFindingIds: unique([control.linkedFindingId]),
    linkedRiskIds: unique(control.linkedRiskIds)
  }));
  const decisions = evidenceModel.leadershipDecisions.map((decision) => ({
    subjectKey: decision.id,
    title: decision.decisionRequired,
    detail: decision.recommendedDecision,
    evidenceRefs: unique(decision.evidenceRefs),
    linkedFindingIds: unique(decision.linkedFindingIds),
    linkedRiskIds: unique(decision.linkedRiskIds)
  }));
  const managementActions = evidenceModel.roadmapActions.map((action) => ({
    subjectKey: action.id,
    title: action.deliverable,
    detail: action.evidenceOfCompletion,
    domain: action.domainName,
    evidenceRefs: unique(action.evidenceRefs),
    linkedFindingIds: unique(action.linkedFindingIds),
    linkedRiskIds: unique(action.linkedRiskIds)
  }));
  // The complete authoritative reference universe.
  //
  // This was previously the evidence checklist alone, i.e. only 'evidence:*' refs. Findings carry
  // those refs, but risks, control designs, decisions and management actions carry 'finding:*',
  // 'question:*' and 'risk:*' refs instead. That made the two validators demand disjoint sets:
  // validateComprehensiveSubject() (save time) accepts only refs belonging to the specific subject,
  // while requireKnownEvidenceRefs() (generation time) accepted only this list. A risk record could
  // therefore be saved and could never pass generation, so no Comprehensive package could ever be
  // produced. The reviewer UI has the same dead end -- it offers allEvidenceRefs as the option
  // source for every record type.
  //
  // The union below is drawn ONLY from refs already attached to authorised analytical subjects and
  // from the evidence checklist. No reference is invented, and a ref that belongs to no subject and
  // no checklist item remains unknown and still fails. Subject-specific validation in
  // review-record-service is untouched, so a ref authorised for one subject is still rejected on
  // another.
  const allEvidenceRefs = unique([
    ...evidenceModel.evidenceChecklist.map((item) => item.evidenceRef),
    ...findings.flatMap((subject) => subject.evidenceRefs),
    ...risks.flatMap((subject) => subject.evidenceRefs),
    ...controlDesigns.flatMap((subject) => subject.evidenceRefs),
    ...decisions.flatMap((subject) => subject.evidenceRefs),
    ...managementActions.flatMap((subject) => subject.evidenceRefs)
  ]);
  return {
    assessmentId: data.assessmentId,
    scoreRunId: data.currentScoreRunId,
    findings,
    risks,
    controlDesigns,
    decisions,
    managementActions,
    allEvidenceRefs
  };
}

export async function loadComprehensiveSubjectAuthority(orderReference: string) {
  return buildComprehensiveSubjectAuthority(await assembleReportData(orderReference));
}

export function subjectsForRecordType(authority: ComprehensiveSubjectAuthority, recordType: ComprehensiveRecordType) {
  switch (recordType) {
    case 'finding': return authority.findings;
    case 'risk': return authority.risks;
    case 'control_design': return authority.controlDesigns;
    case 'decision': return authority.decisions;
    case 'management_action': return authority.managementActions;
  }
}

export function findComprehensiveSubject(authority: ComprehensiveSubjectAuthority, recordType: ComprehensiveRecordType, subjectKey: string) {
  return subjectsForRecordType(authority, recordType).find((subject) => subject.subjectKey === subjectKey.trim()) ?? null;
}

export function validateComprehensiveSubject(
  authority: ComprehensiveSubjectAuthority,
  recordType: ComprehensiveRecordType,
  subjectKey: string,
  evidenceRefs: string[]
) {
  const subject = findComprehensiveSubject(authority, recordType, subjectKey);
  if (!subject) throw new Error(`Comprehensive ${recordType} subject is not part of the current assessment: ${subjectKey}`);
  const refs = unique(evidenceRefs);
  if (refs.length === 0) throw new Error(`Comprehensive ${recordType} ${subject.subjectKey} must bind at least one analytical evidence reference.`);
  const allowed = new Set(subject.evidenceRefs);
  if (refs.some((ref) => !allowed.has(ref))) {
    throw new Error(`Comprehensive ${recordType} ${subject.subjectKey} references evidence outside its analytical universe.`);
  }
  return { subject, evidenceRefs: refs };
}
