#!/usr/bin/env node
/**
 * Offline V1.2 operating-context truth closure.
 *
 * This suite deliberately mutates every legal gateway option while holding all other answers
 * constant. It proves that a gateway changes only its registered semantic fact, which is the
 * regression the former positional rules could not detect.
 */
import assert from 'node:assert/strict';
import v11Graph from '../../docs/adaptive-assessment/adaptive-graph-v1-draft.json' with { type: 'json' };
import v12Graph from '../../src/lib/adaptive/candidates/adaptive-graph-v1-2-candidate.json' with { type: 'json' };
import {
  VHUTSHILO_V12_GATEWAY_ANSWERS,
  VHUTSHILO_V12_GATEWAY_MAP,
  VHUTSHILO_V12_GRAPH_VERSION,
  VHUTSHILO_V12_GRAPH_FINGERPRINT
} from '../../src/lib/adaptive/fixtures/vhutshilo-v12.ts';
import {
  contextFact,
  describeOperatingContextFact,
  deriveOperatingContext,
  gatewaySemanticKeys,
  OperatingContextGraphMismatchError,
  OperatingContextProvenanceError,
  UnsupportedGraphVersionError
} from '../../src/lib/reports/narrative/operating-context.ts';
import { exposuresFromContext, hasExposure } from '../../src/lib/reports/narrative/operating-exposures.ts';
import { buildNarrativeWriterBrief } from '../../src/lib/reports/narrative/writer-brief.ts';

const checks = [];
const check = (name, fn) => {
  try {
    fn();
    checks.push({ name, status: 'PASS' });
  } catch (error) {
    checks.push({ name, status: 'FAIL', detail: error instanceof Error ? error.message.split('\n')[0] : String(error) });
  }
};

const graphVersion = VHUTSHILO_V12_GRAPH_VERSION;
const graphFingerprint = VHUTSHILO_V12_GRAPH_FINGERPRINT;
const expectedGatewayKeys = {
  G01: 'OPERATING_ENVIRONMENT',
  G02: 'WORKFORCE_SIZE',
  G03: 'EXTERNAL_SUPPLIERS_PRESENT',
  G04: 'SUPPLIER_MANAGEMENT_MODEL',
  G05: 'PROCUREMENT_MODEL',
  G06: 'PHYSICAL_CASH_EXPOSURE',
  G07: 'STOCK_OR_PHYSICAL_ASSETS',
  G08: 'PAYROLL_DELIVERY_MODEL',
  G09: 'CUSTOMER_DIGITAL_CHANNELS',
  G10: 'CUSTOMER_DIGITAL_PAYMENTS',
  G11: 'PERSONAL_OR_IDENTITY_DATA',
  G12: 'MANUAL_FINANCIAL_OR_STOCK_ADJUSTMENTS',
  G13: 'MULTI_SITE_OR_DISTRIBUTED_OPERATIONS',
  G14: 'TEMPORARY_SEASONAL_OR_SUBCONTRACTED_WORKFORCE',
  G15: 'REMOTE_SYSTEM_OR_DATA_ACCESS',
  G16: 'HIGHER_RISK_PAYMENT_APPROVAL_MODEL',
  G17: 'INTERMEDIARY_EXPOSURE'
};

const factsFor = (gatewayAnswers = VHUTSHILO_V12_GATEWAY_MAP, graph = v12Graph) =>
  deriveOperatingContext({ graphVersion, graph, gatewayAnswers });

const factSnapshot = (facts) => Object.fromEntries(facts.map((fact) => [fact.key, {
  value: fact.value,
  certainty: fact.certainty,
  sourceGatewayCode: fact.sourceGatewayCode,
  sourceQuestionId: fact.sourceQuestionId,
  sourceOptionId: fact.sourceOptionId,
  sourceOptionLabel: fact.sourceOptionLabel,
  sourcePrompt: fact.sourcePrompt
}]));

check('V1.2 registers exactly one semantic key for every G01-G17 gateway', () => {
  assert.deepEqual(gatewaySemanticKeys(graphVersion), Object.fromEntries(
    Object.entries(expectedGatewayKeys).map(([gatewayCode, key]) => [gatewayCode, [key]])
  ));
});

