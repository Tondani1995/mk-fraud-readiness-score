import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import {
  ResponseLabelSourceError,
  validateOfficialResponseLabels
} from '../src/lib/reports/response-labels.ts';

const migrationPath = 'supabase/migrations/20260826193614_v12_fix_v1_2_response_scale_display_order.sql';
const migration = await fs.readFile(migrationPath, 'utf8');
const replay = await fs.readFile('scripts/release-v12-migration-replay.sh', 'utf8');

const canonicalRows = [
  {
    response_value: 0,
    label: 'Not in place',
    operational_meaning: 'The capability is absent or is not recognised as required.',
    normalised_score: 0,
    display_order: 1
  },
  {
    response_value: 1,
    label: 'Informal / reactive',
    operational_meaning: 'Some activity occurs, but it is informal, reactive or dependent on individual effort.',
    normalised_score: 20,
    display_order: 2
  },
  {
    response_value: 2,
    label: 'Partly designed',
    operational_meaning: 'The capability has been partly designed, but important elements are incomplete or inconsistent.',
    normalised_score: 40,
    display_order: 3
  },
  {
    response_value: 3,
    label: 'Implemented in key areas',
    operational_meaning: 'The capability operates in key areas, but coverage or consistency is not yet organisation-wide.',
    normalised_score: 60,
    display_order: 4
  },
  {
    response_value: 4,
    label: 'Consistently operating',
    operational_meaning: 'The capability is defined, operating consistently and supported by evidence.',
    normalised_score: 80,
    display_order: 5
  },
  {
    response_value: 5,
    label: 'Embedded and improving',
    operational_meaning: 'The capability is measured, governed and deliberately improved over time.',
    normalised_score: 100,
    display_order: 6
  }
];

function check(name, fn) {
  fn();
  console.log(`  ok - ${name}`);
}

check('canonical response values are independently 0..5 and display order is 1..6', () => {
  const labels = validateOfficialResponseLabels(canonicalRows);
  assert.deepEqual(labels.map((row) => row.responseValue), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(labels.map((row) => row.displayOrder), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(labels.map((row) => row.normalisedScore), [0, 20, 40, 60, 80, 100]);
});

check('zero display order is rejected', () => {
  const malformed = canonicalRows.map((row) => ({ ...row }));
  malformed[0].display_order = 0;
  assert.throws(
    () => validateOfficialResponseLabels(malformed),
    (error) => error instanceof ResponseLabelSourceError && /display_order/.test(error.message)
  );
});

check('migration is a scoped display-order-only correction', () => {
  assert.match(migration, /MFRS-V1\.2-ADAPTIVE-CANDIDATE-20260821/);
  assert.match(migration, /MFRS-V1\.2-CANDIDATE-OWNER-CORRECTION/);
  assert.match(migration, /set display_order = response_value \+ 1/);
  assert.match(migration, /response_value.*0.*1.*2.*3.*4.*5/s);
  assert.match(migration, /display_order.*0.*1.*2.*3.*4.*5/s);
  assert.doesNotMatch(migration, /set\s+response_value\s*=/i);
  assert.doesNotMatch(migration, /set\s+(label|operational_meaning|normalised_score)\s*=/i);
});

check('replay proves the historical 0-based activation before the forward correction', () => {
  assert.match(replay, /register_adaptive_staging_candidate/);
  assert.match(replay, /initial_v12_scale/);
  assert.match(replay, /0,1,2,3,4,5/);
  assert.match(replay, /validateOfficialResponseLabels/);
});

// This live section is intentionally opt-in. It is read-only: getOfficialResponseLabels() and
// assembleReportData() perform no generation, provider, storage, email, or scoring writes. The
// Staging certification invokes it after the forward migration has been applied.
if (process.env.V12_RESPONSE_SCALE_LIVE === '1') {
  const { createSupabaseServiceClient } = await import('../src/lib/supabase/server.ts');
  const { assembleReportData } = await import('../src/lib/reports/assemble-report-data.ts');
  const { getOfficialResponseLabels } = await import('../src/lib/reports/response-labels.ts');
  const supabase = createSupabaseServiceClient();
  const assessmentReference = process.env.V12_ASSESSMENT_REFERENCE ?? 'MKFRS-2026-2585AD2D0D';

  const { data: methodology, error: methodologyError } = await supabase
    .from('methodology_versions')
    .select('id')
    .eq('version_code', 'MFRS-V1.2-CANDIDATE-OWNER-CORRECTION')
    .maybeSingle();
  assert.ifError(methodologyError);
  assert.ok(methodology, 'V1.2 methodology must exist');

  const labels = await getOfficialResponseLabels(methodology.id);
  assert.deepEqual(labels.map((row) => row.displayOrder), [1, 2, 3, 4, 5, 6]);

  const assembled = await assembleReportData({ assessmentReference });
  assert.equal(assembled.scoreRun.methodologyVersionId, methodology.id);
  assert.deepEqual(assembled.officialResponseLabels, labels);
  console.log('  ok - live V1.2 official response scale loaded by report assembly');
} else {
  console.log('  skipped - live report-assembly check (set V12_RESPONSE_SCALE_LIVE=1 after Staging correction)');
}

console.log('V1.2 response-scale correction tests passed.');
