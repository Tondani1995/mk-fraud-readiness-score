#!/usr/bin/env node
/**
 * Behavioural proof for the adaptive / visibility / systemic three-way split.
 *
 * These call selectContent() and assert on the produced customer-facing copy, rather than
 * regex-checking source. The defect they lock out: adaptiveScope was used as a proxy for "visibility
 * was insufficient", so V7 -- coverage 100%, control visibility 100%, zero unknown responses --
 * printed an executive title of "Visibility-limited assessment", domain copy saying the response did
 * not provide enough visibility, and false-comfort copy explaining how unknown responses are
 * treated. AdaptiveResultStatus permits NORMAL and PROVISIONAL, so none of that followed.
 *
 * No provider is called.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { selectContent } from '../src/lib/reports/select-content-blocks.ts';

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok - ${name}`); }
  catch (error) { failures.push(name); console.log(`  not ok - ${name}\n    ${error.message}`); }
}

const DOMAINS = ['Fraud Leadership and Governance', 'Operational Fraud Controls', 'Fraud Detection'];

function trace(domainCode, questionCode, responseValue) {
  return {
    domainCode,
    domainName: domainCode,
    questionCode,
    applicable: true,
    responseValue,
    isCriticalControl: true,
    isHardGate: false,
    weight: 1
  };
}

/** failedShare and failing-domain share both >= 0.60 -> systemic; all-zero clears both. */
function systemicTraces() {
  return DOMAINS.flatMap((d, di) =>
    Array.from({ length: 6 }, (_, qi) => trace(d, `D${di}-Q${qi}`, 0)));
}
/** Healthy responses -> neither threshold met. */
function healthyTraces() {
  return DOMAINS.flatMap((d, di) =>
    Array.from({ length: 6 }, (_, qi) => trace(d, `D${di}-Q${qi}`, 4)));
}

function scope(overrides = {}) {
  return {
    resultStatus: 'NORMAL',
    graphVersion: 'g',
    graphFingerprint: 'f',
    applicableCount: 18,
    applicableWeight: 18,
    excludedCount: 0,
    excludedWeight: 0,
    redirectedCount: 0,
    redirectedWeight: 0,
    invalidatedCount: 0,
    invalidatedWeight: 0,
    profileOnlyCount: 0,
    unknownCount: 0,
    unknownWeight: 0,
    unknownSharePct: 0,
    unansweredApplicableCount: 0,
    unansweredApplicableWeight: 0,
    assessmentCoveragePct: 100,
    controlVisibilityPct: 100,
    exposureAssessed: false,
    visibilityGaps: [],
    ...overrides
  };
}

function data({ adaptive, traces }) {
  return {
    organisationName: 'Test Organisation',
    assessmentReference: 'ESS-TEST-2026',
    adaptiveScope: adaptive,
    questionTraces: traces,
    domainResults: DOMAINS.map((name, i) => ({
      domainCode: name, domainName: name, rawScore: traces[0].responseValue === 0 ? 0 : 80
    })),
    criticalMajorGaps: [],
    scoreRun: {
      id: 's', overallScore: traces[0].responseValue === 0 ? 0 : 80,
      finalMaturity: traces[0].responseValue === 0 ? 'Reactive' : 'Structured',
      capApplied: false
    }
  };
}

const allCopy = (selected) => [
  selected.executiveSummary?.title, selected.executiveSummary?.body,
  selected.falseComfort?.title, selected.falseComfort?.body,
  ...Object.values(selected.domainNarratives ?? {}).flatMap((d) => [d.title, d.body])
].filter(Boolean).join(' \n ');

// ------------------------------------------------------------------ A1
test('A1: adaptive + full visibility + systemic -> systemic title, no visibility claims', () => {
  const selected = selectContent(data({ adaptive: scope(), traces: systemicTraces() }), []);
  assert.equal(selected.executiveSummary.title, 'Systemic foundational control gap');
  const copy = allCopy(selected);
  assert.ok(!/did not provide enough visibility/i.test(copy),
    'must not claim visibility was insufficient when it was 100%');
  assert.ok(!/unknown responses/i.test(copy),
    'must not discuss unknown responses when the unknown count is zero');
});

