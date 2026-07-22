// V7 Checkpoint C -- deterministic materiality engine and exact question-playbook suite.
// Credential-free: every function under test is the real production evidence-model function;
// database I/O is represented by validated, production-shaped persisted evidence fixtures.
import assert from 'node:assert/strict';
import { ResponseLabelSourceError } from '../src/lib/reports/response-labels.ts';
import { buildMaterialFindings } from '../src/lib/reports/evidence-model/material-findings.ts';
import {
  AUTHORITATIVE_QUESTION_MAPPINGS,
  checkQualityGates,
  getQuestionPlaybook,
  listQuestionPlaybooks
} from '../src/lib/reports/evidence-model/index.ts';
import { buildAdvisoryEvidenceModel } from '../src/lib/reports/evidence-model/index.ts';
import { officialResponseLabelsFixture } from '../src/lib/reports/evidence-model/__fixtures__/official-response-labels.ts';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok - ${name}`);
  } catch (error) {
    console.error(`  FAIL - ${name}`);
    console.error(`    ${error.stack ?? error.message}`);
    throw error;
  }
}

const DOMAIN_NAMES = {
  D1: 'Fraud Leadership and Governance', D2: 'Fraud Risk Identification', D3: 'Operational Fraud Controls',
  D4: 'Fraud Detection Capability', D5: 'Fraud Incident Response', D6: 'Whistleblowing and Reporting Culture',
  D7: 'Third-Party and Supply Chain Fraud Risk', D8: 'Digital and Identity Fraud Risk',
  D9: 'Fraud Culture and Awareness', D10: 'Continuous Improvement and Fraud Risk Monitoring'
};

function trace(questionCode, responseValue, overrides = {}) {
  const mapping = AUTHORITATIVE_QUESTION_MAPPINGS[questionCode];
  assert.ok(mapping, `Test trace requires a registered authoritative mapping for ${questionCode}.`);
  return {
    questionCode, domainCode: mapping.domainCode, domainName: DOMAIN_NAMES[mapping.domainCode], prompt: mapping.prompt,
    responseValue, normalisedScore: responseValue * 20, applicable: true, triggeredRules: [],
    isCritical: mapping.isCritical, isHardGate: mapping.isHardGate,
    isCriticalGap: responseValue <= 2 && mapping.isCritical, isMajorGap: false,
    ...overrides
  };
}

function assembledData(questionTraces, overrides = {}) {
  const domainScores = { D1: 78, D2: 84, D3: 62, D4: 58, D5: 54, D6: 56, D7: 38, D8: 44, D9: 72, D10: 80 };
  const domainResults = Object.entries(DOMAIN_NAMES).map(([domainCode, domainName]) => ({
    domainCode, domainName, weightPct: 10, rawScore: domainScores[domainCode], weightedContribution: domainScores[domainCode] / 10,
    coveragePct: 100, criticalGapCount: questionTraces.filter((item) => item.domainCode === domainCode && item.isCriticalGap).length
  }));
  const criticalMajorGaps = questionTraces
    .filter((item) => item.isCriticalGap || item.isMajorGap)
    .map(({ normalisedScore, applicable, triggeredRules, ...gap }) => gap);
  return {
    orderId: 'cp-c-order', orderReference: 'CP-C-ORDER', orderAssessmentId: 'cp-c-assessment',
    assessmentId: 'cp-c-assessment', organisationId: 'cp-c-org', currentScoreRunId: 'cp-c-run',
    orderVerifiedAt: null, orderVerifiedBy: null, organisationName: 'Checkpoint C Test Organisation',
    respondentName: 'Fixture', customerEmail: 'fixture@example.test', assessmentReference: 'CP-C-ASSESSMENT',
    reportReference: 'CP-C-REPORT', generatedAt: '2026-07-22T00:00:00.000Z', packageName: 'Essential',
    productCode: 'essential_self_assessment', orderStatus: 'verified', amountCents: 0, currency: 'ZAR',
    productPriceCents: 0, productCurrency: 'ZAR', requiresPaymentVerification: false,
    deliveryMode: 'mk_controlled_pdf', productActive: true,
    scoreRun: {
      id: 'cp-c-run', assessmentId: 'cp-c-assessment', methodologyVersionId: 'methodology-version-v1.1',
      status: 'completed', lockedAt: '2026-07-22T00:00:00.000Z', inputHash: 'fixture-hash', overallScore: 82,
      calculatedMaturity: 'Strategic', finalMaturity: 'Developing', exposureScore: 72, exposureBand: 'High',
      coveragePct: 100, nARatePct: 0, criticalGapCount: criticalMajorGaps.filter((item) => item.isCriticalGap).length,
      majorGapCount: criticalMajorGaps.filter((item) => item.isMajorGap).length, capApplied: true, capReason: 'Fixture cap'
    },
    domainResults,
    exposureAnswers: [
      { factorCode: 'EXP-01', name: 'High-risk process footprint', selectedLabel: 'High exposure', pointsAwarded: 20, maxPoints: 25 },
      { factorCode: 'EXP-02', name: 'Third-party dependency', selectedLabel: 'Severe exposure', pointsAwarded: 15, maxPoints: 15 },
      { factorCode: 'EXP-03', name: 'Digital reliance', selectedLabel: 'High exposure', pointsAwarded: 12, maxPoints: 15 },
      { factorCode: 'EXP-04', name: 'Identity dependency', selectedLabel: 'High exposure', pointsAwarded: 8, maxPoints: 10 },
      { factorCode: 'EXP-07', name: 'Manual exceptions', selectedLabel: 'Severe exposure', pointsAwarded: 10, maxPoints: 10 },
      { factorCode: 'EXP-08', name: 'Public funds', selectedLabel: 'High exposure', pointsAwarded: 6, maxPoints: 7 }
    ],
    questionTraces,
    criticalMajorGaps,
    officialResponseLabels: officialResponseLabelsFixture,
    maturityCapEvents: [{ ruleCode: 'hard_gate_lte_2', capTo: 'Developing', reason: 'Fixture cap', relatedQuestionCode: 'D1-Q04', relatedQuestionPrompt: AUTHORITATIVE_QUESTION_MAPPINGS['D1-Q04'].prompt, relatedDomainCode: 'D1', relatedDomainName: DOMAIN_NAMES.D1 }],
    recommendationRules: [], expectedDomainResultCount: 10, actualDomainResultCount: 10,
    expectedQuestionTraceCount: questionTraces.length, actualQuestionTraceCount: questionTraces.length,
    ...overrides
  };
}

function materialFixture() {
  return assembledData([
    trace('D1-Q01', 5), trace('D1-Q04', 2), trace('D3-Q03', 2), trace('D3-Q04', 1),
    trace('D4-Q02', 1, { isMajorGap: true }), trace('D5-Q01', 2), trace('D5-Q05', 1),
    trace('D6-Q01', 1), trace('D7-Q01', 1), trace('D7-Q04', 0, { isMajorGap: true }),
    trace('D8-Q02', 2), trace('D8-Q04', 1, { isMajorGap: true }), trace('D8-Q05', 3, { isMajorGap: true }),
    trace('D9-Q01', 4)
  ]);
}

function cleanFixture() {
  const traces = [trace('D1-Q01', 5, { isCriticalGap: false }), trace('D3-Q04', 4, { isCriticalGap: false }), trace('D5-Q01', 5, { isCriticalGap: false })];
  const data = assembledData(traces, {
    scoreRun: { ...assembledData(traces).scoreRun, overallScore: 94, calculatedMaturity: 'Strategic', finalMaturity: 'Strategic', exposureScore: 25, exposureBand: 'Low', criticalGapCount: 0, majorGapCount: 0, capApplied: false, capReason: null },
    domainResults: Object.entries(DOMAIN_NAMES).map(([domainCode, domainName], index) => ({ domainCode, domainName, weightPct: 10, rawScore: 88 + index, weightedContribution: (88 + index) / 10, coveragePct: 100, criticalGapCount: 0 })),
    exposureAnswers: [{ factorCode: 'EXP-03', name: 'Digital reliance', selectedLabel: 'Low exposure', pointsAwarded: 2, maxPoints: 15 }],
    criticalMajorGaps: [], maturityCapEvents: []
  });
  return data;
}

console.log('V7 Checkpoint C -- materiality engine and exact question playbooks');

test('A1-A4. official methodology labels are preserved, values 4/5 stay distinct, and an incomplete source fails closed', () => {
  const findings = buildMaterialFindings(cleanFixture());
  const byValue = new Map(findings.map((finding) => [finding.responseValue, finding]));
  assert.equal(byValue.get(4).responseLabel, 'Consistently operating');
  assert.equal(byValue.get(5).responseLabel, 'Embedded and improved');
  assert.notEqual(byValue.get(4).responseMeaning, byValue.get(5).responseMeaning);
  assert.ok(findings.every((finding) => finding.methodologyVersionId === 'methodology-version-v1.1'));
  assert.throws(() => buildMaterialFindings({ ...cleanFixture(), officialResponseLabels: officialResponseLabelsFixture.slice(0, 5) }), ResponseLabelSourceError);
});

test('S1-S8. every required materiality reason is exercised, including cross-domain, contradiction and scenario linkage', () => {
  const findings = buildMaterialFindings(materialFixture());
  const reasons = new Set(findings.flatMap((finding) => finding.selectionReasons));
  for (const required of ['HARD_GATE_FAILURE', 'CRITICAL_CONTROL_FAILURE', 'MATURITY_CAP_EVENT', 'CRITICAL_GAP', 'MAJOR_GAP', 'ABSENT_CONTROL', 'PARTIAL_KEY_CONTROL_HIGH_EXPOSURE', 'WEAKEST_DOMAIN', 'EXPOSURE_CONTROL_MISMATCH', 'MATERIAL_CONTRADICTION', 'CROSS_DOMAIN_DEPENDENCY', 'STRONG_AGGREGATE_MASKING_CRITICAL_WEAKNESS', 'PRIORITY_SCENARIO_ENABLER']) {
    assert.ok(reasons.has(required), `Missing selection reason ${required}.`);
  }
});

test('S9-S11. multiple reasons consolidate, duplicate source rows cannot clone a finding, and distinct same-domain questions remain separate', () => {
  const data = materialFixture();
  data.questionTraces.push({ ...data.questionTraces.find((item) => item.questionCode === 'D7-Q04') });
  data.maturityCapEvents.push({ ...data.maturityCapEvents[0], ruleCode: 'duplicate-path', relatedQuestionCode: 'D7-Q04' });
  const findings = buildMaterialFindings(data);
  const bankChange = findings.filter((finding) => finding.questionCode === 'D7-Q04');
  assert.equal(bankChange.length, 1);
  assert.ok(bankChange[0].selectionReasons.length >= 6);
  assert.equal(new Set(bankChange[0].selectionReasons).size, bankChange[0].selectionReasons.length);
  assert.equal(findings.filter((finding) => finding.domainCode === 'D5').length, 2);
});

test('S12. ranking, IDs and reason order are stable across repeated runs and shuffled database input', () => {
  const data = materialFixture();
  const first = buildMaterialFindings(data).map(({ id, questionCode, selectionReasons, materialityScore }) => ({ id, questionCode, selectionReasons, materialityScore }));
  const shuffled = { ...data, questionTraces: [...data.questionTraces].reverse(), domainResults: [...data.domainResults].reverse(), exposureAnswers: [...data.exposureAnswers].reverse(), maturityCapEvents: [...data.maturityCapEvents].reverse() };
  assert.deepEqual(buildMaterialFindings(shuffled).map(({ id, questionCode, selectionReasons, materialityScore }) => ({ id, questionCode, selectionReasons, materialityScore })), first);
  assert.deepEqual(buildMaterialFindings(data).map(({ id, questionCode, selectionReasons, materialityScore }) => ({ id, questionCode, selectionReasons, materialityScore })), first);
});

test('P1-P6. required related controls receive genuinely different, question-specific designs', () => {
  const design = (code) => getQuestionPlaybook(code).recommendedControlDesign;
  assert.notEqual(design('D5-Q01'), design('D5-Q05'));
  assert.match(design('D5-Q01'), /incident commander/i);
  assert.match(design('D5-Q05'), /chain-of-custody|custody/i);
  assert.notEqual(design('D7-Q01'), design('D7-Q04'));
  assert.match(design('D7-Q04'), /callback/i);
  assert.notEqual(design('D3-Q04'), design('D8-Q04'));
  assert.doesNotMatch(design('D8-Q04'), /customer identity verification|single static data point/i);
  assert.notEqual(design('D1-Q01'), design('D1-Q04'));
  assert.notEqual(design('D8-Q02'), design('D8-Q05'));
});

test('P7. every required playbook maps to an authoritative code, domain and critical/hard-gate status', () => {
  const required = ['D1-Q04', 'D3-Q04', 'D5-Q01', 'D5-Q05', 'D6-Q01', 'D7-Q01', 'D7-Q04', 'D8-Q04'];
  const registered = new Set(listQuestionPlaybooks().map((playbook) => playbook.questionCode));
  for (const code of required) {
    const mapping = AUTHORITATIVE_QUESTION_MAPPINGS[code];
    const playbook = getQuestionPlaybook(code);
    assert.ok(mapping?.prompt.length > 20);
    assert.equal(playbook.domainCode, mapping.domainCode);
    assert.equal(mapping.isCritical, true);
    assert.ok(registered.has(code));
    for (const field of ['controlObjective', 'expectedStandard', 'fraudMechanism', 'recommendedControlDesign', 'effectivenessMeasure', 'escalationThreshold']) {
      assert.ok(typeof playbook[field] === 'string' && playbook[field].length > 10, `${code}.${field} must be substantive.`);
    }
    for (const field of ['executiveAccountability', 'processOwnership', 'oversightFunction', 'operatingFrequency']) {
      assert.ok(typeof playbook[field] === 'string' && playbook[field].trim().length > 0, `${code}.${field} must be populated.`);
    }
    for (const field of ['supportingFunctions', 'evidenceRequired', 'minimumAcceptableEvidenceCharacteristics', 'dependencies', 'relatedScenarioTypes']) {
      assert.ok(Array.isArray(playbook[field]) && playbook[field].length > 0, `${code}.${field} must be populated.`);
    }
    assert.ok(['Low', 'Moderate', 'High'].includes(playbook.implementationDifficulty));
    assert.ok(['30 days', '60 days', '90 days'].includes(playbook.targetPeriod));
  }
});

test('P8-P10. material findings use exact playbooks only and a missing playbook emits QG_MATERIAL_PLAYBOOK_MISSING', () => {
  const data = materialFixture();
  const findings = buildMaterialFindings(data);
  assert.ok(findings.every((finding) => finding.fallbackStatus === 'exact_question_playbook'));
  assert.ok(findings.every((finding) => finding.playbookSource === `question-playbooks:${finding.questionCode}`));
  const unknownTrace = { questionCode: 'D2-Q01', domainCode: 'D2', domainName: DOMAIN_NAMES.D2, prompt: 'Authoritative but deliberately unregistered test question.', responseValue: 1, normalisedScore: 20, applicable: true, triggeredRules: [], isCritical: true, isHardGate: true, isCriticalGap: true, isMajorGap: false };
  const missingData = assembledData([unknownTrace]);
  const model = buildAdvisoryEvidenceModel(missingData);
  const gate = checkQualityGates(model, missingData);
  assert.equal(model.materialFindings[0].fallbackStatus, 'missing_question_playbook');
  assert.ok(gate.violations.some((issue) => issue.code === 'QG_MATERIAL_PLAYBOOK_MISSING'));
});

test('C1-C4. strong assessment creates no false weakness and any selected item is a deterministic assurance priority', () => {
  const data = cleanFixture();
  const first = buildMaterialFindings(data);
  assert.equal(first.some((finding) => ['CRITICAL_GAP', 'MAJOR_GAP', 'ABSENT_CONTROL', 'HARD_GATE_FAILURE', 'CRITICAL_CONTROL_FAILURE'].some((reason) => finding.selectionReasons.includes(reason))), false);
  assert.ok(first.every((finding) => finding.materialityClass === 'assurance_priority'));
  assert.ok(first.every((finding) => /assurance priority, not a failed control/i.test(finding.whyItMatters)));
  assert.deepEqual(buildMaterialFindings(data).map((finding) => [finding.id, finding.selectionReasons]), first.map((finding) => [finding.id, finding.selectionReasons]));
});

test('C5. official value 3 (Implemented and in use) is not reclassified as partial or an exposure mismatch', () => {
  const implemented = trace('D8-Q05', 3, { isCriticalGap: false, isMajorGap: false });
  const data = assembledData([implemented], {
    domainResults: Object.entries(DOMAIN_NAMES).map(([domainCode, domainName], index) => ({ domainCode, domainName, weightPct: 10, rawScore: domainCode === 'D8' ? 55 : 80 + index, weightedContribution: 8, coveragePct: 100, criticalGapCount: 0 })),
    criticalMajorGaps: [], maturityCapEvents: []
  });
  const finding = buildMaterialFindings(data).find((item) => item.questionCode === 'D8-Q05');
  assert.ok(finding, 'Weakest-domain assurance priority should remain available for an exact playbook.');
  assert.equal(finding.materialityClass, 'assurance_priority');
  assert.deepEqual(finding.selectionReasons, ['WEAKEST_DOMAIN']);
});

console.log(`\n${passed} passed`);
