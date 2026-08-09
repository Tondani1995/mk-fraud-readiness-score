#!/usr/bin/env node
/**
 * V6 closure contract: exposure grounding, contract-version authority, validation provenance.
 *
 * V6 (manual attempt 5d416211) proved the truncation fix: both AI attempts finished with reason
 * 'stop', 3,732 and 3,726 output tokens against the 6,500 ceiling, verified accounting, no
 * structured-output diagnostics. It still fell back, because the generated AND repaired prose used
 * exposure language ("The exposure position is driven by...", "unassessed exposure areas") on an
 * adaptive assessment whose evidence pack carries no exposure score or band. The validator was
 * right; the prompt never told the model the rule. No provider is called here.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PREMIUM_REPORT_PROMPT_VERSION,
  PREMIUM_REPORT_SCHEMA_VERSION
} from '../src/lib/reports/automation/types.ts';
import {
  buildPremiumReportGenerationPrompt,
  buildPremiumReportRepairPrompt,
  exposureAssessedForNarrative
} from '../src/lib/reports/automation/prompt.ts';
import { buildPremiumReportRepairScope } from '../src/lib/reports/automation/repair-scope.ts';
import {
  parsePremiumReportAutomationFlags,
  contractVersionMismatch
} from '../src/lib/reports/automation/feature-flags.ts';
import { PREMIUM_REPORT_STRUCTURED_OUTPUT_NAME } from '../src/lib/reports/automation/ai-sdk-generator.ts';

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok - ${name}`); }
  catch (error) { failures.push(name); console.log(`  not ok - ${name}\n    ${error.message}`); }
}

const EXPOSURE_WORD = /\bexposure\b/i;

function section(sectionId) {
  return {
    sectionId,
    purpose: 'p',
    requiredEvidenceRefs: ['domain:GOV'],
    allowedEvidenceRefs: ['domain:GOV'],
    requiredThemes: ['t'],
    maxCharacters: 650
  };
}
function brief() {
  return {
    version: 'b',
    executive: section('executive'),
    falseComfort: section('false_comfort'),
    leadership: section('leadership'),
    domains: { GOV: section('domain:GOV'), FIN: section('domain:FIN') },
    gaps: { Q1: section('gap:Q1'), Q2: section('gap:Q2') }
  };
}
function generationInput(items) {
  return {
    evidence: { schemaVersion: PREMIUM_REPORT_SCHEMA_VERSION, items },
    evidenceChecksum: 'a'.repeat(64),
    narrativeBrief: brief(),
    promptVersion: PREMIUM_REPORT_PROMPT_VERSION,
    schemaVersion: PREMIUM_REPORT_SCHEMA_VERSION
  };
}
const noExposureItems = [{ id: 'domain:GOV', kind: 'domain', domainCode: 'GOV', label: 'Governance', value: {} }];
const withExposureItems = [
  ...noExposureItems,
  { id: 'exposure:band', kind: 'exposure_band', label: 'Exposure band', value: { band: 'Moderate' } }
];

// ---------------------------------------------------------------- 1-2: generation prompt grounding
test('exposure not assessed -> generation prompt explicitly forbids exposure terminology', () => {
  const input = generationInput(noExposureItems);
  assert.equal(exposureAssessedForNarrative(input), false);
  const prompt = buildPremiumReportGenerationPrompt(input);
  assert.match(prompt, /Exposure was not assessed in this assessment/);
  assert.match(prompt, /do not use the word "exposure"/);
  assert.match(prompt, /"inherent fraud risk"/);
  assert.match(prompt, /fraud-risk areas, control weaknesses, risk events or readiness limitations/);
});
test('exposure assessed -> the instruction does not suppress a supported exposure conclusion', () => {
  const input = generationInput(withExposureItems);
  assert.equal(exposureAssessedForNarrative(input), true);
  const prompt = buildPremiumReportGenerationPrompt(input);
  assert.ok(!/Exposure was not assessed in this assessment/.test(prompt),
    'a measured exposure must never be told to suppress itself');
});

// -------------------------------------------------------------------- 3-5: repair scope precision
const exposureIssue = {
  code: 'adaptive_exposure_unsupported',
  path: 'narrative',
  message: 'Adaptive narrative must not include exposure claims when exposure was not assessed.',
  blocking: true
};
test('adaptive_exposure_unsupported repairs exactly executive + false comfort + leadership', () => {
  const scope = buildPremiumReportRepairScope({
    narrativeBrief: brief(),
    previousOutput: undefined,
    validationIssues: [exposureIssue]
  });
  assert.deepEqual([...scope.failedSectionIds].sort(),
    ['executive', 'false_comfort', 'leadership']);
});
test('domain and gap sections stay out of that repair scope so they are byte-preserved', () => {
  const scope = buildPremiumReportRepairScope({
    narrativeBrief: brief(),
    previousOutput: undefined,
    validationIssues: [exposureIssue]
  });
  for (const preserved of ['domain:GOV', 'domain:FIN', 'gap:Q1', 'gap:Q2']) {
    assert.ok(!scope.failedSectionIds.includes(preserved),
      `${preserved} must not be repaired for a root-narrative rule`);
  }
  // The old behaviour: an unrecognised path left wanted empty and expanded to all 19 sections.
  assert.notEqual(scope.failedSectionIds.length, 8);
});
test('the repair prompt carries the literal exposure correction instruction', () => {
  const input = { ...generationInput(noExposureItems), validationIssues: [exposureIssue], previousOutput: undefined };
  const prompt = buildPremiumReportRepairPrompt(input);
  assert.match(prompt, /Remove all "exposure" and "inherent fraud risk" wording/);
  assert.match(prompt, /Exposure was not assessed\./);
  assert.match(prompt, /cited readiness\/control\/risk evidence only/);
});
test('an unrelated failure does not attract the exposure correction', () => {
  const input = {
    ...generationInput(noExposureItems),
    validationIssues: [{ code: 'unsupported_number', path: 'executiveBody', message: 'x', blocking: true }],
    previousOutput: undefined
  };
  assert.ok(!/Remove all "exposure"/.test(buildPremiumReportRepairPrompt(input)));
});

// ------------------------------------------------------- 6-7: the validator itself is not weakened
test('the exposure validator still blocks the word and is untouched', () => {
  const validation = readFileSync('src/lib/reports/automation/validation.ts', 'utf8');
  assert.match(validation, /adaptive_exposure_unsupported/);
  assert.match(validation, /exposure\|inherent fraud risk/);
  // It must still be scoped to the three root bodies the rule is about.
  assert.match(validation, /executiveDiagnosis/);
  assert.match(validation, /falseComfort/);
  assert.match(validation, /leadershipAttention/);
});

// ------------------------------------------------- 8-9: validation provenance (initialValidation)
test('initialValidation records the repair-triggering result, not a passing plan check', () => {
  const pipeline = readFileSync('src/lib/reports/automation/narrative-pipeline.ts', 'utf8');
  // Structural-plan failure path passes the plan result.
  assert.match(pipeline, /initialValidation: planValidation,\s*\n\s*priorValidationIssues: planValidation\.issues/);
  // Narrative-grounding failure path passes the FULL narrative result.
  assert.match(pipeline, /initialValidation: validation,\s*\n\s*priorValidationIssues: validation\.issues/);
  // And nothing hard-codes planValidation into the persisted field any more.
  assert.ok(!/initialValidation: planValidation,\s*\n\s*repairValidation/.test(pipeline),
    'the repair result must carry the repair-triggering validation');
});

// --------------------------------------------------------- 10-14: contract-version authority
test('the compiled prompt and schema versions are authoritative', () => {
  assert.equal(PREMIUM_REPORT_PROMPT_VERSION, 'mk-essential-report-v6-advisory-editor-grounding');
  assert.equal(PREMIUM_REPORT_SCHEMA_VERSION, 'mk-essential-ai-advisory-editor-v5');
  // A database row cannot relabel the executable contract.
  const flags = parsePremiumReportAutomationFlags({
    premium_report_prompt_version: 'mk-premium-report-v2-evidence-plan',
    premium_report_schema_version: 'mk-premium-ai-evidence-plan-v2'
  });
  assert.equal(flags.promptVersion, PREMIUM_REPORT_PROMPT_VERSION);
  assert.equal(flags.schemaVersion, PREMIUM_REPORT_SCHEMA_VERSION);
});
test('DB v2 + compiled v6/v5 raises a safe mismatch that fails AI closed', () => {
  const flags = parsePremiumReportAutomationFlags({
    premium_report_ai_narrative_enabled: true,
    premium_report_prompt_version: 'mk-premium-report-v2-evidence-plan',
    premium_report_schema_version: 'mk-premium-ai-evidence-plan-v2'
  });
  assert.ok(flags.contractVersionMismatch, 'a disagreeing declaration must be reported');
  assert.match(flags.contractVersionMismatch, /^ai_contract_version_mismatch: /);
  // The diagnostic must carry version labels only -- no prose, no evidence.
  assert.ok(!/body|narrative|evidence:/i.test(flags.contractVersionMismatch));
  const manual = readFileSync('src/lib/reports/phase1-manual-fulfilment.ts', 'utf8');
  assert.match(manual, /aiNarrativeAllowed = flags\.aiNarrativeEnabled && !flags\.contractVersionMismatch/);
});
test('DB v6/v5 + compiled v6/v5 allows AI', () => {
  const flags = parsePremiumReportAutomationFlags({
    premium_report_ai_narrative_enabled: true,
    premium_report_prompt_version: PREMIUM_REPORT_PROMPT_VERSION,
    premium_report_schema_version: PREMIUM_REPORT_SCHEMA_VERSION
  });
  assert.equal(flags.contractVersionMismatch, null);
  assert.equal(flags.aiNarrativeEnabled, true);
});
test('a declaration that asserts nothing is not a mismatch', () => {
  assert.equal(contractVersionMismatch({}), null);
});
test('the durable attempt receives the compiled versions, so reuse cannot cross contracts', () => {
  const flags = parsePremiumReportAutomationFlags({
    premium_report_prompt_version: 'mk-premium-report-v2-evidence-plan'
  });
  assert.equal(flags.promptVersion, PREMIUM_REPORT_PROMPT_VERSION);
  const durable = readFileSync('src/lib/reports/automation/durable-ai-attempts.ts', 'utf8');
  // schema_version participates in the reuse fingerprint, which is why the label must be true.
  assert.match(durable, /\.eq\('schema_version', fingerprint\.schemaVersion\)/);
  assert.notEqual(PREMIUM_REPORT_SCHEMA_VERSION, 'mk-premium-ai-evidence-plan-v2');
});

// ----------------------------------------------- 15-16: provider metadata and contract duplication
test('the provider structured-output name matches the schema contract', () => {
  assert.equal(PREMIUM_REPORT_STRUCTURED_OUTPUT_NAME, 'mk_essential_ai_advisory_editor_v5');
  const generator = readFileSync('src/lib/reports/automation/ai-sdk-generator.ts', 'utf8');
  // The literal may still appear in the comment explaining the drift; what must be gone is its use
  // as the provider-facing name.
  assert.ok(!/name:\s*'mk_essential_report_v4_advisory_editor'/.test(generator),
    'the stale v4 provider schema name must no longer be sent to the provider');
  // Derived, not restated, so it cannot lag the schema version again.
  assert.match(generator, /name: PREMIUM_REPORT_STRUCTURED_OUTPUT_NAME/);
});
test('there is exactly one provider-contract representation in the repository', () => {
  const prompt = readFileSync('src/lib/reports/automation/prompt.ts', 'utf8');
  assert.ok(!/export const PREMIUM_REPORT_NARRATIVE_JSON_SCHEMA/.test(prompt),
    'the dead hand-maintained JSON schema must not return');
  assert.match(prompt, /PREMIUM_REPORT_NARRATIVE_JSON_SCHEMA was retired/);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
