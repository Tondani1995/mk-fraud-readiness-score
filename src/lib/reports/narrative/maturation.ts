import type { NarrativeControlFact, NarrativeFindingFact, NarrativeSustainmentPriorityFact } from './fact-pack';
import type { PrimarySemanticFamily } from '../evidence-model/semantic-mappings';

export interface NarrativeMaturationStep {
  maturationRef: string;
  linkedFindingRef: string;
  linkedSustainmentPriorityRef?: string;
  linkedControlRef: string;
  semanticFamily: PrimarySemanticFamily;
  phase: 'EMBED' | 'MATURE';
  phaseWindow: '4-6 months' | '7-12 months';
  managementOutcome: string;
  priorityActivity: string;
  accountableExecutive: string;
  processOwner: string;
  dependency: string;
  successMeasure: string;
  proofOfProgress: string;
}

type MaturationPattern = Pick<NarrativeMaturationStep, 'managementOutcome' | 'priorityActivity' | 'successMeasure' | 'proofOfProgress'>;

const PATTERNS: Partial<Record<PrimarySemanticFamily, { embed: MaturationPattern; mature: MaturationPattern }>> = {
  FRAUD_GOVERNANCE: {
    embed: { managementOutcome: 'Fraud-risk accountability is embedded in the management operating rhythm.', priorityActivity: 'Embed named executive ownership, challenge routes and management reporting into the governance calendar.', successMeasure: 'All priority fraud-risk decisions have an accountable executive, recorded route and scheduled review.', proofOfProgress: 'Retain governance agendas, decision records and action closure evidence for the priority risk set.' },
    mature: { managementOutcome: 'Governance is repeatable, challenged and improved from trend information.', priorityActivity: 'Mature governance through trend review, independent challenge and closed-loop improvement.', successMeasure: 'Management demonstrates repeatable challenge, timely action closure and documented improvement decisions.', proofOfProgress: 'Retain trend packs, challenge records, action logs and evidence of decisions changing the control environment.' }
  },
  FRAUD_RISK_IDENTIFICATION: {
    embed: { managementOutcome: 'The fraud-risk register is connected to owned treatment and review activity.', priorityActivity: 'Embed risk-register refresh, treatment ownership and change-triggered review across priority processes.', successMeasure: 'Priority fraud pathways have current owners, linked treatments and a recorded review cadence.', proofOfProgress: 'Retain the dated risk register, review record, treatment decisions and change-trigger evidence.' },
    mature: { managementOutcome: 'Fraud-risk identification is current, scenario-led and used to steer control investment.', priorityActivity: 'Mature the risk view through trend analysis, emerging-risk review and treatment effectiveness feedback.', successMeasure: 'Material changes update the risk view and control priorities within the agreed management cycle.', proofOfProgress: 'Retain risk trend packs, emerging-risk assessments, revised treatments and management challenge records.' }
  },
  SUPPLIER_ONBOARDING: {
    embed: { managementOutcome: 'Supplier onboarding prevents fictitious, conflicted or compromised relationships from reaching payment.', priorityActivity: 'Embed independent registration, ownership, conflict and banking checks before activation.', successMeasure: 'All in-scope suppliers have complete onboarding evidence and exceptions are approved before payment eligibility.', proofOfProgress: 'Retain supplier due-diligence records, approval evidence, exception decisions and sample review results.' },
    mature: { managementOutcome: 'Supplier onboarding is monitored as a continuous fraud-prevention control.', priorityActivity: 'Mature supplier monitoring through refresh triggers, exception analytics and periodic independent challenge.', successMeasure: 'Supplier-risk changes trigger timely refresh and exceptions show documented resolution or escalation.', proofOfProgress: 'Retain refresh logs, exception trends, challenge records and closure evidence.' }
  },
  SUPPLIER_PAYMENT_CHANGE: {
    embed: { managementOutcome: 'Supplier bank-detail changes are independently verified before payment release.', priorityActivity: 'Embed trusted-channel callback, dual approval, change logging and payment-hold escalation.', successMeasure: 'Every in-scope payment-detail change has independent verification and a traceable approval record.', proofOfProgress: 'Retain change requests, trusted-channel verification, approval logs, holds and release evidence.' },
    mature: { managementOutcome: 'Payment-change controls are measured, challenged and tuned to emerging diversion patterns.', priorityActivity: 'Mature the control through analytics, sampling, exception review and periodic challenge of trusted channels.', successMeasure: 'Diversion indicators are detected, investigated and used to improve thresholds and response timing.', proofOfProgress: 'Retain monitoring reports, sample results, investigations, threshold decisions and improvement actions.' }
  },
  THIRD_PARTY_OVERSIGHT: {
    embed: { managementOutcome: 'Third-party fraud-risk oversight is visible across onboarding, payment and renewal decisions.', priorityActivity: 'Embed risk-tiering, accountable review and escalation for material third-party relationships.', successMeasure: 'Material third parties have current risk tiers, owners, review dates and recorded exceptions.', proofOfProgress: 'Retain the third-party inventory, risk assessments, review minutes and exception decisions.' },
    mature: { managementOutcome: 'Third-party oversight is proportionate, risk-led and improved from performance information.', priorityActivity: 'Mature oversight through portfolio analytics, refresh triggers and independent review of high-risk relationships.', successMeasure: 'Portfolio trends drive timely refresh, escalation and changes to third-party control requirements.', proofOfProgress: 'Retain portfolio reports, refresh evidence, escalations and resulting control changes.' }
  },
  ORDINARY_ACCESS: {
    embed: { managementOutcome: 'Role-based access is aligned to fraud-sensitive duties and reviewed on a repeatable cycle.', priorityActivity: 'Embed joiner, mover, leaver, recertification and segregation-of-duties routines for ordinary access.', successMeasure: 'In-scope access reviews complete on time and exceptions have named owners and closure dates.', proofOfProgress: 'Retain access review sign-offs, exception logs, removal evidence and sample challenge results.' },
    mature: { managementOutcome: 'Access governance uses usage information and recurring challenge to reduce residual privilege.', priorityActivity: 'Mature access oversight through usage analytics, risk-tiered recertification and periodic independent challenge.', successMeasure: 'Access anomalies and stale entitlements are identified, resolved and reflected in role design.', proofOfProgress: 'Retain usage reports, recertification results, exception closure and role-design changes.' }
  },
  PRIVILEGED_ACCESS: {
    embed: { managementOutcome: 'Privileged access is restricted, time-bounded and independently reviewed.', priorityActivity: 'Embed privileged-access approval, emergency-use logging, session review and recertification.', successMeasure: 'Privileged entitlements and use are reviewed to schedule with every exception investigated and closed.', proofOfProgress: 'Retain entitlement reviews, approvals, emergency-use logs, session review and exception closure.' },
    mature: { managementOutcome: 'Privileged-access monitoring detects misuse patterns and informs operating decisions.', priorityActivity: 'Mature privileged-access oversight through analytics, risk-based challenge and repeatable response testing.', successMeasure: 'High-risk use patterns produce timely review, escalation and control improvement decisions.', proofOfProgress: 'Retain analytics, investigations, response tests, challenge records and improvement actions.' }
  },
  IDENTITY_VERIFICATION: {
    embed: { managementOutcome: 'Material identity changes are verified through a consistent independent route.', priorityActivity: 'Embed identity-proofing, trusted-channel verification, change approval and exception escalation.', successMeasure: 'Material identity or mandate changes have complete verification and approval evidence before activation.', proofOfProgress: 'Retain verification records, trusted-channel evidence, approvals and exception decisions.' },
    mature: { managementOutcome: 'Identity verification is risk-tiered, monitored and improved from attempted misuse signals.', priorityActivity: 'Mature identity controls through anomaly analytics, refresh triggers and testing of high-risk change routes.', successMeasure: 'Identity anomalies and failed verification attempts inform timely control and process changes.', proofOfProgress: 'Retain anomaly reports, failed-verification reviews, refresh evidence and control-change records.' }
  },
  DETECTION_MONITORING: {
    embed: { managementOutcome: 'Fraud-sensitive monitoring produces owned alerts, investigation decisions and escalation.', priorityActivity: 'Embed alert ownership, thresholds, triage, investigation records and escalation service levels.', successMeasure: 'Priority alerts are triaged and resolved within the agreed service level with outcomes recorded.', proofOfProgress: 'Retain alert queues, triage decisions, investigations, escalations and closure evidence.' },
    mature: { managementOutcome: 'Detection monitoring is tuned from performance trends and tested against changing pathways.', priorityActivity: 'Mature monitoring through threshold tuning, scenario testing, false-positive review and independent challenge.', successMeasure: 'Detection performance is measured and changes demonstrably improve timely identification of priority pathways.', proofOfProgress: 'Retain performance dashboards, test results, tuning decisions and challenge records.' }
  },
  INCIDENT_RESPONSE: {
    embed: { managementOutcome: 'Suspected-fraud intake, severity, containment and ownership operate as one response route.', priorityActivity: 'Embed incident triage, named response ownership, containment decisions and escalation timing.', successMeasure: 'Every suspected matter receives a timely severity decision, owner, containment route and decision record.', proofOfProgress: 'Retain intake records, severity decisions, action logs, escalation evidence and closure reviews.' },
    mature: { managementOutcome: 'Incident response improves through exercised learning and management oversight.', priorityActivity: 'Mature response through scenario exercises, root-cause review, lessons learned and tracked improvement.', successMeasure: 'Exercises and live matters produce closed improvement actions that reduce response delay or recurrence risk.', proofOfProgress: 'Retain exercise records, post-matter reviews, improvement logs and management oversight evidence.' }
  },
  EVIDENCE_INTEGRITY: {
    embed: { managementOutcome: 'Fraud-related records are preserved, access-controlled and traceable through review.', priorityActivity: 'Embed retention, legal-hold, access, custody and review requirements for suspected-fraud records.', successMeasure: 'Priority matters have complete preservation and custody records with access exceptions escalated.', proofOfProgress: 'Retain hold notices, custody logs, access records, preservation checks and exception decisions.' },
    mature: { managementOutcome: 'Evidence integrity is tested and strengthened through recurring assurance and incident learning.', priorityActivity: 'Mature evidence handling through custody testing, access analytics and lessons from investigations.', successMeasure: 'Evidence-handling exceptions are detected, resolved and used to improve retention or custody design.', proofOfProgress: 'Retain custody tests, access reports, exception closure and resulting design changes.' }
  },
  WHISTLEBLOWING: {
    embed: { managementOutcome: 'Protected reporting routes reach an independent owner with visible protection and escalation.', priorityActivity: 'Embed channel independence, reporter protection, triage, escalation and case governance.', successMeasure: 'Concerns are logged, protected, triaged and escalated without dependence on an implicated manager.', proofOfProgress: 'Retain channel governance, anonymised case records, protection decisions and escalation evidence.' },
    mature: { managementOutcome: 'Protected reporting is trusted, monitored and improved from case-pattern information.', priorityActivity: 'Mature reporting oversight through trend review, independent challenge and recurring channel testing.', successMeasure: 'Management identifies reporting-pattern changes and closes actions that improve independence or protection.', proofOfProgress: 'Retain anonymised trend packs, channel tests, challenge records and improvement actions.' }
  },
  FRAUD_AWARENESS: {
    embed: { managementOutcome: 'Fraud awareness is targeted to the roles and pathways carrying the greatest exposure.', priorityActivity: 'Embed role-specific learning, scenario-based reinforcement and completion escalation.', successMeasure: 'Priority roles complete relevant learning and management follows up overdue or failed reinforcement.', proofOfProgress: 'Retain learning assignments, completion reports, scenario exercises and escalation records.' },
    mature: { managementOutcome: 'Awareness changes behaviour through measured reinforcement and pathway-specific learning.', priorityActivity: 'Mature awareness through outcome testing, incident learning and targeted refresh for high-risk roles.', successMeasure: 'Learning outcomes and fraud signals drive changes to content, audience or reinforcement cadence.', proofOfProgress: 'Retain outcome tests, refresh decisions, incident-learning records and completion trends.' }
  },
  CONTINUOUS_IMPROVEMENT: {
    embed: { managementOutcome: 'Control performance is reviewed and improvement actions are owned through closure.', priorityActivity: 'Embed effectiveness measures, review cadence, exception escalation and action tracking.', successMeasure: 'Priority controls have current measures, review records and closed improvement actions.', proofOfProgress: 'Retain scorecards, review records, exception logs and action closure evidence.' },
    mature: { managementOutcome: 'The control environment improves deliberately from measured performance and challenge.', priorityActivity: 'Mature continuous improvement through trend analysis, independent challenge and controlled design updates.', successMeasure: 'Measured performance produces timely, owned and demonstrably effective control improvements.', proofOfProgress: 'Retain trend analysis, challenge records, design approvals and post-change effectiveness results.' }
  }
};