const frozenFacts = factsFor();
check('all 17 frozen answers resolve to one canonical fact', () => {
  assert.equal(frozenFacts.length, 17);
  for (const answer of VHUTSHILO_V12_GATEWAY_ANSWERS) {
    const fact = frozenFacts.find((candidate) => candidate.sourceGatewayCode === answer.gatewayCode);
    assert.ok(fact, `${answer.gatewayCode} did not resolve`);
    assert.equal(fact.key, expectedGatewayKeys[answer.gatewayCode]);
    assert.equal(fact.sourceQuestionId, answer.questionId);
    assert.equal(fact.sourcePrompt, answer.prompt);
    assert.equal(fact.sourceOptionId, answer.optionValue);
    assert.equal(fact.sourceOptionLabel, answer.optionLabel);
    assert.equal(fact.graphVersion, graphVersion);
    assert.equal(fact.graphFingerprint, graphFingerprint);
    assert.equal(fact.provenance, 'RECORDED_GATEWAY_RESPONSE');
    assert.equal(fact.customerNarrativeAllowed, true);
  }
});

check('Vhutshilo values preserve the recorded truth states', () => {
  assert.equal(contextFact(frozenFacts, 'PERSONAL_OR_IDENTITY_DATA')?.certainty, 'NEGATED');
  assert.equal(contextFact(frozenFacts, 'MANUAL_FINANCIAL_OR_STOCK_ADJUSTMENTS')?.certainty, 'NEGATED');
  assert.equal(contextFact(frozenFacts, 'CUSTOMER_DIGITAL_CHANNELS')?.certainty, 'NEGATED');
  assert.equal(contextFact(frozenFacts, 'INTERMEDIARY_EXPOSURE')?.certainty, 'NOT_ESTABLISHED');
  assert.equal(contextFact(frozenFacts, 'MULTI_SITE_OR_DISTRIBUTED_OPERATIONS')?.certainty, 'AFFIRMED');
  assert.equal(contextFact(frozenFacts, 'TEMPORARY_SEASONAL_OR_SUBCONTRACTED_WORKFORCE')?.certainty, 'AFFIRMED');
});

check('customer-language projection preserves bounded YES/NO/UNKNOWN wording', () => {
  assert.match(describeOperatingContextFact(contextFact(frozenFacts, 'CUSTOMER_DIGITAL_CHANNELS')), /no customer-facing digital channel/i);
  assert.match(describeOperatingContextFact(contextFact(frozenFacts, 'INTERMEDIARY_EXPOSURE')), /did not establish whether agents, brokers, distributors or other intermediaries are used/i);
  assert.match(describeOperatingContextFact(contextFact(frozenFacts, 'TEMPORARY_SEASONAL_OR_SUBCONTRACTED_WORKFORCE')), /temporary, seasonal or subcontracted workers are used/i);
  assert.doesNotMatch(describeOperatingContextFact(contextFact(frozenFacts, 'INTERMEDIARY_EXPOSURE')), /not use|does not use/i);
});

check('operating exposures are projections of the typed facts, not a second gateway table', () => {
  const exposures = exposuresFromContext(frozenFacts);
  assert.ok(hasExposure(exposures, 'DISTRIBUTED_OPERATIONS'));
  assert.ok(hasExposure(exposures, 'TEMPORARY_OR_SUBCONTRACTED_WORKFORCE'));
  assert.ok(!hasExposure(exposures, 'PERSONAL_DATA_HELD'));
  assert.ok(!hasExposure(exposures, 'REFUNDS_AND_ADJUSTMENTS'));
  assert.equal(exposures.find((exposure) => exposure.id === 'DISTRIBUTED_OPERATIONS')?.evidence[0], 'G13');
  assert.equal(exposures.find((exposure) => exposure.id === 'TEMPORARY_OR_SUBCONTRACTED_WORKFORCE')?.evidence[0], 'G14');
});

