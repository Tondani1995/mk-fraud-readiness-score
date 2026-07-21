// Real data for MK Assist (MKFRS-2026-18BC0EC4D7), pulled via SQL against production
// jvjxlphdyzerrhwcgkup on 2026-07-20. Used only for this local smoke test.
export const mkAssistFixture = {
  organisationName: 'MK Assist',
  domainResults: [
    { domainCode: 'D1', domainName: 'Fraud Leadership and Governance', rawScore: 65.33, weightPct: 10 },
    { domainCode: 'D2', domainName: 'Fraud Risk Identification', rawScore: 77.95, weightPct: 10 },
    { domainCode: 'D3', domainName: 'Operational Fraud Controls', rawScore: 77.22, weightPct: 10 },
    { domainCode: 'D4', domainName: 'Fraud Detection Capability', rawScore: 94.71, weightPct: 10 },
    { domainCode: 'D5', domainName: 'Fraud Incident Response', rawScore: 54.86, weightPct: 10 },
    { domainCode: 'D6', domainName: 'Whistleblowing and Reporting Culture', rawScore: 44.29, weightPct: 10 },
    { domainCode: 'D7', domainName: 'Third-Party and Supply Chain Fraud Risk', rawScore: 50.59, weightPct: 10 },
    { domainCode: 'D8', domainName: 'Digital and Identity Fraud Risk', rawScore: 62.38, weightPct: 10 },
    { domainCode: 'D9', domainName: 'Fraud Culture and Awareness', rawScore: 56.30, weightPct: 10 },
    { domainCode: 'D10', domainName: 'Continuous Improvement and Fraud Risk Monitoring', rawScore: 44.67, weightPct: 10 }
  ],
  criticalMajorGaps: [
    { questionCode: 'D1-Q04', domainCode: 'D1', domainName: 'Fraud Leadership and Governance', prompt: 'Management owns fraud risk, while internal audit or assurance functions provide independent review where they exist.', responseValue: 2, isCritical: true, isHardGate: true, isCriticalGap: true, isMajorGap: false },
    { questionCode: 'D3-Q04', domainCode: 'D3', domainName: 'Operational Fraud Controls', prompt: 'System and data access are granted based on role requirements and reviewed periodically.', responseValue: 1, isCritical: true, isHardGate: true, isCriticalGap: true, isMajorGap: true },
    { questionCode: 'D5-Q01', domainCode: 'D5', domainName: 'Fraud Incident Response', prompt: 'The organisation has a documented process for responding to suspected fraud incidents.', responseValue: 2, isCritical: true, isHardGate: true, isCriticalGap: true, isMajorGap: false },
    { questionCode: 'D5-Q05', domainCode: 'D5', domainName: 'Fraud Incident Response', prompt: 'Evidence linked to suspected fraud is identified, preserved and handled appropriately.', responseValue: 2, isCritical: true, isHardGate: true, isCriticalGap: true, isMajorGap: false },
    { questionCode: 'D6-Q01', domainCode: 'D6', domainName: 'Whistleblowing and Reporting Culture', prompt: 'The organisation provides a confidential or anonymous channel for reporting suspected fraud or misconduct.', responseValue: 1, isCritical: true, isHardGate: false, isCriticalGap: true, isMajorGap: false },
    { questionCode: 'D7-Q01', domainCode: 'D7', domainName: 'Third-Party and Supply Chain Fraud Risk', prompt: 'Suppliers, contractors or other third parties are subject to due diligence before being engaged.', responseValue: 1, isCritical: true, isHardGate: false, isCriticalGap: true, isMajorGap: false },
    { questionCode: 'D7-Q04', domainCode: 'D7', domainName: 'Third-Party and Supply Chain Fraud Risk', prompt: 'Supplier payment processes include checks to reduce invoice manipulation, fake vendors, bank-detail changes or vendor impersonation.', responseValue: 1, isCritical: true, isHardGate: true, isCriticalGap: true, isMajorGap: true },
    { questionCode: 'D8-Q04', domainCode: 'D8', domainName: 'Digital and Identity Fraud Risk', prompt: 'Access to sensitive digital systems, administrator rights and confidential data is restricted and reviewed.', responseValue: 1, isCritical: true, isHardGate: true, isCriticalGap: true, isMajorGap: true }
  ],
  maturityCapEvents: [
    { ruleCode: 'any_hard_gate_critical_control_lte_1', capTo: 'Developing', reason: 'One or more hard-gate critical controls scored 0 or 1.', relatedQuestionCode: 'D3-Q04', relatedQuestionPrompt: 'System and data access are granted based on role requirements and reviewed periodically.', relatedDomainCode: 'D3', relatedDomainName: 'Operational Fraud Controls' },
    { ruleCode: 'any_hard_gate_critical_control_eq_2', capTo: 'Structured', reason: 'One or more hard-gate critical controls scored 2.', relatedQuestionCode: 'D1-Q04', relatedQuestionPrompt: 'Management owns fraud risk, while internal audit or assurance functions provide independent review where they exist.', relatedDomainCode: 'D1', relatedDomainName: 'Fraud Leadership and Governance' },
    { ruleCode: 'three_or_more_critical_controls_lte_2', capTo: 'Developing', reason: 'Three or more critical controls scored 0, 1 or 2.', relatedQuestionCode: null, relatedQuestionPrompt: null, relatedDomainCode: null, relatedDomainName: null },
    { ruleCode: 'any_core_domain_below_60', capTo: 'Structured', reason: 'Core domain D5 scored below 60.', relatedQuestionCode: null, relatedQuestionPrompt: null, relatedDomainCode: 'D5', relatedDomainName: 'Fraud Incident Response' }
  ],
  exposureAnswers: [
    { factorCode: 'EXP-01', name: 'High-risk process footprint (procurement, refunds, claims, stock, payments or service delivery)', selectedLabel: 'High exposure', pointsAwarded: 18.75, maxPoints: 25 },
    { factorCode: 'EXP-02', name: 'Third-party and supplier dependency (suppliers, contractors, agents or outsourced providers)', selectedLabel: 'High exposure', pointsAwarded: 11.25, maxPoints: 15 },
    { factorCode: 'EXP-03', name: 'Digital channel reliance (portals, apps, online forms, WhatsApp journeys or customer platforms)', selectedLabel: 'Low exposure', pointsAwarded: 3.75, maxPoints: 15 },
    { factorCode: 'EXP-04', name: 'Identity and personal-data dependency (customers, employees, suppliers, beneficiaries or users)', selectedLabel: 'High exposure', pointsAwarded: 7.5, maxPoints: 10 },
    { factorCode: 'EXP-05', name: 'Cash, stock or high-value asset handling', selectedLabel: 'High exposure', pointsAwarded: 7.5, maxPoints: 10 },
    { factorCode: 'EXP-06', name: 'Operational dispersion (branches, depots, regions, sites, field teams or remote operations)', selectedLabel: 'Low exposure', pointsAwarded: 2, maxPoints: 8 },
    { factorCode: 'EXP-07', name: 'Manual intervention and exception volume (overrides, adjustments, manual approvals or exception handling)', selectedLabel: 'Severe exposure', pointsAwarded: 10, maxPoints: 10 },
    { factorCode: 'EXP-08', name: 'Public funds, regulated payments or vulnerable stakeholders', selectedLabel: 'None / not applicable', pointsAwarded: 0, maxPoints: 7 }
  ]
};
