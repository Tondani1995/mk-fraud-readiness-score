// V7 Checkpoint A correction -- deterministic, credential-free unit tests for the pure
// response-scale validator (validateOfficialResponseLabels) and findOfficialResponseLabel().
//
// These tests exercise pure functions only. They never call getOfficialResponseLabels() and never
// construct a Supabase client, so they require no NEXT_PUBLIC_SUPABASE_URL, no
// SUPABASE_SERVICE_ROLE_KEY, and no network access. This is the mandatory command
// (v7:test-checkpoint-a-unit) that CI runs on every PR -- it must never depend on production
// credentials. The separate DB-backed integration test
// (phase-v7-checkpoint-a-response-label-db-integration-tests.mjs) is what actually proves the real
// response_scale table matches this shape; that one requires real credentials and is not part of
// the mandatory CI gate.
import assert from 'node:assert/strict';
import {
  validateOfficialResponseLabels,
  findOfficialResponseLabel,
  ResponseLabelSourceError
} from '../src/lib/reports/response-labels.ts';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok - ${name}`);
  } catch (error) {
    console.error(`  FAIL - ${name}`);
    console.error(`    ${error.stack ?? error.message}`);
    throw error;
  }
}

// A valid, complete six-row scale -- deliberately built out of display_order sequence (5, then 1,
// then ...) to double as the "unordered input" fixture reused by the normalisation test below.
function validRows() {
  return [
    { response_value: 4, label: 'Consistently operating', operational_meaning: 'Operating consistently in practice.', normalised_score: 80, display_order: 5 },
    { response_value: 0, label: 'Not in place', operational_meaning: 'No control exists.', normalised_score: 0, display_order: 1 },
    { response_value: 5, label: 'Embedded and improved', operational_meaning: 'Embedded and subject to continuous improvement.', normalised_score: 100, display_order: 6 },
    { response_value: 1, label: 'Initial / ad hoc', operational_meaning: 'Exists only informally or inconsistently.', normalised_score: 20, display_order: 2 },
    { response_value: 3, label: 'Implemented', operational_meaning: 'Implemented and in use.', normalised_score: 60, display_order: 4 },
    { response_value: 2, label: 'Partially designed', operational_meaning: 'Partially designed but not fully implemented.', normalised_score: 40, display_order: 3 }
  ];
}

console.log('V7 Checkpoint A correction -- response-label validator unit suite');

test('1. valid six-row scale (0-5) is accepted and returned', () => {
  const result = validateOfficialResponseLabels(validRows());
  assert.equal(result.length, 6);
  assert.deepEqual(
    result.map((r) => r.responseValue),
    [0, 1, 2, 3, 4, 5]
  );
});

test('2. missing value 5 is rejected', () => {
  const rows = validRows().filter((r) => r.response_value !== 5);
  assert.throws(() => validateOfficialResponseLabels(rows), ResponseLabelSourceError);
});

test('3. duplicate response value is rejected', () => {
  const rows = validRows();
  rows[0] = { ...rows[1] }; // duplicate response_value 0
  assert.throws(() => validateOfficialResponseLabels(rows), ResponseLabelSourceError);
});

test('4. duplicate display order is rejected', () => {
  const rows = validRows();
  rows[0].display_order = rows[1].display_order;
  assert.throws(() => validateOfficialResponseLabels(rows), ResponseLabelSourceError);
});

test('5. blank label is rejected', () => {
  const rows = validRows();
  rows[0].label = '   ';
  assert.throws(() => validateOfficialResponseLabels(rows), ResponseLabelSourceError);
});

test('6. null operational_meaning is rejected', () => {
  const rows = validRows();
  rows[0].operational_meaning = null;
  assert.throws(() => validateOfficialResponseLabels(rows), ResponseLabelSourceError);
});

test('7. invalid normalised_score (out of 0-100 range) is rejected', () => {
  const rows = validRows();
  rows[0].normalised_score = 150;
  assert.throws(() => validateOfficialResponseLabels(rows), ResponseLabelSourceError);
});

test('7b. non-numeric normalised_score is rejected', () => {
  const rows = validRows();
  rows[0].normalised_score = '80';
  assert.throws(() => validateOfficialResponseLabels(rows), ResponseLabelSourceError);
});

test('8. invalid response_value (outside 0-5) is rejected', () => {
  const rows = validRows();
  rows[0].response_value = 6;
  assert.throws(() => validateOfficialResponseLabels(rows), ResponseLabelSourceError);
});

test('8b. non-numeric response_value is rejected', () => {
  const rows = validRows();
  rows[0].response_value = '0';
  assert.throws(() => validateOfficialResponseLabels(rows), ResponseLabelSourceError);
});

test('9. unordered input is deterministically normalised (sorted by display_order)', () => {
  // validRows() is intentionally built out of display_order sequence.
  const result = validateOfficialResponseLabels(validRows());
  const displayOrders = result.map((r) => r.displayOrder);
  const sorted = [...displayOrders].sort((a, b) => a - b);
  assert.deepEqual(displayOrders, sorted, 'Result must be sorted by display_order regardless of input order.');
  // Running it twice on the same (still-unordered) input must produce the same order both times.
  const resultAgain = validateOfficialResponseLabels(validRows());
  assert.deepEqual(resultAgain.map((r) => r.responseValue), result.map((r) => r.responseValue));
});

test('10. findOfficialResponseLabel() returns distinct labels for official values 4 and 5', () => {
  const result = validateOfficialResponseLabels(validRows());
  const four = findOfficialResponseLabel(result, 4);
  const five = findOfficialResponseLabel(result, 5);
  assert.ok(four && five);
  assert.notEqual(four.label, five.label);
  assert.equal(four.label, 'Consistently operating');
  assert.equal(five.label, 'Embedded and improved');
});

test('11. findOfficialResponseLabel() returns null for a null (unanswered) response', () => {
  const result = validateOfficialResponseLabels(validRows());
  assert.equal(findOfficialResponseLabel(result, null), null);
});

test('12. findOfficialResponseLabel() returns null for an unsupported value, never a guessed label', () => {
  const result = validateOfficialResponseLabels(validRows());
  assert.equal(findOfficialResponseLabel(result, 6), null);
  assert.equal(findOfficialResponseLabel(result, -1), null);
});

test('empty result is rejected (does not fall back to an inferred scale)', () => {
  assert.throws(() => validateOfficialResponseLabels([]), ResponseLabelSourceError);
});

test('non-object row is rejected', () => {
  assert.throws(() => validateOfficialResponseLabels(['not-a-row']), ResponseLabelSourceError);
});

test('non-integer display_order is rejected', () => {
  const rows = validRows();
  rows[0].display_order = 1.5;
  assert.throws(() => validateOfficialResponseLabels(rows), ResponseLabelSourceError);
});

test('non-positive display_order is rejected', () => {
  const rows = validRows();
  rows[0].display_order = 0;
  assert.throws(() => validateOfficialResponseLabels(rows), ResponseLabelSourceError);
});

console.log(`\n${passed} passed`);
