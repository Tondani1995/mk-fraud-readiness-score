import type { AssembledReportData } from '../types';
import type {
  AdvisoryEvidenceModel,
  EvidenceChecklistItem,
  MaterialFinding,
  RoadmapAction
} from '../evidence-model';
import type { EssentialProjection } from '../essential-projection';
import { buildEssentialAdaptationContext } from '../essential-presentation-adaptation';
import { adaptiveGraphVersionForAssessment } from '../narrative/operating-context';
import {
  buildEssentialOrganisationContext,
  contextRationaleForFamily,
  contextScopeForFamily
} from './customer-context';
import { familyPresentation } from './content-families';

export const ESSENTIAL_ACTION_REGISTER_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const ESSENTIAL_ACTION_REGISTER_SHEET_NAME = 'Action & Proof Register';
export const ESSENTIAL_ACTION_REGISTER_SUMMARY_SHEET_NAME = 'Summary';
export const ESSENTIAL_ACTION_REGISTER_STATUS_VALUES = [
  'Not started',
  'In progress',
  'Complete',
  'Deferred'
] as const;
export type EssentialActionRegisterStatus = typeof ESSENTIAL_ACTION_REGISTER_STATUS_VALUES[number];

/** The customer promise is deliberately one sentence and is shared by PDF and workbook tests. */
export const ESSENTIAL_ACTION_REGISTER_PROMISE =
  'Your Essential package includes a focused Action & Proof Register supporting the priority 30/60/90 management actions in this report.';

/** Visible columns. Source identities are retained on the internal row object, never in cells. */
export const ESSENTIAL_ACTION_REGISTER_HEADERS = [
  'Priority ID',
  'Priority / finding title',
  'Domain',
  'Assessed condition',
  'Priority rationale',
  'Management action',
  'Accountable role',
  'Target period',
  'Required population',
  'Evidence to retain',
  'Completion / effectiveness test',
  'Escalation trigger',
  'Status',
  'Management notes'
] as const;

export interface EssentialActionProofRegisterRow {
  priorityId: string;
  sourceActionId: string;
  sourceFindingIds: string[];
  sourceEvidenceIds: string[];
  priorityTitle: string;
  domain: string;
  assessedCondition: string;
  priorityRationale: string;
  managementAction: string;
  accountableRole: string;
  targetPeriod: RoadmapAction['period'];
  requiredPopulation: string;
  evidenceToRetain: string;
  completionEffectivenessTest: string;
  escalationTrigger: string;
  status: EssentialActionRegisterStatus;
  managementNotes: string;
}

export interface EssentialActionProofRegisterProjection {
  productLabel: 'Essential';
  organisationName: string;
  assessmentReference: string;
  reportReference: string;
  score: number | null;
  maturity: string;
  pdfFileName: string;
  registerFileName: string;
  requiredArtefacts: readonly ['pdf', 'supporting_register'];
  rows: EssentialActionProofRegisterRow[];
}

export interface EssentialPackageCompletenessInput {
  pdfBytes?: Uint8Array | null;
  register?: {
    storagePath?: string | null;
    fileName?: string | null;
    mimeType?: string | null;
    fileSizeBytes?: number | null;
    checksumSha256?: string | null;
  } | null;
}

export class EssentialPackageCompletenessError extends Error {
  readonly code = 'essential_package_incomplete';
  readonly missingArtifacts: readonly string[];

  constructor(missingArtifacts: string[]) {
    super(`The Essential package is incomplete: ${missingArtifacts.join(', ')}.`);
    this.name = 'EssentialPackageCompletenessError';
    this.missingArtifacts = missingArtifacts;
  }
}

export function assertEssentialPackageComplete(input: EssentialPackageCompletenessInput): void {
  const missing: string[] = [];
  if (!input.pdfBytes || input.pdfBytes.length === 0) missing.push('pdf');
  const register = input.register;
  if (
    !register
    || !register.storagePath
    || !register.fileName
    || !register.mimeType
    || !register.fileSizeBytes
    || register.fileSizeBytes <= 0
    || !register.checksumSha256
  ) {
    missing.push('supporting_register');
  }
  if (missing.length > 0) throw new EssentialPackageCompletenessError(missing);
}

function cleanReference(value: string): string {
  return value
    .replace(/^RPT-/i, '')
    .replace(/-V\d+$/i, '')
    .replace(/-COMP(?=-|$)/i, '-ESS');
}

function versionFromReference(value: string | undefined): number | undefined {
  const match = String(value ?? '').match(/-V(\d+)$/i);
  return match ? Number(match[1]) : undefined;
}

export function buildEssentialReportReference(
  assessmentReference: string,
  versionNumber: number
): string {
  const version = Number.isFinite(Number(versionNumber)) && Number(versionNumber) > 0
    ? Math.trunc(Number(versionNumber))
    : 1;
  return `RPT-${cleanReference(assessmentReference)}-V${version}`;
}