check('the two known fabricated-fact paths are impossible', () => {
  const personalDataChanged = factsFor({ ...VHUTSHILO_V12_GATEWAY_MAP, G11: 'yes' });
  const adjustmentsChanged = factsFor({ ...VHUTSHILO_V12_GATEWAY_MAP, G12: 'yes' });
  assert.equal(contextFact(personalDataChanged, 'MULTI_SITE_OR_DISTRIBUTED_OPERATIONS')?.sourceGatewayCode, 'G13');
  assert.equal(contextFact(adjustmentsChanged, 'TEMPORARY_SEASONAL_OR_SUBCONTRACTED_WORKFORCE')?.sourceGatewayCode, 'G14');
  assert.equal(contextFact(personalDataChanged, 'MULTI_SITE_OR_DISTRIBUTED_OPERATIONS')?.value, 'yes');
  assert.equal(contextFact(adjustmentsChanged, 'TEMPORARY_SEASONAL_OR_SUBCONTRACTED_WORKFORCE')?.value, 'yes');
});

check('each gateway mutation changes only its own semantic key', () => {
  const baseline = factSnapshot(factsFor());
  for (const gateway of v12Graph.gateways) {
    const gatewayCode = gateway.questionId;
    const expectedKey = expectedGatewayKeys[gatewayCode];
    for (const option of gateway.responseOptions) {
      const next = { ...VHUTSHILO_V12_GATEWAY_MAP, [gatewayCode]: option.value };
      const changedKeys = Object.keys(factSnapshot(factsFor(next))).filter((key) =>
        JSON.stringify(factSnapshot(factsFor(next))[key]) !== JSON.stringify(baseline[key])
      );
      const expectedChanged = option.value === VHUTSHILO_V12_GATEWAY_MAP[gatewayCode] ? [] : [expectedKey];
      assert.deepEqual(changedKeys, expectedChanged, `${gatewayCode}=${option.value} changed ${changedKeys.join(',')}`);
    }
  }
});

check('explicit gateway isolation requirements hold', () => {
  const noPersonal = factSnapshot(factsFor({ ...VHUTSHILO_V12_GATEWAY_MAP, G11: 'no' }));
  const yesPersonal = factSnapshot(factsFor({ ...VHUTSHILO_V12_GATEWAY_MAP, G11: 'yes' }));
  const noAdjustments = factSnapshot(factsFor({ ...VHUTSHILO_V12_GATEWAY_MAP, G12: 'no' }));
  const yesAdjustments = factSnapshot(factsFor({ ...VHUTSHILO_V12_GATEWAY_MAP, G12: 'yes' }));
  assert.deepEqual(noPersonal.MULTI_SITE_OR_DISTRIBUTED_OPERATIONS, yesPersonal.MULTI_SITE_OR_DISTRIBUTED_OPERATIONS);
  assert.deepEqual(noAdjustments.TEMPORARY_SEASONAL_OR_SUBCONTRACTED_WORKFORCE, yesAdjustments.TEMPORARY_SEASONAL_OR_SUBCONTRACTED_WORKFORCE);
  assert.notDeepEqual(factSnapshot(factsFor({ ...VHUTSHILO_V12_GATEWAY_MAP, G13: 'no' })).MULTI_SITE_OR_DISTRIBUTED_OPERATIONS, noPersonal.MULTI_SITE_OR_DISTRIBUTED_OPERATIONS);
  assert.notDeepEqual(factSnapshot(factsFor({ ...VHUTSHILO_V12_GATEWAY_MAP, G14: 'no' })).TEMPORARY_SEASONAL_OR_SUBCONTRACTED_WORKFORCE, noAdjustments.TEMPORARY_SEASONAL_OR_SUBCONTRACTED_WORKFORCE);
  assert.deepEqual(factSnapshot(factsFor({ ...VHUTSHILO_V12_GATEWAY_MAP, G04: 'organisation' })).PROCUREMENT_MODEL, noPersonal.PROCUREMENT_MODEL);
  assert.notDeepEqual(factSnapshot(factsFor({ ...VHUTSHILO_V12_GATEWAY_MAP, G05: 'business_owners' })).PROCUREMENT_MODEL, noPersonal.PROCUREMENT_MODEL);
  assert.notDeepEqual(factSnapshot(factsFor({ ...VHUTSHILO_V12_GATEWAY_MAP, G16: 'one_person' })).HIGHER_RISK_PAYMENT_APPROVAL_MODEL, noPersonal.HIGHER_RISK_PAYMENT_APPROVAL_MODEL);
});

