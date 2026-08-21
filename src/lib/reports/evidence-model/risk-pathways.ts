import type { MaterialFinding } from './types';

export interface RiskPathway {
  key: string;
  title: string;
  cause: string;
  riskEvent: string;
  financialImpact: string;
  operationalImpact: string;
  legalRegulatoryImpact?: string;
  reputationalImpact?: string;
  consequence: 'Low' | 'Moderate' | 'High' | 'Severe';
  /**
   * Assurance-priority variant of title/cause/riskEvent, used whenever every finding grouped under
   * this pathway is materialityClass === 'assurance_priority' (see registers.ts buildRiskRegister).
   * Required semantics (Checkpoint F controller review, blocker 1): preserve the reported strong
   * state, never assert absence/failure/delay/non-documentation/non-separation/unrestricted access
   * as a present fact, and make the risk event conditional on independent validation rather than a
   * claim that the control has failed.
   */
  resilienceTitle: string;
  resilienceCause: string;
  resilienceRiskEvent: string;
}

const PATHWAY_BY_QUESTION: Record<string, RiskPathway> = {
  'D1-Q01': {
    key: 'GOVERNANCE-ACCOUNTABILITY', title: 'Fraud-risk accountability and escalation failure',
    cause: 'executive fraud-risk accountability, authority and escalation are not supported by the required operating evidence',
    riskEvent: 'material fraud-control gaps remain unresolved or accepted without an authorised decision',
    financialImpact: 'losses continue because required resources or corrective action are delayed', operationalImpact: 'cross-functional actions remain ownerless or overdue', reputationalImpact: 'leadership may be unable to demonstrate active stewardship of known fraud risks', consequence: 'High',
    resilienceTitle: 'Fraud-risk accountability and escalation resilience validation',
    resilienceCause: 'independent operating evidence has not yet validated that executive fraud-risk accountability, authority and escalation operate consistently across the complete population',
    resilienceRiskEvent: 'the reported accountability and escalation controls may not operate consistently across the full population, at the required frequency or under pressure'
  },
  'D1-Q04': {
    key: 'GOVERNANCE-ACCOUNTABILITY', title: 'Fraud-risk accountability and escalation failure',
    cause: 'management ownership and independent assurance responsibilities are not clearly separated',
    riskEvent: 'a material control is operated and certified without independent challenge',
    financialImpact: 'control failure remains undetected and permits avoidable loss', operationalImpact: 'assurance conclusions cannot be relied upon for remediation decisions', reputationalImpact: 'governance reporting may provide false comfort', consequence: 'High',
    resilienceTitle: 'Fraud-risk accountability and escalation resilience validation',
    resilienceCause: 'independent operating evidence has not yet validated that management ownership and independent assurance responsibilities operate as separated in practice, across the complete population',
    resilienceRiskEvent: 'the reported separation between management ownership and independent assurance may not operate consistently across the full population, at the required frequency or under pressure'
  },
  'D3-Q03': {
    key: 'SUPPLIER-ONBOARDING', title: 'Fictitious or conflicted supplier enters the vendor population',
    cause: 'supplier identity, ownership, banking and conflict checks are incomplete or not evidenced before activation',
    riskEvent: 'a fictitious, conflicted or misrepresented supplier is approved and used for purchasing or payment',
    financialImpact: 'funds are paid to an illegitimate or related party', operationalImpact: 'procurement and vendor-master integrity are compromised', legalRegulatoryImpact: 'sanctions, conflict or procurement obligations may be breached', reputationalImpact: 'stakeholders lose confidence in supplier governance', consequence: 'Severe',
    resilienceTitle: 'Supplier onboarding resilience validation',
    resilienceCause: 'independent operating evidence has not yet validated that supplier identity, ownership, banking and conflict checks are completed for the full population before activation',
    resilienceRiskEvent: 'the reported supplier-onboarding checks may not operate consistently across the full supplier population, at the required frequency or under pressure'
  },
  'D7-Q01': {
    key: 'SUPPLIER-ONBOARDING', title: 'Fictitious or conflicted supplier enters the vendor population',
    cause: 'risk-tiered third-party due diligence is incomplete or not evidenced before engagement',
    riskEvent: 'an unsuitable, conflicted or misrepresented third party gains access, authority or funds',
    financialImpact: 'payments or assets are exposed to an illegitimate third party', operationalImpact: 'the organisation becomes dependent on an unverified provider', legalRegulatoryImpact: 'contracting, sanctions or integrity obligations may be breached', reputationalImpact: 'third-party misconduct is attributed to the organisation', consequence: 'Severe',
    resilienceTitle: 'Supplier onboarding resilience validation',
    resilienceCause: 'independent operating evidence has not yet validated that risk-tiered third-party due diligence is completed for the full population before engagement',
    resilienceRiskEvent: 'the reported third-party due-diligence process may not operate consistently across the full population, at the required frequency or under pressure'
  },
  'D7-Q04': {
    key: 'SUPPLIER-PAYMENT-REDIRECTION', title: 'Supplier payment is redirected through impersonation',
    cause: 'invoice and bank-detail changes are not independently verified through a trusted pre-existing contact',
    riskEvent: 'an impersonator or insider redirects a legitimate supplier payment to an unauthorised account',
    financialImpact: 'a payment is irrecoverably transferred to a fraud-controlled account', operationalImpact: 'supplier settlement and service continuity are disrupted', legalRegulatoryImpact: 'recovery, disclosure or dispute obligations may arise', reputationalImpact: 'suppliers lose confidence in payment controls', consequence: 'Severe',
    resilienceTitle: 'Supplier payment verification resilience validation',
    resilienceCause: 'independent operating evidence has not yet validated that every invoice and bank-detail change is verified through a trusted pre-existing contact, across the complete population',
    resilienceRiskEvent: 'the reported payment-verification control may not operate consistently across the full population, at the required frequency or under pressure'
  },
  'D3-Q04': {
    key: 'UNAUTHORISED-ACCESS', title: 'Unauthorised system access enables transaction or record manipulation',
    cause: 'role-based access is not completely reviewed and removed when responsibilities change',
    riskEvent: 'a user or compromised credential uses excess access to initiate, approve or conceal unauthorised activity',
    financialImpact: 'transactions or assets are manipulated for direct loss', operationalImpact: 'system records and segregation of duties cannot be relied upon', legalRegulatoryImpact: 'data or access-control obligations may be breached', reputationalImpact: 'stakeholders lose trust in system integrity', consequence: 'Severe',
    resilienceTitle: 'System and privileged-access control resilience validation',
    resilienceCause: 'independent operating evidence has not yet validated that role-based access is completely reviewed and removed when responsibilities change, across the complete population',
    resilienceRiskEvent: 'the reported role-based access review may not operate consistently across the full population, at the required frequency or under pressure'
  },
  'D8-Q04': {
    key: 'UNAUTHORISED-ACCESS', title: 'Unauthorised system access enables transaction or record manipulation',
    cause: 'privileged, administrator or sensitive-data access is not completely restricted, logged and independently recertified',
    riskEvent: 'a privileged user or compromised administrator identity alters records, controls or logs without timely detection',
    financialImpact: 'high-impact transactions or data can be manipulated', operationalImpact: 'critical systems and audit trails lose integrity', legalRegulatoryImpact: 'security and personal-data obligations may be breached', reputationalImpact: 'confidence in digital controls is damaged', consequence: 'Severe',
    resilienceTitle: 'System and privileged-access control resilience validation',
    resilienceCause: 'independent operating evidence has not yet validated that privileged, administrator and sensitive-data access is completely restricted, logged and recertified, across the complete population',
    resilienceRiskEvent: 'the reported privileged-access restriction and recertification process may not operate consistently across the full population, at the required frequency or under pressure'
  },
  'D4-Q02': {
    key: 'DETECTION-REVIEW', title: 'Suspicious activity remains unresolved in the exception queue',
    cause: 'the complete population of alerts and exception reports is not evidenced as assigned, investigated and independently reviewed',
    riskEvent: 'material anomalous activity is missed, closed without support or allowed to remain overdue',
    financialImpact: 'losses compound while suspicious activity continues', operationalImpact: 'monitoring backlogs and unsupported closures weaken detection', consequence: 'High',
    resilienceTitle: 'Exception and alert review resilience validation',
    resilienceCause: 'independent operating evidence has not yet validated that the complete population of alerts and exception reports is assigned, investigated and independently reviewed',
    resilienceRiskEvent: 'the reported alert and exception review may not operate consistently across the full population, at the required frequency or under pressure'
  },
  'D5-Q01': {
    key: 'INCIDENT-RESPONSE', title: 'Fraud incident response is delayed or uncoordinated',
    cause: 'incident command, severity, containment and decision roles are not documented and rehearsed',
    riskEvent: 'a suspected fraud is handled inconsistently, delaying containment and escalation',
    financialImpact: 'losses and recovery costs increase while action is delayed', operationalImpact: 'containment, legal, HR, IT and communications decisions conflict or stall', legalRegulatoryImpact: 'notification or investigation duties may be missed', reputationalImpact: 'poor crisis handling amplifies stakeholder harm', consequence: 'Severe',
    resilienceTitle: 'Fraud incident-response resilience validation',
    resilienceCause: 'independent operating evidence has not yet validated that incident command, severity, containment and decision roles operate as documented and rehearsed',
    resilienceRiskEvent: 'the reported incident-response process may not operate consistently across every incident type, at the required speed or under pressure'
  },
  'D5-Q05': {
    key: 'EVIDENCE-INTEGRITY', title: 'Fraud evidence loses integrity or chain of custody',
    cause: 'evidence identification, preservation, integrity checks and custody transfers are not consistently controlled',
    riskEvent: 'material evidence is altered, lost, contaminated or cannot be shown to be authentic',
    financialImpact: 'recovery, disciplinary or legal outcomes are weakened', operationalImpact: 'investigations must be repeated or abandoned', legalRegulatoryImpact: 'evidence, retention or legal-hold duties may be breached', reputationalImpact: 'the organisation cannot substantiate its response', consequence: 'High',
    resilienceTitle: 'Fraud evidence-integrity resilience validation',
    resilienceCause: 'independent operating evidence has not yet validated that evidence identification, preservation, integrity checks and custody transfers are consistently controlled',
    resilienceRiskEvent: 'the reported evidence-handling control may not operate consistently across every case, at the required standard or under pressure'
  },
  'D6-Q01': {
    key: 'REPORTING-SUPPRESSION', title: 'Fraud concerns remain unreported or are routed to conflicted management',
    cause: 'confidential or anonymous reporting is not trusted, independently routed and protected from retaliation',
    riskEvent: 'a person who observes suspected fraud does not report it or the concern is suppressed',
    financialImpact: 'fraud continues longer before detection', operationalImpact: 'early-warning information never reaches an independent reviewer', legalRegulatoryImpact: 'whistleblower-protection duties may be compromised', reputationalImpact: 'staff trust and reporting culture deteriorate', consequence: 'High',
    resilienceTitle: 'Confidential reporting-channel resilience validation',
    resilienceCause: 'independent operating evidence has not yet validated that confidential or anonymous reporting is trusted, independently routed and protected from retaliation in practice',
    resilienceRiskEvent: 'the reported reporting-channel control may not operate consistently for every reporter, at the required standard or under pressure'
  },
  'D8-Q02': {
    key: 'DIGITAL-MISUSE', title: 'Digital account compromise or misuse is not detected promptly',
    cause: 'material login, access, profile and transaction events are not completely monitored and triaged',
    riskEvent: 'a compromised or malicious identity uses digital channels without timely detection and response',
    financialImpact: 'unauthorised transactions or account changes cause direct loss', operationalImpact: 'digital operations must contain and investigate a wider incident', legalRegulatoryImpact: 'security or personal-data notification duties may arise', reputationalImpact: 'customers and partners lose trust in digital channels', consequence: 'Severe',
    resilienceTitle: 'Digital account and activity monitoring resilience validation',
    resilienceCause: 'independent operating evidence has not yet validated that material login, access, profile and transaction events are completely monitored and triaged, across the complete population',
    resilienceRiskEvent: 'the reported digital-monitoring control may not operate consistently across the full event population, at the required speed or under pressure'
  },
  'D8-Q05': {
    key: 'DIGITAL-MISUSE', title: 'Digital account compromise or misuse is not detected promptly',
    cause: 'digital events are not joined and monitored for misuse, unauthorised transactions and suspicious data changes',
    riskEvent: 'malicious or compromised users manipulate digital activity without a complete alert trail',
    financialImpact: 'unauthorised transactions create direct loss', operationalImpact: 'digital records and customer operations require investigation and correction', legalRegulatoryImpact: 'security or personal-data obligations may be triggered', reputationalImpact: 'confidence in digital services is damaged', consequence: 'Severe',
    resilienceTitle: 'Digital account and activity monitoring resilience validation',
    resilienceCause: 'independent operating evidence has not yet validated that digital events are joined and monitored for misuse, unauthorised transactions and suspicious data changes, across the complete population',
    resilienceRiskEvent: 'the reported digital-monitoring control may not operate consistently across the full event population, at the required speed or under pressure'
  },
  'D9-Q01': {
    key: 'ROLE-AWARENESS', title: 'Staff fail to recognise role-specific fraud manipulation',
    cause: 'fraud guidance is not current, role-specific and tested for understanding',
    riskEvent: 'an employee complies with a fraudulent request or misses a warning sign relevant to their role',
    financialImpact: 'social engineering or control bypass causes avoidable loss', operationalImpact: 'staff become the entry point for process compromise', consequence: 'Moderate',
    resilienceTitle: 'Role-specific fraud-awareness resilience validation',
    resilienceCause: 'independent operating evidence has not yet validated that fraud guidance is current, role-specific and understood, across the complete workforce population',
    resilienceRiskEvent: 'the reported awareness control may not operate consistently across every role, at the required frequency or under pressure'
  },
  'D3-Q08': {
    key: 'ACCESS-REVIEW', title: 'Stale system or data access remains usable',
    cause: 'the complete ordinary-user access population is not periodically reconciled to current responsibilities and removal decisions',
    riskEvent: 'a former or transferred user retains access that can initiate, change or conceal activity',
    financialImpact: 'unauthorised changes or transactions can create direct loss', operationalImpact: 'access exceptions and removal work accumulate without accountable closure', reputationalImpact: 'stakeholders may lose confidence in the organisation’s access discipline', consequence: 'High',
    resilienceTitle: 'Ordinary access-review resilience validation',
    resilienceCause: 'independent operating evidence has not yet validated that ordinary-user access is periodically reconciled to current responsibilities and removed when no longer required',
    resilienceRiskEvent: 'the reported ordinary-access review may not operate consistently across the complete population, at the required frequency or under pressure'
  },
  'D3-Q09': {
    key: 'PAYROLL-MASTER-FILE', title: 'Payroll master-file manipulation reaches payment release',
    cause: 'payroll master-file changes, joiner/mover/leaver reconciliation and unusual-record review are not independently completed before payment',
    riskEvent: 'an unauthorised change, duplicate or ghost payroll record diverts value through a payment run',
    financialImpact: 'salary or benefit value is paid to an unauthorised destination', operationalImpact: 'payroll correction and employee trust are disrupted', legalRegulatoryImpact: 'payroll, tax or employment obligations may be affected', reputationalImpact: 'employees and stakeholders lose confidence in payroll integrity', consequence: 'Severe',
    resilienceTitle: 'Payroll pre-payment review resilience validation',
    resilienceCause: 'independent operating evidence has not yet validated that payroll master-file and unusual-record review operates before every payment run',
    resilienceRiskEvent: 'the reported payroll review may not operate consistently across the complete payment population, at the required frequency or under pressure'
  },
  'D3-Q10': {
    key: 'CASH-CUSTODY', title: 'Cash custody differences remain unresolved',
    cause: 'cash custody, counting, banking and reconciliation are not consistently assigned, independently checked and investigated',
    riskEvent: 'cash shortages or diversion remain within ordinary variance without timely challenge',
    financialImpact: 'physical cash is lost or unrecovered', operationalImpact: 'site cash operations and banking continuity are disrupted', legalRegulatoryImpact: 'cash-handling or recordkeeping obligations may be affected', reputationalImpact: 'management cannot demonstrate custody over cash entrusted to the organisation', consequence: 'High',
    resilienceTitle: 'Cash custody and reconciliation resilience validation',
    resilienceCause: 'independent operating evidence has not yet validated that cash custody, counting, banking and reconciliation operate across the complete cash population',
    resilienceRiskEvent: 'the reported cash controls may not operate consistently at every cash point, at the required frequency or under pressure'
  },
  'D3-Q11': {
    key: 'STOCK-ASSET-CUSTODY', title: 'Stock or physical-asset shrinkage is not reconciled',
    cause: 'custody, movement, count, reconciliation, write-off and disposal controls are not consistently applied across locations',
    riskEvent: 'stock or physical assets are diverted, lost or written off without timely challenge',
    financialImpact: 'inventory or asset value is lost or understated', operationalImpact: 'service and supply continuity are disrupted by unexplained shortages', legalRegulatoryImpact: 'asset records or disposal obligations may be misstated', reputationalImpact: 'stakeholders lose confidence in physical-asset stewardship', consequence: 'High',
    resilienceTitle: 'Stock and physical-asset custody resilience validation',
    resilienceCause: 'independent operating evidence has not yet validated that stock and physical assets are safeguarded and reconciled across all relevant locations',
    resilienceRiskEvent: 'the reported custody and reconciliation controls may not operate consistently across the complete asset population, at the required frequency or under pressure'
  },
  'D4-Q08': {
    key: 'EXTERNAL-FRAUD-MONITORING', title: 'External-party fraud signals are not challenged in time',
    cause: 'external-party fraud threats and provider-operated channel reporting are not completely covered, reconciled and assigned for review',
    riskEvent: 'customer, supplier, partner or provider-channel fraud continues without timely organisational response',
    financialImpact: 'external fraud causes loss before the organisation can intervene', operationalImpact: 'provider or channel incidents require wider containment and correction', legalRegulatoryImpact: 'customer, supplier or data-protection obligations may be affected', reputationalImpact: 'external stakeholders lose confidence in the organisation’s channel oversight', consequence: 'High',
    resilienceTitle: 'External-party monitoring resilience validation',
    resilienceCause: 'independent operating evidence has not yet validated that relevant external-party threats and provider reports are covered and reviewed',
    resilienceRiskEvent: 'the reported external-party monitoring may not operate consistently across relevant channels, at the required speed or under pressure'
  },
  'D8-Q09': {
    key: 'PRIVILEGED-ACCESS-REVIEW', title: 'Sensitive or administrator access remains unjustified',
    cause: 'sensitive-access and administrator populations are not periodically recertified against current ownership and business need',
    riskEvent: 'stale or excessive rights are used to alter value-bearing records, entitlements or confidential data',
    financialImpact: 'unauthorised changes or transactions create direct loss', operationalImpact: 'system integrity and investigation confidence are weakened', legalRegulatoryImpact: 'access, security or confidentiality obligations may be breached', reputationalImpact: 'stakeholders lose confidence in sensitive-system governance', consequence: 'Severe',
    resilienceTitle: 'Sensitive-access review resilience validation',
    resilienceCause: 'independent operating evidence has not yet validated that sensitive and administrator access is reviewed and removed when no longer justified',
    resilienceRiskEvent: 'the reported sensitive-access review may not operate consistently across the complete population, at the required frequency or under pressure'
  },
  'D8-Q10': {
    key: 'IDENTITY-MISUSE-RESPONSE', title: 'Identity misuse is not contained and investigated',
    cause: 'identity-misuse investigation, containment, evidence preservation and closure decisions are not consistently defined and exercised',
    riskEvent: 'a compromised or impersonated identity continues to affect accounts, transactions or records after detection',
    financialImpact: 'unauthorised transactions or account changes increase direct loss', operationalImpact: 'containment, customer or employee support and recovery are delayed', legalRegulatoryImpact: 'notification or identity-protection duties may be missed', reputationalImpact: 'affected parties lose trust in identity and account safeguards', consequence: 'Severe',
    resilienceTitle: 'Identity-misuse response resilience validation',
    resilienceCause: 'independent operating evidence has not yet validated that suspected identity misuse can be contained, investigated and closed through a defined route',
    resilienceRiskEvent: 'the reported identity-misuse response may not operate consistently across relevant cases, at the required speed or under pressure'
  }
};

