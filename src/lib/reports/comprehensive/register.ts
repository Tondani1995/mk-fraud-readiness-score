import type { ComprehensiveDeliveryModel } from './types';
import { normaliseOversightRoleLabel, normaliseRoleLabel, normaliseRoleText } from './role-normalisation';

export interface RegisterSheet<T extends Record<string, unknown> = Record<string, unknown>> { name: string; columns: string[]; rows: T[]; }

function safeCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const text = normaliseRoleText(String(value))
    .replace(/\bnamed reviewer(s)?\b/gi, 'designated control owner$1')
    .replace(/\bG28-D\d+-Q\d+\b/gi, 'the named question trace')
    .replace(/\bevidence validation\b/gi, 'control-proof review')
    .replace(/\bindependently verify the control evidence before relying on the result\b/gi, 'retain the defined control proof before closing the action');
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function list(values: unknown[]): string { return values.map((value) => String(value ?? '').trim()).filter(Boolean).join('; '); }
function refs(values: unknown[]): string { return list(values).replaceAll('finding:', 'Finding ID: ').replaceAll('risk:', 'Risk ID: ').replaceAll('question:', 'Question code: ').replaceAll('control:', 'Control ID: ').replaceAll('evidence:', 'Proof ID: '); }
function date(value: unknown): string { const raw = String(value ?? '').trim(); if (!raw) return ''; const parsed = new Date(raw); return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }); }
function oversight(value: unknown, ...roleSources: unknown[]): string {
  return normaliseRoleLabel([
    value,
    ...roleSources.map((source) => normaliseOversightRoleLabel(source))
  ].filter(Boolean).join(' / '), 'oversight');
}

export function safeSpreadsheetCell(value: unknown): string | number | boolean | null { return safeCell(value); }

