// V7 Checkpoint A -- baseline test proving the official response-scale source (spec 8.2's hard
// stop: "The official response-label source must be proven before any response wording is
// changed").
//
// Requires a real Supabase connection (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY), like
// every other DB-backed script in this repo (e.g. phase14:test-atomic-capability-completion). It
// was not runnable in the sandbox this commit was authored in -- that sandbox has no npm install
// and no database credentials (documented, not silently skipped: see the Checkpoint A report for
// the independent read-only production query that verified the exact expected values asserted
// below, run via the Supabase MCP tool rather than this script). This test is written to run for
// real in CI / any environment with real credentials and a real npm install, per the spec's "do not
// rely on standalone scripts as the only proof" requirement -- once it can run, it is the proof.
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
