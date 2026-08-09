#!/usr/bin/env node
/**
 * Permanent output-envelope contract for the premium-report structured output.
 *
 * V5 (manual attempt cca0524c, AI attempt 50b0a33e, openai/gpt-5.5) reached the provider, was
 * accounted for -- 10,850 in / 5,000 out / 15,850 total, 44,640 ms, 204,250 micros, verified -- and
 * still failed with finishReason 'length', rawFinishReason 'max_output_tokens', settling as
 * structured_output_truncated. The output envelope, not the input, was the cause: a single 2,000
 * character default across 19 bodies permitted ~33,200 narrative characters.
 *
 * These tests hold the corrected envelope in place. No provider is called.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PREMIUM_REPORT_AI_BODY_MAX_CHARS,
  PREMIUM_REPORT_AI_SECTION_BODY_MAX_CHARS,
  PREMIUM_REPORT_PROMPT_VERSION,
  PREMIUM_REPORT_SCHEMA_VERSION
} from '../src/lib/reports/automation/types.ts';
import {
  premiumReportNarrativeSchema,
  PREMIUM_REPORT_AI_MAX_OUTPUT_TOKENS,
  PREMIUM_REPORT_AI_MAX_DOMAIN_SECTIONS,
  PREMIUM_REPORT_AI_MAX_GAP_SECTIONS
} from '../src/lib/reports/automation/ai-sdk-generator.ts';
import { ESSENTIAL_CAPS } from '../src/lib/reports/essential-projection.ts';

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok - ${name}`); }
  catch (error) { failures.push(name); console.log(`  not ok - ${name}\n    ${error.message}`); }
}

const LIMITS = PREMIUM_REPORT_AI_SECTION_BODY_MAX_CHARS;
const body = (n) => 'a'.repeat(n);
const refs = ['domain:GOV'];

function payload(overrides = {}) {
  return {
    executiveEvidenceRefs: refs,
    executiveBody: body(10),
    falseComfortEvidenceRefs: refs,
    falseComfortBody: body(10),
    leadershipEvidenceRefs: refs,
    leadershipBody: body(10),
    domainEvidence: [{ domainCode: 'GOV', evidenceRefs: refs, body: body(10) }],
    gapEvidence: [{ questionCode: 'Q1', evidenceRefs: refs, body: body(10) }],
    ...overrides
  };
}
const accepts = (p) => premiumReportNarrativeSchema.safeParse(p).success;

// ---------------------------------------------------------------- 1-6: field maxima are enforced
test('executive body above 1,200 characters is rejected', () => {
  assert.equal(LIMITS.executive, 1200);
  assert.equal(accepts(payload({ executiveBody: body(LIMITS.executive + 1) })), false);
});
test('false-comfort body above 800 characters is rejected', () => {
  assert.equal(LIMITS.falseComfort, 800);
  assert.equal(accepts(payload({ falseComfortBody: body(LIMITS.falseComfort + 1) })), false);
});
test('leadership body above 800 characters is rejected', () => {
  assert.equal(LIMITS.leadership, 800);
  assert.equal(accepts(payload({ leadershipBody: body(LIMITS.leadership + 1) })), false);
});
test('domain body above 650 characters is rejected', () => {
  assert.equal(LIMITS.domain, 650);
  assert.equal(accepts(payload({
    domainEvidence: [{ domainCode: 'GOV', evidenceRefs: refs, body: body(LIMITS.domain + 1) }]
  })), false);
});
test('gap body above 550 characters is rejected', () => {
  assert.equal(LIMITS.gap, 550);
  assert.equal(accepts(payload({
    gapEvidence: [{ questionCode: 'Q1', evidenceRefs: refs, body: body(LIMITS.gap + 1) }]
  })), false);
});
test('a body of exactly the maximum is accepted for every section type', () => {
  assert.ok(accepts(payload({ executiveBody: body(LIMITS.executive) })), 'executive boundary');
  assert.ok(accepts(payload({ falseComfortBody: body(LIMITS.falseComfort) })), 'false comfort boundary');
  assert.ok(accepts(payload({ leadershipBody: body(LIMITS.leadership) })), 'leadership boundary');
  assert.ok(accepts(payload({
    domainEvidence: [{ domainCode: 'GOV', evidenceRefs: refs, body: body(LIMITS.domain) }]
  })), 'domain boundary');
  assert.ok(accepts(payload({
    gapEvidence: [{ questionCode: 'Q1', evidenceRefs: refs, body: body(LIMITS.gap) }]
  })), 'gap boundary');
});

// -------------------------------------------------- 7: schema and brief share one authoritative source
test('the narrative brief exposes exactly the schema limits, from the same constant', () => {
  const brief = readFileSync('src/lib/reports/automation/narrative-brief.ts', 'utf8');
  for (const kind of ['executive', 'falseComfort', 'leadership', 'domain', 'gap']) {
    assert.match(brief, new RegExp(`PREMIUM_REPORT_AI_SECTION_BODY_MAX_CHARS\\.${kind}\\b`),
      `the brief must take its ${kind} maximum from the shared constant`);
  }
  // No section may reintroduce a literal limit of its own.
  const generator = readFileSync('src/lib/reports/automation/ai-sdk-generator.ts', 'utf8');
  assert.ok(!/body:\s*narrativeBody/.test(generator),
    'no provider-facing body may fall back to the generic 2,000-character default');
  assert.ok(!/Body:\s*narrativeBody/.test(generator),
    'no provider-facing body may fall back to the generic 2,000-character default');
});

// ------------------------------------------------------------------ 8-9: whole-report envelope
function envelopeChars(domains, gaps) {
  return LIMITS.executive + LIMITS.falseComfort + LIMITS.leadership
    + (domains * LIMITS.domain) + (gaps * LIMITS.gap);
}
test('a normal 10-domain / 6-gap Essential report is bounded at 12,600 body characters', () => {
  assert.equal(envelopeChars(10, 6), 12600);
});
test('the bounded worst case is derived from ESSENTIAL_CAPS, not a hard-coded gap count', () => {
  // The gap universe is one section per selected material finding (automation/evidence.ts builds
  // gap items from projection.findings), so the authoritative ceiling is the findings cap itself.
  assert.equal(PREMIUM_REPORT_AI_MAX_GAP_SECTIONS, ESSENTIAL_CAPS.findings);
  const worst = envelopeChars(PREMIUM_REPORT_AI_MAX_DOMAIN_SECTIONS, ESSENTIAL_CAPS.findings);
  assert.equal(worst, 13700);
  assert.ok(worst < 14000, 'the bounded worst case must stay under 14,000 body characters');
});
test('no section can silently regain the old 2,000-character default', () => {
  for (const [kind, limit] of Object.entries(LIMITS)) {
    assert.ok(limit < PREMIUM_REPORT_AI_BODY_MAX_CHARS,
      `${kind} must be tighter than the absolute backstop`);
  }
  // The old uniform envelope across 19 bodies is what truncated V5.
  assert.ok(envelopeChars(10, 6) < 19 * PREMIUM_REPORT_AI_BODY_MAX_CHARS * 0.5,
    'the tightened envelope must be far below the envelope that truncated V5');
});

// ------------------------------------------------------------------ array bounds
test('evidence arrays carry defensive maxima that do not alter selection', () => {
  assert.equal(PREMIUM_REPORT_AI_MAX_DOMAIN_SECTIONS, 10);
  const tooManyDomains = Array.from({ length: PREMIUM_REPORT_AI_MAX_DOMAIN_SECTIONS + 1 }, (_, i) => (
    { domainCode: `D${i}`, evidenceRefs: refs, body: body(10) }));
  assert.equal(accepts(payload({ domainEvidence: tooManyDomains })), false);
  const tooManyGaps = Array.from({ length: PREMIUM_REPORT_AI_MAX_GAP_SECTIONS + 1 }, (_, i) => (
    { questionCode: `Q${i}`, evidenceRefs: refs, body: body(10) }));
  assert.equal(accepts(payload({ gapEvidence: tooManyGaps })), false);
  // Exactly the bound is still valid -- this protects shape, it does not shrink the report.
  const atBound = Array.from({ length: PREMIUM_REPORT_AI_MAX_GAP_SECTIONS }, (_, i) => (
    { questionCode: `Q${i}`, evidenceRefs: refs, body: body(10) }));
  assert.ok(accepts(payload({ gapEvidence: atBound })));
});

// ------------------------------------------------------- 10-11: provider corridor
test('the provider output ceiling is 6,500', () => {
  assert.equal(PREMIUM_REPORT_AI_MAX_OUTPUT_TOKENS, 6500);
  assert.ok(PREMIUM_REPORT_AI_MAX_OUTPUT_TOKENS > 5000, 'V5 truncated at exactly 5,000');
  assert.ok(PREMIUM_REPORT_AI_MAX_OUTPUT_TOKENS < 8000, 'deliberately not raised to 8k/10k');
});
test('the V5 actual input still fits the hard total-token and cost corridor', () => {
  const V5_ACTUAL_INPUT_TOKENS = 10850;
  const HARD_MAX_TOTAL_TOKENS = 24000;
  const HARD_MAX_ESTIMATED_COST_MICROS = 500000;
  const worstTotal = V5_ACTUAL_INPUT_TOKENS + PREMIUM_REPORT_AI_MAX_OUTPUT_TOKENS;
  assert.equal(worstTotal, 17350);
  assert.ok(worstTotal < HARD_MAX_TOTAL_TOKENS,
    `worst-case total ${worstTotal} must stay under the hard ceiling ${HARD_MAX_TOTAL_TOKENS}`);
  // V5 cost 204,250 micros for 15,850 tokens; scale to the new worst case and stay well under.
  const scaledCost = Math.ceil(204250 * (worstTotal / 15850));
  assert.ok(scaledCost < HARD_MAX_ESTIMATED_COST_MICROS,
    `scaled worst-case cost ${scaledCost} must stay under ${HARD_MAX_ESTIMATED_COST_MICROS}`);
});

// ------------------------------------------------------- 12: the failure contract is untouched
test('truncation still classifies as structured_output_truncated with full diagnostics', () => {
  const diagnostics = readFileSync('src/lib/reports/automation/structured-output-diagnostics.ts', 'utf8');
  assert.match(diagnostics, /structured_output_truncated/,
    'the truncation terminal status must remain in the classifier');
  const generator = readFileSync('src/lib/reports/automation/ai-sdk-generator.ts', 'utf8');
  for (const field of ['finishReason', 'rawFinishReason']) {
    assert.ok(diagnostics.includes(field) || generator.includes(field),
      `${field} must still be captured for diagnosis`);
  }
});

// ------------------------------------------------------- 13-14: versioning and the repair path
test('the prompt and schema versions were bumped for a real contract change', () => {
  assert.equal(PREMIUM_REPORT_SCHEMA_VERSION, 'mk-essential-ai-advisory-editor-v5');
  // The prompt moved to v6 when it gained the no-exposure grounding instruction; the schema's
  // structure and maxima did not change, so it stays v5. They are separate contracts.
  assert.equal(PREMIUM_REPORT_PROMPT_VERSION, 'mk-essential-report-v6-advisory-editor-grounding');
});
test('the repair path shares one output envelope with the first attempt', () => {
  const generator = readFileSync('src/lib/reports/automation/ai-sdk-generator.ts', 'utf8');
  // Exactly one output-token ceiling and one schema may exist, so a repair cannot use a wider one.
  assert.equal((generator.match(/PREMIUM_REPORT_AI_MAX_OUTPUT_TOKENS\s*=/g) ?? []).length, 1,
    'there must be exactly one authoritative output-token ceiling');
  assert.equal((generator.match(/export const premiumReportNarrativeSchema\s*=/g) ?? []).length, 1,
    'there must be exactly one provider-facing narrative schema');
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
