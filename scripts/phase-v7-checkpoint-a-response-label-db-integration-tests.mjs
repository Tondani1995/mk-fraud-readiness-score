// V7 Checkpoint A correction -- DATABASE INTEGRATION TEST (not a unit test, not part of the
// mandatory CI gate) proving the official response-scale source against a real database (spec
// 8.2's hard stop: "The official response-label source must be proven before any response wording
// is changed").
//
// Renamed from phase-v7-checkpoint-a-response-label-baseline-tests.mjs and reclassified per the
// Checkpoint A correction: this script requires a real Supabase connection
// (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) and is run via the separate
// v7:test-checkpoint-a-db npm script -- it is NOT run by v7:test-checkpoint-a-unit and is NOT part
// of the mandatory V7 Report Hardening CI workflow, because that workflow must never depend on
// production service-role credentials. Run it against a disposable local/staging Supabase database,
// or independently (as was done for Checkpoint A itself, via the Supabase MCP tool's read-only
// production query -- see the Checkpoint A report). Module resolution for this script (imports of
// the real report-engine source and @supabase/supabase-js) has been verified working end-to-end in
// this environment as of the Checkpoint A correction; it currently stops only at the credential
// boundary below, which is the expected, correct behaviour for an integration test with no
// credentials configured -- this is disclosed honestly, not silently skipped.
//
// The unit-level behaviour of the response-scale validator itself (rejection rules, the two
// distinct 4/5 labels, null/unsupported-value handling) is covered without any credentials by
// phase-v7-checkpoint-a-response-label-validator-unit-tests.mjs, which IS part of the mandatory
// CI gate.
import assert from 'node:assert/strict';
import { createSupabaseServiceClient } from '../src/lib/supabase/server.ts';
import { getOfficialResponseLabels, findOfficialResponseLabel, ResponseLabelSourceError } from '../src/lib/reports/response-labels.ts';

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok - ${name}`);
  } catch (error) {
    console.error(`  FAIL - ${name}`);
    console.error(`    ${error.stack ?? error.message}`);
    throw error;
  }
}

// Exact values independently verified via a read-only production query against response_scale
// joined to methodology_versions on 2026-07-22 (Checkpoint A). Six rows (0-5), identical across
// both methodology versions currently in production use.
const EXPECTED_LABELS = [
  { responseValue: 0, label: 'Not in place', normalisedScore: 0 },
  { responseValue: 1, label: 'Initial / ad hoc', normalisedScore: 20 },
  { responseValue: 2, label: 'Partially designed', normalisedScore: 40 },
  { responseValue: 3, label: 'Implemented', normalisedScore: 60 },
  { responseValue: 4, label: 'Consistently operating', normalisedScore: 80 },
  { responseValue: 5, label: 'Embedded and improved', normalisedScore: 100 }
];

async function resolveMethodologyVersionId(supabase, versionCode) {
  const { data, error } = await supabase
    .from('methodology_versions')
    .select('id')
    .eq('version_code', versionCode)
    .maybeSingle();
  if (error || !data) {
    throw new Error(`Could not resolve methodology_version_id for version_code=${versionCode}: ${error?.message ?? 'not found'}`);
  }
  return data.id;
}

console.log('V7 Checkpoint A -- response-label baseline suite');

for (const versionCode of ['MFRS-V1.0', 'MFRS-V1.1']) {
  await test(`getOfficialResponseLabels() returns the full, correct 0-5 scale for ${versionCode}`, async () => {
    const supabase = createSupabaseServiceClient();
    const methodologyVersionId = await resolveMethodologyVersionId(supabase, versionCode);
    const labels = await getOfficialResponseLabels(methodologyVersionId);

    assert.equal(labels.length, 6, `Expected 6 response-scale rows (0-5), got ${labels.length}.`);
    for (const expected of EXPECTED_LABELS) {
      const actual = findOfficialResponseLabel(labels, expected.responseValue);
      assert.ok(actual, `Missing official label for response value ${expected.responseValue}.`);
      assert.equal(actual.label, expected.label);
      assert.equal(actual.normalisedScore, expected.normalisedScore);
    }
  });
}

await test('BASELINE (documents the previously-missed defect): official value 4 and value 5 are distinct labels, not one collapsed "fully in place" band', async () => {
  const supabase = createSupabaseServiceClient();
  const methodologyVersionId = await resolveMethodologyVersionId(supabase, 'MFRS-V1.1');
  const labels = await getOfficialResponseLabels(methodologyVersionId);
  const four = findOfficialResponseLabel(labels, 4);
  const five = findOfficialResponseLabel(labels, 5);
  assert.notEqual(four.label, five.label, 'Values 4 and 5 must resolve to distinct official labels.');
});

await test('findOfficialResponseLabel() returns null for an unanswered (null) response, never a guessed label', () => {
  assert.equal(findOfficialResponseLabel(EXPECTED_LABELS.map((e) => ({ ...e, operationalMeaning: '', displayOrder: 0 })), null), null);
});

await test('getOfficialResponseLabels() throws ResponseLabelSourceError rather than silently falling back for an unknown methodology version', async () => {
  const supabase = createSupabaseServiceClient();
  await assert.rejects(
    () => getOfficialResponseLabels('00000000-0000-0000-0000-000000000000'),
    ResponseLabelSourceError,
    'Expected an unknown methodology_version_id to throw ResponseLabelSourceError, not resolve with inferred/empty data.'
  );
  void supabase; // client construction itself must not throw when env vars are present
});

console.log(`\n${passed} passed`);
