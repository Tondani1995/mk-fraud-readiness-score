import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function loadCommonJsFromTypeScript(relativePath) {
  const source = read(relativePath);
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    },
    fileName: relativePath
  }).outputText;
  const module = { exports: {} };
  const execute = new Function('require', 'module', 'exports', output);
  execute((specifier) => {
    throw new Error(`Unexpected runtime dependency in pure validation module: ${specifier}`);
  }, module, module.exports);
  return module.exports;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const packageJson = JSON.parse(read('package.json'));
const packageLock = JSON.parse(read('package-lock.json'));
assert.equal(packageJson.engines.node, '20.x', 'Node 20 Chromium guard must remain intact.');
assert.equal(packageJson.dependencies['@workflow/core'], '4.0.1-beta.23', 'Workflow core runtime must remain pinned.');
assert.equal(packageJson.dependencies['@workflow/errors'], '4.0.1-beta.7', 'Workflow error contract must remain pinned.');
assert.equal(packageJson.dependencies['@workflow/next'], '4.0.1-beta.26', 'Workflow Next integration must remain pinned.');
assert.equal(packageJson.dependencies.workflow, undefined, 'The Workflow meta-package must not reintroduce its Node 22-only CLI dependency.');
assert.equal(packageJson.dependencies.ai, '6.0.83', 'Node-20-compatible AI SDK version must remain pinned.');
assert.equal(packageJson.dependencies.zod, '4.1.8', 'Structured-output schema dependency must remain pinned.');
assert.equal(packageLock.packages['node_modules/@workflow/core']?.version, '4.0.1-beta.23');
assert.equal(packageLock.packages['node_modules/@workflow/errors']?.version, '4.0.1-beta.7');
assert.equal(packageLock.packages['node_modules/@workflow/next']?.version, '4.0.1-beta.26');
assert.equal(packageLock.packages['node_modules/workflow'], undefined, 'Workflow meta-package must be absent from the committed lockfile.');
assert.equal(packageLock.packages['node_modules/mixpart'], undefined, 'Node 22-only mixpart must be absent from the committed lockfile.');

