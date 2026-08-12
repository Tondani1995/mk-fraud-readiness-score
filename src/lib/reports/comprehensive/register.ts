import type { ComprehensiveDeliveryModel } from './types';

export interface RegisterSheet<T extends Record<string, unknown> = Record<string, unknown>> { name: string; columns: string[]; rows: T[]; }

function safeCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const text = String(value)
    .replace(/\bnamed reviewer(s)?\b/gi, 'designated control owner$1')
    .replace(/\bG28-D\d+-Q\d+\b/gi, 'the named question trace')
    .replace(/\bevidence validation\b/gi, 'control-proof review')
    .replace(/\bindependently verify the control evidence before relying on the result\b/gi, 'retain the defined control proof before closing the action');
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function list(values: unknown[]): string { return values.map((value) => String(value ?? '').trim()).filter(Boolean).join('; '); }
function refs(values: unknown[]): string { return list(values).replaceAll('finding:', 'Finding ID: ').replaceAll('risk:', 'Risk ID: ').replaceAll('question:', 'Question code: ').replaceAll('control:', 'Control ID: ').replaceAll('evidence:', 'Proof ID: '); }
function date(value: unknown): string { const raw = String(value ?? '').trim(); if (!raw) return ''; const parsed = new Date(raw); return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }); }

export function safeSpreadsheetCell(value: unknown): string | number | boolean | null { return safeCell(value); }

