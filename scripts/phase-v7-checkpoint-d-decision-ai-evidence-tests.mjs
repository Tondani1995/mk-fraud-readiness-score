// V7 Checkpoint D -- decision-ready advisory model and AI-ready evidence contract.
// Credential-free and deterministic: production builders run against production-shaped fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildAdvisoryEvidenceModel,
  checkQualityGates
} from '../src/lib/reports/evidence-model/index.ts';
import {
  buildMateriallyWeakDecisionFixture,
  buildModerateDecisionFixture,
  buildCleanAssuranceFixture
} from '../src/lib/reports/evidence-model/__fixtures__/decision-fixtures.ts';
import {
  buildPremiumReportEvidencePack,
  canonicalEvidenceJson,
  evidenceChecksum,
  validatePremiumReportEvidencePack
} from '../src/lib/reports/automation/evidence.ts';
import { adaptAdvisoryRoadmapToLegacyAgenda } from '../src/lib/reports/roadmap.ts';
import { validateRoadmapSource } from '../src/lib/reports/commercial-quality.ts';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log('  ok - ' + name);
  } catch (error) {
    console.error('  FAIL - ' + name);
    console.error('    ' + (error.stack ?? error.message));
    throw error;
  }
}

function models() {
  const weakData = buildMateriallyWeakDecisionFixture();
  const moderateData = buildModerateDecisionFixture();
  const cleanData = buildCleanAssuranceFixture();
  return {
    weakData, moderateData, cleanData,
    weak: buildAdvisoryEvidenceModel(weakData),
    moderate: buildAdvisoryEvidenceModel(moderateData),
    clean: buildAdvisoryEvidenceModel(cleanData)
  };
}

function clone(value) {
  return structuredClone(value);
}

console.log('V7 Checkpoint D -- decision-ready advisory model and AI evidence contract');

test('F1. weak, moderate and clean fixtures produce materially different advisory structures', () => {
  const { weak, moderate, clean } = models();
  assert.notDeepEqual(weak.riskRegister.map((item) => item.id), moderate.riskRegister.map((item) => item.id));
  assert.notDeepEqual(moderate.scenarios.map((item) => item.id), clean.scenarios.map((item) => item.id));
  assert.notDeepEqual(weak.leadershipDecisions.map((item) => item.decisionCategory), clean.leadershipDecisions.map((item) => item.decisionCategory));
  assert.notDeepEqual(weak.roadmapActions.map((item) => item.id), clean.roadmapActions.map((item) => item.id));
});

test('R1-R3. every risk has distinct cause-event-impact fields, grounded statement and evidence', () => {
  const { weak } = models();
  for (const risk of weak.riskRegister) {
    assert.ok(risk.cause.length > 20);
    assert.ok(risk.riskEvent.length > 20);
    assert.ok(risk.financialImpact.length > 10);
    assert.ok(risk.operationalImpact.length > 10);
    assert.match(risk.riskStatement, /^Because .+, there is a risk that .+, resulting in .+\.$/);
    assert.ok(risk.linkedFindingIds.length > 0 && risk.linkedQuestionCodes.length > 0 && risk.evidenceRefs.length > 0);
    assert.equal(risk.assessmentConfidence, 'Self-assessment only, not independently verified');
  }
});

test('R4-R5. causal consolidation is deterministic without collapsing distinct supplier or response pathways', () => {
  const { weak } = models();
  const access = weak.riskRegister.find((risk) => risk.id === 'RISK-UNAUTHORISED-ACCESS');
  assert.deepEqual(access.linkedQuestionCodes, ['D3-Q04', 'D8-Q04']);
  const onboarding = weak.riskRegister.find((risk) => risk.id === 'RISK-SUPPLIER-ONBOARDING');
  const payment = weak.riskRegister.find((risk) => risk.id === 'RISK-SUPPLIER-PAYMENT-REDIRECTION');
  assert.ok(onboarding && payment && onboarding.id !== payment.id);
  assert.ok(onboarding.linkedQuestionCodes.includes('D7-Q01'));
  assert.deepEqual(payment.linkedQuestionCodes, ['D7-Q04']);
  assert.ok(weak.riskRegister.some((risk) => risk.id === 'RISK-INCIDENT-RESPONSE'));
  assert.ok(weak.riskRegister.some((risk) => risk.id === 'RISK-EVIDENCE-INTEGRITY'));
});

