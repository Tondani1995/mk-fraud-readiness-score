import type { ComprehensiveDeliveryModel } from './types';
import type { NarrativeFactPack } from '../narrative/fact-pack';
import { buildComprehensiveNarrativeFactPack } from '../narrative/fact-pack';
import { buildAuthoritativeComprehensiveObjects } from './authoritative-objects';

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

export function buildComprehensiveRegisterSheets(model: ComprehensiveDeliveryModel, factPackOverride?: NarrativeFactPack): RegisterSheet[] {
  const factPack = factPackOverride ?? buildComprehensiveNarrativeFactPack(model);
  const sustainmentPack = factPack.narrativeMode === 'SUSTAINMENT' ? factPack : null;
  const authoritative = buildAuthoritativeComprehensiveObjects(factPack);
  const findings = (sustainmentPack ? [] : model.findings).map((finding) => ({
    id: safeCell(finding.id), title: safeCell(finding.title), domain: safeCell(finding.domainName), questionCode: safeCell(finding.questionCode),
    recordedResponse: safeCell(finding.responseMeaning), diagnosis: safeCell(finding.diagnosis), whyItMatters: safeCell(finding.whyItMatters),
    fraudMechanism: safeCell(finding.fraudMechanism), materiality: safeCell(finding.materialityClass), priorityScore: safeCell(finding.materialityScore),
    interpretation: safeCell(finding.interpretation), recommendedControl: safeCell(finding.recommendedControl), accountableOwner: safeCell(finding.accountableOwner),
    processOwner: safeCell(finding.processOwner), oversightFunction: safeCell(finding.oversightFunction), targetPeriod: safeCell(finding.targetPeriod),
    effectivenessMeasure: safeCell(finding.effectivenessMeasure), escalationThreshold: safeCell(finding.escalationThreshold), sourceRefs: safeCell(refs([`finding:${finding.id}`, `question:${finding.questionCode}`]))
  }));

  const risks = (sustainmentPack ? [] : model.riskRegister).map((risk) => ({
    id: safeCell(risk.id), title: safeCell(risk.title), priority: safeCell(risk.priority), likelihood: safeCell(risk.likelihood), impact: safeCell(risk.impact),
    riskStatement: safeCell(risk.riskStatement), cause: safeCell(risk.cause), riskEvent: safeCell(risk.riskEvent), financialImpact: safeCell(risk.financialImpact),
    operationalImpact: safeCell(risk.operationalImpact), currentControlPosition: safeCell(risk.currentControlPosition), requiredTreatment: safeCell(risk.requiredTreatment),
    accountableExecutive: safeCell(risk.accountableExecutive), processOwner: safeCell(risk.processOwner), oversightFunction: safeCell(risk.oversightFunction),
    targetPeriod: safeCell(risk.targetPeriod), effectivenessMeasure: safeCell(risk.effectivenessMeasure), remainingLimitation: safeCell(risk.remainingLimitation),
    linkedFindingIds: safeCell(refs(risk.linkedFindingIds)), linkedScenarioIds: safeCell(refs(risk.linkedScenarioIds))
  }));

  const controls = sustainmentPack
    ? authoritative.controls.map((control) => ({
      id: safeCell(control.sourceId), linkedFindingId: '', linkedRiskIds: '', questionCode: '',
      currentState: safeCell(control.currentState), targetState: safeCell(control.targetState), controlObjective: safeCell(control.objective), controlDesign: safeCell(control.targetState),
      accountableExecutive: safeCell(control.accountableExecutive), processOwner: safeCell(control.processOwner), oversightFunction: '',
      supportingFunctions: '', operatingFrequency: safeCell(control.frequency), population: safeCell(control.population),
      proofRetained: safeCell(list(control.proofRetained)), independentCheck: safeCell(control.independentCheck), escalationThreshold: safeCell(control.escalationTrigger),
      serviceLevel: safeCell(control.sla), effectivenessMeasure: safeCell(control.effectivenessMeasure), failureResponse: safeCell(control.failureResponse),
      targetPeriod: '', dependencies: safeCell(list(control.dependencies))
    }))
    : model.controlImprovements.map((control) => ({
      id: safeCell(control.id), linkedFindingId: safeCell(control.linkedFindingId), linkedRiskIds: safeCell(refs(control.linkedRiskIds)), questionCode: safeCell(control.linkedQuestionCode),
      currentState: safeCell(control.currentState), targetState: safeCell(control.targetState), controlObjective: safeCell(control.controlObjective), controlDesign: safeCell(control.controlDesign),
      accountableExecutive: safeCell(control.accountableExecutive), processOwner: safeCell(control.processOwner), oversightFunction: safeCell(control.oversightFunction),
      supportingFunctions: safeCell(list(control.supportingFunctions)), operatingFrequency: safeCell(control.operatingFrequency), population: safeCell(control.completePopulationCoverage),
      proofRetained: safeCell(list(control.evidenceRetained)), independentCheck: safeCell(control.effectivenessTest), escalationThreshold: safeCell(control.escalationThreshold),
      serviceLevel: safeCell(control.implementationDependency), effectivenessMeasure: safeCell(control.effectivenessTest), failureResponse: safeCell(control.failureResponse),
      targetPeriod: safeCell(control.targetPeriod), dependencies: safeCell(list(control.dependencies))
    }));

  const proof = sustainmentPack
    ? sustainmentPack.proofOfProgress.map((item) => ({
      proofRef: safeCell(item.factRef), requirement: safeCell(item.requirement), linkedDomain: '', linkedFindingIds: '',
      linkedRiskIds: '', linkedControlIds: safeCell(item.sourceId), whyItMatters: safeCell(item.whyItMatters),
      acceptableExamples: safeCell(list(item.acceptableExamples)), priority: 'MEDIUM', proofOwner: safeCell(item.owner), expectedRecency: safeCell(item.expectedRecency),
      requiredPopulation: safeCell(item.requiredPopulation), privacyBoundary: 'Use the minimum necessary business record for the named population and period.'
    }))
    : model.proofRequirements.map((item) => ({
      proofRef: safeCell(item.proofRef), requirement: safeCell(item.requirement), linkedDomain: safeCell(item.linkedDomain), linkedFindingIds: safeCell(refs(item.linkedFindingIds)),
      linkedRiskIds: safeCell(refs(item.linkedRiskIds)), linkedControlIds: safeCell(refs(item.linkedControlIds)), whyItMatters: safeCell(item.whyItMatters),
      acceptableExamples: safeCell(list(item.acceptableExamples)), priority: safeCell(item.priority), proofOwner: safeCell(item.proofOwner), expectedRecency: safeCell(item.expectedRecency),
      requiredPopulation: safeCell(item.requiredPopulation), privacyBoundary: safeCell(item.privacyBoundary)
    }));

  const roadmap = sustainmentPack
    ? authoritative.roadmap.map((action) => ({
      id: safeCell(action.sourceId), period: safeCell(action.targetPeriod), domain: safeCell(action.primarySemanticFamily), deliverable: safeCell(action.priorityWork),
      accountableExecutive: safeCell(action.accountableExecutive), processOwner: safeCell(action.processOwner), oversightFunction: '',
      supportingFunctions: '', dependencies: safeCell(list(action.dependencies)), successMeasure: safeCell(action.successMeasure),
      proofOfCompletion: safeCell(action.proofOfCompletion), escalationThreshold: safeCell(action.failureTrigger), linkedFindingIds: '', linkedRiskIds: ''
    }))
    : model.roadmapActions.map((action) => ({
      id: safeCell(action.id), period: safeCell(action.period), domain: safeCell(action.domainName), deliverable: safeCell(action.deliverable),
      accountableExecutive: safeCell(action.accountableExecutive), processOwner: safeCell(action.processOwner), oversightFunction: safeCell(action.oversightFunction),
      supportingFunctions: safeCell(list(action.supportingFunctions)), dependencies: safeCell(refs(action.dependencyIds)), successMeasure: safeCell(action.successMeasure),
      proofOfCompletion: safeCell(action.evidenceOfCompletion), escalationThreshold: safeCell(action.escalationThreshold), linkedFindingIds: safeCell(refs(action.linkedFindingIds)), linkedRiskIds: safeCell(refs(action.linkedRiskIds))
    }));

  const sourceFindingIdForRef = (findingRef: string): string => factPack.findings.find((finding) => finding.factRef === findingRef)?.sourceId ?? '';
  const sustainmentRoadmapStage = (targetPeriod: string): string => /^30\s*days?$/i.test(targetPeriod.trim()) ? 'PRESERVE' : 'MEASURE';
  const maturationStage = (phase: string): string => sustainmentPack && phase === 'MATURE' ? 'OPTIMISE' : phase;
  const roadmapPhaseForSourceId = (sourceId: string): string => authoritative.roadmap.find((item) => item.sourceId === sourceId)?.phase ?? '';
  const implementation = sustainmentPack
    ? [
      ...authoritative.roadmap.map((action) => ({
        recordType: 'Roadmap action', technicalId: safeCell(action.sourceId), blueprintStage: safeCell(sustainmentRoadmapStage(action.targetPeriod)), period: safeCell(action.targetPeriod), domain: safeCell(action.primarySemanticFamily),
        requirementOrDeliverable: safeCell(action.priorityWork), accountableOwner: safeCell(action.accountableExecutive), processOwner: safeCell(action.processOwner),
        oversightFunction: '', dependencies: safeCell(list(action.dependencies)), proofOrCompletion: safeCell(action.proofOfCompletion),
        successMeasure: safeCell(action.successMeasure), expectedRecency: '', requiredPopulation: '', acceptableExamples: '', linkedFindingIds: '', linkedRiskIds: ''
      })),
      ...sustainmentPack.proofOfProgress.map((item) => ({
        recordType: 'Proof requirement', technicalId: safeCell(item.factRef), blueprintStage: '', period: '', domain: '',
        requirementOrDeliverable: safeCell(item.requirement), accountableOwner: safeCell(item.owner), processOwner: '', oversightFunction: '', dependencies: '',
        proofOrCompletion: safeCell(item.whyItMatters), successMeasure: '', expectedRecency: safeCell(item.expectedRecency), requiredPopulation: safeCell(item.requiredPopulation),
        acceptableExamples: safeCell(list(item.acceptableExamples)), linkedFindingIds: '', linkedRiskIds: ''
      })),
      ...authoritative.maturationSteps.map((item) => ({
        recordType: 'Maturation step', technicalId: safeCell(item.maturationRef), blueprintStage: safeCell(maturationStage(item.phase)), period: safeCell(item.phaseWindow), domain: safeCell(item.semanticFamily),
        requirementOrDeliverable: safeCell(item.priorityActivity), accountableOwner: safeCell(item.accountableExecutive), processOwner: safeCell(item.processOwner),
        oversightFunction: '', dependencies: safeCell(item.dependency), proofOrCompletion: safeCell(item.proofOfProgress), successMeasure: safeCell(item.successMeasure),
        expectedRecency: '', requiredPopulation: '', acceptableExamples: '', linkedFindingIds: '', linkedRiskIds: ''
      }))
    ]
    : [
    ...model.roadmapActions.map((action) => ({
      recordType: 'Roadmap action', technicalId: safeCell(action.id), blueprintStage: safeCell(roadmapPhaseForSourceId(action.id)), period: safeCell(action.period), domain: safeCell(action.domainName),
      requirementOrDeliverable: safeCell(action.deliverable), accountableOwner: safeCell(action.accountableExecutive), processOwner: safeCell(action.processOwner),
      oversightFunction: safeCell(action.oversightFunction), dependencies: safeCell(refs(action.dependencyIds)), proofOrCompletion: safeCell(action.evidenceOfCompletion),
      successMeasure: safeCell(action.successMeasure), expectedRecency: '', requiredPopulation: '', acceptableExamples: '', linkedFindingIds: safeCell(refs(action.linkedFindingIds)), linkedRiskIds: safeCell(refs(action.linkedRiskIds))
    })),
    ...model.proofRequirements.map((item) => ({
      recordType: 'Proof requirement', technicalId: safeCell(item.proofRef), blueprintStage: '', period: '', domain: safeCell(item.linkedDomain),
      requirementOrDeliverable: safeCell(item.requirement), accountableOwner: safeCell(item.proofOwner), processOwner: '', oversightFunction: '', dependencies: '',
      proofOrCompletion: safeCell(item.whyItMatters), successMeasure: '', expectedRecency: safeCell(item.expectedRecency), requiredPopulation: safeCell(item.requiredPopulation),
      acceptableExamples: safeCell(list(item.acceptableExamples)), linkedFindingIds: safeCell(refs(item.linkedFindingIds)), linkedRiskIds: safeCell(refs(item.linkedRiskIds))
    })),
    ...authoritative.maturationSteps.map((item) => ({
      recordType: 'Maturation step', technicalId: safeCell(item.maturationRef), blueprintStage: safeCell(maturationStage(item.phase)), period: safeCell(item.phaseWindow), domain: safeCell(item.semanticFamily),
      requirementOrDeliverable: safeCell(item.priorityActivity), accountableOwner: safeCell(item.accountableExecutive), processOwner: safeCell(item.processOwner),
      oversightFunction: '', dependencies: safeCell(item.dependency), proofOrCompletion: safeCell(item.proofOfProgress), successMeasure: safeCell(item.successMeasure),
      expectedRecency: '', requiredPopulation: '', acceptableExamples: '', linkedFindingIds: safeCell(sourceFindingIdForRef(item.linkedFindingRef) ? refs([`finding:${sourceFindingIdForRef(item.linkedFindingRef)}`]) : ''), linkedRiskIds: ''
    }))
  ];

  const traces = (model.analytical.assembled?.questionTraces ?? model.findings.map((finding) => ({ questionCode: finding.questionCode, domainCode: finding.domainCode, domainName: finding.domainName, prompt: finding.questionPrompt, responseValue: finding.responseValue, normalisedScore: finding.normalisedScore, applicable: true, isCritical: finding.isCriticalControl, isHardGate: finding.isHardGate, isCriticalGap: finding.gapClassification === 'critical', isMajorGap: finding.gapClassification === 'major', triggeredRules: [] }))).map((trace) => {
    const finding = sustainmentPack ? undefined : model.findings.find((candidate) => candidate.questionCode === trace.questionCode);
    return { questionCode: safeCell(trace.questionCode), domain: safeCell(trace.domainName), prompt: safeCell(trace.prompt), recordedResponse: safeCell(trace.responseValue), normalisedScore: safeCell(trace.normalisedScore), applicable: safeCell(trace.applicable), materiality: safeCell(trace.isCriticalGap ? 'Critical gap' : trace.isMajorGap ? 'Major gap' : trace.isCritical ? 'Critical control' : 'Recorded response'), linkedFindingIds: safeCell(finding ? finding.id : ''), linkedRiskIds: safeCell(finding ? list(model.riskRegister.filter((risk) => risk.linkedFindingIds.includes(finding.id)).map((risk) => risk.id)) : ''), linkedControlIds: safeCell(finding ? list(model.controlImprovements.filter((control) => control.linkedFindingId === finding.id).map((control) => control.id)) : ''), sourceRefs: safeCell(refs([`question:${trace.questionCode}`, ...(finding ? [`finding:${finding.id}`] : [])])) };
  });

  const decisions = authoritative.decisions.map((decision) => {
    const sourceDecision = model.leadershipDecisions.find((candidate) => candidate.id === decision.sourceId);
    return {
      id: safeCell(decision.sourceId), decisionRequired: safeCell(decision.question), whyNow: safeCell(sourceDecision?.whyNow ?? decision.rationale), evidenceDrivingIt: safeCell(sourceDecision?.evidenceDrivingIt ?? decision.rationale), consequenceOfDelay: safeCell(decision.consequenceOfDelay),
      viableOptions: safeCell(list(decision.options.map((item) => item.option))), optionAnalysis: safeCell(decision.options.map((item) => `${item.option}: cost: ${item.cost}; benefit: ${item.benefit}; trade-off: ${item.tradeOff}`).join(' | ')),
      recommendedRoute: safeCell(decision.recommendedRoute), recommendationRationale: safeCell(decision.rationale), accountableOwner: safeCell(decision.owner), targetPeriod: safeCell(sourceDecision?.targetPeriod ?? decision.targetDate), targetDate: safeCell(date(decision.targetDate)), immediateNextDeliverable: safeCell(sourceDecision?.immediateNextDeliverable), linkedFindingIds: sustainmentPack ? '' : safeCell(refs(sourceDecision?.linkedFindingIds ?? [])), linkedRiskIds: sustainmentPack ? '' : safeCell(refs(sourceDecision?.linkedRiskIds ?? []))
    };
  });

  const customerLineageColumns = new Set(['linkedFindingId', 'linkedRiskIds', 'linkedFindingIds', 'linkedRiskId']);
  const customerSheet = (name: string, columns: string[], rows: Array<Record<string, unknown>>): RegisterSheet => {
    if (!sustainmentPack) return { name, columns, rows };
    const visibleColumns = columns.filter((column) => !customerLineageColumns.has(column));
    return { name, columns: visibleColumns, rows: rows.map((row) => Object.fromEntries(visibleColumns.map((column) => [column, row[column]]))) };
  };

  return [
    customerSheet('Material Findings', Object.keys(findings[0] ?? { id: '' }), findings),
    customerSheet('Risk Register', Object.keys(risks[0] ?? { id: '' }), risks),
    customerSheet('Control Blueprints', Object.keys(controls[0] ?? { id: '' }), controls),
    customerSheet('Implementation Blueprint', Object.keys(implementation[0] ?? { technicalId: '' }), implementation),
    customerSheet('Management Decisions', Object.keys(decisions[0] ?? { id: '' }), decisions),
    customerSheet('Question Traceability', Object.keys(traces[0] ?? { questionCode: '' }), traces)
  ];
}
