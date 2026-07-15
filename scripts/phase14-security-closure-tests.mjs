import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

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

const { validatePremiumReportAiEditorialPlan, normaliseAiIdentifier } = loadPureModule(
  'src/lib/reports/automation/ai-plan-validation.ts'
);
assert.equal(normaliseAiIdentifier('Ｄ１'), 'D1');
assert.equal(normaliseAiIdentifier('gap：Q１'), 'gap:Q1');

const evidence = {
  schemaVersion: 'mk-premium-ai-evidence-plan-v2',
  assessmentReference: 'TEST',
  organisationName: 'Test',
  packageName: 'Essential',
  scoreRunId: 'score',
  methodologyAuthority: 'deterministic',
  items: [
    { id: 'score:final_maturity', kind: 'final_maturity', label: 'Maturity', value: 'Developing' },
    { id: 'domain:D1', kind: 'domain', label: 'D1', value: {}, domainCode: 'D1' },
    { id: 'gap:Q1', kind: 'gap', label: 'Q1', value: {}, questionCode: 'Q1' }
  ]
};
const validPlan = {
  executiveEvidenceRefs: ['score:final_maturity'],
  falseComfortEvidenceRefs: ['gap:Q1'],
  leadershipEvidenceRefs: ['domain:D1'],
  domainEvidence: [{ domainCode: 'D1', evidenceRefs: ['domain:D1'] }],
  gapEvidence: [{ questionCode: 'Q1', evidenceRefs: ['gap:Q1'] }]
};
assert.equal(validatePremiumReportAiEditorialPlan(validPlan, evidence).ok, true);
assert.equal(validatePremiumReportAiEditorialPlan({
  ...validPlan,
  domainEvidence: [{ domainCode: 'Ｄ１', evidenceRefs: ['domain：Ｄ１'] }],
  gapEvidence: [{ questionCode: 'Ｑ１', evidenceRefs: ['gap：Ｑ１'] }]
}, evidence).ok, true, 'NFKC normalization must occur before identifier validation.');

for (const [label, prohibitedText] of [
  ['written-out score', 'The score is sixty-four.'],
  ['full-width digits', 'The score is ６４.'],
  ['range', 'Readiness is between 60–70%.'],
  ['qualified contradiction', 'Although labelled Developing, it is effectively Strategic.'],
  ['maturity synonym', 'The operating model is fully embedded.'],
  ['indirect exposure', 'The risk intensity is elevated.'],
  ['current-control assertion', 'Segregation of duties is operating effectively.'],
  ['roadmap completion assertion', 'The ninety-day action has already been implemented.']
]) {
  const result = validatePremiumReportAiEditorialPlan({
    ...validPlan,
    executiveDiagnosis: { body: prohibitedText }
  }, evidence);
  assert.equal(result.ok, false, label);
  assert(result.issues.some((entry) => entry.code === 'ai_schema_field_forbidden'), label);
}

const aiSchema = read('src/lib/reports/automation/ai-sdk-generator.ts');
assert.doesNotMatch(aiSchema, /body:\s*z\.string/);
assert.doesNotMatch(aiSchema, /title:\s*z\.string/);
assert.match(aiSchema, /domainEvidence/);
assert.match(aiSchema, /gapEvidence/);

const downloadRoute = read('src/app/score/api/admin/reports/[reportId]/download/route.ts');
const downloadService = read('src/lib/reports/premium-report-download.ts');
const downloadVerification = read('src/lib/reports/download-verification.ts');
assert.doesNotMatch(downloadRoute, /createSignedUrl/);
assert.match(downloadRoute, /Content-Disposition/);
assert.match(downloadService, /assert_premium_report_download_entitlement/);
assert.match(downloadService, /readVerifiedReportObject/);
assert.match(downloadVerification, /sha256/);
assert.match(downloadVerification, /record_phase14_operational_alert/);

const closure = read('supabase/migrations/0017_phase14_canonical_disabled_foundation.sql');
for (const assertion of [
  /status text not null default 'unsatisfied'/,
  /phase14_aal2_required/,
  /final_storage_path text/,
  /from storage\.objects/,
  /delivery_provider_acceptance_unresolved/,
  /provider_event_payload_conflict/,
  /finalize_premium_report_delivery/,
  /accounting_unverified/
]) assert.match(closure, assertion);

console.log('Phase 14 security closure, evidence-only AI schema, Unicode normalization and verified-download tests passed.');
