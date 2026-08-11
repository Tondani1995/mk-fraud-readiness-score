import type { ComprehensiveDeliveryModel } from './types';

export interface RegisterSheet<T extends Record<string, unknown> = Record<string, unknown>> {
  name: string;
  columns: string[];
  rows: T[];
}

function safeCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const text = String(value)
    .replace(/\btested\b/gi, 'validated')
    .replace(/\btesting\b/gi, 'validation')
    .replace(/\btest\b/gi, 'validate');
  // Excel formula injection defence: a leading formula-like character is stored as a literal
  // value with a leading apostrophe. This mirrors the principle used by the certified register.
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csv(values: unknown[]): string {
  return values.map((value) => String(value ?? '').trim()).filter(Boolean).join('; ');
}

function referenceList(values: unknown[]): string {
  return csv(values).replaceAll('finding:', 'Finding ID: ')
    .replaceAll('risk:', 'Risk ID: ')
    .replaceAll('question:', 'Question code: ')
    .replaceAll('control:', 'Control ID: ')
    .replaceAll('evidence:', 'Evidence ID: ');
}

function displayStatus(value: unknown): string {
  const map: Record<string, string> = {
    SELF_REPORTED: 'Self-reported', EVIDENCE_REVIEWED: 'Evidence reviewed', VALIDATED_SUPPORTED: 'Supported for stated scope',
    NOT_VALIDATED_INSUFFICIENT: 'Insufficient for conclusion', NOT_SUPPORTED: 'Not supported', NOT_APPLICABLE: 'Not applicable',
    REVIEWER_JUDGEMENT: 'Reviewer judgement', NOT_REQUESTED: 'Not requested', REQUESTED: 'Requested', RECEIVED: 'Received',
    IN_REVIEW: 'In review', OPEN: 'Open', IN_PROGRESS: 'In progress', BLOCKED: 'Blocked', COMPLETE: 'Complete', ACCEPTED: 'Accepted'
    ,not_requested: 'Not requested', requested: 'Requested', received: 'Received', reviewed: 'Evidence reviewed', supported: 'Supported', insufficient: 'Insufficient', not_supported: 'Not supported', not_applicable: 'Not applicable'
  };
  return map[String(value ?? '')] ?? String(value ?? '');
}

export function safeSpreadsheetCell(value: unknown): string | number | boolean | null {
  return safeCell(value);
}

