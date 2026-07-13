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

const migration = read('supabase/migrations/0017_phase14_autonomous_report_engine.sql');
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

assert.equal(exists('src/app/api/internal/phase14-uat/route.ts'), false);
assert.equal(exists('src/app/api/internal/phase14-uat-status/route.ts'), false);

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
assert.match(start, /await start\(premiumReportFulfilmentWorkflow, \[fulfilmentId\]\)/);
assert.match(start, /workflow_start_status:\s*'starting'/);
assert.match(start, /\.is\('workflow_run_id', null\)/);
assert.match(start, /\.in\('workflow_start_status', \['not_started', 'failed'\]\)/);

const workflow = read('src/workflows/premium-report-fulfilment.ts');
assert.match(workflow, /from 'workflow'/);
assert.match(workflow, /'use workflow'/);
assert.equal((workflow.match(/'use step'/g) ?? []).length, 4);
for (const step of ['validateFulfilmentStep','generateAndStoreReportStep','verifyDeliveryReadyStep','deliverReportEmailIfEnabledStep']) {
  assert.match(workflow, new RegExp(step));
}
assert.match(workflow, /flags\.autoEmailEnabled/);

const config = read('next.config.mjs');
assert.match(config, /from 'workflow\/next'/);
assert.match(config, /export default withWorkflow\(nextConfig\)/);
assert.match(config, /@sparticuz\/chromium\/bin/);
assert.match(config, /'puppeteer-core': 'commonjs puppeteer-core'/);
assert.doesNotMatch(config, /turbopack/);

const service = read('src/lib/reports/premium-report-service.ts');
for (const pattern of [
  /validatePremiumReportGenerationEntitlement/,
  /preparePremiumReportNarrative/,
  /renderHtmlToPdfBuffer/,
  /ready_for_email_delivery/,
  /report_generation_runs/,
  /fulfilment_id/,
  /reusedExistingReport/
]) assert.match(service, pattern);
assert.doesNotMatch(service, /mk_validated_assessment:\s*'mk_validated'/);

const payment = read('src/app/admin/orders/[orderReference]/status/route.ts');
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
  productCode: 'essential_self_assessment',
  orderStatus: 'payment_received',
  amountCents: 500000,
  currency: 'ZAR',
  productPriceCents: 500000,
  productCurrency: 'ZAR',
  requiresPaymentVerification: true,
  deliveryMode: 'mk_controlled_pdf',
  productActive: true,
  scoreRun: { id: 'score-run-id', assessmentId: 'assessment-id' }
};
assert.equal(validatePremiumReportGenerationEntitlement(eligibleReport), 'essential_self_assessment');
for (const testCase of [
  ['R50,000 personalised engagement', { productCode: 'mk_validated_assessment' }, 'order_not_eligible'],
  ['free product code', { productCode: 'free_snapshot' }, 'order_not_eligible'],
  ['awaiting payment', { orderStatus: 'awaiting_payment' }, 'order_not_eligible'],
  ['cancelled order', { orderStatus: 'cancelled' }, 'order_not_eligible'],
  ['expired order', { orderStatus: 'expired' }, 'order_not_eligible'],
  ['missing score run', { scoreRun: null }, 'assessment_not_scored'],
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
    { id: 'score:exposure_band', kind: 'exposure_band', label: 'Exposure band', value: 'High' },
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

console.log('Phase 14 autonomous report, entitlement guard, route isolation, durable workflow 4.6.0, deterministic validation and conditional email tests passed on Node 24.');