test('R6. every likelihood-impact pair uses the documented deterministic priority matrix', () => {
  const matrix = {
    Low: { Low: 'Low', Moderate: 'Medium', High: 'High', Severe: 'High' },
    Moderate: { Low: 'Medium', Moderate: 'Medium', High: 'High', Severe: 'Critical' },
    High: { Low: 'Medium', Moderate: 'High', High: 'Critical', Severe: 'Critical' }
  };
  const { weak, moderate, clean } = models();
  for (const risk of [...weak.riskRegister, ...moderate.riskRegister, ...clean.riskRegister]) {
    assert.equal(risk.priority, matrix[risk.likelihood][risk.impact]);
    assert.ok(risk.likelihoodRationale.length > 30 && risk.impactRationale.length > 30);
    assert.doesNotMatch(risk.likelihoodRationale, /\b\d+(?:\.\d+)?%\b/);
  }
});

test('R7. shuffled traces, domains, exposure and cap events produce byte-identical model ordering', () => {
  const data = buildMateriallyWeakDecisionFixture();
  const first = buildAdvisoryEvidenceModel(data);
  const shuffled = {
    ...data,
    questionTraces: [...data.questionTraces].reverse(),
    criticalMajorGaps: [...data.criticalMajorGaps].reverse(),
    domainResults: [...data.domainResults].reverse(),
    exposureAnswers: [...data.exposureAnswers].reverse(),
    maturityCapEvents: [...data.maturityCapEvents].reverse()
  };
  assert.equal(JSON.stringify(buildAdvisoryEvidenceModel(shuffled)), JSON.stringify(first));
});

test('C1-C4. contradictions consolidate, rank, retain evidence and disappear for a clean assessment', () => {
  const { weak, clean } = models();
  assert.ok(weak.contradictions.length > 0 && weak.contradictions.length <= 5);
  const keys = weak.contradictions.map((item) => item.pattern + '|' + [...item.linkedFindingIds].sort().join('|'));
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(weak.contradictions.every((item) => item.linkedFindingIds.length > 0 && item.linkedRiskId && item.evidenceRefs.length > 0));
  assert.deepEqual(weak.contradictions.map((item) => item.materialityScore), [...weak.contradictions].map((item) => item.materialityScore).sort((a, b) => b - a));
  assert.equal(clean.contradictions.length, 0);
});

test('C5. equivalent contradiction duplication and empty evidence fail closed', () => {
  const data = buildMateriallyWeakDecisionFixture();
  const model = buildAdvisoryEvidenceModel(data);
  const duplicate = { ...model, contradictions: [...model.contradictions, clone(model.contradictions[0])] };
  assert.ok(checkQualityGates(duplicate, data).violations.some((issue) => issue.code === 'QG_DUPLICATE_CONTRADICTION'));
  const empty = clone(model);
  empty.contradictions[0].linkedFindingIds = [];
  assert.ok(checkQualityGates(empty, data).violations.some((issue) => issue.code === 'QG_CONTRADICTION_EVIDENCE_MISSING'));
});

test('S1-S6. weak scenarios are gap-based; clean scenarios validate assurance without allegation', () => {
  const { weak, clean } = models();
  assert.ok(weak.scenarios.length >= 3);
  assert.ok(weak.scenarios.every((scenario) => scenario.scenarioBasis === 'control_gap'));
  assert.ok(clean.scenarios.length >= 2);
  assert.ok(clean.scenarios.every((scenario) => scenario.scenarioBasis === 'assurance_validation'));
  assert.ok(clean.scenarios.every((scenario) => scenario.linkedControlWeaknesses.length === 0));
  for (const scenario of [...weak.scenarios, ...clean.scenarios]) {
    assert.ok(scenario.linkedFindingIds.length > 0 && scenario.linkedQuestionCodes.length > 0 && scenario.linkedRiskIds.length > 0 && scenario.evidenceRefs.length > 0);
    assert.match(scenario.disclaimer, /not an allegation/i);
    assert.doesNotMatch(scenario.fraudSequence, /the organisation committed|fraud has occurred|the event occurred/i);
  }
});

test('S7. invalid basis and unsupported scenario evidence fail closed', () => {
  const data = buildMateriallyWeakDecisionFixture();
  const model = clone(buildAdvisoryEvidenceModel(data));
  model.scenarios[0].scenarioBasis = 'unsupported';
  model.scenarios[0].linkedRiskIds = [];
  const codes = checkQualityGates(model, data).violations.map((issue) => issue.code);
  assert.ok(codes.includes('QG_SCENARIO_BASIS_INVALID'));
  assert.ok(codes.includes('QG_SCENARIO_EVIDENCE_MISSING'));
});