check('unsupported versions and graph drift fail closed', () => {
  assert.throws(() => deriveOperatingContext({ graphVersion: 'MFRS-V1.3-UNKNOWN', gatewayAnswers: { G01: 'yes' } }), UnsupportedGraphVersionError);
  assert.throws(() => deriveOperatingContext({ graphVersion, graph: v11Graph, gatewayAnswers: { G01: 'manufacturing_production' } }), OperatingContextGraphMismatchError);
  assert.throws(() => deriveOperatingContext({ graphVersion, gatewayAnswers: { G01: 'not-a-compiled-option' } }), OperatingContextProvenanceError);
});

check('V1.1 is never interpreted through V1.2 mapping', () => {
  const answers = Object.fromEntries(v11Graph.gateways.map((gateway) => [gateway.questionId, gateway.responseOptions[0].value]));
  answers.G11 = 'yes';
  const facts = deriveOperatingContext({ graphVersion: 'MFRS-V1.1-ADAPTIVE-DRAFT-20260804', graph: v11Graph, gatewayAnswers: answers });
  assert.equal(contextFact(facts, 'MULTI_SITE_OR_DISTRIBUTED_OPERATIONS')?.sourceGatewayCode, 'G11');
  assert.equal(contextFact(facts, 'REMOTE_SYSTEM_OR_DATA_ACCESS'), undefined);
  assert.equal(contextFact(facts, 'INTERMEDIARY_EXPOSURE'), undefined);
});

check('writer brief receives the same typed facts and bounded projection', () => {
  const pack = {
    schemaVersion: 'test', bibleVersion: '1.1', productTier: 'essential', narrativeMode: 'REMEDIATION',
    organisation: { name: 'Vhutshilo Foods Manufacturing (Pty) Ltd', operatingContext: frozenFacts, sectorFacts: frozenFacts.map(describeOperatingContextFact) },
    assessment: { reference: 'test', generatedAt: '2026-08-24T00:00:00.000Z', score: 43.33, maturity: 'Developing', calculatedMaturity: 'Developing', exposureScore: null, exposureBand: null, coveragePct: 100, uncertaintyRatePct: 0, criticalGapCount: 6, majorGapCount: 3, uncertaintyFacts: [] },
    domains: [], relativeStrengths: [], systemicThemeInputs: [], standaloneFindingReasons: {}, findings: [], sustainmentPriorities: [], risks: [], scenarios: [], controls: [], decisions: [], roadmap: [], proofOfProgress: [], maturationSteps: [], highReadinessSparseNarrativeReason: undefined, prohibitedClaims: [],
    narrativeBounds: { themeCount: 0, findingCount: 0, scenarioCount: 0, controlCount: 0, decisionCount: 0, managementResponseCount: 0, maturationCount: 0 }, facts: []
  };
  const plan = { executiveStoryObjective: 'test', movements: [], themeOrder: [], findingOrder: [], scenarioOrder: [], riskOrder: [], controlOrder: [], decisionOrder: [], roadmapOrder: [], maturationOrder: [], narrativeBounds: pack.narrativeBounds, requiredConclusion: 'test' };
  const brief = buildNarrativeWriterBrief(pack, plan);
  assert.equal(brief.organisation.operatingContext.length, 17);
  assert.equal(brief.organisation.operatingContext.find((fact) => fact.key === 'MULTI_SITE_OR_DISTRIBUTED_OPERATIONS')?.sourceGatewayCode, 'G13');
  assert.match(brief.organisation.operatingContext.find((fact) => fact.key === 'INTERMEDIARY_EXPOSURE')?.customerLanguage ?? '', /did not establish/i);
});

const failures = checks.filter((entry) => entry.status === 'FAIL');
for (const entry of checks) console.log(`${entry.status}  ${entry.name}${entry.detail ? `  [${entry.detail}]` : ''}`);
console.log(`\nOperating-context checks: ${checks.length}; failures: ${failures.length}; provider calls: 0`);
if (failures.length) process.exit(1);