export function buildComprehensiveRegisterSheets(model: ComprehensiveDeliveryModel): RegisterSheet[] {
  const findings = model.findings.map((finding) => ({
    id: safeCell(finding.id), title: safeCell(finding.title), domain: safeCell(finding.domainName), questionCode: safeCell(finding.questionCode),
    recordedResponse: safeCell(finding.responseMeaning), diagnosis: safeCell(finding.diagnosis), whyItMatters: safeCell(finding.whyItMatters),
    fraudMechanism: safeCell(finding.fraudMechanism), materiality: safeCell(finding.materialityClass), priorityScore: safeCell(finding.materialityScore),
    interpretation: safeCell(finding.interpretation), recommendedControl: safeCell(finding.recommendedControl), accountableOwner: safeCell(finding.accountableOwner),
    processOwner: safeCell(finding.processOwner), oversightFunction: safeCell(finding.oversightFunction), targetPeriod: safeCell(finding.targetPeriod),
    effectivenessMeasure: safeCell(finding.effectivenessMeasure), escalationThreshold: safeCell(finding.escalationThreshold), sourceRefs: safeCell(refs([`finding:${finding.id}`, `question:${finding.questionCode}`]))
  }));

  const risks = model.riskRegister.map((risk) => ({
    id: safeCell(risk.id), title: safeCell(risk.title), priority: safeCell(risk.priority), likelihood: safeCell(risk.likelihood), impact: safeCell(risk.impact),
    riskStatement: safeCell(risk.riskStatement), cause: safeCell(risk.cause), riskEvent: safeCell(risk.riskEvent), financialImpact: safeCell(risk.financialImpact),
    operationalImpact: safeCell(risk.operationalImpact), currentControlPosition: safeCell(risk.currentControlPosition), requiredTreatment: safeCell(risk.requiredTreatment),
    accountableExecutive: safeCell(risk.accountableExecutive), processOwner: safeCell(risk.processOwner), oversightFunction: safeCell(risk.oversightFunction),
    targetPeriod: safeCell(risk.targetPeriod), effectivenessMeasure: safeCell(risk.effectivenessMeasure), remainingLimitation: safeCell(risk.remainingLimitation),
    linkedFindingIds: safeCell(refs(risk.linkedFindingIds)), linkedScenarioIds: safeCell(refs(risk.linkedScenarioIds))
  }));

  const controls = model.controlImprovements.map((control) => ({
    id: safeCell(control.id), linkedFindingId: safeCell(control.linkedFindingId), linkedRiskIds: safeCell(refs(control.linkedRiskIds)), questionCode: safeCell(control.linkedQuestionCode),
    currentState: safeCell(control.currentState), targetState: safeCell(control.targetState), controlObjective: safeCell(control.controlObjective), controlDesign: safeCell(control.controlDesign),
    accountableExecutive: safeCell(control.accountableExecutive), processOwner: safeCell(control.processOwner), oversightFunction: safeCell(control.oversightFunction),
    supportingFunctions: safeCell(list(control.supportingFunctions)), operatingFrequency: safeCell(control.operatingFrequency), population: safeCell(control.completePopulationCoverage),
    proofRetained: safeCell(list(control.evidenceRetained)), independentCheck: safeCell(control.effectivenessTest), escalationThreshold: safeCell(control.escalationThreshold),
    serviceLevel: safeCell(control.implementationDependency), effectivenessMeasure: safeCell(control.effectivenessTest), failureResponse: safeCell(control.failureResponse),
    targetPeriod: safeCell(control.targetPeriod), dependencies: safeCell(list(control.dependencies))
  }));

  const proof = model.proofRequirements.map((item) => ({
    proofRef: safeCell(item.proofRef), requirement: safeCell(item.requirement), linkedDomain: safeCell(item.linkedDomain), linkedFindingIds: safeCell(refs(item.linkedFindingIds)),
    linkedRiskIds: safeCell(refs(item.linkedRiskIds)), linkedControlIds: safeCell(refs(item.linkedControlIds)), whyItMatters: safeCell(item.whyItMatters),
    acceptableExamples: safeCell(list(item.acceptableExamples)), priority: safeCell(item.priority), proofOwner: safeCell(item.proofOwner), expectedRecency: safeCell(item.expectedRecency),
    requiredPopulation: safeCell(item.requiredPopulation), privacyBoundary: safeCell(item.privacyBoundary)
  }));

  const roadmap = model.roadmapActions.map((action) => ({
    id: safeCell(action.id), period: safeCell(action.period), domain: safeCell(action.domainName), deliverable: safeCell(action.deliverable),
    accountableExecutive: safeCell(action.accountableExecutive), processOwner: safeCell(action.processOwner), oversightFunction: safeCell(action.oversightFunction),
    supportingFunctions: safeCell(list(action.supportingFunctions)), dependencies: safeCell(refs(action.dependencyIds)), successMeasure: safeCell(action.successMeasure),
    proofOfCompletion: safeCell(action.evidenceOfCompletion), escalationThreshold: safeCell(action.escalationThreshold), linkedFindingIds: safeCell(refs(action.linkedFindingIds)), linkedRiskIds: safeCell(refs(action.linkedRiskIds))
  }));

  const traces = (model.analytical.assembled?.questionTraces ?? model.findings.map((finding) => ({ questionCode: finding.questionCode, domainCode: finding.domainCode, domainName: finding.domainName, prompt: finding.questionPrompt, responseValue: finding.responseValue, normalisedScore: finding.normalisedScore, applicable: true, isCritical: finding.isCriticalControl, isHardGate: finding.isHardGate, isCriticalGap: finding.gapClassification === 'critical', isMajorGap: finding.gapClassification === 'major', triggeredRules: [] }))).map((trace) => {
    const finding = model.findings.find((candidate) => candidate.questionCode === trace.questionCode);
    return { questionCode: safeCell(trace.questionCode), domain: safeCell(trace.domainName), prompt: safeCell(trace.prompt), recordedResponse: safeCell(trace.responseValue), normalisedScore: safeCell(trace.normalisedScore), applicable: safeCell(trace.applicable), materiality: safeCell(trace.isCriticalGap ? 'Critical gap' : trace.isMajorGap ? 'Major gap' : trace.isCritical ? 'Critical control' : 'Recorded response'), linkedFindingIds: safeCell(finding ? finding.id : ''), linkedRiskIds: safeCell(finding ? list(model.riskRegister.filter((risk) => risk.linkedFindingIds.includes(finding.id)).map((risk) => risk.id)) : ''), linkedControlIds: safeCell(finding ? list(model.controlImprovements.filter((control) => control.linkedFindingId === finding.id).map((control) => control.id)) : ''), sourceRefs: safeCell(refs([`question:${trace.questionCode}`, ...(finding ? [`finding:${finding.id}`] : [])])) };
  });

  const decisions = model.leadershipDecisions.map((decision) => {
    const options = model.decisionOptionSets.find((candidate) => candidate.decisionId === decision.id);
    return { id: safeCell(decision.id), decisionRequired: safeCell(decision.decisionRequired), whyNow: safeCell(decision.whyNow), evidenceDrivingIt: safeCell(decision.evidenceDrivingIt), consequenceOfDelay: safeCell(decision.consequenceOfDelay), viableOptions: safeCell(list(options?.viableOptions ?? [])), optionAnalysis: safeCell((options?.optionDetails ?? []).map((item) => `${item.option}: cost — ${item.cost}; benefit — ${item.benefit}; trade-off — ${item.tradeOff}`).join(' | ')), deterministicRecommendation: safeCell(options?.deterministicRecommendation ?? decision.recommendedDecision), recommendationRationale: safeCell(options?.recommendationRationale), accountableOwner: safeCell(decision.accountableExecutive), targetPeriod: safeCell(decision.targetPeriod), targetDate: safeCell(date(decision.deadline)), immediateNextDeliverable: safeCell(decision.immediateNextDeliverable), linkedFindingIds: safeCell(refs(decision.linkedFindingIds)), linkedRiskIds: safeCell(refs(decision.linkedRiskIds)) };
  });

  return [
    { name: 'Material Findings', columns: Object.keys(findings[0] ?? { id: '' }), rows: findings },
    { name: 'Risk Register', columns: Object.keys(risks[0] ?? { id: '' }), rows: risks },
    { name: 'Control Actions', columns: Object.keys(controls[0] ?? { id: '' }), rows: controls },
    { name: 'Evidence Checklist', columns: Object.keys(proof[0] ?? { proofRef: '' }), rows: proof },
    { name: 'Roadmap', columns: Object.keys(roadmap[0] ?? { id: '' }), rows: roadmap },
    { name: 'Management Decisions', columns: Object.keys(decisions[0] ?? { id: '' }), rows: decisions },
    { name: 'Question Traceability', columns: Object.keys(traces[0] ?? { questionCode: '' }), rows: traces }
  ];
}
