import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function loadPureModule(relativePath) {
  const output = ts.transpileModule(read(relativePath), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)((specifier) => {
    throw new Error(`Unexpected runtime dependency in pure module: ${specifier}`);
  }, module, module.exports);
  return module.exports;
}

const { validatePremiumReportNarrative } = loadPureModule('src/lib/reports/automation/validation.ts');

const baseEvidenceItems = [
  { id: 'score:scale_max', kind: 'score_scale', label: 'Score scale maximum', value: { scale: 'fraud_readiness_score', maximum: 100, unit: 'points' } },
  { id: 'score:overall', kind: 'overall_score', label: 'Overall score', value: 58.15 },
  { id: 'score:final_maturity', kind: 'final_maturity', label: 'Final maturity', value: 'Developing' },
  { id: 'score:exposure', kind: 'exposure_score', label: 'Exposure score', value: 41 },
  { id: 'score:exposure_band', kind: 'exposure_band', label: 'Exposure band', value: 'High' },
  { id: 'score:coverage', kind: 'coverage', label: 'Coverage', value: 83.75 },
  { id: 'gaps:critical_count', kind: 'gap_count', label: 'Critical gaps', value: 1 },
  { id: 'gaps:major_count', kind: 'gap_count', label: 'Major gaps', value: 2 },
  { id: 'domain:D1', kind: 'domain', label: 'Governance', domainCode: 'D1', value: { maturityBand: 'Developing', rawScore: 55 } },
  { id: 'gap:D1-Q01', kind: 'gap', label: 'Ownership', domainCode: 'D1', questionCode: 'D1-Q01', value: { isCriticalGap: true } }
];

function evidence(extra = []) {
  return {
    schemaVersion: 'mk-essential-ai-advisory-editor-v5',
    assessmentReference: 'MKFRS-TEST',
    organisationName: 'Test Organisation',
    packageName: 'Essential Self-Assessment Report',
    scoreRunId: 'score-run-test',
    methodologyAuthority: 'deterministic',
    items: [...baseEvidenceItems, ...extra]
  };
}

function narrative(body, refs = ['score:final_maturity']) {
  return {
    executiveDiagnosis: { title: 'Readiness result', body, evidenceRefs: refs },
    falseComfort: { title: 'Read carefully', body: 'The evidence should be reviewed against the named findings.', evidenceRefs: ['score:final_maturity'] },
    leadershipAttention: { body: 'Leadership should maintain named ownership and evidence of follow-through.', evidenceRefs: ['score:final_maturity'] },
    domainNarratives: [{ domainCode: 'D1', title: 'Governance', body: 'Governance needs consistent ownership.', evidenceRefs: ['domain:D1'] }],
    gapCommentary: [{ questionCode: 'D1-Q01', body: 'The ownership gap needs a defined corrective action.', evidenceRefs: ['gap:D1-Q01', 'domain:D1'] }]
  };
}

function violations(result) {
  return result.issues.map((item) => item.code);
}

// The corrected canonical score-scale fact is allowed only when the section cites it.
assert.equal(validatePremiumReportNarrative(
  narrative('The organisation scored 58 out of 100.', ['score:scale_max', 'score:overall', 'score:final_maturity']),
  evidence()
).ok, true);

// Numeric characters in the exact customer-entered organisation name are identity text, not a
// report claim; the surrounding score claim remains fully validated.
const namedOrganisation = evidence();
namedOrganisation.organisationName = 'MK G27 QA - Adaptive Paid Report 20260804';
assert.equal(validatePremiumReportNarrative(
  narrative('MK G27 QA - Adaptive Paid Report 20260804 scored 58 out of 100.', ['score:scale_max', 'score:overall', 'score:final_maturity']),
  namedOrganisation
).ok, true);

// Invented percentage, currency and control-count claims remain blocked.
assert(violations(validatePremiumReportNarrative(narrative('The result is 99% reliable.'), evidence())).includes('unsupported_numeric_claim'));
assert(violations(validatePremiumReportNarrative(narrative('The payment value is 7500.'), evidence())).includes('unsupported_numeric_claim'));
assert(violations(validatePremiumReportNarrative(narrative('The assessment has 17 critical controls.'), evidence())).includes('unsupported_numeric_claim'));

// Adaptive facts must be registered as named evidence items; presence in prose is not enough.
assert(violations(validatePremiumReportNarrative(narrative('Control visibility is 97.5%.'), evidence())).includes('unsupported_numeric_claim'));
assert.equal(validatePremiumReportNarrative(
  narrative('The assessment includes 68 applicable controls.', ['adaptive:applicable_count', 'score:final_maturity']),
  evidence([{ id: 'adaptive:applicable_count', kind: 'score_scale', label: 'Applicable control count', value: { metric: 'applicable_count', value: 68 } }])
).ok, true);
assert.equal(validatePremiumReportNarrative(
  narrative('Control visibility is 97.5%.', ['adaptive:control_visibility', 'score:final_maturity']),
  evidence([{ id: 'adaptive:control_visibility', kind: 'score_scale', label: 'Control visibility', value: { metric: 'control_visibility_pct', value: 97.5 } }])
).ok, true);

// Formatting tricks cannot turn an unsupported number into a supported claim.
assert(violations(validatePremiumReportNarrative(narrative('Coverage is 83,75%.', ['score:coverage', 'score:final_maturity']), evidence()))
  .includes('unsupported_numeric_claim'));

// Contract-approved roadmap timing numbers pass only when backed by the roadmap evidence item.
assert.equal(validatePremiumReportNarrative(
  narrative('The 30-day, 60-day and 90-day actions are linked to the finding.', ['roadmap:D1', 'score:final_maturity']),
  evidence([{ id: 'roadmap:D1', kind: 'roadmap', label: 'Governance roadmap', value: { timingDays: [30, 60, 90], action30: '30 days', action60: '60 days', action90: '90 days' } }])
).ok, true);

// Adaptive result withholding remains fail-closed in the scoring and template contracts.
const adaptiveScoring = read('src/lib/scoring/adaptive-scoring.ts');
const reportTemplate = read('src/lib/reports/templates/report-template.ts');
assert.match(adaptiveScoring, /INSUFFICIENT_VISIBILITY/);
assert.match(adaptiveScoring, /numeric Fraud Readiness Score is withheld/);
assert.match(reportTemplate, /insufficientVisibility \? 'Not issued'/);

console.log('G27 commercial-report numeric evidence regression tests passed.');
