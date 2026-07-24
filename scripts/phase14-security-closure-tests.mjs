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
    if (specifier === './narrative-brief') {
      return loadPureModule('src/lib/reports/automation/narrative-brief.ts');
    }
    if (specifier === './types') {
      return { PREMIUM_REPORT_AI_BODY_MAX_CHARS: 2500 };
    }
    if (specifier === '../commercial-quality') {
      return {
        COMMERCIAL_QUALITY_SAFE_ADMIN_MESSAGE: 'Safe test-only commercial-quality message.',
        ReportCommercialQualityError: class ReportCommercialQualityError extends Error {}
      };
    }
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
  executiveBody: 'The organisation shows a Developing maturity position based on the cited evidence.',
  falseComfortEvidenceRefs: ['gap:Q1', 'score:final_maturity'],
  falseComfortBody: 'A single strong control does not offset the cited gap.',
  leadershipEvidenceRefs: ['domain:D1', 'gap:Q1', 'score:final_maturity'],
  leadershipBody: 'Leadership should prioritise the D1 domain given the cited evidence.',
  domainEvidence: [{ domainCode: 'D1', evidenceRefs: ['domain:D1'], body: 'Domain D1 requires attention based on its cited evidence.' }],
  gapEvidence: [{ questionCode: 'Q1', evidenceRefs: ['gap:Q1'], body: 'This gap remains open based on the cited evidence.' }]
};
const validPlanResult = validatePremiumReportAiEditorialPlan(validPlan, evidence);
assert.equal(validPlanResult.ok, true, JSON.stringify(validPlanResult.issues));
assert.equal(validatePremiumReportAiEditorialPlan({
  ...validPlan,
  domainEvidence: [{ domainCode: 'Ｄ１', evidenceRefs: ['domain：Ｄ１'], body: validPlan.domainEvidence[0].body }],
  gapEvidence: [{ questionCode: 'Ｑ１', evidenceRefs: ['gap：Ｑ１'], body: validPlan.gapEvidence[0].body }]
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

// Schema v3 (docs/v1/phase14/ai-narrative-fix.md): the AI is now permitted to draft bounded,
// evidence-grounded body prose (previously it was evidence-references-only and its output was
// silently discarded -- see Phase 14 Independent Review C1). It must never receive a "title"
// field (titles stay MK-authored/deterministic) and every body field must be length-bounded.
const aiSchema = read('src/lib/reports/automation/ai-sdk-generator.ts');
assert.match(aiSchema, /body:\s*(z\.string|narrativeBody)/);
assert.doesNotMatch(aiSchema, /title:\s*z\.string/);
assert.match(aiSchema, /narrativeBody\s*=\s*z\.string\(\)\.min\(1\)\.max\(/, 'AI body fields must be length-bounded.');
assert.match(aiSchema, /domainEvidence/);
assert.match(aiSchema, /gapEvidence/);

// The full-narrative fact-checker must actually run on AI output before it can reach the report
// (C1 fix): buildAndValidateAiNarrative in narrative-pipeline.ts must call the same
// validatePremiumReportNarrative used for deterministic content, and the resulting narrative --
// not the deterministic one -- must be what is returned for 'ai' and 'ai_repair' modes.
const pipelineSource = read('src/lib/reports/automation/narrative-pipeline.ts');
assert.match(pipelineSource, /buildAndValidateAiNarrative/);
assert.match(pipelineSource, /aiPlanToNarrative/);
assert.doesNotMatch(
  pipelineSource,
  /mode:\s*'ai',[\s\S]{0,80}narrative:\s*buildDeterministicNarrative/,
  'AI-mode results must not silently substitute deterministic content.'
);

const downloadRoute = read('src/app/score/api/admin/reports/[reportId]/download/route.ts');
const downloadService = read('src/lib/reports/premium-report-download.ts');
const downloadVerification = read('src/lib/reports/download-verification.ts');
const phase1DownloadAccess = read('src/lib/reports/phase1-report-access.ts');
assert.doesNotMatch(downloadRoute, /createSignedUrl/);
assert.match(downloadRoute, /createSecurePhase1ReportAccess/);
assert.match(phase1DownloadAccess, /download: report\.file_name/);
assert.match(phase1DownloadAccess, /ACCESS_TTL_SECONDS = 60/);
assert.match(phase1DownloadAccess, /createHash\('sha256'\)/);
assert.match(downloadService, /assert_premium_report_download_entitlement/);
assert.match(downloadService, /readVerifiedReportObject/);
assert.match(downloadVerification, /sha256/);
assert.match(downloadVerification, /record_phase14_operational_alert/);

// L1: strengthen secret-leak/output validation. The prior denylist only matched infrastructure
// vocabulary phrases ("api key", "service role"); it did not catch an actual credential-shaped
// string or an email address if one somehow appeared in AI-generated narrative text. Prove the
// new pattern-based checks in validation.ts actually reject each credential/PII shape, and that
// ordinary evidence-grounded prose (no such shapes present) is unaffected.
{
  const { validatePremiumReportNarrative } = loadPureModule('src/lib/reports/automation/validation.ts');
  const l1Evidence = {
    schemaVersion: 'mk-premium-ai-evidence-plan-v2',
    assessmentReference: 'TEST-L1',
    organisationName: 'Test Org',
    packageName: 'Essential',
    scoreRunId: 'score-l1',
    methodologyAuthority: 'deterministic',
    items: [
      { id: 'score:final_maturity', kind: 'final_maturity', label: 'Maturity', value: 'Developing' }
    ]
  };
  const baseNarrative = () => ({
    executiveDiagnosis: { title: 'Executive summary', body: 'The organisation shows a Developing maturity position.', evidenceRefs: ['score:final_maturity'] },
    falseComfort: { title: 'False comfort', body: 'A single strong control does not offset other exposure.', evidenceRefs: [] },
    leadershipAttention: { body: 'Leadership should prioritise remediation.', evidenceRefs: [] },
    domainNarratives: [],
    gapCommentary: []
  });

  const clean = validatePremiumReportNarrative(baseNarrative(), l1Evidence);
  assert.equal(clean.ok, true, 'ordinary evidence-grounded prose must not be flagged by the L1 patterns');

  const l1Cases = [
    ['email_address_leakage', 'Please contact ops@internal-example.com for follow-up.'],
    ['jwt_like_token', 'Token observed: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFPGQGtiTb8'],
    ['cloud_credential_pattern', 'Leaked identifier AKIAABCDEFGHIJKLMNOP was noted.'],
    ['vendor_secret_pattern', 'A key sk-abcdefghijklmnopqrstuvwx appeared in the draft.'],
    ['opaque_hex_token', 'Reference 9f8c7b6a5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b was cited.'],
    ['supabase_project_url', 'See https://abcdefghijklmno.supabase.co for details.']
  ];
  for (const [code, poisonedBody] of l1Cases) {
    const narrative = baseNarrative();
    narrative.executiveDiagnosis.body += ` ${poisonedBody}`;
    const result = validatePremiumReportNarrative(narrative, l1Evidence);
    assert.equal(result.ok, false, `${code} must be rejected`);
    assert(result.issues.some((entryIssue) => entryIssue.code === code), `${code} must produce a matching issue code`);
  }
}

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
