import assert from 'node:assert/strict';
import { semanticMappingForQuestion } from '../../src/lib/reports/evidence-model/semantic-mappings.ts';
import { buildScenarioFacts } from '../../src/lib/reports/narrative/fact-pack.ts';

const expectedMappings = new Map([
  ['D3-Q01', 'PRIVILEGED_ACCESS_MISUSE'],
  ['D3-Q02', 'DETECTION_EVASION'],
  ['D3-Q04', 'PRIVILEGED_ACCESS_MISUSE'],
  ['D3-Q05', 'DETECTION_EVASION']
]);

for (const [questionCode, expectedFamily] of expectedMappings) {
  const mapping = semanticMappingForQuestion(questionCode);
  assert.ok(
    mapping.fraudPathwayFamilies.includes(expectedFamily),
    `${questionCode} must retain its evidence-backed operational fraud pathway ${expectedFamily}`
  );
}

const finding = (questionCode, materialityScore) => {
  const mapping = semanticMappingForQuestion(questionCode);
  return {
    id: `MF-${questionCode}`,
    title: `Recorded operational weakness ${questionCode}`,
    questionCode,
    materialityScore,
    materialityClass: 'control_gap',
    linkedScenarioTypes: [],
    fraudPathwayFamilies: mapping.fraudPathwayFamilies,
    primarySemanticFamily: mapping.primarySemanticFamily,
    secondarySemanticFamilies: mapping.secondarySemanticFamilies,
    fraudMechanism: 'a recorded control weakness may allow value-bearing activity to proceed without timely independent challenge',
    domainName: 'Operational Fraud Controls',
    responseMeaning: 'Partially in place',
    responseLabel: 'Partially in place',
    responseOperationalMeaning: 'The control is only partly designed.',
    expectedControlStandard: 'Independent preventive and detective control over the complete in-scope population',
    escalationThreshold: 'Any unsupported exception is escalated to the accountable owner.',
    accountableOwner: 'Executive owner',
    processOwner: 'Operational owner',
    targetPeriod: '60 days',
    recommendedControl: 'Implement independent review and retain attributable evidence across the complete population.',
    effectivenessMeasure: 'All in-scope exceptions are independently reviewed and resolved.',
    questionPrompt: `Control question ${questionCode}.`,
    likelyFinancialImpact: 'Unauthorised activity may create financial loss.',
    likelyOperationalImpact: 'Control bypass may disrupt operations.'
  };
};

// Mirrors the production failure shape: segregation of duties, supplier onboarding and manual
// adjustment review are simultaneously material. Before this repair only supplier onboarding was
// connected to a narrative pathway, so Comprehensive collapsed to one scenario and failed closed.
const findings = [
  finding('D3-Q01', 1000),
  finding('D3-Q03', 900),
  finding('D3-Q05', 800)
];
const risk = {
  id: 'RISK-OPERATIONAL-CONTROLS',
  priority: 'Critical',
  title: 'Operational control pathway',
  riskStatement: 'Material operational controls may be bypassed before timely challenge.',
  cause: 'Independent preventive and detective review is incomplete.',
  riskEvent: 'value-bearing activity proceeds without timely independent challenge',
  likelihood: 'Moderate',
  impact: 'Severe',
  requiredTreatment: 'Implement independent review and retain attributable evidence.',
  accountableExecutive: 'Executive owner',
  targetPeriod: '60 days',
  financialImpact: 'Value may be lost.',
  operationalImpact: 'Operations may be disrupted.',
  legalRegulatoryImpact: null,
  reputationalImpact: null,
  linkedFindingIds: findings.map((item) => item.id)
};

const findingRefs = new Map(findings.map((item, index) => [item.id, `FINDING-${String(index + 1).padStart(3, '0')}`]));
const riskRefs = new Map([[risk.id, 'RISK-001']]);
const scenarios = buildScenarioFacts([], findings, [risk], findingRefs, riskRefs, 'comprehensive');
const families = new Set(scenarios.map((scenario) => scenario.scenarioFamily));

assert.ok(scenarios.length >= 2 && scenarios.length <= 4, 'Comprehensive operational-control profile must satisfy the unchanged 2-4 Story Plan bound');
assert.ok(families.has('SUPPLIER_PAYMENT_DIVERSION'), 'supplier-onboarding weakness must remain represented');
assert.ok(families.has('DETECTION_EVASION'), 'manual-adjustment review weakness must remain represented');
assert.ok(families.has('PRIVILEGED_ACCESS_MISUSE'), 'segregation/authority weakness must remain represented');
assert.ok(scenarios.every((scenario) => scenario.linkedFindingRefs.length > 0 && scenario.linkedRiskRefs.length > 0), 'every projected scenario must remain evidence-linked');

console.log('PASS: operational control fraud-pathway mapping and Comprehensive scenario projection regression');