test('G1-G2. control register has one exact-playbook-derived entry per finding', () => {
  const { weak } = models();
  assert.equal(weak.controlImprovements.length, weak.materialFindings.length);
  assert.equal(new Set(weak.controlImprovements.map((item) => item.linkedFindingId)).size, weak.materialFindings.length);
  for (const item of weak.controlImprovements) {
    const finding = weak.materialFindings.find((entry) => entry.id === item.linkedFindingId);
    assert.equal(item.controlDesign, finding.recommendedControl);
    assert.deepEqual(item.evidenceRetained, [...new Set(finding.evidenceToRequest)].sort());
    assert.ok(item.completePopulationCoverage.length > 20 && item.minimumEvidenceCharacteristics.length > 0);
  }
});

test('G3-G5. evidence artefacts consolidate without losing links and start unrequested', () => {
  const { weak } = models();
  const keys = weak.evidenceChecklist.map((item) => item.artefact.trim().toLowerCase());
  assert.equal(new Set(keys).size, keys.length);
  for (const item of weak.evidenceChecklist) {
    assert.equal(item.reviewStatus, 'Not yet requested');
    assert.ok(item.linkedFindingIds.length > 0 && item.linkedRiskIds.length > 0 && item.linkedQuestionCodes.length > 0);
    assert.ok(item.requiredPopulation.length > 20 && item.samplingExpectation.length > 20 && item.minimumAcceptableCharacteristics.length > 0);
    assert.equal(item.evidenceRef, 'evidence:' + item.id);
  }
});

test('D1-D5. leadership decisions are consolidated, bounded, role-separated and context-aware', () => {
  const { weak, clean } = models();
  assert.ok(weak.leadershipDecisions.length <= 6);
  const keys = weak.leadershipDecisions.map((item) => item.decisionCategory + '|' + item.evidenceRefs.join('|'));
  assert.equal(new Set(keys).size, keys.length);
  for (const item of weak.leadershipDecisions) {
    assert.ok(item.accountableExecutive && item.implementationOwner && item.oversightFunction);
    assert.ok(['30 days', '60 days', '90 days'].includes(item.deadline));
    assert.ok(item.linkedFindingIds.length > 0 && item.linkedRiskIds.length > 0);
  }
  assert.ok(clean.leadershipDecisions.every((item) => ['independent_validation', 'governance_reporting_cadence'].includes(item.decisionCategory)));
  assert.equal(clean.leadershipDecisions.some((item) => item.decisionCategory === 'risk_acceptance_or_remediation'), false);
});

test('A1. functional agenda separates accountability, operation and oversight and validates assurance', () => {
  const { weak, clean } = models();
  assert.ok(weak.functionalAgenda.some((item) => item.id.endsWith('ACCOUNTABILITY')));
  assert.ok(weak.functionalAgenda.some((item) => item.id.endsWith('OPERATION')));
  assert.ok(weak.functionalAgenda.some((item) => item.id.endsWith('OVERSIGHT')));
  assert.ok(clean.functionalAgenda.every((item) => /validate|reconcile|independently test/i.test(item.question)));
  assert.ok(clean.functionalAgenda.every((item) => !/move this to fully in place/i.test(item.question)));
});

test('M1-M5. one roadmap source preserves owners, dependencies, measures and adapter identity', () => {
  const { weak } = models();
  assert.equal(new Set(weak.roadmapActions.map((item) => item.deliverable)).size, weak.roadmapActions.length);
  const positions = new Map(weak.roadmapActions.map((item, index) => [item.id, index]));
  for (const action of weak.roadmapActions) {
    assert.ok(action.accountableExecutive && action.processOwner && action.oversightFunction);
    assert.ok(action.successMeasure && action.evidenceOfCompletion && action.escalationThreshold);
    assert.ok(action.dependencyIds.every((id) => positions.get(id) < positions.get(action.id)));
  }
  const legacy = adaptAdvisoryRoadmapToLegacyAgenda(weak.roadmapActions);
  assert.deepEqual(legacy.agenda.flatMap((item) => item.authoritativeActionIds), weak.roadmapActions.map((item) => item.id));
  assert.equal(validateRoadmapSource(legacy.agenda, weak).passed, true);
  const mismatched = clone(legacy.agenda);
  mismatched[0].ownerRole = 'Wrong owner';
  assert.ok(validateRoadmapSource(mismatched, weak).violations.some((issue) => issue.code === 'QG_ROADMAP_SOURCE_MISMATCH'));
});

