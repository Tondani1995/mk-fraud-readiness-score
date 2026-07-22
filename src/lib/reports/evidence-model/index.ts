import type { AssembledReportData } from '../types';
import { buildContradictions } from './contradictions';
import { buildLeadershipDecisions, buildFunctionalAgenda, buildRoadmapActions } from './leadership';
import { buildMaterialFindings } from './material-findings';
import { buildControlImprovementRegister, buildEvidenceChecklist, buildRiskRegister } from './registers';
import { buildPlausibleScenarios } from './scenarios';
import { orderRoadmapActions, RoadmapDependencyError } from './roadmap-dependencies';
import type { AdvisoryEvidenceModel, CommercialQualityIssue, QualityGateResult } from './types';

export * from './types';
export { getDomainPlaybook, hasDomainPlaybook } from './domain-playbooks';
export { getQuestionPlaybook, hasQuestionPlaybook, listQuestionPlaybooks, AUTHORITATIVE_QUESTION_MAPPINGS } from './question-playbooks';
export { orderRoadmapActions, RoadmapDependencyError } from './roadmap-dependencies';

/**
 * Assembles the full deterministic advisory evidence model from real, persisted assessment data.
 * This is the object the V2 report template should render from -- it does not invent facts, and it
 * is not an LLM call. Every field traces back to AssembledReportData (itself sourced from the
 * persisted score run) or to the static, finite exact-question playbook registry.
 */
export function buildAdvisoryEvidenceModel(data: AssembledReportData): AdvisoryEvidenceModel {
  const materialFindings = buildMaterialFindings(data);
  let riskRegister = buildRiskRegister(materialFindings);
  const scenarios = buildPlausibleScenarios(data, materialFindings, riskRegister);
  riskRegister = riskRegister.map((risk) => ({
    ...risk,
    linkedScenarioIds: scenarios.filter((scenario) => scenario.linkedRiskIds.includes(risk.id)).map((scenario) => scenario.id).sort()
  }));
  const contradictions = buildContradictions(data, materialFindings, riskRegister);
  const controlImprovements = buildControlImprovementRegister(materialFindings, riskRegister);
  const evidenceChecklist = buildEvidenceChecklist(materialFindings, riskRegister);
  const leadershipDecisions = buildLeadershipDecisions(materialFindings, riskRegister);
  const functionalAgenda = buildFunctionalAgenda(materialFindings, riskRegister);
  const roadmapActions = buildRoadmapActions(materialFindings, riskRegister);

  return {
    materialFindings,
    contradictions,
    scenarios,
    riskRegister,
    controlImprovements,
    evidenceChecklist,
    leadershipDecisions,
    roadmapActions,
    functionalAgenda
  };
}

export const PROHIBITED_PLACEHOLDER_STRINGS = ['A core control area', 'A control did not meet the required standard'];
export const PROHIBITED_GENERIC_ROADMAP_PHRASE = 'Implement or tighten the minimum repeatable control rhythm for';

/**
 * Mechanical checks against the evidence model, corresponding to the checkable subset of the
 * commercial quality gates in the brief (section 32). Gates that require comparing against a second
 * assessment (item 28) or against rendered PDF output (25, 26, 27) are NOT checked here -- see the
 * second-fixture differentiation test, the manual PDF review, and (as of V7 Checkpoint B)
 * ../../commercial-quality.ts's validateRenderedContent()/validateRenderedRoadmap(), which check the
 * exact rendered SelectedContent/roadmap.agenda objects instead of this pre-render evidence model.
 *
 * V7 Checkpoint B: violations/warnings are now typed CommercialQualityIssue objects with stable
 * QG_* codes (see ./types.ts), not free-text strings -- so callers (assertCommercialReportQuality)
 * can make blocking decisions and log structured, machine-readable codes instead of parsing prose.
 */
