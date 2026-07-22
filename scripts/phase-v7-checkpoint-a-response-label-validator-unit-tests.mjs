// V7 Checkpoint A correction -- deterministic, credential-free unit tests for the pure
// response-scale validator (validateOfficialResponseLabels), the strict numeric parser
// (parseFiniteDatabaseNumeric), and findOfficialResponseLabel().
//
// These tests exercise pure functions only. They never call getOfficialResponseLabels() and never
// construct a Supabase client, so they require no NEXT_PUBLIC_SUPABASE_URL, no
// SUPABASE_SERVICE_ROLE_KEY, and no network access. This is the mandatory command
// (v7:test-checkpoint-a-unit) that CI runs on every PR -- it must never depend on production
// credentials. The separate DB-backed integration test
// (phase-v7-checkpoint-a-response-label-db-integration-tests.mjs) is what actually proves the real
// response_scale table matches this shape; that one requires real credentials and is not part of
// the mandatory CI gate.
//
// V7 Checkpoint A FINAL correction: this repository's own methodology loader
// (src/lib/respondent/assessment-methodology.ts) types response_scale.normalised_score as
// `number | string` -- real evidence that PostgREST can serialize this column as a numeric string.
// The tests below prove numeric strings ("80", "80.00") are now accepted for normalised_score,
// that genuinely malformed values are still rejected, and that the new structural
// scale-consistency checks (contiguous display orders, positionally-aligned response values,
// strictly increasing scores, 0-to-100 bounds) catch inconsistent scales that individually-valid
// rows could otherwise assemble into.
import assert from 'node:assert/strict';
import {
  validateOfficialResponseLabels,
  findOfficialResponseLabel,
  parseFiniteDatabaseNumeric,
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
// display_order -> response_value -> normalised_score mapping is: 1->0->0, 2->1->20, 3->2->40,
// 4->3->60, 5->4->80, 6->5->100 -- correctly aligned and strictly increasing 0..100, so this
// baseline also satisfies every structural consistency rule unmodified.
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

test('7b. numeric string normalised_score ("80") is ACCEPTED, not rejected (inverted per Checkpoint A final correction)', () => {
  // Repository evidence (src/lib/respondent/assessment-methodology.ts's RawResponseScale type and
  // toNumber() helper) shows normalised_score legitimately arrives from PostgREST as a string.
  // This test replaces the old "7b. non-numeric normalised_score is rejected" test, which
  // incorrectly rejected valid database rows.
  const rows = validRows();
  rows[0].normalised_score = '80';
  const result = validateOfficialResponseLabels(rows);
  const four = findOfficialResponseLabel(result, 4);
  assert.equal(four.normalisedScore, 80);
  assert.equal(typeof four.normalisedScore, 'number');
});

test('7c. numeric string normalised_score ("80.00") is accepted and normalised to the number 80', () => {
  const rows = validRows();
  rows[0].normalised_score = '80.00';
  const result = validateOfficialResponseLabels(rows);
  const four = findOfficialResponseLabel(result, 4);
  assert.equal(four.normalisedScore, 80);
  assert.equal(typeof four.normalisedScore, 'number');
});

test('7d. "0.00" is accepted and normalised to the number 0', () => {
  const rows = validRows();
  rows[1].normalised_score = '0.00'; // response_value 0
  const result = validateOfficialResponseLabels(rows);
  const zero = findOfficialResponseLabel(result, 0);
  assert.equal(zero.normalisedScore, 0);
});

test('7e. malformed normalised_score strings are rejected: "", "   ", "80abc", "NaN", "Infinity"', () => {
  for (const malformed of ['', '   ', '80abc', 'NaN', 'Infinity']) {
    const rows = validRows();
    rows[0].normalised_score = malformed;
    assert.throws(
      () => validateOfficialResponseLabels(rows),
      ResponseLabelSourceError,
      `Expected normalised_score=${JSON.stringify(malformed)} to be rejected.`
    );
  }
});

test('7f. non-string, non-number normalised_score values are rejected: null, boolean, array, object', () => {
  for (const malformed of [null, true, false, [80], { value: 80 }]) {
    const rows = validRows();
    rows[0].normalised_score = malformed;
    assert.throws(
      () => validateOfficialResponseLabels(rows),
      ResponseLabelSourceError,
      `Expected normalised_score=${JSON.stringify(malformed)} to be rejected.`
    );
  }
});

test('8. invalid response_value (outside 0-5) is rejected', () => {
  const rows = validRows();
  rows[0].response_value = 6;
  assert.throws(() => validateOfficialResponseLabels(rows), ResponseLabelSourceError);
});

test('8b. non-numeric response_value is rejected (response_value remains integer-only -- no repository evidence it arrives as a string)', () => {
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

test('13. non-contiguous display orders are rejected (1,2,3,4,5,7 -- missing 6, gap at 7)', () => {
  const rows = validRows();
  const orderSixRow = rows.find((r) => r.display_order === 6);
  orderSixRow.display_order = 7;
  assert.throws(() => validateOfficialResponseLabels(rows), ResponseLabelSourceError);
});

test('14. response values that do not align with display order are rejected (set and count are still valid, only the pairing is wrong)', () => {
  const rows = validRows();
  const orderFiveRow = rows.find((r) => r.display_order === 5); // response_value 4
  const orderSixRow = rows.find((r) => r.display_order === 6); // response_value 5
  const swap = orderFiveRow.response_value;
  orderFiveRow.response_value = orderSixRow.response_value;
  orderSixRow.response_value = swap;
  // Membership/duplicate/count checks all still pass (still {0,1,2,3,4,5}, still six unique
  // display orders) -- only the new positional-alignment check can catch this.
  assert.throws(() => validateOfficialResponseLabels(rows), ResponseLabelSourceError);
});

test('15. decreasing normalised scores (by display_order) are rejected', () => {
  const rows = validRows();
  const value2Row = rows.find((r) => r.response_value === 2); // normalised_score 40
  const value3Row = rows.find((r) => r.response_value === 3); // normalised_score 60
  const swap = value2Row.normalised_score;
  value2Row.normalised_score = value3Row.normalised_score;
  value3Row.normalised_score = swap;
  // Sequence by display_order becomes 0, 20, 60, 40, 80, 100 -- decreasing at position 4.
  assert.throws(() => validateOfficialResponseLabels(rows), ResponseLabelSourceError);
});

test('16. a scale not starting at normalised_score 0 is rejected', () => {
  const rows = validRows();
  const zeroRow = rows.find((r) => r.response_value === 0);
  zeroRow.normalised_score = 5; // still strictly less than the next row (20), isolates this check
  assert.throws(() => validateOfficialResponseLabels(rows), ResponseLabelSourceError);
});

test('17. a scale not ending at normalised_score 100 is rejected', () => {
  const rows = validRows();
  const fiveRow = rows.find((r) => r.response_value === 5);
  fiveRow.normalised_score = 95; // still strictly greater than the previous row (80)
  assert.throws(() => validateOfficialResponseLabels(rows), ResponseLabelSourceError);
});

console.log('\nparseFiniteDatabaseNumeric() direct tests');

test('parseFiniteDatabaseNumeric: accepts finite numbers', () => {
  assert.equal(parseFiniteDatabaseNumeric(80, 'x'), 80);
  assert.equal(parseFiniteDatabaseNumeric(0, 'x'), 0);
});

test('parseFiniteDatabaseNumeric: accepts canonical numeric strings', () => {
  assert.equal(parseFiniteDatabaseNumeric('80', 'x'), 80);
  assert.equal(parseFiniteDatabaseNumeric('80.00', 'x'), 80);
  assert.equal(parseFiniteDatabaseNumeric('0', 'x'), 0);
  assert.equal(parseFiniteDatabaseNumeric('0.00', 'x'), 0);
});

test('parseFiniteDatabaseNumeric: rejects blank and malformed strings, and non-finite numbers', () => {
  for (const bad of ['', '   ', '80abc', 'NaN', 'Infinity']) {
    assert.throws(() => parseFiniteDatabaseNumeric(bad, 'x'), ResponseLabelSourceError, `expected ${JSON.stringify(bad)} to throw`);
  }
  assert.throws(() => parseFiniteDatabaseNumeric(NaN, 'x'), ResponseLabelSourceError);
  assert.throws(() => parseFiniteDatabaseNumeric(Infinity, 'x'), ResponseLabelSourceError);
});

test('parseFiniteDatabaseNumeric: rejects null, booleans, arrays, and objects (never coerces to 0)', () => {
  for (const bad of [null, undefined, true, false, [80], { value: 80 }]) {
    assert.throws(() => parseFiniteDatabaseNumeric(bad, 'x'), ResponseLabelSourceError, `expected ${JSON.stringify(bad)} to throw`);
  }
});

console.log(`\n${passed} passed`);
