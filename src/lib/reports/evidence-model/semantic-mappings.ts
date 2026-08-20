/**
 * The semantic layer is deliberately question-identity driven. Do not replace these maps with
 * keyword searches over finding prose: implementation language can mention another population or
 * control without changing the question's primary meaning.
 */
export const PRIMARY_SEMANTIC_FAMILIES = [
  'FRAUD_GOVERNANCE', 'FRAUD_RISK_IDENTIFICATION', 'SUPPLIER_ONBOARDING', 'SUPPLIER_PAYMENT_CHANGE',
  'THIRD_PARTY_OVERSIGHT', 'ORDINARY_ACCESS', 'PRIVILEGED_ACCESS', 'IDENTITY_VERIFICATION',
  'DETECTION_MONITORING', 'INCIDENT_RESPONSE', 'EVIDENCE_INTEGRITY', 'WHISTLEBLOWING',
  'FRAUD_AWARENESS', 'CONTINUOUS_IMPROVEMENT'
] as const;
export type PrimarySemanticFamily = typeof PRIMARY_SEMANTIC_FAMILIES[number];

export const FRAUD_PATHWAY_FAMILIES = [
  'SUPPLIER_PAYMENT_DIVERSION', 'PRIVILEGED_ACCESS_MISUSE', 'IDENTITY_IMPERSONATION',
  'DETECTION_EVASION', 'INCIDENT_CONCEALMENT'
] as const;
export type FraudPathwayFamily = typeof FRAUD_PATHWAY_FAMILIES[number];

const groupedPrimaryFamilies: Record<PrimarySemanticFamily, string[]> = {
  FRAUD_GOVERNANCE: ['D1-Q01', 'D1-Q02', 'D1-Q03', 'D1-Q04', 'D1-Q05', 'D1-Q06', 'D3-Q01', 'D3-Q02'],
  FRAUD_RISK_IDENTIFICATION: ['D2-Q01', 'D2-Q02', 'D2-Q03', 'D2-Q04', 'D2-Q05', 'D2-Q06', 'D2-Q07', 'D2-Q08'],
  SUPPLIER_ONBOARDING: ['D3-Q03', 'D7-Q01'],
  SUPPLIER_PAYMENT_CHANGE: ['D7-Q04'],
  THIRD_PARTY_OVERSIGHT: ['D7-Q02', 'D7-Q03', 'D7-Q05', 'D7-Q06', 'D7-Q07'],
  ORDINARY_ACCESS: ['D3-Q04', 'D3-Q07'],
  PRIVILEGED_ACCESS: ['D8-Q04'],
  IDENTITY_VERIFICATION: ['D8-Q01', 'D8-Q08'],
  DETECTION_MONITORING: ['D3-Q05', 'D4-Q01', 'D4-Q02', 'D4-Q03', 'D4-Q04', 'D4-Q05', 'D4-Q06', 'D4-Q07', 'D8-Q02', 'D8-Q05'],
  INCIDENT_RESPONSE: ['D5-Q01', 'D5-Q02', 'D5-Q03', 'D5-Q04', 'D5-Q06'],
  EVIDENCE_INTEGRITY: ['D5-Q05'],
  WHISTLEBLOWING: ['D6-Q01', 'D6-Q02', 'D6-Q03', 'D6-Q04', 'D6-Q05', 'D9-Q06'],
  FRAUD_AWARENESS: ['D6-Q06', 'D8-Q03', 'D8-Q06', 'D9-Q01', 'D9-Q02', 'D9-Q03', 'D9-Q04', 'D9-Q05'],
  CONTINUOUS_IMPROVEMENT: ['D3-Q06', 'D5-Q07', 'D8-Q07', 'D10-Q01', 'D10-Q02', 'D10-Q03', 'D10-Q04', 'D10-Q05', 'D10-Q06']
};

export const PRIMARY_SEMANTIC_FAMILY_BY_QUESTION: Record<string, PrimarySemanticFamily> = Object.fromEntries(
  Object.entries(groupedPrimaryFamilies).flatMap(([family, questionCodes]) => questionCodes.map((questionCode) => [questionCode, family]))
) as Record<string, PrimarySemanticFamily>;

/** Deliberate cross-family relationships only; absence means no secondary relationship. */
export const SECONDARY_SEMANTIC_FAMILIES_BY_QUESTION: Record<string, PrimarySemanticFamily[]> = {
  'D2-Q07': ['PRIVILEGED_ACCESS'],
  'D2-Q08': ['IDENTITY_VERIFICATION'],
  'D4-Q06': ['INCIDENT_RESPONSE'],
  'D8-Q02': ['IDENTITY_VERIFICATION'],
  'D8-Q05': ['IDENTITY_VERIFICATION']
};

/** Approved fraud pathways are also question-identity driven. */
export const FRAUD_PATHWAY_FAMILIES_BY_QUESTION: Record<string, FraudPathwayFamily[]> = {
  'D3-Q03': ['SUPPLIER_PAYMENT_DIVERSION'],
  'D7-Q01': ['SUPPLIER_PAYMENT_DIVERSION'],
  'D7-Q04': ['SUPPLIER_PAYMENT_DIVERSION'],
  'D4-Q01': ['DETECTION_EVASION'],
  'D4-Q02': ['DETECTION_EVASION'],
  'D4-Q03': ['DETECTION_EVASION'],
  'D4-Q04': ['DETECTION_EVASION'],
  'D4-Q05': ['DETECTION_EVASION'],
  'D4-Q06': ['DETECTION_EVASION'],
  'D4-Q07': ['DETECTION_EVASION'],
  'D8-Q02': ['DETECTION_EVASION'],
  'D8-Q05': ['DETECTION_EVASION'],
  'D8-Q04': ['PRIVILEGED_ACCESS_MISUSE'],
  'D8-Q01': ['IDENTITY_IMPERSONATION'],
  'D8-Q08': ['IDENTITY_IMPERSONATION'],
  'D5-Q01': ['INCIDENT_CONCEALMENT'],
  'D5-Q02': ['INCIDENT_CONCEALMENT'],
  'D5-Q03': ['INCIDENT_CONCEALMENT'],
  'D5-Q04': ['INCIDENT_CONCEALMENT'],
  'D5-Q05': ['INCIDENT_CONCEALMENT'],
  'D5-Q06': ['INCIDENT_CONCEALMENT'],
  'D5-Q07': ['INCIDENT_CONCEALMENT']
};

export function semanticMappingForQuestion(questionCode: string): {
  primarySemanticFamily: PrimarySemanticFamily;
  secondarySemanticFamilies: PrimarySemanticFamily[];
  fraudPathwayFamilies: FraudPathwayFamily[];
} {
  const primarySemanticFamily = PRIMARY_SEMANTIC_FAMILY_BY_QUESTION[questionCode];
  if (!primarySemanticFamily) throw new Error(`No explicit primary semantic family is registered for ${questionCode}.`);
  return {
    primarySemanticFamily,
    secondarySemanticFamilies: SECONDARY_SEMANTIC_FAMILIES_BY_QUESTION[questionCode] ?? [],
    fraudPathwayFamilies: FRAUD_PATHWAY_FAMILIES_BY_QUESTION[questionCode] ?? []
  };
}
