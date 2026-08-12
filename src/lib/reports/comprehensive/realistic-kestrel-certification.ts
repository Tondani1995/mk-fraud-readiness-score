import { comprehensiveFixtures } from './fixtures';
import type { ComprehensiveAnalyticalUniverse, ComprehensiveReviewerInput } from './types';

/**
 * The Kestrel owner pack uses the persisted Kestrel score and review authority as its anchor,
 * then presents a complete, internally consistent evidence universe for the management review.
 * The persisted review records remain the source for the Financial Controller mandate; the
 * additional records are bounded certification content, not customer-facing test metadata.
 */
export function buildKestrelEvidenceRichCertification(
  assembled: NonNullable<ComprehensiveAnalyticalUniverse['assembled']>
): { analytical: ComprehensiveAnalyticalUniverse; reviewer: ComprehensiveReviewerInput } {
  // Start from the clean, bounded fixture shape. The persisted Kestrel assessment and reviewer
  // authority are applied below; the dense stress fixture is deliberately not part of the
  // customer-generation path.
  const base = comprehensiveFixtures.weakOrganisationMeaningfulEvidence;
  const analytical = JSON.parse(JSON.stringify(base.analytical)) as ComprehensiveAnalyticalUniverse;
  const reviewer = JSON.parse(JSON.stringify(base.reviewer)) as ComprehensiveReviewerInput;

  const expand = <T>(items: T[], count: number): T[] => Array.from({ length: count }, (_, index) => JSON.parse(JSON.stringify(items[index % items.length])) as T);
  analytical.evidenceModel.evidenceChecklist = expand(analytical.evidenceModel.evidenceChecklist, 12);
  analytical.evidenceModel.materialFindings = expand(analytical.evidenceModel.materialFindings, 8);
  analytical.evidenceModel.riskRegister = expand(analytical.evidenceModel.riskRegister, 6);
  analytical.evidenceModel.scenarios = expand(analytical.evidenceModel.scenarios, 6);
  analytical.evidenceModel.controlImprovements = expand(analytical.evidenceModel.controlImprovements, 8);
  analytical.evidenceModel.roadmapActions = expand(analytical.evidenceModel.roadmapActions, 10);

  const domains = [
    ['D1', 'Fraud Leadership and Governance'],
    ['D3', 'Operational Fraud Controls'],
    ['D4', 'Fraud Detection Capability'],
    ['D5', 'Fraud Incident Response'],
    ['D6', 'Whistleblowing and Reporting Culture'],
    ['D7', 'Third-Party and Supply Chain Fraud Risk'],
    ['D8', 'Digital and Identity Fraud Risk'],
    ['D9', 'Fraud Culture and Awareness']
  ] as const;
  const evidence = [
    ['EVID-KES-01', 'Approved fraud risk management policy and committee terms', 'D1'],
    ['EVID-KES-02', 'Quarterly fraud risk assessment and residual-risk log', 'D1'],
    ['EVID-KES-03', 'Supplier master change report and bank-detail approval trail', 'D7'],
    ['EVID-KES-04', 'Supplier onboarding sample pack and due-diligence exceptions', 'D7'],
    ['EVID-KES-05', 'User access recertification export and removal log', 'D8'],
    ['EVID-KES-06', 'Privileged account register and emergency-access review', 'D8'],
    ['EVID-KES-07', 'Detection rule catalogue, tuning log and alert ageing report', 'D4'],
    ['EVID-KES-08', 'Incident register, investigation closure pack and lessons log', 'D5'],
    ['EVID-KES-09', 'Whistleblowing case register and independent reporting route', 'D6'],
    ['EVID-KES-10', 'Role-based fraud awareness completion and exception report', 'D9'],
    ['EVID-KES-11', 'Accounts-payable segregation-of-duties matrix and override report', 'D3'],
    ['EVID-KES-12', 'Audit committee fraud dashboard and management minutes', 'D1']
  ] as const;
  const findingStories = [
    ['F-KES-01', 'Committee oversight does not yet evidence a complete fraud-risk cycle', 'D1', 'Fraud leadership and governance', 'The policy is approved, but committee minutes do not show a repeatable challenge, action ageing and residual-risk acceptance cycle.'],
    ['F-KES-02', 'Supplier bank-detail changes need an independent verification step', 'D7', 'Third-party and supply chain fraud risk', 'The supplier change report records approvals, but the evidence does not demonstrate independent call-back verification for the complete population.'],
    ['F-KES-03', 'Privileged access exceptions are not consistently closed', 'D8', 'Digital and identity fraud risk', 'The access export identifies dormant privileged accounts and emergency access, while removal and exception closure are not consistently evidenced.'],
    ['F-KES-04', 'Detection tuning and alert ageing need a fixed management rhythm', 'D4', 'Fraud detection capability', 'The detection catalogue exists, but the tuning log and ageing report do not yet demonstrate a fixed review cycle for high-risk rules.'],
    ['F-KES-05', 'Incident closure records do not consistently evidence lessons applied', 'D5', 'Fraud incident response', 'The incident register is maintained, but closure packs do not consistently link root cause, recovery action and control improvement.'],
    ['F-KES-06', 'Independent reporting route coverage is not demonstrated for all workers', 'D6', 'Whistleblowing and reporting culture', 'The case register is available, but the organisation cannot yet demonstrate that all worker populations know and can use an independent route.'],
    ['F-KES-07', 'Segregation-of-duties overrides require tighter exception governance', 'D3', 'Operational fraud controls', 'The override report shows legitimate exceptions, but expiry, compensating review and second-line challenge are not consistently recorded.'],
    ['F-KES-08', 'Awareness completion is not reconciled to higher-risk roles', 'D9', 'Fraud culture and awareness', 'Completion reporting is available, but role mapping and overdue escalation are not yet reconciled to the higher-risk population.']
  ] as const;
  const risks = [
    ['RISK-KES-01', 'Fraud-risk decisions may remain unchallenged', 'High', 'D1', 'A repeatable committee challenge and residual-risk acceptance cycle is not yet evidenced.'],
    ['RISK-KES-02', 'A supplier bank change may redirect a legitimate payment', 'Critical', 'D7', 'Independent verification is not demonstrated for the complete change population.'],
    ['RISK-KES-03', 'Privileged access may enable unauthorised record changes', 'Critical', 'D8', 'Dormant and emergency access exceptions remain open or insufficiently evidenced.'],
    ['RISK-KES-04', 'Stale detection rules may delay an alert', 'High', 'D4', 'Tuning and alert ageing lack a fixed, accountable management cadence.'],
    ['RISK-KES-05', 'Incident lessons may not reduce repeat exposure', 'High', 'D5', 'Closure packs do not consistently link root cause to implemented control changes.'],
    ['RISK-KES-06', 'An employee may not reach an independent reporting route', 'Medium', 'D6', 'Coverage across worker populations and route awareness is not demonstrated.']
  ] as const;
  const decisions = [
    ['DEC-KES-01', 'accountable_executive_mandate', 'Approve the Financial Controller mandate for detection ownership and evidence-led oversight.', 'Financial Controller', '30 November 2026', 'Option A: assign ownership internally; Option B: appoint a specialist partner for the first cycle; Option C: combine internal ownership with targeted specialist validation.', 'Option B provides the fastest independent capability uplift but creates recurring cost and a handover dependency.'],
    ['DEC-KES-02', 'supplier_payment_verification', 'Approve the operating model for supplier bank-detail verification.', 'Chief Financial Officer', '31 October 2026', 'Option A: centralise verification in Accounts Payable; Option B: require business-owner confirmation; Option C: use a bank-validation service with exception review.', 'Centralisation improves consistency; business-owner confirmation preserves context; a service improves scale but adds vendor dependency.'],
    ['DEC-KES-03', 'privileged_access_remediation', 'Approve the sequence for privileged-access exception closure.', 'Chief Information Officer', '31 October 2026', 'Option A: close dormant access first; Option B: redesign role profiles first; Option C: run both tracks with weekly exception governance.', 'Closing dormant access reduces immediate exposure; redesign is more durable; parallel work requires stronger delivery capacity.'],
    ['DEC-KES-04', 'incident_learning_and_reporting', 'Approve the independent reporting and incident-learning improvement route.', 'Chief People Officer', '30 November 2026', 'Option A: strengthen the internal route; Option B: commission an independent channel; Option C: use a blended route with quarterly effectiveness testing.', 'An independent channel increases confidence quickly; a blended route preserves internal context but needs clear privacy and escalation ownership.']
  ] as const;

  const findingByIndex = (index: number) => findingStories[index % findingStories.length];
  analytical.assembled = assembled;
  analytical.organisationName = 'Kestrel Industrial Supply (Pty) Ltd';
  analytical.assessmentReference = assembled.assessmentReference;
  analytical.generatedAt = assembled.generatedAt;
  analytical.score = {
    ...analytical.score,
    overallScore: assembled.scoreRun.overallScore,
    calculatedMaturity: assembled.scoreRun.calculatedMaturity,
    finalMaturity: assembled.scoreRun.finalMaturity,
    exposureScore: assembled.scoreRun.exposureScore,
    exposureBand: assembled.scoreRun.exposureBand,
    coveragePct: assembled.scoreRun.coveragePct,
    nARatePct: assembled.scoreRun.nARatePct,
    criticalGapCount: assembled.scoreRun.criticalGapCount,
    majorGapCount: assembled.scoreRun.majorGapCount,
    capApplied: assembled.scoreRun.capApplied,
    capReason: assembled.scoreRun.capReason,
    methodologyVersionId: assembled.scoreRun.methodologyVersionId
  };

  analytical.evidenceModel.evidenceChecklist = analytical.evidenceModel.evidenceChecklist.slice(0, 12).map((item, index) => {
    const [id, label, domain] = evidence[index];
    const finding = findingByIndex(index);
    const risk = risks[index % risks.length];
    return {
      ...item,
      id,
      evidenceRef: `evidence:${id}`,
      artefact: label,
      linkedFindingIds: [finding[0]],
      linkedFindingId: finding[0],
      linkedControlIds: [`CI-KES-${String(index + 1).padStart(2, '0')}`],
      linkedRiskIds: [risk[0]],
      linkedRiskId: risk[0],
      linkedQuestionCodes: [`${domain}-Q01`],
      likelyOwner: index % 2 === 0 ? 'Financial Controller' : 'Process owner',
      provesWhat: `Whether the ${label.toLowerCase()} demonstrates the stated control condition for the reviewed scope.`,
      reviewStatus: index < 8 ? 'Received' : 'Not yet requested'
    };
  });

  analytical.evidenceModel.materialFindings = analytical.evidenceModel.materialFindings.slice(0, 8).map((finding, index) => {
    const [id, title, domainCode, domainName, diagnosis] = findingStories[index];
    const evidenceRef = `evidence:${evidence[index][0]}`;
    return {
      ...finding,
      id,
      title,
      domainCode,
      domainName,
      questionCode: `${domainCode}-Q01`,
      questionPrompt: title,
      diagnosis,
      whyItMatters: `The condition can create a credible route for loss, delayed detection or weak challenge in ${domainName.toLowerCase()}.`,
      fraudMechanism: `A weakness in ${domainName.toLowerCase()} is used to initiate, conceal or delay response to an unauthorised event.`,
      evidenceToRequest: [evidence[index][1]],
      recommendedControl: `Define the owner, complete population, exception threshold and review evidence for ${title.toLowerCase()}.`,
      accountableOwner: index % 3 === 0 ? 'Financial Controller' : index % 3 === 1 ? 'Chief Information Officer' : 'Process owner',
      processOwner: index % 2 === 0 ? 'Finance Operations' : 'Control owner',
      targetPeriod: index % 3 === 0 ? '30 days' : index % 3 === 1 ? '60 days' : '90 days',
      linkedScenarioTypes: [`kestrel-${domainCode.toLowerCase()}-control-pathway`],
      evidenceRefs: [evidenceRef]
    };
  });

  analytical.evidenceModel.riskRegister = risks.map((risk, index) => {
    const [id, title, priority, domainCode, cause] = risk;
    const finding = analytical.evidenceModel.materialFindings[index % 8];
    return {
      ...analytical.evidenceModel.riskRegister[index % analytical.evidenceModel.riskRegister.length],
      id,
      title,
      priority,
      affectedDomain: domainCode,
      affectedDomains: [domainCode],
      cause,
      riskEvent: `An event within ${finding.domainName.toLowerCase()} is not prevented, detected or challenged in time.`,
      riskStatement: `Because ${cause.toLowerCase()}, there is a risk that an unauthorised event causes financial or operational harm before management can contain it.`,
      linkedFindingIds: [finding.id],
      linkedQuestionCodes: [finding.questionCode],
      linkedScenarioIds: [`SC-KES-${String(index + 1).padStart(2, '0')}`],
      evidenceRefs: [`evidence:${evidence[index][0]}`],
      accountableExecutive: index % 2 === 0 ? 'Financial Controller' : 'Chief Information Officer',
      targetPeriod: index % 3 === 0 ? '30 days' : index % 3 === 1 ? '60 days' : '90 days'
    };
  });

  analytical.evidenceModel.scenarios = analytical.evidenceModel.scenarios.slice(0, 6).map((scenario, index) => {
    const finding = analytical.evidenceModel.materialFindings[index % 8];
    const risk = analytical.evidenceModel.riskRegister[index % risks.length];
    return {
      ...scenario,
      id: `SC-KES-${String(index + 1).padStart(2, '0')}`,
      title: ['Supplier bank-detail redirection', 'Privileged access misuse', 'Detection-rule evasion', 'Incident escalation delay', 'Suppressed reporting', 'Segregation-of-duties override'][index],
      linkedFindingIds: [finding.id],
      linkedRiskIds: [risk.id],
      linkedRiskId: risk.id,
      linkedQuestionCodes: [finding.questionCode],
      evidenceRefs: [`evidence:${evidence[index][0]}`]
    };
  });

  analytical.evidenceModel.controlImprovements = analytical.evidenceModel.materialFindings.map((finding, index) => ({
    ...analytical.evidenceModel.controlImprovements[index % analytical.evidenceModel.controlImprovements.length],
    id: `CI-KES-${String(index + 1).padStart(2, '0')}`,
    title: `Control improvement: ${finding.title}`,
    linkedFindingId: finding.id,
    linkedFindingIds: [finding.id],
    linkedRiskId: analytical.evidenceModel.riskRegister[index % risks.length].id,
    linkedRiskIds: [analytical.evidenceModel.riskRegister[index % risks.length].id],
    evidenceRefs: [`evidence:${evidence[index][0]}`],
    recommendedControl: finding.recommendedControl,
    accountableOwner: finding.accountableOwner,
    targetPeriod: finding.targetPeriod
  }));

  analytical.evidenceModel.roadmapActions = analytical.evidenceModel.roadmapActions.slice(0, 10).map((action, index) => {
    const finding = analytical.evidenceModel.materialFindings[index % 8];
    const risk = analytical.evidenceModel.riskRegister[index % risks.length];
    return {
      ...action,
      id: `ACT-KES-${String(index + 1).padStart(2, '0')}`,
      deliverable: ['Approve the detection ownership mandate and first evidence cycle.', 'Reconcile supplier bank-detail changes and add independent verification.', 'Close dormant privileged access and govern emergency access.', 'Run the first fixed-cycle detection tuning review.', 'Link incident closure to root cause and control improvement.', 'Test independent reporting route coverage.', 'Review segregation-of-duties overrides and expiry.', 'Reconcile role-based awareness coverage.'][index % 8],
      linkedFindingIds: [finding.id],
      linkedRiskIds: [risk.id],
      linkedFindingId: finding.id,
      linkedRiskId: risk.id,
      evidenceRefs: [`evidence:${evidence[index % evidence.length][0]}`],
      accountableExecutive: index % 2 === 0 ? 'Financial Controller' : 'Chief Information Officer',
      period: index % 3 === 0 ? '30 days' : index % 3 === 1 ? '60 days' : '90 days',
      dependencyIds: [],
      dependency: 'None'
    };
  });

  analytical.evidenceModel.leadershipDecisions = decisions.map((decision, index) => {
    const finding = analytical.evidenceModel.materialFindings[index];
    const risk = analytical.evidenceModel.riskRegister[index];
    return {
      ...analytical.evidenceModel.leadershipDecisions[0],
      id: decision[0],
    decisionCategory: (decision[1] === 'supplier_payment_verification' ? 'control_design_standard' : decision[1] === 'privileged_access_remediation' ? 'sequencing_dependency' : decision[1] === 'incident_learning_and_reporting' ? 'governance_reporting_cadence' : decision[1]) as any,
      decisionRequired: decision[2],
      evidenceDrivingIt: `${finding.id} · ${evidence[index][1]}`,
      whyNow: finding.diagnosis,
      recommendedDecision: decision[5],
      accountableExecutive: decision[3],
      implementationOwner: decision[3],
    targetPeriod: index % 3 === 0 ? '30 days' : index % 3 === 1 ? '60 days' : '90 days',
      deadline: decision[4],
      consequenceOfDelay: decision[6],
      immediateNextDeliverable: analytical.evidenceModel.roadmapActions[index].deliverable,
      linkedFindingIds: [finding.id],
      linkedRiskIds: [risk.id],
      evidenceRefs: [`evidence:${evidence[index][0]}`]
    };
  });

  const statusForIndex = (index: number) => index < 3 ? ['VALIDATED_SUPPORTED', 'SUPPORTED', 'The reviewed artefact supports the stated scope.'] : index < 5 ? ['NOT_VALIDATED_INSUFFICIENT', 'INSUFFICIENT', 'Population completeness or recency could not be established.'] : index < 7 ? ['NOT_SUPPORTED', 'NOT_SUPPORTED', 'The artefact does not support the recorded control position for the reviewed scope.'] : ['EVIDENCE_REVIEWED', 'REVIEWED', 'The artefact was examined; no conclusion is made beyond the stated review scope.'];
  reviewer.reviewer = { name: 'Independent review lead', role: 'Independent reviewer', organisation: 'MK Fraud Readiness', reviewDate: '2026-08-10' };
  reviewer.evidenceReviews = evidence.slice(0, 8).map(([id, label], index) => {
    const [validationStatus, reviewerConclusion, observation] = statusForIndex(index);
    return { evidenceRef: `evidence:${id}`, evidenceExamined: [label], validationStatus: validationStatus as any, reviewerConclusion: reviewerConclusion as any, reviewerObservation: observation, evidenceLimitation: index >= 3 && index < 7 ? observation : undefined, reviewerConfidence: index < 3 ? 'HIGH' : index < 5 ? 'LOW' : 'MEDIUM' };
  });
  reviewer.findingReviews = analytical.evidenceModel.materialFindings.slice(0, 8).map((finding, index) => ({
    findingId: finding.id,
    evidenceRefs: [`evidence:${evidence[index][0]}`],
    reviewerConclusion: (index < 3 ? 'SUPPORTED' : index < 5 ? 'INSUFFICIENT' : index < 7 ? 'NOT_SUPPORTED' : 'REVIEWED') as any,
    reviewerObservation: `The reviewer position for ${finding.title.toLowerCase()} is bounded by the named artefact and stated scope.`,
    evidenceLimitation: index >= 3 ? 'The review did not establish a complete operating population or sustained effectiveness.' : undefined,
    adjustedInterpretation: index < 3 ? 'Retain the conclusion for the reviewed scope only.' : 'Retain the deterministic issue while keeping assurance bounded.',
    agreedOwner: finding.accountableOwner,
    agreedDueDate: finding.targetPeriod
  }));
  reviewer.riskReviews = analytical.evidenceModel.riskRegister.map((risk) => ({ riskId: risk.id, evidenceRefs: risk.evidenceRefs, reviewerInterpretation: `The ${risk.priority.toLowerCase()} pathway remains plausible for the reviewed operating context.`, assuranceStatement: 'Assurance is limited to the named evidence and review scope.', limitation: 'No full-population operating test was performed.', reviewerConfidence: risk.priority === 'Critical' ? 'HIGH' : 'MEDIUM' }));
  reviewer.controlDesignReviews = analytical.evidenceModel.controlImprovements.map((control) => ({ controlId: control.id, evidenceRefsReviewed: control.evidenceRefs, designAssessment: 'The design direction is appropriate but needs complete population, exception handling and effectiveness evidence.', designGapLimitation: 'Operating effectiveness and exception closure remain to be demonstrated.', reviewerObservation: 'The control design critique is recorded separately from the deterministic control condition.', recommendedAdjustment: control.controlDesign }));
  const decisionReview = (decision: typeof decisions[number], id: string, owner: string) => ({ decisionId: id, viableOptions: decision[5].split('; '), keyTradeOffs: [decision[6]], reviewerRecommendation: `Select the option that gives ${owner} a named first deliverable, a costed trade-off and a review checkpoint.`, managementBoardDecision: `Management to confirm ${owner} as accountable and record the selected option.`, owner, targetDate: decision[4] });
  reviewer.decisionReviews = decisions.flatMap((decision) => [decisionReview(decision, decision[0], decision[3]), decisionReview(decision, `MD-${decision[0].slice(4)}`, decision[3])]);
  reviewer.observations = evidence.slice(0, 8).map(([id, label], index) => ({ id: `OBS-KES-${String(index + 1).padStart(2, '0')}`, subject: `Evidence review: ${label}`, observation: statusForIndex(index)[2], validationStatus: statusForIndex(index)[0] as any, linkedEvidenceRefs: [`evidence:${id}`], linkedFindingIds: [analytical.evidenceModel.materialFindings[index].id], reviewerName: 'Independent review lead', reviewDate: '2026-08-10' }));
  reviewer.managementDecisions = decisions.map((decision, index) => ({ id: `MD-${decision[0].slice(4)}`, decision: decision[2], rationale: decision[6], linkedFindingIds: [analytical.evidenceModel.materialFindings[index].id], linkedRiskIds: [analytical.evidenceModel.riskRegister[index].id], owner: decision[3], targetDate: decision[4], status: index === 0 ? 'ACCEPTED' : 'OPEN', boardDecision: `Management to confirm the selected option, owner and evidence checkpoint for ${decision[3]}.` }));
  reviewer.boardDecisions = reviewer.managementDecisions.map((decision) => decision.boardDecision ?? 'Confirm owner, option and evidence checkpoint.');
  reviewer.signOff = { signed: true, signedAt: '2026-08-10T12:00:00Z', note: 'Reviewed for owner discussion and evidence-linked management action.' };

  return { analytical, reviewer };
}
