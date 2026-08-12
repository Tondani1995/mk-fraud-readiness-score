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
    .replace(/MK Staging Reviewer \(UAT\)/gi, 'Named review lead')
    .replace(/\bUAT\b/gi, 'review')
    .replace(/\bStaging\b/gi, 'review')
    .replace(/\bR\s?([0-9][0-9,]*(?:\.\d{2})?)\b/g, 'R$1 (recorded in the supplied incident register)');
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
    SELF_REPORTED: 'Recorded self-assessment', EVIDENCE_REVIEWED: 'Management review record', VALIDATED_SUPPORTED: 'Review note — stated scope recorded',
    NOT_VALIDATED_INSUFFICIENT: 'Review note — further basis required', NOT_SUPPORTED: 'Review note — limitation recorded', NOT_APPLICABLE: 'Outside stated scope',
    REVIEWER_JUDGEMENT: 'Reviewer judgement', NOT_REQUESTED: 'Not requested', REQUESTED: 'Requested', RECEIVED: 'Received',
    IN_REVIEW: 'In review', OPEN: 'Open', IN_PROGRESS: 'In progress', BLOCKED: 'Blocked', COMPLETE: 'Complete', ACCEPTED: 'Accepted'
    ,not_requested: 'Not supplied', requested: 'Requested', received: 'Artefact received', reviewed: 'Management review record', supported: 'Review note — stated scope recorded', insufficient: 'Review note — further basis required', not_supported: 'Review note — limitation recorded', not_applicable: 'Outside stated scope'
  };
  return map[String(value ?? '')] ?? String(value ?? '');
}

function humanDate(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
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
    agreedDueDate: safeCell(humanDate(finding.agreedDueDate)),
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
    failureResponse: safeCell(control.failureResponse),
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
    reviewDate: safeCell(humanDate(observation.reviewDate))
  }));

  const evidenceByQuestion = new Map<string, { evidenceRef: string; reviewerNote: string }>();
  for (const item of model.evidenceRequestPack) {
    const finding = model.findings.find((candidate) => item.linkedFindingIds.includes(candidate.id));
    if (finding) evidenceByQuestion.set(finding.questionCode, { evidenceRef: item.evidenceRef, reviewerNote: item.reviewerNote });
  }
  const observationByFinding = new Map<string, { observation: string }>();
  for (const observation of model.reviewerInput.observations) for (const findingId of observation.linkedFindingIds) observationByFinding.set(findingId, observation);
  const sourceTraces = model.analytical.assembled?.questionTraces ?? model.findings.map((finding) => ({
    questionCode: finding.questionCode,
    domainCode: finding.domainCode,
    domainName: finding.domainName,
    prompt: finding.questionPrompt,
    responseValue: finding.responseValue,
    normalisedScore: finding.normalisedScore,
    applicable: true,
    isCritical: finding.isCriticalControl,
    isHardGate: finding.isHardGate,
    isCriticalGap: finding.gapClassification === 'critical',
    isMajorGap: finding.gapClassification === 'major',
    triggeredRules: []
  }));
  const questionTraceability = sourceTraces.map((trace) => {
    const finding = model.findings.find((candidate) => candidate.questionCode === trace.questionCode);
    const evidenceItem = evidenceByQuestion.get(trace.questionCode);
    const observation = finding ? observationByFinding.get(finding.id) : undefined;
    return {
      questionCode: safeCell(trace.questionCode),
      domain: safeCell(trace.domainName),
      prompt: safeCell(trace.prompt),
      recordedResponse: safeCell(trace.responseValue),
      normalisedScore: safeCell(trace.normalisedScore),
      applicable: safeCell(trace.applicable),
      materiality: safeCell(trace.isCriticalGap ? 'Critical gap' : trace.isMajorGap ? 'Major gap' : trace.isCritical ? 'Critical control' : 'Recorded response'),
      evidenceReferences: safeCell(evidenceItem ? evidenceItem.evidenceRef : ''),
      reviewerNote: safeCell(observation?.observation ?? evidenceItem?.reviewerNote ?? ''),
      sourceRefs: safeCell(referenceList([`question:${trace.questionCode}`, ...(finding ? [`finding:${finding.id}`] : [])]))
    };
  });

  const decisions = model.leadershipDecisions.map((decision) => {
    const review = model.decisionReviews.find((candidate) => candidate.decisionId === decision.id);
    return {
      id: safeCell(decision.id),
      decision: safeCell(decision.decisionRequired),
      rationale: safeCell(decision.whyNow),
      linkedFindingIds: safeCell(csv(decision.linkedFindingIds)),
      linkedRiskIds: safeCell(csv(decision.linkedRiskIds)),
      owner: safeCell(review?.owner ?? decision.accountableExecutive),
      targetDate: safeCell(humanDate(review?.targetDate ?? decision.deadline)),
      status: safeCell('Open'),
      boardDecision: safeCell(decision.recommendedDecision),
      managementResponse: safeCell(review?.managementBoardDecision),
      viableOptions: safeCell(csv(review?.viableOptions ?? [])),
      keyTradeOffs: safeCell(csv(review?.keyTradeOffs ?? [])),
      reviewerRecommendation: safeCell(review?.reviewerRecommendation ?? decision.recommendedDecision),
      managementBoardDecision: safeCell(review?.managementBoardDecision ?? 'Management to confirm the selected option, accountable owner and decision date.'),
      optionAnalysis: safeCell((review?.optionDetails ?? []).map((option) => `${option.option}: cost — ${option.cost}; benefit — ${option.benefit}; trade-off — ${option.tradeOff}; ${option.rejectionReason ? `rejection reason — ${option.rejectionReason}` : 'recommended option'}`).join(' | ')),
      recommendationRationale: safeCell(review?.recommendationRationale)
    };
  });

  return [
    { name: 'Material Findings', columns: Object.keys(findings[0] ?? { id: '' }), rows: findings },
    { name: 'Risk Register', columns: Object.keys(risks[0] ?? { id: '' }), rows: risks },
    { name: 'Control Actions', columns: Object.keys(controls[0] ?? { id: '' }), rows: controls },
    { name: 'Roadmap', columns: Object.keys(roadmap[0] ?? { id: '' }), rows: roadmap },
    { name: 'Management Decisions', columns: Object.keys(decisions[0] ?? { id: '' }), rows: decisions }
    , { name: 'Question Traceability', columns: Object.keys(questionTraceability[0] ?? { questionCode: '' }), rows: questionTraceability }
  ];
}