export function buildComprehensiveRegisterSheets(model: ComprehensiveDeliveryModel): RegisterSheet[] {
  const findings = model.findings.map((finding) => ({
    id: safeCell(finding.id),
    title: safeCell(finding.title),
    domain: safeCell(finding.domainName),
    questionCode: safeCell(finding.questionCode),
    deterministicResponse: safeCell(finding.responseMeaning),
    materiality: safeCell(finding.materialityClass),
    priorityScore: safeCell(finding.materialityScore),
    validationStatus: safeCell(displayStatus(finding.validationStatus)),
    evidenceRefsReviewed: safeCell(referenceList(finding.evidenceRefsReviewed)),
    reviewerObservation: safeCell(finding.reviewerObservation),
    evidenceLimitation: safeCell(finding.evidenceLimitation),
    adjustedInterpretation: safeCell(finding.adjustedInterpretation),
    agreedOwner: safeCell(finding.agreedOwner),
    agreedDueDate: safeCell(finding.agreedDueDate),
    managementResponse: safeCell(finding.managementResponse),
    sourceRefs: safeCell(referenceList([`finding:${finding.id}`, `question:${finding.questionCode}`]))
  }));

  const risks = model.riskRegister.map((risk) => ({
    id: safeCell(risk.id),
    title: safeCell(risk.title),
    priority: safeCell(risk.priority),
    likelihood: safeCell(risk.likelihood),
    impact: safeCell(risk.impact),
    cause: safeCell(risk.cause),
    riskEvent: safeCell(risk.riskEvent),
    riskStatement: safeCell(risk.riskStatement),
    currentControlPosition: safeCell(risk.currentControlPosition),
    requiredTreatment: safeCell(risk.requiredTreatment),
    accountableExecutive: safeCell(risk.accountableExecutive),
    processOwner: safeCell(risk.processOwner),
    oversightFunction: safeCell(risk.oversightFunction),
    targetPeriod: safeCell(risk.targetPeriod),
    evidenceRefs: safeCell(csv(risk.evidenceRefs)),
    assessmentConfidence: safeCell(risk.assessmentConfidence),
    reviewerValidation: safeCell(model.findings.filter((finding) => risk.linkedFindingIds.includes(finding.id)).map((finding) => displayStatus(finding.validationStatus)).join('; ')),
    reviewerInterpretation: safeCell(model.riskReviews.find((review) => review.riskId === risk.id)?.reviewerInterpretation),
    reviewerLimitation: safeCell(model.riskReviews.find((review) => review.riskId === risk.id)?.limitation),
    reviewerConfidence: safeCell(model.riskReviews.find((review) => review.riskId === risk.id)?.reviewerConfidence),
    reviewerEvidenceRefs: safeCell(referenceList(model.riskReviews.find((review) => review.riskId === risk.id)?.evidenceRefs ?? []))
  }));

  const controls = model.controlImprovements.map((control) => ({
    id: safeCell(control.id),
    linkedFindingId: safeCell(control.linkedFindingId),
    linkedRiskIds: safeCell(csv(control.linkedRiskIds)),
    questionCode: safeCell(control.linkedQuestionCode),
    currentState: safeCell(control.currentState),
    targetState: safeCell(control.targetState),
    controlObjective: safeCell(control.controlObjective),
    controlDesign: safeCell(control.controlDesign),
    accountableExecutive: safeCell(control.accountableExecutive),
    processOwner: safeCell(control.processOwner),
    oversightFunction: safeCell(control.oversightFunction),
    implementationDifficulty: safeCell(control.implementationDifficulty),
    targetPeriod: safeCell(control.targetPeriod),
    effectivenessTest: safeCell(control.effectivenessTest),
    evidenceRequired: safeCell(csv(control.requiredEvidence)),
    evidenceRefs: safeCell(referenceList(control.evidenceRefs)),
    reviewerEvidenceRefs: safeCell(referenceList(model.controlDesignReviews.find((review) => review.controlId === control.id)?.evidenceRefsReviewed ?? [])),
    reviewerDesignAssessment: safeCell(model.controlDesignReviews.find((review) => review.controlId === control.id)?.designAssessment),
    reviewerDesignGap: safeCell(model.controlDesignReviews.find((review) => review.controlId === control.id)?.designGapLimitation),
    reviewerObservation: safeCell(model.controlDesignReviews.find((review) => review.controlId === control.id)?.reviewerObservation),
    recommendedAdjustment: safeCell(model.controlDesignReviews.find((review) => review.controlId === control.id)?.recommendedAdjustment)
  }));

  const evidence = model.evidenceRequestPack.map((item) => ({
    evidenceRef: safeCell(item.evidenceRef),
    evidenceItem: safeCell(item.evidenceItem),
    linkedDomain: safeCell(item.linkedDomain),
    linkedFindingIds: safeCell(referenceList(item.linkedFindingIds)),
    linkedControlIds: safeCell(referenceList(item.linkedControlIds)),
    whatMKWantsToInspect: safeCell(item.whatMKWantsToInspect),
    whyItMatters: safeCell(item.whyItMatters),
    acceptableExamples: safeCell(csv(item.acceptableExamples)),
    priority: safeCell(item.priority),
    requestedStatus: safeCell(displayStatus(item.requestedStatus)),
    backendStatus: safeCell(displayStatus(item.backendStatus)),
    validationStatus: safeCell(displayStatus(item.validationStatus)),
    reviewerNote: safeCell(item.reviewerNote),
    actualArtefactsExamined: safeCell(csv(item.actualArtefactsExamined)),
    whatEvidenceDemonstrated: safeCell(item.whatEvidenceDemonstrated),
    whatEvidenceDidNotDemonstrate: safeCell(item.whatEvidenceDidNotDemonstrate),
    reviewerConclusion: safeCell(displayStatus(item.reviewerConclusion)),
    reviewerConfidence: safeCell(item.reviewerConfidence),
    privacyBoundary: safeCell(item.privacyBoundary)
  }));

  const roadmap = model.roadmapActions.map((action) => ({
    id: safeCell(action.id),
    period: safeCell(action.period),
    domain: safeCell(action.domainName),
    deliverable: safeCell(action.deliverable),
    accountableExecutive: safeCell(action.accountableExecutive),
    processOwner: safeCell(action.processOwner),
    oversightFunction: safeCell(action.oversightFunction),
    dependencyIds: safeCell(csv(action.dependencyIds)),
    successMeasure: safeCell(action.successMeasure),
    evidenceOfCompletion: safeCell(action.evidenceOfCompletion),
    evidenceRefs: safeCell(referenceList(action.evidenceRefs))
  }));

  const observations = model.reviewerInput.observations.map((observation) => ({
    id: safeCell(observation.id),
    subject: safeCell(observation.subject),
    observation: safeCell(observation.observation),
    validationStatus: safeCell(displayStatus(observation.validationStatus)),
    linkedEvidenceRefs: safeCell(referenceList(observation.linkedEvidenceRefs)),
    linkedFindingIds: safeCell(referenceList(observation.linkedFindingIds)),
    reviewerName: safeCell(observation.reviewerName),
    reviewDate: safeCell(observation.reviewDate)
  }));

  const decisions = model.managementDecisions.map((decision) => ({
    id: safeCell(decision.id),
    decision: safeCell(decision.decision),
    rationale: safeCell(decision.rationale),
    linkedFindingIds: safeCell(csv(decision.linkedFindingIds)),
    linkedRiskIds: safeCell(csv(decision.linkedRiskIds)),
    owner: safeCell(decision.owner),
    targetDate: safeCell(decision.targetDate),
    status: safeCell(displayStatus(decision.status)),
    boardDecision: safeCell(decision.boardDecision),
    managementResponse: safeCell(decision.managementResponse),
    viableOptions: safeCell(csv(model.decisionReviews.find((review) => review.decisionId === decision.id)?.viableOptions ?? [])),
    keyTradeOffs: safeCell(csv(model.decisionReviews.find((review) => review.decisionId === decision.id)?.keyTradeOffs ?? [])),
    reviewerRecommendation: safeCell(model.decisionReviews.find((review) => review.decisionId === decision.id)?.reviewerRecommendation),
    managementBoardDecision: safeCell(model.decisionReviews.find((review) => review.decisionId === decision.id)?.managementBoardDecision)
  }));

  return [
    { name: 'Material Findings', columns: Object.keys(findings[0] ?? { id: '' }), rows: findings },
    { name: 'Risk Register', columns: Object.keys(risks[0] ?? { id: '' }), rows: risks },
    { name: 'Control Actions', columns: Object.keys(controls[0] ?? { id: '' }), rows: controls },
    { name: 'Evidence Validation', columns: Object.keys(evidence[0] ?? { evidenceRef: '' }), rows: evidence },
    { name: 'Roadmap', columns: Object.keys(roadmap[0] ?? { id: '' }), rows: roadmap },
    { name: 'Reviewer Observations', columns: Object.keys(observations[0] ?? { id: '' }), rows: observations },
    { name: 'Management Decisions', columns: Object.keys(decisions[0] ?? { id: '' }), rows: decisions }
  ];
}