export function riskPathwayForFinding(finding: MaterialFinding): RiskPathway {
  // A generic domain fallback caused every unclassified question in a domain
  // to collapse into one indistinguishable register title. Keep the fallback
  // deterministic, but anchor it to the recorded question so canonical risks
  // remain one-to-one with the source position.
  const questionTitle = String(finding.questionPrompt ?? '').replace(/[.]$/, '').trim();
  const fallbackTitle = `${finding.domainName}: ${questionTitle || finding.questionCode} risk`;
  return PATHWAY_BY_QUESTION[finding.questionCode] ?? {
    key: `CONTROL-${finding.questionCode}`,
    title: fallbackTitle,
    cause: finding.materialityClass === 'assurance_priority'
      ? 'the self-reported control position has not yet been independently validated with operating evidence'
      : `the self-assessment records "${finding.questionPrompt.replace(/[.]$/, '')}" as "${finding.responseLabel}"; the expected control standard is therefore not yet met`,
    riskEvent: finding.materialityClass === 'assurance_priority'
      ? 'the reported control may not operate consistently across the full population, at the required frequency or under pressure'
      : finding.fraudMechanism.replace(/[.]$/, '').replace(/^./, (value) => value.toLowerCase()),
    financialImpact: finding.likelyFinancialImpact,
    operationalImpact: finding.likelyOperationalImpact,
    consequence: finding.isHardGate ? 'Severe' : finding.isCriticalControl ? 'High' : 'Moderate',
    resilienceTitle: `${finding.domainName} control resilience validation`,
    resilienceCause: 'the self-reported control position has not yet been independently validated with operating evidence',
    resilienceRiskEvent: 'the reported control may not operate consistently across the full population, at the required frequency or under pressure'
  };
}
