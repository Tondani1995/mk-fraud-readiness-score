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
  executiveInterpretation: 'The recorded position is mixed, with stronger governance foundations and material control gaps that require management attention. The important relationship is that a defined control foundation does not by itself show complete operating coverage across the activities that carry value, access or decision rights. That distinction matters because the assessment records a position for management interpretation, not an independently tested result. Leadership should preserve the stronger foundation while closing the dependency between accountable ownership, exception handling and retained operating proof. The report therefore treats the score as a starting point for decisions and sequencing. It does not describe an incident, a loss or a completed assurance conclusion. The recommended response is to make the material control population explicit, assign ownership and use evidence requirements to test whether the intended practice is applied consistently.',
  whyThisMatters: 'The gaps matter because inconsistent prevention and detection can leave value-bearing activity exposed to avoidable loss. The operational concern is not that an event is known to have occurred; it is that normal activity may pass through a process where the exception route, review population or escalation path is not sufficiently defined. Management should focus first on the pathway with the greatest combination of exposure and weak dependency, then confirm how warning indicators would reach an accountable decision-maker. This creates a practical bridge between the recorded self-assessment and the evidence still needed to support a stronger position. The result is a conditional risk interpretation, not an allegation about the organisation.',
  managementImplication: 'Management should sequence the highest-priority actions, assign accountable owners and retain evidence of completion. The first decision is to confirm who owns the relevant control standard and who can require escalation when an exception is identified. The second is to agree the population and review rhythm that will demonstrate whether the standard is operating beyond isolated examples. Those decisions unlock the later design, monitoring and assurance work because teams will know what is in scope, which outcomes matter and where unresolved exceptions go. The agenda should remain tied to the recorded findings and risks rather than becoming a general governance programme. It should also distinguish implementation by the organisation from evidence that still needs to be obtained.',
  controlProgrammeSynthesis: 'The control programme should strengthen ownership, monitoring, exception handling and repeatable evidence retention. Governance and response provide authority for escalation; process controls reduce opportunities for unauthorised changes; access and identity controls protect the systems and roles through which the process operates; detection and evidence controls create the signals and records needed to interrupt and reconstruct a matter. These elements reinforce one another, but none should be treated as proof that the organisation already operates at the recommended level. The dependency is complete population definition: controls should identify which suppliers, transactions, users, adjustments or locations are covered, who reviews exceptions and what record is retained. That makes the blueprint actionable while preserving the boundary between recommended design and self-reported position.',
  implementationSynthesis: 'Implementation should start with the material gaps, then establish a recurring review rhythm and measurable closure checkpoints. First, management should resolve accountability and scope so later control work has an authorised owner and a defined population. Next, teams can document the operating standard, exception route and evidence requirement for the highest-priority pathways. The following horizon should embed recurring review, escalation and retention so the practice is not dependent on one individual or one location. Only after those foundations are in place can effectiveness measures show whether the intended control is being applied consistently. This sequence is based on the dependencies in the deterministic programme and does not introduce dates, costs or effort estimates that the assessment does not record.',
  conclusion: 'This assessment is a self-assessment interpretation and does not constitute independent validation or an assurance opinion. Progress should mean that the highest-priority pathways have named accountability, defined coverage, a usable interruption route and durable operating evidence. Management can then distinguish a designed control from one that is consistently applied and supported by proof. The recommended programme is intended to make that distinction visible, not to claim that the work is already complete. The next review should test the evidence requirements and the recorded decisions against the same population and score basis.'
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
