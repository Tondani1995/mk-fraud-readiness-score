import assert from 'node:assert/strict';
import { buildPlausibleScenarios } from '../../src/lib/reports/evidence-model/scenarios.ts';
import { buildScenarioFacts } from '../../src/lib/reports/narrative/fact-pack.ts';

const finding = (id, questionCode, materialityScore, scenarioType) => ({
  id,
  title: `Recorded access weakness ${questionCode}`,
  questionCode,
  materialityScore,
  materialityClass: 'material_weakness',
  linkedScenarioTypes: [scenarioType],
  fraudPathwayFamilies: ['PRIVILEGED_ACCESS_MISUSE'],
  primarySemanticFamily: 'PRIVILEGED_ACCESS',
  secondarySemanticFamilies: [],
  fraudMechanism: 'a recorded access-control weakness may enable unauthorised change',
  domainName: 'Digital and Identity Fraud Risks',
  responseMeaning: 'Partly designed',
  responseLabel: 'Partially in place',
  responseOperationalMeaning: 'The access control is only partly designed.',
  expectedControlStandard: 'Independent preventive and detective access control',
  escalationThreshold: 'Any unresolved privileged-access exception is escalated',
  accountableOwner: 'Executive owner',
  processOwner: 'Technology owner',
  targetPeriod: '30 days',
  recommendedControl: 'Restrict, log and independently recertify privileged access.',
  effectivenessMeasure: 'All privileged access is attributable and current.',
  questionPrompt: `Control question ${questionCode}.`,
  likelyFinancialImpact: 'Unauthorised changes may create financial loss.',
  likelyOperationalImpact: 'Unauthorised changes may disrupt operations.'
});

const findings = [
  finding('MF-1', 'D8-Q01', 100, 'privileged_access_exploitation'),
  finding('MF-2', 'D8-Q02', 90, 'segregation_of_duties_bypass'),
  finding('MF-3', 'D8-Q03', 80, 'access_abuse')
];
const risk = {
  id: 'RISK-CONSOLIDATED',
  priority: 'Critical',
  title: 'Consolidated access-control pathway',
  riskStatement: 'Privileged access may be misused before timely challenge.',
  cause: 'Privileged access is not consistently restricted and recertified.',
  riskEvent: 'unauthorised activity proceeds without timely challenge',
  likelihood: 'Possible',
  impact: 'Major',
  requiredTreatment: 'Restrict, log and recertify privileged access.',
  accountableExecutive: 'Executive owner',
  targetPeriod: '30 days',
  financialImpact: 'Value may be lost',
  operationalImpact: 'Operations may be disrupted',
  legalRegulatoryImpact: null,
  reputationalImpact: null,
  linkedFindingIds: findings.map((item) => item.id)
};

const evidenceScenarios = buildPlausibleScenarios({}, findings, [risk]);
assert.equal(evidenceScenarios.length, 3, 'evidence layer should retain three distinct evidence-backed variants');

const findingRefs = new Map(findings.map((item, index) => [item.id, `FINDING-${String(index + 1).padStart(3, '0')}`]));
const riskRefs = new Map([[risk.id, 'RISK-001']]);
const narrativeScenarios = buildScenarioFacts(evidenceScenarios, findings, [risk], findingRefs, riskRefs, 'comprehensive');

assert.ok(narrativeScenarios.length >= 2 && narrativeScenarios.length <= 4, 'Comprehensive narrative projection must preserve the unchanged 2-4 Story Plan bound');
assert.equal(new Set(narrativeScenarios.map((item) => item.canonicalScenarioId)).size, narrativeScenarios.length, 'narrative scenarios must retain distinct canonical evidence identities');
assert.ok(narrativeScenarios.every((item) => item.scenarioFamily === 'PRIVILEGED_ACCESS_MISUSE'), 'top-up must not invent another fraud pathway family');
assert.ok(narrativeScenarios.every((item) => item.linkedFindingRefs.length > 0 && item.linkedRiskRefs.length > 0), 'every narrative scenario must remain linked to selected findings and risks');

console.log('PASS: Comprehensive consolidated-pathway narrative scenario projection regression');
