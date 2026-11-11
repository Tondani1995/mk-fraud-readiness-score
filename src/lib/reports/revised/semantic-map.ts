import type { FraudPathwayFamily, PrimarySemanticFamily } from '@/lib/reports/evidence-model/semantic-mappings';

/**
 * Fictional prototype: maps bank 1.3 modules onto the existing engines' semantic and fraud-pathway families, so that
 * the unchanged Fact Pack, blueprint clustering and registers can group revised findings. The mapping is by module
 * (what the control protects), never by keyword. It is a presentation grouping proposed for MK (decision M-9), not a
 * scoring classification.
 */
type Family = { primary: PrimarySemanticFamily; pathways: FraudPathwayFamily[] };
const F = (primary: PrimarySemanticFamily, ...pathways: FraudPathwayFamily[]): Family => ({ primary, pathways });

const BY_MODULE: Record<string, Family> = {
  // D1 governance
  'D1/*': F('FRAUD_GOVERNANCE', 'INCIDENT_CONCEALMENT'),
  'D1/improvement': F('CONTINUOUS_IMPROVEMENT', 'DETECTION_EVASION'),
  // D2 risk assessment
  'D2/*': F('FRAUD_RISK_IDENTIFICATION', 'DETECTION_EVASION'),
  // D3 ethics and anti-corruption
  'D3/*': F('FRAUD_AWARENESS', 'THIRD_PARTY_COLLUSION'),
  'D3/conflicts': F('THIRD_PARTY_OVERSIGHT', 'THIRD_PARTY_COLLUSION'),
  'D3/gifts': F('THIRD_PARTY_OVERSIGHT', 'THIRD_PARTY_COLLUSION'),
  'D3/bribery': F('THIRD_PARTY_OVERSIGHT', 'THIRD_PARTY_COLLUSION'),
  'D3/donations': F('THIRD_PARTY_OVERSIGHT', 'THIRD_PARTY_COLLUSION'),
  'D3/government': F('THIRD_PARTY_OVERSIGHT', 'THIRD_PARTY_COLLUSION'),
  'D3/extortion': F('THIRD_PARTY_OVERSIGHT', 'THIRD_PARTY_COLLUSION'),
  // D4 third parties
  'D4/*': F('THIRD_PARTY_OVERSIGHT', 'SUPPLIER_PAYMENT_DIVERSION', 'THIRD_PARTY_COLLUSION'),
  'D4/sourcing': F('THIRD_PARTY_OVERSIGHT', 'THIRD_PARTY_COLLUSION'),
  'D4/interests': F('THIRD_PARTY_OVERSIGHT', 'THIRD_PARTY_COLLUSION'),
  'D4/onboarding': F('SUPPLIER_ONBOARDING', 'SUPPLIER_PAYMENT_DIVERSION', 'THIRD_PARTY_COLLUSION'),
  'D4/bankdetails': F('SUPPLIER_PAYMENT_CHANGE', 'SUPPLIER_PAYMENT_DIVERSION'),
  'D4/monitoring': F('DETECTION_MONITORING', 'DETECTION_EVASION', 'SUPPLIER_PAYMENT_DIVERSION'),
  // D5 people and payroll
  'D5/*': F('PAYROLL_INTEGRITY', 'PAYROLL_MANIPULATION'),
  'D5/highrisk': F('PRIVILEGED_ACCESS', 'PRIVILEGED_ACCESS_MISUSE'),
  'D5/leave': F('PRIVILEGED_ACCESS', 'PRIVILEGED_ACCESS_MISUSE'),
  'D5/conduct': F('PRIVILEGED_ACCESS', 'PRIVILEGED_ACCESS_MISUSE'),
  // D6 finance and banking
  'D6/*': F('DETECTION_MONITORING', 'DETECTION_EVASION'),
  'D6/accounts': F('SUPPLIER_PAYMENT_CHANGE', 'SUPPLIER_PAYMENT_DIVERSION'),
  'D6/platform': F('SUPPLIER_PAYMENT_CHANGE', 'SUPPLIER_PAYMENT_DIVERSION', 'IDENTITY_IMPERSONATION'),
  'D6/manual': F('CASH_CUSTODY', 'CASH_CUSTODY_MISUSE'),
  // D7 customers and revenue
  'D7/*': F('DETECTION_MONITORING', 'DETECTION_EVASION'),
  'D7/onboarding': F('IDENTITY_VERIFICATION', 'IDENTITY_IMPERSONATION'),
  'D7/fica': F('IDENTITY_VERIFICATION', 'IDENTITY_IMPERSONATION'),
  'D7/channels': F('THIRD_PARTY_OVERSIGHT', 'THIRD_PARTY_COLLUSION'),
  // D8 assets, cash and inventory
  'D8/*': F('STOCK_ASSET_CUSTODY', 'STOCK_ASSET_MISUSE'),
  'D8/cash': F('CASH_CUSTODY', 'CASH_CUSTODY_MISUSE'),
  // D9 digital and identity
  'D9/*': F('IDENTITY_VERIFICATION', 'IDENTITY_IMPERSONATION'),
  'D9/access': F('PRIVILEGED_ACCESS', 'PRIVILEGED_ACCESS_MISUSE'),
  'D9/data': F('ORDINARY_ACCESS', 'PRIVILEGED_ACCESS_MISUSE'),
  'D9/response': F('INCIDENT_RESPONSE', 'INCIDENT_CONCEALMENT'),
  // D10 detection, speak-up and response
  'D10/*': F('INCIDENT_RESPONSE', 'INCIDENT_CONCEALMENT'),
  'D10/speakup': F('WHISTLEBLOWING', 'INCIDENT_CONCEALMENT'),
  'D10/nochannel': F('WHISTLEBLOWING', 'INCIDENT_CONCEALMENT'),
  'D10/protection': F('WHISTLEBLOWING', 'INCIDENT_CONCEALMENT'),
  'D10/detection': F('DETECTION_MONITORING', 'DETECTION_EVASION'),
  'D10/evidence': F('EVIDENCE_INTEGRITY', 'INCIDENT_CONCEALMENT')
};

export function familyFor(domain: string, module: string | null | undefined): Family {
  return BY_MODULE[`${domain}/${module ?? ''}`] ?? BY_MODULE[`${domain}/*`] ?? F('FRAUD_GOVERNANCE');
}