function customerOrganisationLabel(organisationName: string): string {
  const withoutParenthetical = String(organisationName ?? '').replace(/\([^)]*\)/g, ' ');
  const withoutLegalSuffix = withoutParenthetical
    .replace(/\b(?:PROPRIETARY|PTY|LIMITED|LTD|INCORPORATED|INC|LLC|CC)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  const words = withoutLegalSuffix.split(/\s+/).filter(Boolean);
  return (words.length > 0 ? words : ['Organisation'])
    .map((word) => word.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''))
    .join('_');
}

export function buildEssentialCustomerPdfFileName(organisationName: string): string {
  return `MK_Fraud_Readiness_Essential_${customerOrganisationLabel(organisationName)}.pdf`;
}

export function buildEssentialActionRegisterFileName(organisationName: string): string {
  return `MK_Fraud_Readiness_Essential_Action_Register_${customerOrganisationLabel(organisationName)}.xlsx`;
}

export function priorityIdForIndex(index: number): string {
  return `P-${String(index + 1).padStart(2, '0')}`;
}

function sentence(value: unknown): string {
  const rendered = String(value ?? '').trim();
  if (!rendered) return '';
  return /[.!?]$/.test(rendered) ? rendered : `${rendered}.`;
}

function uniqueSentences(values: readonly (string | undefined | null)[]): string {
  const seen = new Set<string>();
  return values
    .map((value) => sentence(value))
    .filter((value) => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(' ');
}

/**
 * Customer-facing action wording shared by the PDF roadmap and the workbook.
 * The action design and escalation trigger remain in the canonical roadmap object; this helper
 * only removes the internal lead-in and keeps the full design visible to management.
 */
export function customerManagementAction(action: Pick<RoadmapAction, 'deliverable' | 'domainName'>): string {
  const match = action.deliverable.match(
    /^Apply immediate escalation at "([^"]+)" and deliver the exact control design:\s*(.+)$/i
  );
  if (!match) return sentence(action.deliverable);
  const trigger = match[1].trim().replace(/[.;]+$/, '');
  const design = match[2].trim().replace(/[.;]+$/, '');
  return sentence(`Implement the target control design for ${action.domainName}: ${design}; Escalation trigger: ${trigger}`);
}

function linkedFinding(
  action: RoadmapAction,
  projection: EssentialProjection,
  model: AdvisoryEvidenceModel
): MaterialFinding | undefined {
  const projected = new Map(projection.findings.map((finding) => [finding.id, finding]));
  const full = new Map(model.materialFindings.map((finding) => [finding.id, finding]));
  for (const findingId of action.linkedFindingIds) {
    const finding = projected.get(findingId) ?? full.get(findingId);
    if (finding) return finding;
  }
  return undefined;
}

function linkedEvidence(
  action: RoadmapAction,
  projection: EssentialProjection,
  model: AdvisoryEvidenceModel
): EvidenceChecklistItem[] {
  const actionFindingIds = new Set(action.linkedFindingIds);
  const selected = projection.evidenceToObtain.filter((item) =>
    item.linkedFindingIds.some((findingId) => actionFindingIds.has(findingId))
  );
  const fallback = model.evidenceChecklist.filter((item) =>
    item.linkedFindingIds.some((findingId) => actionFindingIds.has(findingId))
  );
  const evidence = selected.length > 0 ? selected : fallback;
  return evidence.slice(0, 3);
}

function priorityTitle(
  action: RoadmapAction,
  finding: MaterialFinding | undefined,
  usedTitles: Set<string>
): string {
  const familyLabel = familyPresentation(finding?.primarySemanticFamily)?.shortLabel;
  // Some exact-question playbooks intentionally have no semantic-family short label. Their raw
  // question prompt is not a customer title, so use the governed domain name as the stable
  // business fallback rather than exposing a control sentence as a heading.
  const base = familyLabel || `${action.domainName}: management and proof`;
  if (!usedTitles.has(base)) {
    usedTitles.add(base);
    return base;
  }
  const qualified = `${base} — ${action.domainName}`;
  usedTitles.add(qualified);
  return qualified;
}

function assessedCondition(finding: MaterialFinding | undefined, action: RoadmapAction): string {
  if (!finding) return `The ${action.domainName} priority action requires a defined control condition and operating proof.`;
  return uniqueSentences([
    `Recorded response: ${finding.responseLabel} — ${finding.responseOperationalMeaning}`,
    `Diagnosis: ${finding.diagnosis}`
  ]);
}