function patternFor(family: PrimarySemanticFamily): { embed: MaturationPattern; mature: MaturationPattern } {
  return PATTERNS[family] ?? PATTERNS.CONTINUOUS_IMPROVEMENT!;
}

export function buildNarrativeMaturationSteps(controls: NarrativeControlFact[], findings: NarrativeFindingFact[], sustainmentPriorities: NarrativeSustainmentPriorityFact[] = []): NarrativeMaturationStep[] {
  const findingByRef = new Map(findings.map((finding) => [finding.factRef, finding]));
  const priorityByRef = new Map(sustainmentPriorities.map((priority) => [priority.factRef, priority]));
  return controls.flatMap((control, index) => {
    const finding = findingByRef.get(control.linkedFindingRefs[0] ?? '');
    const sustainmentPriorityRef = control.linkedSustainmentPriorityRefs[0];
    const sustainmentPriority = priorityByRef.get(sustainmentPriorityRef ?? '');
    if (!finding && !sustainmentPriority) return [];
    const pattern = patternFor(control.primarySemanticFamily);
    const prefix = `MAT-${String(index + 1).padStart(3, '0')}`;
    const common = {
      linkedFindingRef: finding?.factRef ?? '',
      linkedSustainmentPriorityRef: sustainmentPriority?.factRef,
      linkedControlRef: control.factRef,
      semanticFamily: control.primarySemanticFamily,
      accountableExecutive: control.accountableExecutive,
      processOwner: control.processOwner
    } as const;
    return [
      { maturationRef: `${prefix}-EMBED`, phase: 'EMBED' as const, phaseWindow: '4-6 months' as const, dependency: 'Initial 90-day control blueprint is operating and its first review record is available.', ...pattern.embed, ...common },
      { maturationRef: `${prefix}-MATURE`, phase: 'MATURE' as const, phaseWindow: '7-12 months' as const, dependency: 'The embedded control cycle is repeatable and its effectiveness information is available for management review.', ...pattern.mature, ...common }
    ];
  });
}
