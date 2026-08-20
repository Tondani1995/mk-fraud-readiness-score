import { officialResponseLabelsFixture } from './official-response-labels';

// Synthetic, non-production fixture representing a materially different organisation: a digital-first
// consumer lender. Built by hand to differ from MK Assist in exposure profile, maturity distribution,
// failed controls, and cap logic -- per section 38 of the brief (safe fixture, not customer data).
export const syntheticOrgFixture = {
  organisationName: 'Northgate Digital Lending (test fixture)',
  scoreRun: { id: 'synthetic-run', assessmentId: 'synthetic-assessment', methodologyVersionId: 'mfrs-v1.1-fixture', status: 'completed', lockedAt: null, inputHash: null, overallScore: 68, calculatedMaturity: 'Developing', finalMaturity: 'Developing', exposureScore: 58, exposureBand: 'High', coveragePct: 100, nARatePct: 0, criticalGapCount: 1, majorGapCount: 3, capApplied: true, capReason: 'Fixture cap' },
  officialResponseLabels: officialResponseLabelsFixture,
  domainResults: [
    { domainCode: 'D1', domainName: 'Fraud Leadership and Governance', rawScore: 88.0, weightPct: 10 },
    { domainCode: 'D2', domainName: 'Fraud Risk Identification', rawScore: 71.0, weightPct: 10 },
    { domainCode: 'D3', domainName: 'Operational Fraud Controls', rawScore: 82.0, weightPct: 10 },
    { domainCode: 'D4', domainName: 'Fraud Detection Capability', rawScore: 58.0, weightPct: 10 },
    { domainCode: 'D5', domainName: 'Fraud Incident Response', rawScore: 90.0, weightPct: 10 },
    { domainCode: 'D6', domainName: 'Whistleblowing and Reporting Culture', rawScore: 85.0, weightPct: 10 },
    { domainCode: 'D7', domainName: 'Third-Party and Supply Chain Fraud Risk', rawScore: 80.0, weightPct: 10 },
    { domainCode: 'D8', domainName: 'Digital and Identity Fraud Risk', rawScore: 38.0, weightPct: 10 },
    { domainCode: 'D9', domainName: 'Fraud Culture and Awareness', rawScore: 47.0, weightPct: 10 },
    { domainCode: 'D10', domainName: 'Continuous Improvement and Fraud Risk Monitoring', rawScore: 76.0, weightPct: 10 }
  ],
  criticalMajorGaps: [
    { questionCode: 'D8-Q02', domainCode: 'D8', domainName: 'Digital and Identity Fraud Risk', prompt: 'Identity verification for new digital customers uses more than a single static data point.', responseValue: 0, isCritical: true, isHardGate: true, isCriticalGap: true, isMajorGap: false },
    { questionCode: 'D8-Q05', domainCode: 'D8', domainName: 'Digital and Identity Fraud Risk', prompt: 'Device and behavioural signals are used to flag anomalous digital sessions.', responseValue: 1, isCritical: true, isHardGate: false, isCriticalGap: false, isMajorGap: true },
    { questionCode: 'D4-Q02', domainCode: 'D4', domainName: 'Fraud Detection Capability', prompt: 'Detection rules are reviewed and tuned on a fixed cycle to keep pace with changing fraud patterns.', responseValue: 1, isCritical: false, isHardGate: false, isCriticalGap: false, isMajorGap: true },
    { questionCode: 'D9-Q01', domainCode: 'D9', domainName: 'Fraud Culture and Awareness', prompt: 'Staff receive fraud-awareness training at induction and on a recurring cycle.', responseValue: 1, isCritical: false, isHardGate: false, isCriticalGap: false, isMajorGap: true }
  ],
  questionTraces: [
    { questionCode: 'D8-Q02', domainCode: 'D8', domainName: 'Digital and Identity Fraud Risk', prompt: 'Systems or digital platforms are monitored for suspicious activity such as unusual login, access, profile, transaction or account behaviour.', responseValue: 0, normalisedScore: 0, applicable: true, triggeredRules: [], isCritical: true, isHardGate: true, isCriticalGap: true, isMajorGap: false },
    { questionCode: 'D8-Q05', domainCode: 'D8', domainName: 'Digital and Identity Fraud Risk', prompt: 'Digital activity is monitored for misuse, unauthorised transactions, suspicious data changes or channel abuse.', responseValue: 1, normalisedScore: 20, applicable: true, triggeredRules: [], isCritical: false, isHardGate: false, isCriticalGap: false, isMajorGap: true },
    { questionCode: 'D4-Q02', domainCode: 'D4', domainName: 'Fraud Detection Capability', prompt: 'Exception reports or alerts highlighting unusual transactions or activities are generated and reviewed regularly.', responseValue: 1, normalisedScore: 20, applicable: true, triggeredRules: [], isCritical: false, isHardGate: false, isCriticalGap: false, isMajorGap: true },
    { questionCode: 'D9-Q01', domainCode: 'D9', domainName: 'Fraud Culture and Awareness', prompt: "Employees receive periodic training or guidance on fraud risks relevant to their roles and the organisation's operating environment.", responseValue: 1, normalisedScore: 20, applicable: true, triggeredRules: [], isCritical: false, isHardGate: false, isCriticalGap: false, isMajorGap: true }
  ],
  maturityCapEvents: [
    { ruleCode: 'any_hard_gate_critical_control_lte_1', capTo: 'Developing', reason: 'One or more hard-gate critical controls scored 0 or 1.', relatedQuestionCode: 'D8-Q02', relatedQuestionPrompt: 'Identity verification for new digital customers uses more than a single static data point.', relatedDomainCode: 'D8', relatedDomainName: 'Digital and Identity Fraud Risk' }
  ],
  exposureAnswers: [
    { factorCode: 'EXP-01', name: 'High-risk process footprint (procurement, refunds, claims, stock, payments or service delivery)', selectedLabel: 'Moderate exposure', pointsAwarded: 12.5, maxPoints: 25 },
    { factorCode: 'EXP-02', name: 'Third-party and supplier dependency (suppliers, contractors, agents or outsourced providers)', selectedLabel: 'Low exposure', pointsAwarded: 3, maxPoints: 15 },
    { factorCode: 'EXP-03', name: 'Digital channel reliance (portals, apps, online forms, WhatsApp journeys or customer platforms)', selectedLabel: 'Severe exposure', pointsAwarded: 15, maxPoints: 15 },
    { factorCode: 'EXP-04', name: 'Identity and personal-data dependency (customers, employees, suppliers, beneficiaries or users)', selectedLabel: 'Severe exposure', pointsAwarded: 10, maxPoints: 10 },
    { factorCode: 'EXP-05', name: 'Cash, stock or high-value asset handling', selectedLabel: 'None / not applicable', pointsAwarded: 0, maxPoints: 10 },
    { factorCode: 'EXP-06', name: 'Operational dispersion (branches, depots, regions, sites, field teams or remote operations)', selectedLabel: 'Low exposure', pointsAwarded: 1, maxPoints: 8 },
    { factorCode: 'EXP-07', name: 'Manual intervention and exception volume (overrides, adjustments, manual approvals or exception handling)', selectedLabel: 'Low exposure', pointsAwarded: 1, maxPoints: 10 },
    { factorCode: 'EXP-08', name: 'Public funds, regulated payments or vulnerable stakeholders', selectedLabel: 'High exposure', pointsAwarded: 5.5, maxPoints: 7 }
  ]
};