function requiredPopulation(
  finding: MaterialFinding | undefined,
  context: ReturnType<typeof buildEssentialOrganisationContext>,
  evidence: EvidenceChecklistItem[]
): string {
  const scoped = finding ? contextScopeForFamily(context, finding.primarySemanticFamily) : undefined;
  const fallback = evidence[0]?.requiredPopulation || 'the complete in-scope population';
  const raw = String(scoped || fallback).trim().replace(/[.]$/, '');
  const withoutExistingPeriod = raw.replace(/\s+for the stated operating period.*$/i, '').trim();
  const locationQualifier = context.multiSite && !/operating locations/i.test(withoutExistingPeriod)
    ? ' across operating locations'
    : '';
  const population = /\bcomplete(?:\s+in[- ]scope)?\s+population\b/i.test(withoutExistingPeriod)
    ? withoutExistingPeriod
    : `Complete population covering ${withoutExistingPeriod}`;
  return sentence(`${population}${locationQualifier} for the stated operating period, reconciled to the source system or register`);
}

function evidenceToRetain(action: RoadmapAction, evidence: EvidenceChecklistItem[]): string {
  const evidenceLines = evidence.map((item) => {
    const characteristics = item.minimumAcceptableCharacteristics.filter(Boolean).join('; ');
    return `${item.artefact}: ${item.provesWhat}${characteristics ? ` Minimum characteristics: ${characteristics}` : ''}`;
  });
  const completion = action.evidenceOfCompletion ? `Action completion record: ${action.evidenceOfCompletion}` : '';
  return uniqueSentences([...evidenceLines, completion, 'Retain the dated approval, review or exception record with the source population.']);
}

function completionTest(action: RoadmapAction, evidence: EvidenceChecklistItem[]): string {
  const evidenceTest = evidence
    .flatMap((item) => item.minimumAcceptableCharacteristics)
    .filter(Boolean)
    .slice(0, 2)
    .join('; ');
  return uniqueSentences([
    action.successMeasure,
    action.evidenceOfCompletion,
    evidenceTest ? `Evidence must show ${evidenceTest}` : 'Evidence must show the control operating across the required population, with exceptions resolved or escalated.'
  ]);
}

function priorityRationale(
  finding: MaterialFinding | undefined,
  context: ReturnType<typeof buildEssentialOrganisationContext>
): string {
  if (!finding) return 'This action is sequenced to establish accountable control ownership and operating proof.';
  return uniqueSentences([
    contextRationaleForFamily(context, finding.primarySemanticFamily),
    finding.whyItMatters,
    finding.fraudMechanism ? `Fraud mechanism: ${finding.fraudMechanism}` : undefined
  ]);
}

function versionFor(data: AssembledReportData): number {
  return versionFromReference(data.reportReference) ?? 1;
}

function reportReferenceFor(data: AssembledReportData): string {
  const existing = String(data.reportReference ?? '').trim();
  if (/-ESS-/i.test(existing) && /-V\d+$/i.test(existing)) return existing;
  return buildEssentialReportReference(data.assessmentReference, versionFor(data));
}

export function buildEssentialActionProofRegisterProjection(input: {
  data: AssembledReportData;
  model: AdvisoryEvidenceModel;
  projection: EssentialProjection;
}): EssentialActionProofRegisterProjection {
  const { data, model, projection } = input;
  const adaptation = buildEssentialAdaptationContext({
    gatewayAnswers: data.adaptiveGatewayAnswers,
    graphVersion: adaptiveGraphVersionForAssessment(data)
  });
  const context = buildEssentialOrganisationContext(adaptation.operatingContext);
  const usedTitles = new Set<string>();
  const rows = projection.roadmapActions.map((action, index) => {
    const finding = linkedFinding(action, projection, model);
    const evidence = linkedEvidence(action, projection, model);
    return {
      priorityId: priorityIdForIndex(index),
      sourceActionId: action.id,
      sourceFindingIds: [...action.linkedFindingIds],
      sourceEvidenceIds: evidence.map((item) => item.id),
      priorityTitle: priorityTitle(action, finding, usedTitles),
      domain: action.domainName,
      assessedCondition: assessedCondition(finding, action),
      priorityRationale: priorityRationale(finding, context),
      managementAction: customerManagementAction(action),
      accountableRole: action.accountableExecutive,
      targetPeriod: action.period,
      requiredPopulation: requiredPopulation(finding, context, evidence),
      evidenceToRetain: evidenceToRetain(action, evidence),
      completionEffectivenessTest: completionTest(action, evidence),
      escalationTrigger: sentence(action.escalationThreshold),
      status: 'Not started' as const,
      managementNotes: ''
    } satisfies EssentialActionProofRegisterRow;
  });

  return {
    productLabel: 'Essential',
    organisationName: data.organisationName,
    assessmentReference: data.assessmentReference,
    reportReference: reportReferenceFor(data),
    score: data.scoreRun.overallScore,
    maturity: data.scoreRun.finalMaturity ?? 'Not scored',
    pdfFileName: buildEssentialCustomerPdfFileName(data.organisationName),
    registerFileName: buildEssentialActionRegisterFileName(data.organisationName),
    requiredArtefacts: ['pdf', 'supporting_register'],
    rows
  };
}
