import assert from 'node:assert/strict';
import { buildPlausibleScenarios } from '../../src/lib/reports/evidence-model/scenarios.ts';

const finding = (id, questionCode, materialityScore, scenarioType) => ({
  id,
  title: `Recorded weakness ${questionCode}`,
  questionCode,
  materialityScore,
  materialityClass: 'material_weakness',
  linkedScenarioTypes: [scenarioType],
  fraudMechanism: 'a recorded control weakness may enable misuse',
  domainName: 'Test domain',
  responseMeaning: 'Partly designed',
  expectedControlStandard: 'Independent preventive and detective control',
  escalationThreshold: 'Any unresolved exception is escalated',
  accountableOwner: 'Executive owner',
  recommendedControl: 'Implement and evidence the required control.',
  questionPrompt: `Control question ${questionCode}.`
});

const findings = [
  finding('MF-1', 'D1-Q01', 100, 'privileged_access_exploitation'),
  finding('MF-2', 'D1-Q02', 90, 'segregation_of_duties_bypass'),
  finding('MF-3', 'D1-Q03', 80, 'access_abuse')
];

const risk = {
  id: 'RISK-CONSOLIDATED',
  priority: 'Critical',
  title: 'Consolidated control pathway',
  riskEvent: 'unauthorised activity proceeds without timely challenge',
  financialImpact: 'Value may be lost',
  operationalImpact: 'Operations may be disrupted',
  legalRegulatoryImpact: null,
  reputationalImpact: null,
  linkedFindingIds: findings.map((item) => item.id)
};

const scenarios = buildPlausibleScenarios({}, findings, [risk]);
assert.equal(
  scenarios.length,
  3,
  'one consolidated risk with three distinct weak findings must yield the weak-assessment minimum of three evidence-backed scenarios'
);
assert.equal(new Set(scenarios.map((item) => item.id)).size, 3, 'scenario ids must remain unique');
assert.ok(scenarios.every((item) => item.linkedRiskIds.includes(risk.id)), 'each scenario must retain the consolidated risk link');
assert.ok(scenarios.every((item) => item.evidenceRefs.length > 0), 'each scenario must retain evidence provenance');
assert.equal(
  new Set(scenarios.flatMap((item) => item.linkedQuestionCodes)).size,
  3,
  'the top-up must preserve distinct source-question evidence rather than duplicating the primary scenario'
);

console.log('PASS: Essential consolidated-risk scenario top-up regression');