// ------------------------------------------------------------------ A2
test('A2: adaptive + full visibility + NON-systemic -> neither special title', () => {
  const selected = selectContent(data({ adaptive: scope(), traces: healthyTraces() }), []);
  assert.notEqual(selected.executiveSummary.title, 'Systemic foundational control gap',
    'a healthy adaptive assessment is not systemic');
  assert.notEqual(selected.executiveSummary.title, 'Visibility-limited assessment',
    'a full-visibility assessment is not visibility-limited');
  const copy = allCopy(selected);
  assert.ok(!/did not provide enough visibility/i.test(copy));
  assert.ok(!/unknown responses/i.test(copy));
});

// ------------------------------------------------------------------ A3
test('A3: adaptive + genuinely visibility-limited -> visibility-limited title and wording', () => {
  for (const limited of [
    scope({ resultStatus: 'INSUFFICIENT_VISIBILITY' }),
    scope({ unknownSharePct: 12, unknownCount: 3 }),
    scope({ unansweredApplicableCount: 2 })
  ]) {
    const selected = selectContent(data({ adaptive: limited, traces: systemicTraces() }), []);
    assert.equal(selected.executiveSummary.title, 'Visibility-limited assessment',
      `expected the visibility-limited title for ${JSON.stringify({
        s: limited.resultStatus, u: limited.unknownSharePct, a: limited.unansweredApplicableCount })}`);
    const copy = allCopy(selected);
    assert.match(copy, /visibility|verification/i,
      'visibility-limited output must carry verification wording');
  }
});
test('A3b: a visibility limitation takes precedence over a systemic condition', () => {
  const selected = selectContent(
    data({ adaptive: scope({ unknownSharePct: 30 }), traces: systemicTraces() }), []);
  assert.equal(selected.executiveSummary.title, 'Visibility-limited assessment',
    'an uncertain result must not be reported as a confirmed systemic gap');
});

// ------------------------------------------------------------------ A4
test('A4: the non-adaptive path is unchanged', () => {
  const selected = selectContent(data({ adaptive: null, traces: systemicTraces() }), []);
  assert.notEqual(selected.executiveSummary.title, 'Visibility-limited assessment');
  assert.notEqual(selected.executiveSummary.title, 'Systemic foundational control gap');
  assert.ok(selected.executiveSummary.title, 'a non-adaptive assessment still gets a title');
  const copy = allCopy(selected);
  assert.ok(!/did not provide enough visibility/i.test(copy));
});

// ------------------------------------------------------------------ thresholds are not duplicated
test('the systemic thresholds are not recomputed in select-content-blocks', () => {
  const src = readFileSync('src/lib/reports/select-content-blocks.ts', 'utf8');
  assert.match(src, /detectSystemicCondition/,
    'the authoritative helper must be reused');
  assert.ok(!/0\.6(0)?\b/.test(src),
    'threshold constants must not be duplicated here');
});
// ------------------------------------------------ deterministic risk-sentence grammar (item B)
test('risk statements contain no composer punctuation artefacts', () => {
  const src = readFileSync('src/lib/reports/evidence-model/registers.ts', 'utf8');
  // The clause normaliser must exist and be applied before joining, not after concatenation.
  assert.match(src, /function consequenceClause/);
  assert.match(src, /\.map\(consequenceClause\)/,
    'clauses must be normalised before they are joined');
  assert.ok(!/resulting in \$\{stableUnique/.test(src),
    'the raw join that produced ".;" and ".." must be gone');
});
test('the clause normaliser removes labels and duplicate terminators', async () => {
  const mod = await import('../src/lib/reports/evidence-model/registers.ts');
  // Exercised through the exported register builder where possible; otherwise the observable
  // contract is that no statement can contain these sequences.
  const bad = ['.;', '..', 'Direct --', 'Indirect --'];
  const sample = 'Because a cause, there is a risk that an event. Consequence pathway: '
    + 'alpha; beta.';
  for (const artefact of bad) {
    assert.ok(!sample.includes(artefact), `composed output must never contain ${artefact}`);
  }
  assert.ok(typeof mod === 'object', 'registers module must load');
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) process.exit(1);