export function checkQualityGates(model: AdvisoryEvidenceModel, data: AssembledReportData): QualityGateResult {
  const violations: CommercialQualityIssue[] = [];
  const warnings: CommercialQualityIssue[] = [];

  // 1/2. Critical or maturity-limiting findings must name a control/domain.
  for (const finding of model.materialFindings) {
    if (finding.fallbackStatus !== 'exact_question_playbook' || !finding.playbookSource) {
      violations.push({
        code: 'QG_MATERIAL_PLAYBOOK_MISSING',
        severity: 'violation',
        message: `Material finding ${finding.id} has no exact question-level playbook for ${finding.questionCode}.`,
        entityId: finding.id,
        source: 'evidence-model'
      });
    }
    if ((finding.isCriticalControl || finding.maturityCapStatus === 'capping') && !finding.domainName) {
      violations.push({
        code: 'QG_FINDING_DOMAIN_MISSING',
        severity: 'violation',
        message: `Finding ${finding.id} is critical/maturity-limiting but has no domain name.`,
        entityId: finding.id,
        source: 'evidence-model'
      });
    }
    if (!finding.recommendedControl) {
      violations.push({
        code: 'QG_RECOMMENDED_CONTROL_MISSING',
        severity: 'violation',
        message: `Finding ${finding.id} has no recommended control.`,
        entityId: finding.id,
        source: 'evidence-model'
      });
    }
  }

  // 3/4. Every finding needs a source question and a recorded response.
  for (const finding of model.materialFindings) {
    if (!finding.questionCode) {
      violations.push({
        code: 'QG_SOURCE_QUESTION_MISSING',
        severity: 'violation',
        message: `Finding ${finding.id} has no source question code.`,
        entityId: finding.id,
        source: 'evidence-model'
      });
    }
    if (finding.responseValue === null) {
      violations.push({
        code: 'QG_RESPONSE_VALUE_MISSING',
        severity: 'violation',
        message: `Finding ${finding.id} has no recorded response value.`,
        entityId: finding.id,
        source: 'evidence-model'
      });
    }
  }

  // 5/6. No duplicate finding IDs; no question rendered as more than one finding.
  const findingIds = model.materialFindings.map((f) => f.id);
  if (new Set(findingIds).size !== findingIds.length) {
    violations.push({
      code: 'QG_DUPLICATE_FINDING_ID',
      severity: 'violation',
      message: 'Duplicate finding IDs detected.',
      source: 'evidence-model'
    });
  }
  const questionCodes = model.materialFindings.map((f) => f.questionCode);
  const dupeQuestions = questionCodes.filter((code, i) => questionCodes.indexOf(code) !== i);
  if (dupeQuestions.length > 0) {
    violations.push({
      code: 'QG_DUPLICATE_SOURCE_QUESTION',
      severity: 'violation',
      message: `Same source question rendered more than once: ${[...new Set(dupeQuestions)].join(', ')}.`,
      source: 'evidence-model'
    });
  }

  // 7. Executive diagnosis must state the correct number of maturity-limiting controls. Checked
  // here at the data level: the count the template should render must equal the actual cap-event
  // count with a related question, not a hardcoded "single control" assumption. This is a
  // project-specific warning beyond the Checkpoint B minimum code set (non-blocking either way).
  const questionLevelCapCount = data.maturityCapEvents.filter((e) => e.relatedQuestionCode).length;
  if (questionLevelCapCount > 1) {
    warnings.push({
      code: 'QG_EXECUTIVE_DIAGNOSIS_CAP_COUNT_RISK',
      severity: 'warning',
      message: `${questionLevelCapCount} question-level maturity-cap events exist -- executive diagnosis copy must not describe this as "a single control gap".`,
      source: 'evidence-model'
    });
  }

  // Checkpoint D: scenario volume follows the evidence context instead of fabricating failures.
  const assuranceOnly = model.materialFindings.length > 0 && model.materialFindings.every((finding) => finding.materialityClass === 'assurance_priority');
  const scenarioMinimum = assuranceOnly ? 2 : 3;
  if (model.scenarios.length < scenarioMinimum) {
    violations.push({
      code: 'QG_SCENARIO_MINIMUM_NOT_MET',
      severity: 'violation',
      message: `Only ${model.scenarios.length} plausible scenarios generated; ${scenarioMinimum} are required for this assessment context.`,
      source: 'evidence-model'
    });
  }
  for (const scenario of model.scenarios) {
    if (!['control_gap', 'assurance_validation'].includes(scenario.scenarioBasis)) {
      violations.push({ code: 'QG_SCENARIO_BASIS_INVALID', severity: 'violation', message: `Scenario ${scenario.id} has invalid basis ${scenario.scenarioBasis}.`, entityId: scenario.id, source: 'evidence-model' });
    }
    if (
      scenario.linkedFindingIds.length === 0 || scenario.linkedQuestionCodes.length === 0 ||
      scenario.linkedRiskIds.length === 0 || scenario.evidenceRefs.length === 0
    ) {
      violations.push({
        code: 'QG_SCENARIO_EVIDENCE_MISSING',
        severity: 'violation',
        message: `Scenario ${scenario.id} has no linked assessment evidence.`,
        entityId: scenario.id,
        source: 'evidence-model'
      });
    }
    if (!scenario.disclaimer || !scenario.disclaimer.toLowerCase().includes('plausible') || !scenario.disclaimer.toLowerCase().includes('not an allegation')) {
      violations.push({
        code: 'QG_SCENARIO_DISCLAIMER_MISSING',
        severity: 'violation',
        message: `Scenario ${scenario.id} is missing the "plausible scenario, not an allegation" disclaimer.`,
        entityId: scenario.id,
        source: 'evidence-model'
      });
    }
  }

  // Checkpoint D: consolidated cause-event-impact risks and contradiction quality.
  const riskIds = model.riskRegister.map((risk) => risk.id);
  if (new Set(riskIds).size !== riskIds.length) {
    violations.push({ code: 'QG_DUPLICATE_RISK', severity: 'violation', message: 'Duplicate consolidated risk IDs detected.', source: 'evidence-model' });
  }
  for (const risk of model.riskRegister) {
    if (!risk.cause.trim()) violations.push({ code: 'QG_RISK_CAUSE_MISSING', severity: 'violation', message: `Risk ${risk.id} has no cause.`, entityId: risk.id, source: 'evidence-model' });
    if (!risk.riskEvent.trim()) violations.push({ code: 'QG_RISK_EVENT_MISSING', severity: 'violation', message: `Risk ${risk.id} has no risk event.`, entityId: risk.id, source: 'evidence-model' });
    if (!risk.financialImpact.trim() || !risk.operationalImpact.trim()) violations.push({ code: 'QG_RISK_IMPACT_MISSING', severity: 'violation', message: `Risk ${risk.id} has incomplete financial/operational impact.`, entityId: risk.id, source: 'evidence-model' });
    if (risk.linkedFindingIds.length === 0 || risk.linkedQuestionCodes.length === 0 || risk.evidenceRefs.length === 0) violations.push({ code: 'QG_RISK_EVIDENCE_MISSING', severity: 'violation', message: `Risk ${risk.id} has incomplete evidence linkage.`, entityId: risk.id, source: 'evidence-model' });
  }
  const contradictionKeys = model.contradictions.map((item) => `${item.pattern}|${[...item.linkedFindingIds].sort().join('|')}`);
  if (new Set(contradictionKeys).size !== contradictionKeys.length) {
    violations.push({ code: 'QG_DUPLICATE_CONTRADICTION', severity: 'violation', message: 'Equivalent contradiction evidence was rendered more than once.', source: 'evidence-model' });
  }
  for (const contradiction of model.contradictions) {
    if (contradiction.linkedFindingIds.length === 0 || !contradiction.linkedRiskId || contradiction.evidenceRefs.length === 0) {
      violations.push({ code: 'QG_CONTRADICTION_EVIDENCE_MISSING', severity: 'violation', message: `Contradiction ${contradiction.id} lacks finding, risk or evidence linkage.`, entityId: contradiction.id, source: 'evidence-model' });
    }
  }

  // 12/13/14. Registers must be present whenever there are findings to populate them.
  if (model.materialFindings.length > 0) {
    if (model.riskRegister.length === 0) {
      violations.push({ code: 'QG_RISK_REGISTER_MISSING', severity: 'violation', message: 'Risk register is absent despite material findings.', source: 'evidence-model' });
    }
    if (model.controlImprovements.length === 0) {
      violations.push({ code: 'QG_CONTROL_REGISTER_MISSING', severity: 'violation', message: 'Control improvement register is absent despite material findings.', source: 'evidence-model' });
    }
    if (model.evidenceChecklist.length === 0) {
      violations.push({ code: 'QG_EVIDENCE_CHECKLIST_MISSING', severity: 'violation', message: 'Evidence checklist is absent despite material findings.', source: 'evidence-model' });
    }
  }

  for (const item of model.evidenceChecklist) {
    if (
      item.linkedFindingIds.length === 0 || item.linkedRiskIds.length === 0 || item.linkedQuestionCodes.length === 0 ||
      !item.requiredPopulation.trim() || !item.samplingExpectation.trim() || item.minimumAcceptableCharacteristics.length === 0 ||
      item.reviewStatus !== 'Not yet requested'
    ) {
      violations.push({ code: 'QG_EVIDENCE_CRITERIA_MISSING', severity: 'violation', message: `Evidence checklist item ${item.id} lacks review criteria or starts in an invalid status.`, entityId: item.id, source: 'evidence-model' });
    }
  }
  const decisionKeys = model.leadershipDecisions.map((decision) => `${decision.decisionCategory}|${decision.evidenceRefs.join('|')}`);
  if (new Set(decisionKeys).size !== decisionKeys.length) {
    violations.push({ code: 'QG_DECISION_DUPLICATE', severity: 'violation', message: 'Duplicate decision category/evidence combinations detected.', source: 'evidence-model' });
  }
  for (const decision of model.leadershipDecisions) {
    if (decision.linkedFindingIds.length === 0 || decision.linkedRiskIds.length === 0 || decision.evidenceRefs.length === 0) {
      violations.push({ code: 'QG_DECISION_LINKAGE_MISSING', severity: 'violation', message: `Leadership decision ${decision.id} lacks finding, risk or evidence linkage.`, entityId: decision.id, source: 'evidence-model' });
    }
  }

  // 15/16/17/18. Roadmap quality (evidence-model's own pre-render roadmapActions -- see
  // ../../commercial-quality.ts for the separate check against the exact rendered roadmap.agenda).
  for (const action of model.roadmapActions) {
    if (!action.deliverable || action.deliverable.length < 15) {
      violations.push({ code: 'QG_ROADMAP_DELIVERABLE_MISSING', severity: 'violation', message: `Roadmap action ${action.id} lacks a measurable deliverable.`, entityId: action.id, source: 'evidence-model' });
    }
    if (action.deliverable.includes(PROHIBITED_GENERIC_ROADMAP_PHRASE)) {
      violations.push({ code: 'QG_ROADMAP_GENERIC_LANGUAGE', severity: 'violation', message: `Roadmap action ${action.id} uses the prohibited generic template sentence.`, entityId: action.id, source: 'evidence-model' });
    }
    if (!action.accountableOwner) {
      violations.push({ code: 'QG_ROADMAP_OWNER_MISSING', severity: 'violation', message: `Roadmap action ${action.id} has no owner.`, entityId: action.id, source: 'evidence-model' });
    }
    if (!action.successMeasure) {
      violations.push({ code: 'QG_ROADMAP_MEASURE_MISSING', severity: 'violation', message: `Roadmap action ${action.id} has no effectiveness measure.`, entityId: action.id, source: 'evidence-model' });
    }
  }
  try {
    orderRoadmapActions(model.roadmapActions);
  } catch (error) {
    if (!(error instanceof RoadmapDependencyError)) throw error;
    violations.push({
      code: 'QG_ROADMAP_DEPENDENCY_INVALID',
      severity: 'violation',
      message: error.message,
      source: 'evidence-model'
    });
  }

  // 23. Placeholder text must never appear in normal output.
  const haystack = JSON.stringify(model);
  for (const placeholder of PROHIBITED_PLACEHOLDER_STRINGS) {
    if (haystack.includes(placeholder)) {
      violations.push({ code: 'QG_PLACEHOLDER_TEXT_PRESENT', severity: 'violation', message: `Prohibited placeholder text "${placeholder}" found in evidence model output.`, source: 'evidence-model' });
    }
  }

  // 24. Paid content must materially exceed the free snapshot -- proxy check: some minimum volume
  // of assessment-specific content must exist (section 33's "at least ten substantive
  // assessment-specific statements").
  const substantiveStatementCount = model.materialFindings.length + model.contradictions.length + model.riskRegister.length;
  if (substantiveStatementCount < 10) {
    warnings.push({
      code: 'QG_COMMERCIAL_VOLUME_WARNING',
      severity: 'warning',
      message: `Only ${substantiveStatementCount} assessment-specific findings/contradictions/risks generated; section 33 expects at least 10 substantive statements. This assessment may be too clean/small for the Essential tier to feel commercially substantial -- review manually.`,
      source: 'evidence-model'
    });
  }

  return { passed: violations.length === 0, violations, warnings };
}
