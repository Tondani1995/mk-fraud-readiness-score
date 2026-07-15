import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
function loadPureModule(relativePath) {
  const output = ts.transpileModule(read(relativePath), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)((specifier) => {
    throw new Error(`Unexpected runtime dependency in pure module: ${specifier}`);
  }, module, module.exports);
  return module.exports;
}
const clone = (value) => JSON.parse(JSON.stringify(value));

const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
assert.equal(pkg.engines.node, '24.x');
assert.equal(pkg.dependencies.workflow, '4.6.0');
assert.equal(pkg.dependencies.ai, '6.0.83');
assert.equal(pkg.dependencies.zod, '4.1.8');
assert.equal(lock.packages['node_modules/workflow']?.version, '4.6.0');

const migration = read('supabase/migrations/0017_phase14_canonical_disabled_foundation.sql');
for (const pattern of [
  /create table if not exists public\.report_fulfilments/i,
  /create table if not exists public\.report_generation_runs/i,
  /report_fulfilments_one_active_order_uidx/i,
  /report_fulfilments_workflow_run_uidx/i,
  /premium_report_auto_fulfilment_enabled"\s*:\s*false/i,
  /premium_report_ai_narrative_enabled"\s*:\s*false/i,
  /premium_report_auto_email_enabled"\s*:\s*false/i,
  /r50000_automation_enabled"\s*:\s*false/i,
  /alter table public\.report_fulfilments enable row level security/i,
  /revoke all on table public\.report_fulfilments from anon, authenticated/i
]) assert.match(migration, pattern);
assert.doesNotMatch(migration, /grant\s+(insert|update|delete|all).*to\s+authenticated/i);

assert.equal(exists('src/app/score/api/internal/phase14-uat/route.ts'), false);
assert.equal(exists('src/app/score/api/internal/phase14-uat-status/route.ts'), false);

const flags = read('src/lib/reports/automation/feature-flags.ts');
assert.match(flags, /autoFulfilmentEnabled:\s*false/);
assert.match(flags, /aiNarrativeEnabled:\s*false/);
assert.match(flags, /autoEmailEnabled:\s*false/);
assert.match(flags, /automation remains disabled/);

const entitlement = read('src/lib/reports/report-entitlement.ts');
assert.match(entitlement, /ESSENTIAL_SELF_ASSESSMENT_PRICE_CENTS = 500000/);
assert.match(entitlement, /PREMIUM_REPORT_ELIGIBLE_ORDER_STATUS = 'payment_received'/);
assert.match(entitlement, /mk_validated_assessment/);
assert.match(entitlement, /Free products are not eligible/);

const fulfilment = read('src/lib/reports/automation/fulfilment.ts');
assert.match(fulfilment, /premium-report:\$\{orderId\}:\$\{scoreRunId\}/);
assert.match(fulfilment, /validatePremiumReportGenerationEntitlement\(assembled\)/);
assert.doesNotMatch(fulfilment, /product_not_automated/);

const start = read('src/lib/reports/automation/workflow-start.ts');
assert.match(start, /from 'workflow\/api'/);
assert.match(start, /await start\(premiumReportFulfilmentWorkflow, \[durableInput\]\)/);
assert.match(start, /PremiumReportFulfilmentWorkflowInput/);
assert.match(start, /claim_premium_report_workflow_start/);
assert.match(start, /mark_phase14_workflow_start_dispatching/);
assert.match(start, /record_premium_report_workflow_start/);
assert.match(start, /executePhase14WorkerStep/);
assert.match(start, /phase14_workflow_start_acceptance_uncertain/);

const workflow = read('src/workflows/premium-report-fulfilment.ts');
assert.match(workflow, /from 'workflow'/);
assert.match(workflow, /'use workflow'/);
assert.equal((workflow.match(/'use step'/g) ?? []).length, 5);
for (const step of ['validateFulfilmentStep','claimWorkerCapabilityStep','generateAndStoreReportStep','verifyDeliveryReadyStep','deliverReportEmailIfEnabledStep']) {
  assert.match(workflow, new RegExp(step));
}
assert.match(workflow, /flags\.autoEmailEnabled/);