test('Q1. missing risk fields, decision linkage, evidence criteria and roadmap dependencies block', () => {
  const data = buildMateriallyWeakDecisionFixture();
  const model = clone(buildAdvisoryEvidenceModel(data));
  model.riskRegister[0].cause = '';
  model.riskRegister[0].riskEvent = '';
  model.riskRegister[0].financialImpact = '';
  model.leadershipDecisions[0].linkedRiskIds = [];
  model.evidenceChecklist[0].samplingExpectation = '';
  model.roadmapActions[0].dependencyIds = ['RA-NOT-REAL'];
  const codes = checkQualityGates(model, data).violations.map((issue) => issue.code);
  for (const code of ['QG_RISK_CAUSE_MISSING', 'QG_RISK_EVENT_MISSING', 'QG_RISK_IMPACT_MISSING', 'QG_DECISION_LINKAGE_MISSING', 'QG_EVIDENCE_CRITERIA_MISSING', 'QG_ROADMAP_DEPENDENCY_INVALID']) assert.ok(codes.includes(code));
});

test('AI1-AI5. evidence pack includes every required kind, authority marker and closed references', () => {
  const data = buildMateriallyWeakDecisionFixture();
  const model = buildAdvisoryEvidenceModel(data);
  const pack = buildPremiumReportEvidencePack(data, model);
  const kinds = new Set(pack.items.map((item) => item.kind));
  for (const kind of ['overall_score', 'calculated_maturity', 'final_maturity', 'exposure_score', 'exposure_band', 'coverage', 'domain', 'question_response', 'material_finding', 'maturity_cap', 'contradiction', 'plausible_scenario', 'risk', 'control_improvement', 'evidence_checklist', 'leadership_decision', 'roadmap_action', 'assessment_limitation']) assert.ok(kinds.has(kind), 'Missing evidence kind ' + kind);
  assert.equal(pack.methodologyAuthority, 'deterministic');
  assert.equal(pack.narrativeAuthority, 'ai_optional_validated');
  assert.equal(pack.methodologyVersionId, data.scoreRun.methodologyVersionId);
  assert.deepEqual(pack.advisoryModel, model);
  assert.deepEqual(validatePremiumReportEvidencePack(pack, [data.customerEmail, data.respondentName]), []);
  assert.equal(new Set(pack.items.map((item) => item.id)).size, pack.items.length);
});

test('AI6-AI8. canonical JSON and checksum survive shuffled input and differ for another assessment', () => {
  const data = buildMateriallyWeakDecisionFixture();
  const model = buildAdvisoryEvidenceModel(data);
  const pack = buildPremiumReportEvidencePack(data, model);
  const shuffled = {
    ...data,
    questionTraces: [...data.questionTraces].reverse(),
    criticalMajorGaps: [...data.criticalMajorGaps].reverse(),
    domainResults: [...data.domainResults].reverse(),
    exposureAnswers: [...data.exposureAnswers].reverse(),
    maturityCapEvents: [...data.maturityCapEvents].reverse()
  };
  const shuffledPack = buildPremiumReportEvidencePack(shuffled, buildAdvisoryEvidenceModel(shuffled));
  assert.equal(canonicalEvidenceJson(shuffledPack), canonicalEvidenceJson(pack));
  assert.equal(evidenceChecksum(shuffledPack), evidenceChecksum(pack));
  const cleanData = buildCleanAssuranceFixture();
  const cleanPack = buildPremiumReportEvidencePack(cleanData, buildAdvisoryEvidenceModel(cleanData));
  assert.notEqual(evidenceChecksum(cleanPack), evidenceChecksum(pack));
});

test('AI9-AI11. PII is excluded, organisation name stays sanitised and evidence building cannot call a provider', () => {
  const data = buildMateriallyWeakDecisionFixture();
  data.organisationName = 'Acme\u200B Corp';
  const model = buildAdvisoryEvidenceModel(data);
  const pack = buildPremiumReportEvidencePack(data, model);
  const canonical = canonicalEvidenceJson(pack);
  assert.doesNotMatch(canonical, new RegExp(data.customerEmail.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&'), 'i'));
  assert.doesNotMatch(canonical, new RegExp(data.respondentName, 'i'));
  assert.equal(pack.organisationName.includes('\u200B'), false);
  const source = fs.readFileSync(new URL('../src/lib/reports/automation/evidence.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /ai-sdk-generator|createDurablePremiumReportNarrativeGenerator|\.generate\(/);
});

test('AI12. duplicate and unresolved evidence references use stable blocking codes', () => {
  const data = buildMateriallyWeakDecisionFixture();
  const pack = clone(buildPremiumReportEvidencePack(data, buildAdvisoryEvidenceModel(data)));
  pack.items.push(clone(pack.items[0]));
  pack.items[1].evidenceRefs = ['finding:DOES-NOT-EXIST'];
  const codes = validatePremiumReportEvidencePack(pack).map((issue) => issue.code);
  assert.ok(codes.includes('QG_AI_EVIDENCE_REF_DUPLICATE'));
  assert.ok(codes.includes('QG_AI_EVIDENCE_REF_UNRESOLVED'));
});

console.log('\n' + passed + ' passed');
