import assert from 'node:assert/strict';
import { buildAdvisoryEvidenceModel } from '../src/lib/reports/evidence-model/index.ts';
import { syntheticOrgFixture } from '../src/lib/reports/evidence-model/__fixtures__/synthetic-org-fixture.ts';
import { renderComprehensiveReportPackage } from '../src/lib/reports/comprehensive/manual-generation.ts';

// Provider-free package-builder proof. The interpretation generator is injected with a deterministic
// six-slot result and the PDF renderer is injected with fake bytes; the real Comprehensive assembly,
// management model, HTML composition and XLSX builder still run.
const data = {
  ...syntheticOrgFixture,
  orderId: 'rpc-accounting-order',
  orderReference: 'MKORD-RPC-ACCOUNTING-0001',
  orderAssessmentId: 'rpc-accounting-assessment',
  assessmentId: 'rpc-accounting-assessment',
  organisationId: 'rpc-accounting-org',
  currentScoreRunId: 'synthetic-run',
  orderVerifiedAt: '2026-08-21T00:00:00.000Z',
  orderVerifiedBy: 'rpc-accounting-admin',
  respondentName: 'Synthetic owner',
  customerEmail: 'rpc-accounting-owner@example.test',
  assessmentReference: 'MKFRS-RPC-ACCOUNTING-0001',
  reportReference: 'RPT-MKFRS-RPC-ACCOUNTING-0001-V1',
  generatedAt: '2026-08-21T00:00:00.000Z',
  packageName: 'Comprehensive automated assessment',
  productCode: 'mk_validated_assessment',
  orderStatus: 'payment_received',
  amountCents: 3500000,
  currency: 'ZAR',
  productPriceCents: 3500000,
  productCurrency: 'ZAR',
  productId: 'rpc-accounting-product',
  orderCreatedAt: '2026-08-21T00:00:00.000Z',
  productPriceVersionId: 'rpc-accounting-price-version',
  requiresPaymentVerification: true,
  deliveryMode: 'mk_controlled_pdf',
  productActive: true,
  paymentVerification: {
    paymentState: 'PAID', confirmationSource: 'manual_admin', actorReference: 'rpc-accounting-admin',
    providerTransactionReference: null, providerEventReference: null, providerEventAt: null,
    verificationResult: 'authorised_manual_confirmation', processingResult: 'applied',
    paymentEventId: 'rpc-accounting-payment', amountCents: 3500000, orderAmountCents: 3500000,
    currency: 'ZAR', orderCurrency: 'ZAR', orderVerifiedAt: '2026-08-21T00:00:00.000Z',
    orderVerifiedBy: 'rpc-accounting-admin', manualVerifierStatus: 'active', manualVerifierRole: 'platform_admin',
    priorValidSourceEvent: false, transitionCount: 1
  },
  domainResults: syntheticOrgFixture.domainResults.map((domain) => ({
    ...domain,
    weightedContribution: domain.rawScore * (domain.weightPct / 100),
    coveragePct: 100,
    criticalGapCount: 0
  })),
  recommendationRules: [],
  expectedDomainResultCount: 10,
  actualDomainResultCount: 10,
  expectedQuestionTraceCount: syntheticOrgFixture.questionTraces.length,
  actualQuestionTraceCount: syntheticOrgFixture.questionTraces.length,
  adaptiveGatewayAnswers: []
};
data.scoreRun = {
  ...data.scoreRun,
  lockedAt: '2026-08-21T00:00:00.000Z',
  inputHash: 'a'.repeat(64)
};

const evidenceModel = buildAdvisoryEvidenceModel(data);
const accounting = {
  calls: 1,
  repairs: 0,
  inputTokens: 12000,
  outputTokens: 1800,
  totalTokens: 13800,
  costMicros: 456789,
  durationMs: 3210,
  model: 'openai/gpt-5.6-luna',
  repairedSlots: []
};
const interpretation = {
  executiveInterpretation: 'The recorded position is mixed, with stronger governance foundations and material control gaps that require management attention.',
  whyThisMatters: 'The gaps matter because inconsistent prevention and detection can leave value-bearing activity exposed to avoidable loss.',
  managementImplication: 'Management should sequence the highest-priority actions, assign accountable owners and retain evidence of completion.',
  controlProgrammeSynthesis: 'The control programme should strengthen ownership, monitoring, exception handling and repeatable evidence retention.',
  implementationSynthesis: 'Implementation should start with the material gaps, then establish a recurring review rhythm and measurable closure checkpoints.',
  conclusion: 'This assessment is a self-assessment interpretation and does not constitute independent validation or an assurance opinion.'
};

let interpretationCalls = 0;
let accountingPersisted = false;
const result = await renderComprehensiveReportPackage({
  assembled: data,
  evidenceModel,
  orderReference: data.orderReference,
  reportReference: data.reportReference,
  versionNumber: 1,
  generateInterpretation: async () => {
    interpretationCalls += 1;
    return { interpretation, issues: [], accounting };
  },
  onInterpretationComplete: async ({ accounting: persisted }) => {
    assert.deepEqual(persisted, accounting);
    accountingPersisted = true;
  },
  renderPdf: async () => {
    assert.equal(accountingPersisted, true, 'accounting callback must run before PDF rendering');
    return Buffer.from(`%PDF-1.4\n${'0'.repeat(1200)}`);
  }
});

assert.equal(interpretationCalls, 1, 'the mocked interpretation must be called exactly once');
assert.equal(accountingPersisted, true);
assert.ok(Buffer.isBuffer(result.pdf) && result.pdf.length > 1000);
assert.ok(Buffer.isBuffer(result.workbook.bytes) && result.workbook.bytes.length > 0);
assert.equal(result.interpretationRun.accounting.costMicros, accounting.costMicros);
console.log('comprehensive interpretation accounting: mocked package builder, pre-render callback, PDF and XLSX all passed; provider calls = 0.');
