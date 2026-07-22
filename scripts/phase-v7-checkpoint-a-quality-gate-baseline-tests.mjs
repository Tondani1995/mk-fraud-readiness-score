// V7 Checkpoint A -- baseline test proving today's non-blocking quality-gate behaviour.
//
// checkQualityGates() (evidence-model/index.ts) already correctly DETECTS commercial-quality
// violations (that half of the spec's section 10.1 requirement already exists and is exercised
// here). The defect is entirely in the caller: report-template.ts's renderReportHtml() calls
// checkQualityGates(), logs a violation via console.error, and then renders and RETURNS the HTML
// anyway (spec 8.1). This test documents that current, defective behaviour concretely -- with a
// real violation, on a real call to the real render function -- so that Checkpoint B's fix
// (throwing a blocking ReportCommercialQualityError instead) has a test that must be *flipped*,
// not newly invented, proving the fix actually changes real behaviour rather than testing a straw
// man.
//
// Imported directly from the real, compiled source (not reimplemented), per this repo's existing
// test convention (see scripts/phase14-report-access-eligibility-tests.mjs and similar).
import assert from 'node:assert/strict';
import { buildAdvisoryEvidenceModel, checkQualityGates } from '../src/lib/reports/evidence-model/index.ts';
import { renderReportHtml } from '../src/lib/reports/templates/report-template.ts';

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

// Minimal, valid, but deliberately quality-gate-violating fixture: a single material finding
// (D1, a domain with a real playbook) produces at most 1-2 plausible scenarios, well under the
// gate's required minimum of 3 (evidence-model/index.ts line ~99). This is not a contrived object
// shape -- it is a real AssembledReportData shape with real, minimal content, the kind a thin or
// early-stage assessment could legitimately produce.
function buildViolatingFixture() {
  const domainNames = {
    D1: 'Fraud Leadership and Governance', D2: 'Fraud Risk Identification', D3: 'Operational Fraud Controls',
    D4: 'Fraud Detection Capability', D5: 'Fraud Incident Response', D6: 'Whistleblowing and Reporting Culture',
    D7: 'Third-Party and Supply Chain Fraud Risk', D8: 'Digital and Identity Fraud Risk',
    D9: 'Fraud Culture and Awareness', D10: 'Continuous Improvement and Fraud Risk Monitoring'
  };
  const domainResults = Object.entries(domainNames).map(([domainCode, domainName], i) => ({
    domainCode, domainName, weightPct: 10, rawScore: 55, weightedContribution: 5.5,
    coveragePct: 100, criticalGapCount: i === 0 ? 1 : 0
  }));

  return {
    orderId: 'test-order', orderReference: 'TEST-ORDER-001', orderAssessmentId: 'test-assessment',
    assessmentId: 'test-assessment', organisationId: 'test-org', currentScoreRunId: 'test-run',
    orderVerifiedAt: null, orderVerifiedBy: null, organisationName: 'Baseline Test Org',
    respondentName: 'Baseline Tester', customerEmail: 'baseline@example.test',
    assessmentReference: 'TEST-2026-BASELINE01', reportReference: 'RPT-TEST-2026-BASELINE01',
    generatedAt: new Date().toISOString(), packageName: 'Detailed Fraud Readiness Report',
    productCode: null, orderStatus: 'verified', amountCents: null, currency: null,
    productPriceCents: null, productCurrency: null, requiresPaymentVerification: null,
    deliveryMode: null, productActive: null,
    scoreRun: {
      id: 'test-run', assessmentId: 'test-assessment', methodologyVersionId: 'test-methodology-version', status: 'completed', lockedAt: null,
      inputHash: null, overallScore: 55, calculatedMaturity: 'Developing', finalMaturity: 'Developing',
      exposureScore: 50, exposureBand: 'Moderate', coveragePct: 100, nARatePct: 0,
      criticalGapCount: 1, majorGapCount: 0, capApplied: false, capReason: null
    },
    domainResults,
    exposureAnswers: [],
    criticalMajorGaps: [{
      questionCode: 'Q-D1-01', domainCode: 'D1', domainName: domainNames.D1,
      prompt: 'Is fraud risk formally owned at executive level?', responseValue: 1,
      isCritical: true, isHardGate: false, isCriticalGap: true, isMajorGap: false
    }],
    maturityCapEvents: [],
    recommendationRules: [],
    expectedDomainResultCount: 10, actualDomainResultCount: 10,
    expectedQuestionTraceCount: 1, actualQuestionTraceCount: 1
  };
}

function emptySelectedContent(data) {
  const domainNarratives = {};
  const gapCommentary = {};
  for (const domain of data.domainResults) {
    domainNarratives[domain.domainName] = { title: 'Fallback title', body: 'Fallback body.', usedFallback: true };
  }
  for (const gap of data.criticalMajorGaps) {
    gapCommentary[`${gap.domainCode}::${gap.questionCode}`] = { body: 'Fallback gap commentary.', usedFallback: true };
  }
  return {
    executiveSummary: { title: 'Fallback executive summary', body: 'Fallback body.', usedFallback: true },
    falseComfort: { title: 'Fallback false comfort', body: 'Fallback body.', usedFallback: true },
    leadershipAttention: { body: 'Fallback leadership attention.', usedFallback: true },
    domainNarratives,
    gapCommentary
  };
}

console.log('V7 Checkpoint A -- quality-gate baseline suite');

test('control: checkQualityGates() correctly detects a real violation on the minimal fixture (evidence-model layer already works)', () => {
  const fixture = buildViolatingFixture();
  const model = buildAdvisoryEvidenceModel(fixture);
  const gate = checkQualityGates(model, fixture);
  assert.equal(gate.passed, false, 'Expected the fixture to trip at least one quality-gate violation.');
  assert.ok(gate.violations.length > 0, 'Expected at least one violation message.');
  console.log(`    (violations on this fixture: ${JSON.stringify(gate.violations)})`);
});

test('BASELINE (documents current defect, spec 8.1): renderReportHtml() still returns full HTML despite a real quality-gate violation -- it must not, once Checkpoint B lands', () => {
  const fixture = buildViolatingFixture();
  const content = emptySelectedContent(fixture);
  let html;
  assert.doesNotThrow(() => {
    html = renderReportHtml(fixture, content, { agenda: [] });
  }, 'This assert.doesNotThrow documents TODAY\'S defective behaviour. Checkpoint B must invert this test to assert.throws(ReportCommercialQualityError) once the blocking gate is implemented.');
  assert.ok(typeof html === 'string' && html.length > 0, 'Expected non-empty HTML to be returned despite the violation (this is the bug).');
});

console.log(`\n${passed} passed`);