{
  const output = ts.transpileModule(start, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  let serializedWorkflowArguments = '';
  const lease = { expectedStep: 'workflow_start_claim', leaseGeneration: 1 };
  let workerStep = 0;
  new Function('require', 'module', 'exports', output)((specifier) => {
    if (specifier === 'workflow/api') return {
      async start(_workflow, args) {
        serializedWorkflowArguments = JSON.stringify(args);
        return { runId: 'opaque-workflow-run' };
      }
    };
    if (specifier === '@/lib/reports/phase14-security') return {
      async claimPhase14WorkerCapability() { return lease; },
      async executePhase14WorkerStep(currentLease, action) {
        assert.equal(currentLease, lease);
        workerStep += 1;
        if (action === 'claim_premium_report_workflow_start') {
          return { claimed: true, outbox_id: 'outbox-opaque' };
        }
        if (action === 'record_premium_report_workflow_start') {
          return { status: 'started', run_id: 'opaque-workflow-run' };
        }
        return { status: 'acceptance_uncertain' };
      }
    };
    if (specifier === '@/workflows/premium-report-fulfilment') return { premiumReportFulfilmentWorkflow() {} };
    throw new Error(`Unexpected workflow-start dependency: ${specifier}`);
  }, module, module.exports);
  const result = await module.exports.startPremiumReportWorkflow({
    fulfilmentId: 'fulfilment-opaque',
    generationAuthorization: {
      capabilityId: 'generation-capability-opaque',
      capabilityType: 'automatic_generation',
      operationKey: 'generation-operation-opaque',
      expiresAt: '2099-01-01T00:00:00Z',
      authorityEpoch: 7,
      expectedStep: 'claim',
      orderId: null,
      assessmentId: null,
      scoreRunId: null,
      fulfilmentId: 'fulfilment-opaque',
      reportId: null,
      recipient: null,
      issueSecret: 'must-never-serialize',
      leaseToken: 'must-never-serialize'
    },
    deliveryCapabilityId: 'delivery-capability-opaque',
  });
  assert.equal(result.started, true);
  assert.equal(workerStep, 3);
  assert.deepEqual(JSON.parse(serializedWorkflowArguments), [{
    fulfilmentId: 'fulfilment-opaque',
    generationCapabilityId: 'generation-capability-opaque',
    deliveryCapabilityId: 'delivery-capability-opaque'
  }]);
  assert.doesNotMatch(serializedWorkflowArguments, /issueSecret|leaseToken|must-never-serialize/);
}

const config = read('next.config.mjs');
assert.match(config, /from 'workflow\/next'/);
assert.match(config, /export default withWorkflow\(nextConfig\)/);
assert.match(config, /@sparticuz\/chromium\/bin/);
assert.match(config, /'puppeteer-core': 'commonjs puppeteer-core'/);
assert.doesNotMatch(config, /turbopack/);

const service = read('src/lib/reports/premium-report-service-core.ts');
const storagePublication = read('src/lib/reports/storage-publication.ts');
for (const pattern of [
  /validatePremiumReportGenerationEntitlement/,
  /preparePremiumReportNarrative/,
  /renderHtmlToPdfBuffer/,
  /readyForEmailDelivery:\s*true/,
  /report_generation_runs/,
  /fulfilment_id/,
  /reusedExistingReport/
]) assert.match(service, pattern);
assert.doesNotMatch(service, /mk_validated_assessment:\s*'mk_validated'/);
assert.doesNotMatch(service, /removeOrphanedStorageObject/);
assert.match(service, /temporaryPath = `tmp\/\$\{assembled\.assessmentReference\}\/\$\{claimToken\}\/\$\{crypto\.randomUUID\(\)\}\.pdf`/);
assert.match(service, /commit_premium_report_draft/);
assert.match(service, /publishCommittedReportObject/);
assert.match(storagePublication, /publishReport/);
assert(service.indexOf("manualFunction: 'commit_premium_report_draft'") < service.lastIndexOf('publishCommittedReportObject({'), 'Report row/checksum must commit before final object publication.');
const publicationBody = storagePublication.slice(storagePublication.indexOf('export async function publishCommittedReportObject'));
assert(publicationBody.indexOf('.copy(') < publicationBody.indexOf('await verifyStoredReportChecksum'), 'Final object copy must precede checksum verification.');
assert(publicationBody.indexOf('await verifyStoredReportChecksum') < publicationBody.indexOf('await input.publishReport'), 'Final path must be checksum-verified before database publication.');
assert.match(service, /requirePhase14Action\(phase14Action\)/);
assert.match(service, /requirePhase14WorkerAction\(input\.workerLease, phase14Action\)/);
assert.match(service, /worker_claim_premium_report_generation/);
assert.match(service, /terminal_phase14_generation_publication/);
assert.match(service, /admin_terminal_phase14_generation_publication/);
assert.doesNotMatch(service, /worker_publish_premium_report_generation/);
assert.match(service, /recover_premium_report_generation_claim/);
assert.match(service, /renew_premium_report_generation_lease/);
assert.doesNotMatch(service, /p_final_storage_path/);

const durableAi = read('src/lib/reports/automation/durable-ai-attempts.ts');
assert.match(durableAi, /provider_request_key/);
assert.match(durableAi, /status:\s*'started'/);
assert.match(durableAi, /status:\s*'succeeded'/);
assert.match(durableAi, /provider_result_uncertain/);
assert.match(durableAi, /automatic replay is blocked/);
assert.match(durableAi, /PREMIUM_REPORT_AI_MAX_ATTEMPTS = 2/);
assert.match(durableAi, /PREMIUM_REPORT_AI_MAX_ESTIMATED_COST_MICROS/);
assert.match(durableAi, /PREMIUM_REPORT_AI_MAX_TOTAL_TOKENS/);
assert.match(durableAi, /accounting_unverified/);
assert.match(durableAi, /prompt_version/);
assert.match(durableAi, /schema_version/);
assert.match(durableAi, /inputSizeBytes/);

const aiGenerator = read('src/lib/reports/automation/ai-sdk-generator.ts');
assert.match(aiGenerator, /maxRetries:\s*0/);
assert.match(aiGenerator, /AbortSignal\.timeout\(PREMIUM_REPORT_AI_TIMEOUT_MS\)/);
assert.match(aiGenerator, /PREMIUM_REPORT_AI_MAX_OUTPUT_TOKENS = 3500/);

const remediationMigration = read('supabase/migrations/0017_phase14_canonical_disabled_foundation.sql');
for (const pattern of [
  /create table public\.report_generation_claims/i,
  /claim_owner text not null/i,
  /pg_advisory_xact_lock/i,
  /commit_premium_report_draft/i,
  /publish_premium_report_generation/i,
  /create table public\.report_ai_attempts/i
]) assert.match(remediationMigration, pattern);

const closureMigration = read('supabase/migrations/0017_phase14_canonical_disabled_foundation.sql');
for (const pattern of [
  /create table public\.phase14_security_gates/i,
  /satisfied_version integer not null default 0/i,
  /phase14_aal2_required/i,
  /recover_premium_report_generation_claim/i,
  /create table public\.report_delivery_authorizations/i,
  /finalize_premium_report_delivery/i,
  /provider_event_payload_conflict/i,
  /accounting_unverified/i
]) assert.match(closureMigration, pattern);

const remediationIntegration = read('scripts/phase14-remediation-integration-tests.sql');
assert.match(remediationIntegration, /worker-a/);
assert.match(remediationIntegration, /worker-b/);
assert.match(remediationIntegration, /deterministic supersession/i);
assert.match(remediationIntegration, /provider-event-stale-sent/);

const payment = read('src/app/score/admin/orders/[orderReference]/status/route.ts');
assert.match(payment, /flags\.autoFulfilmentEnabled/);
assert.match(payment, /queuePremiumReportFulfilment/);
assert.match(payment, /startPremiumReportWorkflow/);
assert.match(payment, /triggerSource:\s*'payment_confirmation'/);

const {
  validatePremiumReportGenerationEntitlement,
  ReportEntitlementError
} = loadPureModule('src/lib/reports/report-entitlement.ts');
const eligibleReport = {
  orderId: 'order-id',
  orderReference: 'ORDER-TEST',
  orderAssessmentId: 'assessment-id',
  assessmentId: 'assessment-id',
  currentScoreRunId: 'score-run-id',
  orderVerifiedAt: '2026-07-14T00:00:00.000Z',
  orderVerifiedBy: 'admin-id',
  productCode: 'essential_self_assessment',
  orderStatus: 'payment_received',
  amountCents: 500000,
  currency: 'ZAR',
  productPriceCents: 500000,
  productCurrency: 'ZAR',
  requiresPaymentVerification: true,
  deliveryMode: 'mk_controlled_pdf',
  productActive: true,
  expectedDomainResultCount: 10,
  actualDomainResultCount: 10,
  expectedQuestionTraceCount: 68,
  actualQuestionTraceCount: 68,
  scoreRun: {
    id: 'score-run-id',
    assessmentId: 'assessment-id',
    status: 'completed',
    lockedAt: '2026-07-14T00:00:00.000Z',
    inputHash: 'a'.repeat(64)
  }
};
assert.equal(validatePremiumReportGenerationEntitlement(eligibleReport), 'essential_self_assessment');
for (const testCase of [
  ['R50,000 personalised engagement', { productCode: 'mk_validated_assessment' }, 'order_not_eligible'],
  ['free product code', { productCode: 'free_snapshot' }, 'order_not_eligible'],
  ['awaiting payment', { orderStatus: 'awaiting_payment' }, 'order_not_eligible'],
  ['cancelled order', { orderStatus: 'cancelled' }, 'order_not_eligible'],
  ['expired order', { orderStatus: 'expired' }, 'order_not_eligible'],
  ['missing score run', { scoreRun: null }, 'assessment_not_scored'],
  ['unverified order', { orderVerifiedAt: null, orderVerifiedBy: null }, 'order_not_verified'],
  ['partially verified order', { orderVerifiedBy: null }, 'order_not_verified'],
  ['unlocked score run', { scoreRun: { ...eligibleReport.scoreRun, lockedAt: null } }, 'score_run_not_locked'],
  ['missing score input hash', { scoreRun: { ...eligibleReport.scoreRun, inputHash: null } }, 'score_run_input_hash_invalid'],
  ['stale current score reference', { currentScoreRunId: 'old-score-run' }, 'assessment_not_scored'],
  ['order assessment mismatch', { orderAssessmentId: 'other-assessment' }, 'relationship_mismatch'],
  ['score assessment mismatch', { scoreRun: { ...eligibleReport.scoreRun, assessmentId: 'other-assessment' } }, 'relationship_mismatch'],
  ['incomplete domain results', { actualDomainResultCount: 9 }, 'score_run_incomplete'],
  ['incomplete question traces', { actualQuestionTraceCount: 67 }, 'score_run_incomplete'],
  ['free order amount', { amountCents: 0 }, 'order_not_eligible'],
  ['free product price', { productPriceCents: 0 }, 'order_not_eligible'],
  ['unsupported currency', { currency: 'USD' }, 'order_not_eligible'],
  ['unsupported product currency', { productCurrency: 'USD' }, 'order_not_eligible'],
  ['payment verification not required', { requiresPaymentVerification: false }, 'order_not_eligible'],
  ['unsupported delivery mode', { deliveryMode: 'mk_led_validated_engagement' }, 'order_not_eligible'],
  ['inactive product', { productActive: false }, 'order_not_eligible']
]) {
  const [label, patch, reason] = testCase;
  assert.throws(
    () => validatePremiumReportGenerationEntitlement({ ...eligibleReport, ...patch }),
    (error) => error instanceof ReportEntitlementError && error.reason === reason,
    label
  );
}

const { validatePremiumReportNarrative } = loadPureModule('src/lib/reports/automation/validation.ts');
const evidence = {
  schemaVersion: 'mk-premium-narrative-v1',
  assessmentReference: 'MKFRS-TEST',
  organisationName: 'Test Organisation',
  packageName: 'Essential Self-Assessment Report',
  scoreRunId: 'score-run-test',
  methodologyAuthority: 'deterministic',
  items: [
    { id: 'score:overall', kind: 'overall_score', label: 'Overall score', value: 58 },
    { id: 'score:final_maturity', kind: 'final_maturity', label: 'Final maturity', value: 'Developing' },
    { id: 'score:exposure', kind: 'exposure_score', label: 'Exposure score', value: 41 },
    { id: 'score:exposure_band', kind: 'exposure_band', label: 'Exposure band', value: 'High' },
    { id: 'score:coverage', kind: 'coverage', label: 'Coverage', value: 83 },
    { id: 'gaps:critical_count', kind: 'gap_count', label: 'Critical gaps', value: 1 },
    { id: 'gaps:major_count', kind: 'gap_count', label: 'Major gaps', value: 2 },
    { id: 'domain:GOV', kind: 'domain', label: 'Governance', domainCode: 'GOV', value: { maturityBand: 'Developing', rawScore: 55 } },
    { id: 'domain:OPS', kind: 'domain', label: 'Operations', domainCode: 'OPS', value: { maturityBand: 'Structured', rawScore: 72 } },
    { id: 'gap:Q-GOV-01', kind: 'gap', label: 'Executive ownership', domainCode: 'GOV', questionCode: 'Q-GOV-01', value: { isCriticalGap: true } }
  ]
};
const valid = {
  executiveDiagnosis: { title: 'Leadership ownership must become repeatable', body: 'The evidence shows useful controls alongside a material governance weakness.', evidenceRefs: ['score:overall','score:final_maturity','gap:Q-GOV-01'] },
  falseComfort: { title: 'Documented activity is not tested readiness', body: 'Existing activity cannot compensate for the ownership gap.', evidenceRefs: ['domain:GOV','gap:Q-GOV-01'] },
  leadershipAttention: { body: 'Leadership should establish named ownership and evidence of completed corrective action.', evidenceRefs: ['score:final_maturity','domain:GOV'] },
  domainNarratives: [
    { domainCode: 'GOV', title: 'Governance needs clearer ownership', body: 'Governance needs consistent ownership and follow-through.', evidenceRefs: ['domain:GOV','gap:Q-GOV-01'] },
    { domainCode: 'OPS', title: 'Operations provide a useful base', body: 'Operational controls should be protected through testing and evidence.', evidenceRefs: ['domain:OPS'] }
  ],
  gapCommentary: [
    { questionCode: 'Q-GOV-01', body: 'The ownership gap weakens escalation and sustained remediation.', evidenceRefs: ['gap:Q-GOV-01','domain:GOV'] }
  ]
};
assert.equal(validatePremiumReportNarrative(valid, evidence).ok, true);
const missingDomain = clone(valid); missingDomain.domainNarratives.pop();
assert(validatePremiumReportNarrative(missingDomain, evidence).issues.some((issue) => issue.code === 'missing_domain_narrative'));
const unknown = clone(valid); unknown.executiveDiagnosis.evidenceRefs.push('domain:UNKNOWN');
assert(validatePremiumReportNarrative(unknown, evidence).issues.some((issue) => issue.code === 'unknown_evidence_ref'));
const benchmark = clone(valid); benchmark.executiveDiagnosis.body = 'This is above the industry average.';
assert(validatePremiumReportNarrative(benchmark, evidence).issues.some((issue) => issue.code === 'unsupported_benchmark'));
const unsupportedNumber = clone(valid); unsupportedNumber.executiveDiagnosis.body = 'This gives 99 percent fraud prevention certainty.';
assert(validatePremiumReportNarrative(unsupportedNumber, evidence).issues.some((issue) => issue.code === 'unsupported_numeric_claim'));
const domainBandContext = clone(valid);
domainBandContext.executiveDiagnosis.body = 'The organisation remains Developing overall, while Operations demonstrates Structured domain maturity.';
domainBandContext.executiveDiagnosis.evidenceRefs.push('domain:OPS');
assert.equal(validatePremiumReportNarrative(domainBandContext, evidence).ok, true);
const overallContradiction = clone(valid);
overallContradiction.executiveDiagnosis.body = 'The organisation is Strategic overall.';
assert(validatePremiumReportNarrative(overallContradiction, evidence).issues.some((issue) => issue.code === 'overall_maturity_contradiction'));
const reassignedMetricNumber = clone(valid);
reassignedMetricNumber.falseComfort.body = 'The exposure score is 58.';
reassignedMetricNumber.falseComfort.evidenceRefs = ['score:overall', 'score:exposure'];
assert(validatePremiumReportNarrative(reassignedMetricNumber, evidence).issues.some((issue) => issue.code === 'metric_number_reassignment'));
const outsideExecutiveContradiction = clone(valid);
outsideExecutiveContradiction.leadershipAttention.body = 'The organisation is Strategic overall.';
assert(validatePremiumReportNarrative(outsideExecutiveContradiction, evidence).issues.some((issue) => issue.code === 'maturity_evidence_mismatch'));
const indirectMaturity = clone(valid);
indirectMaturity.falseComfort.body = 'This is a fully embedded maturity operating model.';
assert(validatePremiumReportNarrative(indirectMaturity, evidence, new Date(), { prohibitMetricRestatement: true }).issues.some((issue) => issue.code === 'authoritative_maturity_restatement'));
const paraphrasedMetric = clone(valid);
paraphrasedMetric.leadershipAttention.body = 'Risk intensity score is 41.';
paraphrasedMetric.leadershipAttention.evidenceRefs = ['score:exposure'];
assert(validatePremiumReportNarrative(paraphrasedMetric, evidence, new Date(), { prohibitMetricRestatement: true }).issues.some((issue) => issue.code === 'authoritative_metric_restatement'));

console.log('Phase 14 autonomous report, entitlement guard, route isolation, durable workflow 4.6.0, deterministic validation and conditional email tests passed on Node 24.');
