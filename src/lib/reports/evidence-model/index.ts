import type { AssembledReportData } from '../types';
import { buildContradictions } from './contradictions';
import { buildLeadershipDecisions, buildFunctionalAgenda, buildRoadmapActions } from './leadership';
import { buildMaterialFindings } from './material-findings';
import { buildControlImprovementRegister, buildEvidenceChecklist, buildRiskRegister } from './registers';
import { buildPlausibleScenarios } from './scenarios';
import type { AdvisoryEvidenceModel } from './types';

export * from './types';
export { getDomainPlaybook, hasDomainPlaybook } from './domain-playbooks';

/**
 * Assembles the full deterministic advisory evidence model from real, persisted assessment data.
 * This is the object the V2 report template should render from -- it does not invent facts, and it
 * is not an LLM call. Every field traces back to AssembledReportData (itself sourced from the
 * persisted score run) or to the static, finite domain-playbooks.ts content.
 */
export function buildAdvisoryEvidenceModel(data: AssembledReportData): AdvisoryEvidenceModel {
  const materialFindings = buildMaterialFindings(data);
  const riskRegister = buildRiskRegister(materialFindings);
  const controlImprovements = buildControlImprovementRegister(materialFindings, riskRegister);
  const evidenceChecklist = buildEvidenceChecklist(materialFindings, riskRegister);
  const scenarios = buildPlausibleScenarios(data, materialFindings).map((scenario) => ({
    ...scenario,
    linkedRiskId: riskRegister.find((r) => scenario.linkedFindingIds.some((id) => r.linkedFindingIds.includes(id)))?.id ?? ''
  }));
  const contradictions = buildContradictions(data, materialFindings).map((contradiction) => ({
    ...contradiction,
    linkedRiskId: riskRegister.find((r) => contradiction.linkedFindingIds.some((id) => r.linkedFindingIds.includes(id)))?.id ?? null
  }));
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

export interface QualityGateResult {
  passed: boolean;
  violations: string[];
  warnings: string[];
}

const PROHIBITED_PLACEHOLDER_STRINGS = ['A core control area', 'A control did not meet the required standard'];
const PROHIBITED_GENERIC_ROADMAP_PHRASE = 'Implement or tighten the minimum repeatable control rhythm for';

/**
 * Mechanical checks against the evidence model, corresponding to the checkable subset of the
 * commercial quality gates in the brief (section 32). Gates that require comparing against a second
 * assessment (item 28) or against rendered PDF output (25, 26, 27) are NOT checked here -- see the
 * second-fixture differentiation test and manual PDF review respectively.
 */
export function checkQualityGates(model: AdvisoryEvidenceModel, data: AssembledReportData): QualityGateResult {
  const violations: string[] = [];
  const warnings: string[] = [];

  // 1/2. Critical or maturity-limiting findings must name a control/domain.
  for (const finding of model.materialFindings) {
    if ((finding.isCriticalControl || finding.maturityCapStatus === 'capping') && !finding.domainName) {
      violations.push(`Finding ${finding.id} is critical/maturity-limiting but has no domain name.`);
    }
    if (!finding.recommendedControl) {
      violations.push(`Finding ${finding.id} has no recommended control.`);
    }
  }

  // 3/4. Every finding needs a source question and a recorded response.
  for (const finding of model.materialFindings) {
    if (!finding.questionCode) violations.push(`Finding ${finding.id} has no source question code.`);
    if (finding.responseValue === null) violations.push(`Finding ${finding.id} has no recorded response value.`);
  }

  // 5/6. No duplicate finding IDs; no question rendered as more than one finding.
  const findingIds = model.materialFindings.map((f) => f.id);
  if (new Set(findingIds).size !== findingIds.length) violations.push('Duplicate finding IDs detected.');
  const questionCodes = model.materialFindings.map((f) => f.questionCode);
  const dupeQuestions = questionCodes.filter((code, i) => questionCodes.indexOf(code) !== i);
  if (dupeQuestions.length > 0) violations.push(`Same source question rendered more than once: ${[...new Set(dupeQuestions)].join(', ')}.`);

  // 7. Executive diagnosis must state the correct number of maturity-limiting controls. Checked
  // here at the data level: the count the template should render must equal the actual cap-event
  // count with a related question, not a hardcoded "single control" assumption.
  const questionLevelCapCount = data.maturityCapEvents.filter((e) => e.relatedQuestionCode).length;
  if (questionLevelCapCount > 1) {
    warnings.push(`${questionLevelCapCount} question-level maturity-cap events exist -- executive diagnosis copy must not describe this as "a single control gap".`);
  }

  // 9/10/11. Scenario requirements.
  if (model.scenarios.length < 3) violations.push(`Only ${model.scenarios.length} plausible scenarios generated; at least 3 are required.`);
  for (const scenario of model.scenarios) {
    if (scenario.linkedFindingIds.length === 0) violations.push(`Scenario ${scenario.id} has no linked assessment evidence.`);
    if (!scenario.disclaimer || !scenario.disclaimer.toLowerCase().includes('plausible scenario')) {
      violations.push(`Scenario ${scenario.id} is missing the "plausible scenario, not an allegation" disclaimer.`);
    }
  }

  // 12/13/14. Registers must be present whenever there are findings to populate them.
  if (model.materialFindings.length > 0) {
    if (model.riskRegister.length === 0) violations.push('Risk register is absent despite material findings.');
    if (model.controlImprovements.length === 0) violations.push('Control improvement register is absent despite material findings.');
    if (model.evidenceChecklist.length === 0) violations.push('Evidence checklist is absent despite material findings.');
  }

  // 15/16/17/18. Roadmap quality.
  for (const action of model.roadmapActions) {
    if (!action.deliverable || action.deliverable.length < 15) violations.push(`Roadmap action ${action.id} lacks a measurable deliverable.`);
    if (action.deliverable.includes(PROHIBITED_GENERIC_ROADMAP_PHRASE)) violations.push(`Roadmap action ${action.id} uses the prohibited generic template sentence.`);
    if (!action.accountableOwner) violations.push(`Roadmap action ${action.id} has no owner.`);
    if (!action.successMeasure) violations.push(`Roadmap action ${action.id} has no effectiveness measure.`);
  }

  // 23. Placeholder text must never appear in normal output.
  const haystack = JSON.stringify(model);
  for (const placeholder of PROHIBITED_PLACEHOLDER_STRINGS) {
    if (haystack.includes(placeholder)) violations.push(`Prohibited placeholder text "${placeholder}" found in evidence model output.`);
  }

  // 24. Paid content must materially exceed the free snapshot -- proxy check: some minimum volume
  // of assessment-specific content must exist (section 33's "at least ten substantive
  // assessment-specific statements").
  const substantiveStatementCount = model.materialFindings.length + model.contradictions.length + model.riskRegister.length;
  if (substantiveStatementCount < 10) {
    warnings.push(`Only ${substantiveStatementCount} assessment-specific findings/contradictions/risks generated; section 33 expects at least 10 substantive statements. This assessment may be too clean/small for the Essential tier to feel commercially substantial -- review manually.`);
  }

  return { passed: violations.length === 0, violations, warnings };
}