export function buildComprehensiveRegisterSheets(model: ComprehensiveDeliveryModel): RegisterSheet[] {
  const findings = model.findings.map((finding) => ({
    id: safeCell(finding.id), title: safeCell(finding.title), domain: safeCell(finding.domainName), questionCode: safeCell(finding.questionCode),
    recordedResponse: safeCell(finding.responseMeaning), diagnosis: safeCell(finding.diagnosis), whyItMatters: safeCell(finding.whyItMatters),
    fraudMechanism: safeCell(finding.fraudMechanism), materiality: safeCell(finding.materialityClass), priorityScore: safeCell(finding.materialityScore),
    interpretation: safeCell(finding.interpretation), recommendedControl: safeCell(finding.recommendedControl), accountableOwner: safeCell(normaliseRoleLabel(finding.accountableOwner, 'executive')),
    processOwner: safeCell(normaliseRoleLabel(finding.processOwner, 'process')), oversightFunction: safeCell(oversight(finding.oversightFunction, finding.accountableOwner, finding.processOwner)), targetPeriod: safeCell(finding.targetPeriod),
    effectivenessMeasure: safeCell(finding.effectivenessMeasure), escalationThreshold: safeCell(finding.escalationThreshold), sourceRefs: safeCell(refs([`finding:${finding.id}`, `question:${finding.questionCode}`]))
  }));

  const risks = model.riskRegister.map((risk) => ({
    id: safeCell(risk.id), title: safeCell(risk.title), priority: safeCell(risk.priority), likelihood: safeCell(risk.likelihood), impact: safeCell(risk.impact),
    riskStatement: safeCell(risk.riskStatement), cause: safeCell(risk.cause), riskEvent: safeCell(risk.riskEvent), financialImpact: safeCell(risk.financialImpact),
    operationalImpact: safeCell(risk.operationalImpact), currentControlPosition: safeCell(risk.currentControlPosition), requiredTreatment: safeCell(risk.requiredTreatment),
    accountableExecutive: safeCell(normaliseRoleLabel(risk.accountableExecutive, 'executive')), processOwner: safeCell(normaliseRoleLabel(risk.processOwner, 'process')), oversightFunction: safeCell(oversight(risk.oversightFunction, risk.accountableExecutive, risk.processOwner)),
    targetPeriod: safeCell(risk.targetPeriod), effectivenessMeasure: safeCell(risk.effectivenessMeasure), remainingLimitation: safeCell(risk.remainingLimitation),
    linkedFindingIds: safeCell(refs(risk.linkedFindingIds)), linkedScenarioIds: safeCell(refs(risk.linkedScenarioIds))
  }));

  const controls = model.controlImprovements.map((control) => ({
    id: safeCell(control.id), linkedFindingId: safeCell(control.linkedFindingId), linkedRiskIds: safeCell(refs(control.linkedRiskIds)), questionCode: safeCell(control.linkedQuestionCode),
    currentState: safeCell(control.currentState), targetState: safeCell(control.targetState), controlObjective: safeCell(control.controlObjective), controlDesign: safeCell(control.controlDesign),
    accountableExecutive: safeCell(normaliseRoleLabel(control.accountableExecutive, 'executive')), processOwner: safeCell(normaliseRoleLabel(control.processOwner, 'process')), oversightFunction: safeCell(oversight(control.oversightFunction, control.accountableExecutive, control.processOwner)),
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
    accountableExecutive: safeCell(normaliseRoleLabel(action.accountableExecutive, 'executive')), processOwner: safeCell(normaliseRoleLabel(action.processOwner, 'process')), oversightFunction: safeCell(oversight(action.oversightFunction, action.accountableExecutive, action.processOwner)),
    supportingFunctions: safeCell(list(action.supportingFunctions)), dependencies: safeCell(refs(action.dependencyIds)), successMeasure: safeCell(action.successMeasure),
    proofOfCompletion: safeCell(action.evidenceOfCompletion), escalationThreshold: safeCell(action.escalationThreshold), linkedFindingIds: safeCell(refs(action.linkedFindingIds)), linkedRiskIds: safeCell(refs(action.linkedRiskIds))
  }));

  const implementation = [
    ...model.roadmapActions.map((action) => ({
      recordType: 'Roadmap action', technicalId: safeCell(action.id), period: safeCell(action.period), domain: safeCell(action.domainName),
      requirementOrDeliverable: safeCell(action.deliverable), accountableOwner: safeCell(normaliseRoleLabel(action.accountableExecutive, 'executive')), processOwner: safeCell(normaliseRoleLabel(action.processOwner, 'process')),
      oversightFunction: safeCell(oversight(action.oversightFunction, action.accountableExecutive, action.processOwner)), dependencies: safeCell(refs(action.dependencyIds)), proofOrCompletion: safeCell(action.evidenceOfCompletion),
      successMeasure: safeCell(action.successMeasure), expectedRecency: '', requiredPopulation: '', acceptableExamples: '', linkedFindingIds: safeCell(refs(action.linkedFindingIds)), linkedRiskIds: safeCell(refs(action.linkedRiskIds))
    })),
    ...model.proofRequirements.map((item) => ({
      recordType: 'Proof requirement', technicalId: safeCell(item.proofRef), period: '', domain: safeCell(item.linkedDomain),
      requirementOrDeliverable: safeCell(item.requirement), accountableOwner: safeCell(item.proofOwner), processOwner: '', oversightFunction: '', dependencies: '',
      proofOrCompletion: safeCell(item.whyItMatters), successMeasure: '', expectedRecency: safeCell(item.expectedRecency), requiredPopulation: safeCell(item.requiredPopulation),
      acceptableExamples: safeCell(list(item.acceptableExamples)), linkedFindingIds: safeCell(refs(item.linkedFindingIds)), linkedRiskIds: safeCell(refs(item.linkedRiskIds))
    }))
  ];

  const traces = (model.analytical.assembled?.questionTraces ?? model.findings.map((finding) => ({ questionCode: finding.questionCode, domainCode: finding.domainCode, domainName: finding.domainName, prompt: finding.questionPrompt, responseValue: finding.responseValue, normalisedScore: finding.normalisedScore, applicable: true, isCritical: finding.isCriticalControl, isHardGate: finding.isHardGate, isCriticalGap: finding.gapClassification === 'critical', isMajorGap: finding.gapClassification === 'major', triggeredRules: [] }))).map((trace) => {
    const finding = model.findings.find((candidate) => candidate.questionCode === trace.questionCode);
    return { questionCode: safeCell(trace.questionCode), domain: safeCell(trace.domainName), prompt: safeCell(trace.prompt), recordedResponse: safeCell(trace.responseValue), normalisedScore: safeCell(trace.normalisedScore), applicable: safeCell(trace.applicable), materiality: safeCell(trace.isCriticalGap ? 'Critical gap' : trace.isMajorGap ? 'Major gap' : trace.isCritical ? 'Critical control' : 'Recorded response'), linkedFindingIds: safeCell(finding ? finding.id : ''), linkedRiskIds: safeCell(finding ? list(model.riskRegister.filter((risk) => risk.linkedFindingIds.includes(finding.id)).map((risk) => risk.id)) : ''), linkedControlIds: safeCell(finding ? list(model.controlImprovements.filter((control) => control.linkedFindingId === finding.id).map((control) => control.id)) : ''), sourceRefs: safeCell(refs([`question:${trace.questionCode}`, ...(finding ? [`finding:${finding.id}`] : [])])) };
  });

  const decisions = model.leadershipDecisions.map((decision) => {
    const options = model.decisionOptionSets.find((candidate) => candidate.decisionId === decision.id);
    return { id: safeCell(decision.id), decisionRequired: safeCell(decision.decisionRequired), whyNow: safeCell(decision.whyNow), evidenceDrivingIt: safeCell(decision.evidenceDrivingIt), consequenceOfDelay: safeCell(decision.consequenceOfDelay), viableOptions: safeCell(list(options?.viableOptions ?? [])), optionAnalysis: safeCell((options?.optionDetails ?? []).map((item) => `${item.option}: cost — ${item.cost}; benefit — ${item.benefit}; trade-off — ${item.tradeOff}`).join(' | ')), deterministicRecommendation: safeCell(options?.deterministicRecommendation ?? decision.recommendedDecision), recommendationRationale: safeCell(options?.recommendationRationale), accountableOwner: safeCell(normaliseRoleLabel(decision.accountableExecutive, 'executive')), targetPeriod: safeCell(decision.targetPeriod), targetDate: safeCell(date(decision.deadline)), immediateNextDeliverable: safeCell(decision.immediateNextDeliverable), linkedFindingIds: safeCell(refs(decision.linkedFindingIds)), linkedRiskIds: safeCell(refs(decision.linkedRiskIds)) };
  });

  const assembled = model.analytical.assembled;
  const adaptive = assembled?.scoreRun.adaptiveMetrics ?? assembled?.adaptiveScope;
  const basis = [
    { field: 'Assessment reference', value: safeCell(model.analytical.assessmentReference), evidenceRef: 'assessment:reference' },
    { field: 'Methodology version', value: safeCell(model.analytical.score.methodologyVersionId), evidenceRef: 'assessment:methodology' },
    { field: 'Adaptive graph version', value: safeCell(adaptive?.graphVersion), evidenceRef: 'assessment:graph' },
    { field: 'Adaptive graph fingerprint', value: safeCell(adaptive?.graphFingerprint), evidenceRef: 'assessment:graph' },
    { field: 'Recorded coverage (%)', value: safeCell(model.analytical.score.coveragePct), evidenceRef: 'assessment:coverage' },
    { field: 'Recorded uncertainty (%)', value: safeCell(model.analytical.score.nARatePct), evidenceRef: 'assessment:uncertainty' },
    { field: 'Exposure position', value: safeCell(`${model.analytical.score.exposureScore ?? ''} · ${model.analytical.score.exposureBand ?? ''}`), evidenceRef: 'assessment:exposure' },
    { field: 'Maturity cap applied', value: safeCell(model.analytical.score.capApplied), evidenceRef: 'assessment:cap' },
    { field: 'Maturity cap reason', value: safeCell(model.analytical.score.capReason), evidenceRef: 'assessment:cap' },
    ...Object.entries(assembled?.adaptiveGatewayAnswers ?? {}).map(([gatewayCode, recordedValue]) => ({ field: `Gateway ${gatewayCode}`, value: safeCell(recordedValue), evidenceRef: `gateway:${gatewayCode}` })),
    ...(assembled?.exposureAnswers ?? []).map((answer) => ({ field: `Exposure ${answer.factorCode}`, value: safeCell(`${answer.selectedLabel} (${answer.pointsAwarded}/${answer.maxPoints})`), evidenceRef: `exposure:${answer.factorCode}` }))
  ];

  const scenarioRows = model.scenarioPortfolio?.length
    ? model.scenarioPortfolio.map((scenario) => ({
      scenarioId: safeCell(scenario.scenarioId), title: safeCell(scenario.title), scenarioType: safeCell(scenario.family),
      entryPoint: safeCell(scenario.entryPoint), progression: safeCell(scenario.mechanism), concealment: safeCell(scenario.concealment),
      interruptionControl: safeCell(scenario.interruptionPoint), warningIndicators: safeCell(list(scenario.warningIndicators)),
      linkedFindingIds: safeCell(refs(scenario.linkedFindingIds.map((id) => `finding:${id}`))), linkedRiskIds: safeCell(refs(scenario.linkedRiskIds.map((id) => `risk:${id}`))), linkedControlIds: safeCell(refs(scenario.linkedControlIds.map((id) => `control:${id}`))),
      sourceRefs: safeCell(refs([...scenario.linkedFindingIds.map((id) => `finding:${id}`), ...scenario.linkedRiskIds.map((id) => `risk:${id}`)]))
    }))
    : model.scenarios.map((scenario) => {
      const linkedRiskIds = [...scenario.linkedRiskIds];
      const linkedControlIds = model.controlImprovements
        .filter((control) => linkedRiskIds.includes(control.linkedRiskId) || control.linkedRiskIds.some((riskId) => linkedRiskIds.includes(riskId)))
        .map((control) => control.id);
      return {
        scenarioId: safeCell(scenario.id), title: safeCell(scenario.title), scenarioType: safeCell(scenario.scenarioType),
        entryPoint: safeCell(scenario.entryPoint), progression: safeCell(scenario.fraudSequence), concealment: safeCell(scenario.concealmentMechanism),
        interruptionControl: safeCell(scenario.controlsExpected.join('; ')), warningIndicators: safeCell(list(scenario.earlyWarningIndicators)),
        linkedFindingIds: safeCell(refs(scenario.linkedFindingIds)), linkedRiskIds: safeCell(refs(linkedRiskIds)), linkedControlIds: safeCell(refs(linkedControlIds)),
        sourceRefs: safeCell(refs(scenario.evidenceRefs))
      };
    });

  const contradictionRows = model.contradictions.map((contradiction) => ({
    contradictionId: safeCell(contradiction.id), pattern: safeCell(contradiction.pattern), title: safeCell(contradiction.title),
    recordedRelationship: safeCell(contradiction.drivingResponses), operationalMeaning: safeCell(`${contradiction.whyItMatters} ${contradiction.fraudPathwayEnabled}`),
    falseComfortRisk: safeCell(contradiction.falseComfortRisk), leadershipVerification: safeCell(contradiction.whatLeadershipShouldVerify),
    linkedFindingIds: safeCell(refs(contradiction.linkedFindingIds)), linkedRiskId: safeCell(contradiction.linkedRiskId), evidenceRefs: safeCell(refs(contradiction.evidenceRefs))
  }));

  const domainDiagnosticRows = (model.domainDiagnostics ?? []).map((diagnostic) => ({
    domainCode: safeCell(diagnostic.domainCode), domain: safeCell(diagnostic.domainName), score: safeCell(diagnostic.score), maturity: safeCell(diagnostic.maturity), posture: safeCell(diagnostic.posture),
    recordedPosition: safeCell(diagnostic.recordedPosition), keyStrengthOrWeakness: safeCell(diagnostic.keyStrengthOrWeakness), dependencyOrContradiction: safeCell(diagnostic.dependencyOrContradiction),
    operatingContext: safeCell(diagnostic.operatingContext), managementAttention: safeCell(diagnostic.managementAttention), traceability: safeCell(refs(diagnostic.traceability))
  }));
  const scenarioSelectionRows = model.scenarioSelectionAudit?.rows.map((row) => ({
    sourceScenarioId: safeCell(row.sourceScenarioId), sourceTitle: safeCell(row.sourceTitle), materialityScore: safeCell(row.materialityScore),
    linkedFindingIds: safeCell(refs(row.linkedFindingIds)), linkedRiskIds: safeCell(refs(row.linkedRiskIds)), status: safeCell(row.status),
    selectedScenarioIds: safeCell(list(row.selectedScenarioIds)), selectionReason: safeCell(row.selectionReason)
  })) ?? [];

  return [
    { name: 'Assessment Basis', columns: Object.keys(basis[0] ?? { field: '' }), rows: basis },
    ...(domainDiagnosticRows.length ? [{ name: 'Domain Diagnostics', columns: Object.keys(domainDiagnosticRows[0]!), rows: domainDiagnosticRows }] : []),
    { name: 'Scenario Portfolio', columns: Object.keys(scenarioRows[0] ?? { scenarioId: '' }), rows: scenarioRows },
    { name: 'Contradictions', columns: Object.keys(contradictionRows[0] ?? { contradictionId: '' }), rows: contradictionRows },
    ...(scenarioSelectionRows.length ? [{ name: 'Scenario Selection Audit', columns: Object.keys(scenarioSelectionRows[0]!), rows: scenarioSelectionRows }] : []),
    { name: 'Material Findings', columns: Object.keys(findings[0] ?? { id: '' }), rows: findings },
    { name: 'Risk Register', columns: Object.keys(risks[0] ?? { id: '' }), rows: risks },
    { name: 'Control Blueprints', columns: Object.keys(controls[0] ?? { id: '' }), rows: controls },
    { name: 'Implementation Blueprint', columns: Object.keys(implementation[0] ?? { technicalId: '' }), rows: implementation },
    { name: 'Management Decisions', columns: Object.keys(decisions[0] ?? { id: '' }), rows: decisions },
    { name: 'Question Traceability', columns: Object.keys(traces[0] ?? { questionCode: '' }), rows: traces }
  ];
}