const migration = read('supabase/migrations/0017_phase14_autonomous_report_engine.sql');
assert.match(migration, /create table if not exists public\.report_fulfilments/i);
assert.match(migration, /create table if not exists public\.report_generation_runs/i);
assert.match(migration, /report_fulfilments_one_active_order_uidx/i);
assert.match(migration, /constraint report_fulfilments_idempotency_key_unique/i);
assert.match(migration, /workflow_start_status text not null default 'not_started'/i);
assert.match(migration, /workflow_run_id text/i);
assert.match(migration, /report_fulfilments_workflow_run_uidx/i);
assert.match(migration, /premium_report_auto_fulfilment_enabled"\s*:\s*false/i);
assert.match(migration, /premium_report_ai_narrative_enabled"\s*:\s*false/i);
assert.match(migration, /premium_report_auto_email_enabled"\s*:\s*false/i);
assert.match(migration, /r50000_automation_enabled"\s*:\s*false/i);
assert.match(migration, /alter table public\.report_fulfilments enable row level security/i);
assert.match(migration, /revoke all on table public\.report_fulfilments from anon, authenticated/i);
assert.doesNotMatch(migration, /grant\s+(insert|update|delete|all)\s+on\s+table\s+public\.report_fulfilments\s+to\s+authenticated/i);

const flagsSource = read('src/lib/reports/automation/feature-flags.ts');
assert.match(flagsSource, /autoFulfilmentEnabled:\s*false/);
assert.match(flagsSource, /aiNarrativeEnabled:\s*false/);
assert.match(flagsSource, /autoEmailEnabled:\s*false/);
assert.match(flagsSource, /Phase 14 feature flags could not be loaded; automation remains disabled/);

const fulfilmentSource = read('src/lib/reports/automation/fulfilment.ts');
assert.match(fulfilmentSource, /premium-report:\$\{orderId\}:\$\{scoreRunId\}/);
assert.match(fulfilmentSource, /assembled\.productCode !== 'essential_self_assessment'/);
assert.match(fulfilmentSource, /product_not_automated/);
assert.doesNotMatch(fulfilmentSource, /mk_validated_assessment.*automated/i);

const workflowStart = read('src/lib/reports/automation/workflow-start.ts');
assert.match(workflowStart, /from '@workflow\/core\/runtime'/);
assert.match(workflowStart, /await start\(premiumReportFulfilmentWorkflow, \[fulfilmentId\]\)/);
assert.match(workflowStart, /workflow_start_status:\s*'starting'/);
assert.match(workflowStart, /\.is\('workflow_run_id', null\)/);
assert.match(workflowStart, /\.in\('workflow_start_status', \['not_started', 'failed'\]\)/);
assert.match(workflowStart, /workflow_start_status:\s*'failed'/);

const workflowSource = read('src/workflows/premium-report-fulfilment.ts');
assert.match(workflowSource, /from '@workflow\/errors'/);
assert.match(workflowSource, /'use workflow'/);
assert.equal((workflowSource.match(/'use step'/g) ?? []).length, 3, 'Workflow must expose three durable steps.');
assert.match(workflowSource, /validateFulfilmentStep/);
assert.match(workflowSource, /generateAndStoreReportStep/);
assert.match(workflowSource, /verifyDeliveryReadyStep/);
assert.match(workflowSource, /processPremiumReportFulfilment/);

const nextConfig = read('next.config.mjs');
assert.match(nextConfig, /from '@workflow\/next'/);
assert.match(nextConfig, /export default withWorkflow\(nextConfig\)/);
assert.match(nextConfig, /@sparticuz\/chromium\/bin/);
assert.match(nextConfig, /'puppeteer-core': 'commonjs puppeteer-core'/);

const serviceSource = read('src/lib/reports/premium-report-service.ts');
assert.match(serviceSource, /preparePremiumReportNarrative/);
assert.match(serviceSource, /renderHtmlToPdfBuffer/);
assert.match(serviceSource, /ready_for_email_delivery/);
assert.match(serviceSource, /report_generation_runs/);
assert.match(serviceSource, /fulfilment_id/);
assert.match(serviceSource, /reusedExistingReport/);
assert.doesNotMatch(serviceSource, /resend\.emails\.send/);

const adminRoute = read('src/app/api/admin/orders/[orderReference]/generate-report/route.ts');
assert.match(adminRoute, /generatePremiumReport/);
assert.doesNotMatch(adminRoute, /renderHtmlToPdfBuffer/);
assert.doesNotMatch(adminRoute, /selectContent/);

const paymentRoute = read('src/app/admin/orders/[orderReference]/status/route.ts');
assert.match(paymentRoute, /getPremiumReportAutomationFlags/);
assert.match(paymentRoute, /flags\.autoFulfilmentEnabled/);
assert.match(paymentRoute, /queuePremiumReportFulfilment/);
assert.match(paymentRoute, /startPremiumReportWorkflow/);
assert.match(paymentRoute, /triggerSource:\s*'payment_confirmation'/);
assert.match(paymentRoute, /workflow_started/);
assert.doesNotMatch(paymentRoute, /generatePremiumReport\(/);

const adminPage = read('src/app/admin/orders/[orderReference]/page.tsx');
assert.match(adminPage, /Autonomous fulfilment/);
assert.match(adminPage, /Manual generate \/ regenerate fallback/);
assert.match(adminPage, /Automatic customer email delivery is enabled separately/);

const { validatePremiumReportNarrative } = loadCommonJsFromTypeScript('src/lib/reports/automation/validation.ts');
assert.equal(typeof validatePremiumReportNarrative, 'function');

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

const validNarrative = {
  executiveDiagnosis: {
    title: 'A foundation exists, but leadership ownership needs to become repeatable',
    body: 'The assessment shows useful controls alongside a material governance weakness that changes how the overall position should be understood.',
    evidenceRefs: ['score:final_maturity', 'score:overall', 'gap:Q-GOV-01']
  },
  falseComfort: {
    title: 'Documented activity should not be mistaken for tested readiness',
    body: 'The strongest controls will not compensate for a core ownership weakness unless accountability and evidence become routine.',
    evidenceRefs: ['gap:Q-GOV-01', 'domain:GOV']
  },
  leadershipAttention: {
    body: 'Leadership should establish named ownership, a review rhythm and evidence that corrective action is completed.',
    evidenceRefs: ['score:final_maturity', 'domain:GOV']
  },
  domainNarratives: [
    {
      domainCode: 'GOV',
      title: 'Governance needs clearer ownership',
      body: 'Governance activity exists, but ownership and follow-through need to operate as a consistent management discipline.',
      evidenceRefs: ['domain:GOV', 'gap:Q-GOV-01']
    },
    {
      domainCode: 'OPS',
      title: 'Operational controls provide a useful base',
      body: 'Operational controls are functioning and should now be protected through evidence, testing and clear exception handling.',
      evidenceRefs: ['domain:OPS']
    }
  ],
  gapCommentary: [
    {
      questionCode: 'Q-GOV-01',
      body: 'The absence of clear executive ownership weakens escalation and makes sustained corrective action less reliable.',
      evidenceRefs: ['gap:Q-GOV-01', 'domain:GOV']
    }
  ]
};

const validResult = validatePremiumReportNarrative(validNarrative, evidence, new Date('2026-07-12T00:00:00Z'));
assert.equal(validResult.ok, true, JSON.stringify(validResult.issues));

const missingDomain = clone(validNarrative);
missingDomain.domainNarratives.pop();
assert.equal(validatePremiumReportNarrative(missingDomain, evidence).issues.some((item) => item.code === 'missing_domain_narrative'), true);

const unknownReference = clone(validNarrative);
unknownReference.executiveDiagnosis.evidenceRefs.push('domain:UNKNOWN');
assert.equal(validatePremiumReportNarrative(unknownReference, evidence).issues.some((item) => item.code === 'unknown_evidence_ref'), true);

const unsupportedBenchmark = clone(validNarrative);
unsupportedBenchmark.executiveDiagnosis.body = 'This result is above the industry average.';
assert.equal(validatePremiumReportNarrative(unsupportedBenchmark, evidence).issues.some((item) => item.code === 'unsupported_benchmark'), true);

const unsupportedNumber = clone(validNarrative);
unsupportedNumber.executiveDiagnosis.body = 'The organisation has a 99 percent certainty of preventing fraud.';
assert.equal(validatePremiumReportNarrative(unsupportedNumber, evidence).issues.some((item) => item.code === 'unsupported_numeric_claim'), true);

const missingOwnEvidence = clone(validNarrative);
missingOwnEvidence.domainNarratives[0].evidenceRefs = ['score:overall'];
assert.equal(validatePremiumReportNarrative(missingOwnEvidence, evidence).issues.some((item) => item.code === 'missing_own_evidence'), true);

console.log('Phase 14 autonomous premium-report foundation tests passed, including supported durable workflow packages, deterministic validation and no-email boundaries.');
