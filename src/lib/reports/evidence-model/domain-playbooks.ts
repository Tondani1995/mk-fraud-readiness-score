import type { ImplementationDifficulty } from './types';

/**
 * Static, per-domain advisory content. Finite and known (10 domains), so authored once here rather
 * than generated per report -- the *combination* with real finding data (question, response, score,
 * exposure) is what makes each rendered finding assessment-specific, not this playbook on its own.
 * Every "recommended control" describes a concrete deliverable per section 23 of the brief, not a
 * bare verb like "strengthen controls" or "improve governance".
 */
export interface DomainPlaybook {
  domainCode: string;
  expectedControlStandard: string;
  recommendedControl: string;
  evidenceItems: { artefact: string; provesWhat: string; expectedRecency: string; minimumCharacteristics: string }[];
  accountableOwner: string;
  oversightFunction: string;
  supportingFunctions: string[];
  operatingFrequency: string;
  implementationDifficulty: ImplementationDifficulty;
  effectivenessMeasure: string;
  escalationThreshold: string;
}

const PLAYBOOKS: Record<string, DomainPlaybook> = {
  D1: {
    domainCode: 'D1',
    expectedControlStandard:
      'A named executive owns fraud risk end-to-end, with a documented reporting line to the board or audit committee at least quarterly, and independent assurance reviews that ownership separately from the management function performing it.',
    recommendedControl:
      'Formalise a fraud governance charter naming the accountable executive and the independent-assurance function, with a fixed quarterly reporting cadence to the board or audit committee and minutes retained as evidence.',
    evidenceItems: [
      { artefact: 'Fraud governance charter or terms of reference', provesWhat: 'A named executive owner exists with defined authority', expectedRecency: 'Current version, dated', minimumCharacteristics: 'Names the accountable executive and the independent-review function separately' },
      { artefact: 'Board or audit committee minutes referencing fraud risk', provesWhat: 'Independent oversight is actually occurring, not just documented', expectedRecency: 'Last 4 quarters', minimumCharacteristics: 'Shows fraud risk as a standing or recent agenda item' }
    ],
    accountableOwner: 'CEO / Managing Director',
    oversightFunction: 'Board / Audit Committee',
    supportingFunctions: ['Internal Audit', 'Company Secretary'],
    operatingFrequency: 'Quarterly reporting cadence',
    implementationDifficulty: 'Moderate',
    effectivenessMeasure: 'Board/audit committee receives and minutes a fraud risk update every quarter for two consecutive quarters',
    escalationThreshold: 'Any quarter where no fraud risk update reaches the board'
  },
  D2: {
    domainCode: 'D2',
    expectedControlStandard:
      'A documented fraud risk register is maintained, refreshed at least annually or after material operating change, covering all business units and processes with fraud exposure.',
    recommendedControl:
      'Commission a structured fraud risk assessment across every business unit and process, output as a maintained risk register with named risk owners, refreshed on a fixed annual cycle or triggered by material change.',
    evidenceItems: [
      { artefact: 'Fraud risk register with revision history', provesWhat: 'Risk identification is current and covers the whole business, not just headline areas', expectedRecency: 'Refreshed within the last 12 months', minimumCharacteristics: 'Named risk owner per entry, dated revisions' },
      { artefact: 'Risk assessment workshop records or minutes', provesWhat: 'Identification was a structured exercise, not one person\'s assumption', expectedRecency: 'Most recent cycle', minimumCharacteristics: 'Records who participated and what was assessed' }
    ],
    accountableOwner: 'Head of Risk',
    oversightFunction: 'CEO / Board',
    supportingFunctions: ['Internal Audit', 'Operations'],
    operatingFrequency: 'Annual, or on material operating change',
    implementationDifficulty: 'Moderate',
    effectivenessMeasure: 'Risk register revision date is within the last 12 months at every quarterly check',
    escalationThreshold: 'Register unrevised for more than 15 months, or a material change (new product/system/market) with no corresponding update'
  },
  D3: {
    domainCode: 'D3',
    expectedControlStandard:
      'System and data access is granted strictly on role requirements (least privilege) and independently reviewed on a fixed cycle, with exceptions investigated and closed.',
    recommendedControl:
      'Implement a documented user-access review: quarterly review of all system/data access against current role requirements, performed independently of the team being reviewed, with a signed-off exception log.',
    evidenceItems: [
      { artefact: 'Access review sign-off records', provesWhat: 'Access is actually reviewed, not just theoretically restricted', expectedRecency: 'Last completed quarterly cycle', minimumCharacteristics: 'Signed off by someone independent of the reviewed team' },
      { artefact: 'Role-to-access mapping matrix', provesWhat: 'Access is tied to defined role requirements', expectedRecency: 'Current', minimumCharacteristics: 'Covers all systems handling financially or operationally sensitive data' }
    ],
    accountableOwner: 'COO / Process Owner',
    oversightFunction: 'Head of Risk or Internal Audit',
    supportingFunctions: ['IT/Systems', 'HR'],
    operatingFrequency: 'Quarterly',
    implementationDifficulty: 'Moderate',
    effectivenessMeasure: 'Zero unreviewed privileged accounts at each quarterly cycle; exceptions closed within 30 days',
    escalationThreshold: 'Any access review cycle missed, or an exception open beyond 30 days'
  },
  D4: {
    domainCode: 'D4',
    expectedControlStandard:
      'Automated exception/anomaly monitoring covers the organisation\'s highest-risk transaction types, with alerts triaged and closed within a defined SLA.',
    recommendedControl:
      'Extend or formalise exception-monitoring rules to cover all identified high-risk transaction types, with a documented alert-triage process, a maximum time-to-close SLA, and a monthly review of rule effectiveness.',
    evidenceItems: [
      { artefact: 'Monitoring rule inventory', provesWhat: 'Detection coverage matches actual high-risk transaction types', expectedRecency: 'Current', minimumCharacteristics: 'Maps each rule to the risk it is meant to catch' },
      { artefact: 'Alert triage and closure log', provesWhat: 'Alerts are actually actioned, not just generated', expectedRecency: 'Last 3 months', minimumCharacteristics: 'Shows time-to-close against the defined SLA' }
    ],
    accountableOwner: 'Fraud analytics / monitoring owner',
    oversightFunction: 'Head of Risk',
    supportingFunctions: ['IT/Systems', 'Finance'],
    operatingFrequency: 'Continuous monitoring, monthly rule-effectiveness review',
    implementationDifficulty: 'High',
    effectivenessMeasure: 'Median alert time-to-close within SLA for 3 consecutive months',
    escalationThreshold: 'SLA breach rate above an agreed threshold in any month'
  },
  D5: {
    domainCode: 'D5',
    expectedControlStandard:
      'A documented, rehearsed incident-response process exists covering detection, containment, evidence preservation and escalation, with defined roles and a tested response time.',
    recommendedControl:
      'Formalise a fraud incident response plan with a named response team, an evidence-preservation procedure meeting a defensible chain-of-custody standard, and run at least one tabletop rehearsal per year with lessons-learned captured.',
    evidenceItems: [
      { artefact: 'Fraud incident response plan', provesWhat: 'A response process exists beyond individual judgement', expectedRecency: 'Reviewed within 12 months', minimumCharacteristics: 'Names roles, escalation path and evidence-handling steps' },
      { artefact: 'Evidence-preservation procedure', provesWhat: 'Evidence would survive scrutiny if a matter proceeded further', expectedRecency: 'Current', minimumCharacteristics: 'Defines chain-of-custody and retention' },
      { artefact: 'Tabletop rehearsal / lessons-learned record', provesWhat: 'The plan has been tested, not just written', expectedRecency: 'Last 12 months', minimumCharacteristics: 'Documents what was tested and what changed as a result' }
    ],
    accountableOwner: 'Incident response lead',
    oversightFunction: 'Legal / Compliance',
    supportingFunctions: ['HR', 'IT/Systems'],
    operatingFrequency: 'Always-on process; annual rehearsal',
    implementationDifficulty: 'Moderate',
    effectivenessMeasure: 'At least one documented rehearsal per 12 months with lessons-learned actioned',
    escalationThreshold: 'No rehearsal in 12 months, or a real incident revealing the plan was not followed'
  },
  D6: {
    domainCode: 'D6',
    expectedControlStandard:
      'A confidential/anonymous reporting channel is actively promoted, independently operated or reviewed, and paired with a documented anti-retaliation commitment communicated to staff.',
    recommendedControl:
      'Formalise the whistleblowing channel\'s independent handling process (who receives, investigates and closes cases), publish an anti-retaliation policy, and communicate both at induction and at least annually thereafter.',
    evidenceItems: [
      { artefact: 'Whistleblowing case log', provesWhat: 'The channel is used and cases are tracked to resolution', expectedRecency: 'Last 12 months', minimumCharacteristics: 'Shows case status and resolution, anonymised as needed' },
      { artefact: 'Anti-retaliation policy and communication record', provesWhat: 'Staff have been told reporting is safe, not just that a channel exists', expectedRecency: 'Communicated within the last 12 months', minimumCharacteristics: 'Evidence of distribution, not just existence of the policy' }
    ],
    accountableOwner: 'Ethics / HR / Compliance lead',
    oversightFunction: 'Board / Audit Committee',
    supportingFunctions: ['Legal'],
    operatingFrequency: 'Continuous; annual communication refresh',
    implementationDifficulty: 'Low',
    effectivenessMeasure: 'Documented anti-retaliation communication reaches all staff at least once per 12 months',
    escalationThreshold: 'No channel usage or communication evidence for over 12 months'
  },
  D7: {
    domainCode: 'D7',
    expectedControlStandard:
      'Suppliers undergo documented due diligence before onboarding, and any change to supplier banking details is independently verified via callback to a pre-existing contact before payment is released.',
    recommendedControl:
      'Introduce a documented supplier due-diligence checklist applied before onboarding, and an independently verified bank-detail-change process requiring callback confirmation using a contact sourced from records predating the change request, both evidenced in the payment file with monthly exception reporting to the CFO.',
    evidenceItems: [
      { artefact: 'Supplier due-diligence records', provesWhat: 'Suppliers are checked before being trusted with payments', expectedRecency: 'At onboarding, and for existing suppliers within the last 12 months', minimumCharacteristics: 'Covers identity/legitimacy verification, not just a signed contract' },
      { artefact: 'Bank-detail-change verification log', provesWhat: 'Bank-detail changes cannot be actioned on a single unverified request', expectedRecency: 'Every change in the last 12 months', minimumCharacteristics: 'Shows callback verification using a pre-existing contact, not the number on the change request' },
      { artefact: 'Monthly exception report to CFO', provesWhat: 'Deviations from process are visible to leadership, not just to the processing team', expectedRecency: 'Last 3 months', minimumCharacteristics: 'Lists any bank-detail change not following the verified process' }
    ],
    accountableOwner: 'Procurement / vendor-risk owner',
    oversightFunction: 'CFO',
    supportingFunctions: ['Finance / Accounts Payable'],
    operatingFrequency: 'Continuous; monthly exception reporting',
    implementationDifficulty: 'Moderate',
    effectivenessMeasure: 'Zero bank-detail changes actioned without callback verification for 3 consecutive months',
    escalationThreshold: 'Any bank-detail change actioned without verification'
  },
  D8: {
    domainCode: 'D8',
    expectedControlStandard:
      'Privileged and administrator access to digital systems and confidential data is restricted to a named, minimal set of users and independently reviewed on a fixed cycle.',
    recommendedControl:
      'Implement a privileged-access register listing every administrator/privileged account with its business justification, re-certified on a fixed cycle by someone independent of IT operations, with access revoked within a defined SLA on role change or exit.',
    evidenceItems: [
      { artefact: 'Privileged-access register', provesWhat: 'Every high-risk account is known and justified', expectedRecency: 'Current', minimumCharacteristics: 'Lists business justification per account, not just account names' },
      { artefact: 'Access re-certification sign-off', provesWhat: 'Privileged access is reviewed, not granted once and forgotten', expectedRecency: 'Last completed cycle', minimumCharacteristics: 'Independent of IT operations performing the review' }
    ],
    accountableOwner: 'Digital product / identity-control owner',
    oversightFunction: 'Head of Technology / IT Security',
    supportingFunctions: ['HR'],
    operatingFrequency: 'Quarterly',
    implementationDifficulty: 'Moderate',
    effectivenessMeasure: 'Access revoked within the defined SLA for 100% of role changes/exits over a quarter',
    escalationThreshold: 'Any privileged account with no documented business justification, or revocation SLA missed'
  },
  D9: {
    domainCode: 'D9',
    expectedControlStandard:
      'All staff complete fraud-awareness training at induction and at a fixed refresher interval, using current, organisation-relevant examples, with completion tracked.',
    recommendedControl:
      'Build a fraud-awareness training module using current, organisation-relevant scenarios, mandatory at induction and on a fixed annual refresher cycle, with completion tracked centrally and non-completion escalated.',
    evidenceItems: [
      { artefact: 'Training completion records', provesWhat: 'Awareness is actually delivered, not assumed', expectedRecency: 'Current cycle', minimumCharacteristics: 'Tracks completion by individual, not just a headcount estimate' },
      { artefact: 'Training content and version history', provesWhat: 'Content is current and organisation-relevant, not generic or stale', expectedRecency: 'Updated within the last 12 months', minimumCharacteristics: 'Reflects the organisation\'s own risk profile, not a generic template' }
    ],
    accountableOwner: 'People / training lead',
    oversightFunction: 'HR',
    supportingFunctions: ['Risk / Compliance'],
    operatingFrequency: 'Annual refresher; on induction',
    implementationDifficulty: 'Low',
    effectivenessMeasure: '95%+ completion rate within 60 days of each refresher cycle opening',
    escalationThreshold: 'Completion rate below 80% at cycle close'
  },
  D10: {
    domainCode: 'D10',
    expectedControlStandard:
      'Fraud controls are reviewed against a fixed cycle, not only after an incident, with review outcomes feeding a tracked improvement backlog.',
    recommendedControl:
      'Establish a fixed-cycle fraud-control review (at least annually) that reassesses the risk register and control effectiveness, outputs a tracked improvement backlog with owners and target dates, and reports progress to the governance forum.',
    evidenceItems: [
      { artefact: 'Control review record', provesWhat: 'Controls are reassessed on a schedule, not only reactively', expectedRecency: 'Last 12 months', minimumCharacteristics: 'Covers all ten domains, not a partial review' },
      { artefact: 'Improvement backlog with status', provesWhat: 'Findings from review actually get actioned', expectedRecency: 'Current', minimumCharacteristics: 'Has named owners and target dates per item' }
    ],
    accountableOwner: 'Risk governance owner',
    oversightFunction: 'Board / Audit Committee',
    supportingFunctions: ['Internal Audit'],
    operatingFrequency: 'Annual, minimum',
    implementationDifficulty: 'Moderate',
    effectivenessMeasure: 'Improvement backlog items closed within their target date at a rate of 80%+',
    escalationThreshold: 'No control review completed within 15 months'
  }
};

export function getDomainPlaybook(domainCode: string): DomainPlaybook {
  const playbook = PLAYBOOKS[domainCode];
  if (!playbook) {
    throw new Error(`No domain playbook defined for domain code "${domainCode}". Playbooks must cover every domain in the active methodology.`);
  }
  return playbook;
}

export function hasDomainPlaybook(domainCode: string): boolean {
  return domainCode in PLAYBOOKS;
}
