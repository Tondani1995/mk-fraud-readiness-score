/**
 * RC1 question-level playbook coverage contract.
 *
 * The V7 commercial quality gate raises QG_MATERIAL_PLAYBOOK_MISSING for any material finding
 * whose question has no *exact* question-level playbook (see checkQualityGates() in
 * src/lib/reports/evidence-model/index.ts, and the fallbackStatus assignment in
 * material-findings.ts). Before RC1 only 14 of the 68 active MFRS-V1.1 questions had one, so any
 * assessment whose material findings touched the other 54 questions failed generation closed and
 * produced no report at all. This test makes that regression impossible to reintroduce.
 *
 * The authoritative question population is parsed from the immutable methodology seed
 * (0003_phase5_methodology_seed.sql) rather than from the playbook registry itself, so the test
 * cannot pass by simply agreeing with the file it is checking. 0009_methodology_copy_polish.sql
 * creates MFRS-V1.1 as a copy-only polish of MFRS-V1.0 -- app_settings
 * 'active_methodology_copy_polish_v1_1' records weights_changed / critical_flags_changed /
 * hard_gate_flags_changed all false -- so the seed's structural flags are authoritative for the
 * active version too.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  AUTHORITATIVE_QUESTION_MAPPINGS,
  getQuestionPlaybook,
  hasQuestionPlaybook,
  listQuestionPlaybooks
} from '../src/lib/reports/evidence-model/question-playbooks.ts';
import {
  PROHIBITED_PLACEHOLDER_STRINGS,
  PROHIBITED_GENERIC_ROADMAP_PHRASE
} from '../src/lib/reports/evidence-model/index.ts';

const root = process.cwd();
const seedPath = path.join(root, 'supabase', 'migrations', '0003_phase5_methodology_seed.sql');
const seed = fs.readFileSync(seedPath, 'utf8');

// ---------------------------------------------------------------------------
// 1. Independent authoritative question population from the methodology seed.
// ---------------------------------------------------------------------------
// Seed tuple shape:
//   ('D1', 'D1-Q01', '<prompt>', '<help>', <weight>, <is_critical>, <is_hard_gate>, ...)
const seedRowPattern =
  /\(\s*'(D\d+)'\s*,\s*'(D\d+-Q\d+)'\s*,\s*'(?:[^']|'')*'\s*,\s*'(?:[^']|'')*'\s*,\s*[\d.]+\s*,\s*(true|false)\s*,\s*(true|false)\s*,/g;

const seedQuestions = new Map();
for (const match of seed.matchAll(seedRowPattern)) {
  const [, domainCode, questionCode, isCritical, isHardGate] = match;
  assert.equal(
    seedQuestions.has(questionCode), false,
    `Methodology seed lists ${questionCode} more than once.`
  );
  seedQuestions.set(questionCode, {
    domainCode,
    isCritical: isCritical === 'true',
    isHardGate: isHardGate === 'true'
  });
}

assert.equal(
  seedQuestions.size, 68,
  `Expected 68 active questions in the methodology seed, parsed ${seedQuestions.size}.`
);
assert.equal(
  [...seedQuestions.values()].filter((q) => q.isCritical).length, 19,
  'Expected 19 critical controls in the methodology seed.'
);
assert.equal(
  [...seedQuestions.values()].filter((q) => q.isHardGate).length, 17,
  'Expected 17 hard-gate controls in the methodology seed.'
);

// ---------------------------------------------------------------------------
// 2. Coverage: every active question maps and has exactly one exact playbook.
// ---------------------------------------------------------------------------
const mappingCodes = Object.keys(AUTHORITATIVE_QUESTION_MAPPINGS);
const playbooks = listQuestionPlaybooks();
const playbookCodes = playbooks.map((p) => p.questionCode);

const missingMappings = [...seedQuestions.keys()].filter((code) => !mappingCodes.includes(code));
assert.deepEqual(missingMappings, [], `Questions with no authoritative mapping: ${missingMappings.join(', ')}`);

const missingPlaybooks = [...seedQuestions.keys()].filter((code) => !hasQuestionPlaybook(code));
assert.deepEqual(missingPlaybooks, [], `Questions with no exact playbook: ${missingPlaybooks.join(', ')}`);

const orphanMappings = mappingCodes.filter((code) => !seedQuestions.has(code));
assert.deepEqual(orphanMappings, [], `Mappings for questions not in the methodology: ${orphanMappings.join(', ')}`);

const orphanPlaybooks = playbookCodes.filter((code) => !seedQuestions.has(code));
assert.deepEqual(orphanPlaybooks, [], `Playbooks for questions not in the methodology: ${orphanPlaybooks.join(', ')}`);

assert.equal(mappingCodes.length, 68, `Expected 68 authoritative mappings, found ${mappingCodes.length}.`);
assert.equal(playbooks.length, 68, `Expected 68 exact playbooks, found ${playbooks.length}.`);

// No duplicate question mappings: registry keys are unique by construction, so assert the
// self-declared questionCode agrees with its key and appears exactly once across the registry.
assert.equal(new Set(playbookCodes).size, playbookCodes.length, 'Duplicate questionCode across playbooks.');
for (const code of mappingCodes) {
  assert.equal(
    AUTHORITATIVE_QUESTION_MAPPINGS[code].questionCode, code,
    `Mapping key ${code} disagrees with its questionCode field.`
  );
  const playbook = getQuestionPlaybook(code);
  assert.equal(playbook.questionCode, code, `Playbook key ${code} disagrees with its questionCode field.`);
}

// ---------------------------------------------------------------------------
// 3. Structural agreement with the authoritative methodology flags.
// ---------------------------------------------------------------------------
for (const [code, expected] of seedQuestions) {
  const mapping = AUTHORITATIVE_QUESTION_MAPPINGS[code];
  const playbook = getQuestionPlaybook(code);
  assert.equal(mapping.domainCode, expected.domainCode, `${code}: mapping domain mismatch.`);
  assert.equal(playbook.domainCode, expected.domainCode, `${code}: playbook domain mismatch.`);
  assert.equal(mapping.isCritical, expected.isCritical, `${code}: isCritical disagrees with the methodology seed.`);
  assert.equal(mapping.isHardGate, expected.isHardGate, `${code}: isHardGate disagrees with the methodology seed.`);
  assert.equal(
    code.startsWith(`${playbook.domainCode}-`), true,
    `${code}: domainCode is not consistent with the question code prefix.`
  );
  assert.equal(typeof mapping.prompt, 'string');
  assert.ok(mapping.prompt.trim().length >= 20, `${code}: mapping prompt is too short to be the real question.`);
}

// ---------------------------------------------------------------------------
// 4. Field completeness for every playbook, with stricter rules for
//    critical and hard-gate questions.
// ---------------------------------------------------------------------------
const REQUIRED_TEXT_FIELDS = [
  'controlObjective',
  'expectedStandard',
  'fraudMechanism',
  'recommendedControlDesign',
  'executiveAccountability',
  'processOwnership',
  'oversightFunction',
  'operatingFrequency',
  'effectivenessMeasure',
  'escalationThreshold'
];
const REQUIRED_LIST_FIELDS = [
  'supportingFunctions',
  'evidenceRequired',
  'minimumAcceptableEvidenceCharacteristics',
  'dependencies',
  'relatedScenarioTypes'
];
const VALID_DIFFICULTY = new Set(['Low', 'Moderate', 'High']);
const VALID_TARGET_PERIOD = new Set(['30 days', '60 days', '90 days']);

for (const playbook of playbooks) {
  const code = playbook.questionCode;
  const meta = seedQuestions.get(code);

  for (const field of REQUIRED_TEXT_FIELDS) {
    const value = playbook[field];
    assert.equal(typeof value, 'string', `${code}.${field} must be a string.`);
    assert.ok(value.trim().length > 0, `${code}.${field} must not be empty.`);
  }
  for (const field of REQUIRED_LIST_FIELDS) {
    const value = playbook[field];
    assert.ok(Array.isArray(value) && value.length > 0, `${code}.${field} must be a non-empty array.`);
    for (const entry of value) {
      assert.equal(typeof entry, 'string', `${code}.${field} entries must be strings.`);
      assert.ok(entry.trim().length > 0, `${code}.${field} entries must not be empty.`);
    }
  }

  assert.ok(VALID_DIFFICULTY.has(playbook.implementationDifficulty), `${code}: invalid implementationDifficulty.`);
  assert.ok(VALID_TARGET_PERIOD.has(playbook.targetPeriod), `${code}: invalid targetPeriod (30/60/90 roadmap slot).`);

  // Unknown must never be rendered as confirmed absence: the diagnosis text is generated from the
  // official response label and must keep the self-reported / requires-evidence qualifier.
  assert.equal(typeof playbook.currentStateDiagnosis, 'function', `${code}: currentStateDiagnosis must be a function.`);
  const diagnosisText = playbook.currentStateDiagnosis({
    responseValue: 0,
    label: 'Not in place',
    operationalMeaning: 'no control operating',
    normalisedScore: 0
  });
  assert.equal(typeof diagnosisText, 'string');
  assert.match(
    diagnosisText, /self-reported/i,
    `${code}: diagnosis must mark the response as self-reported rather than verified.`
  );
  assert.match(
    diagnosisText, /evidence/i,
    `${code}: diagnosis must require operating evidence before treating the response as verified.`
  );
  for (const forbidden of [/\bconfirmed absence\b/i, /\bproven\s+(?:absent|missing)\b/i]) {
    assert.doesNotMatch(diagnosisText, forbidden, `${code}: diagnosis must not treat unknown as confirmed absence.`);
  }

  // Critical and hard-gate questions carry the heaviest commercial weight in the report and must
  // have substantive control design, evidence, action and risk text.
  if (meta.isCritical || meta.isHardGate) {
    assert.ok(
      playbook.recommendedControlDesign.trim().length >= 180,
      `${code}: critical/hard-gate control design must be specific and actionable.`
    );
    assert.ok(
      playbook.evidenceRequired.length >= 3,
      `${code}: critical/hard-gate questions need at least three distinct evidence items.`
    );
    assert.ok(
      playbook.minimumAcceptableEvidenceCharacteristics.length >= 3,
      `${code}: critical/hard-gate questions need at least three evidence-quality characteristics.`
    );
    assert.ok(
      playbook.escalationThreshold.trim().length >= 40,
      `${code}: critical/hard-gate escalation threshold must state a concrete trigger.`
    );
    assert.ok(
      playbook.effectivenessMeasure.trim().length >= 40,
      `${code}: critical/hard-gate effectiveness measure must be concrete.`
    );
  }
}

// ---------------------------------------------------------------------------
// 5. No placeholder or banned generic language anywhere in the registry.
// ---------------------------------------------------------------------------
const BANNED_SUBSTRINGS = [
  ...PROHIBITED_PLACEHOLDER_STRINGS,
  PROHIBITED_GENERIC_ROADMAP_PHRASE,
  'TODO',
  'TBC',
  'Lorem ipsum',
  'placeholder'
];
// Claims of audit, assurance or certification outcomes are out of scope for a self-assessment
// advisory product and must not appear as promises in the recommended control text.
const BANNED_CLAIM_PATTERNS = [
  /\bwe (?:certify|assure|audit)\b/i,
  /\bthis (?:certifies|constitutes an audit)\b/i,
  /\bguarantee(?:s|d)? (?:compliance|no fraud)\b/i
];

for (const playbook of playbooks) {
  const haystack = [
    ...REQUIRED_TEXT_FIELDS.map((f) => playbook[f]),
    ...REQUIRED_LIST_FIELDS.flatMap((f) => playbook[f])
  ].join('\n');

  for (const banned of BANNED_SUBSTRINGS) {
    assert.equal(
      haystack.toLowerCase().includes(String(banned).toLowerCase()), false,
      `${playbook.questionCode}: banned placeholder/generic language present: "${banned}".`
    );
  }
  for (const pattern of BANNED_CLAIM_PATTERNS) {
    assert.doesNotMatch(haystack, pattern, `${playbook.questionCode}: must not claim audit/assurance/certification.`);
  }
}

// ---------------------------------------------------------------------------
// 6. Content is question-specific, not duplicated filler across questions.
// ---------------------------------------------------------------------------
for (const field of ['controlObjective', 'expectedStandard', 'fraudMechanism', 'recommendedControlDesign', 'effectivenessMeasure', 'escalationThreshold']) {
  const seen = new Map();
  for (const playbook of playbooks) {
    const value = playbook[field].trim().toLowerCase();
    const previous = seen.get(value);
    assert.equal(
      previous, undefined,
      `${playbook.questionCode}.${field} duplicates ${previous} -- each question needs its own wording.`
    );
    seen.set(value, playbook.questionCode);
  }
}

// ---------------------------------------------------------------------------
// 7. The regression itself: QG_MATERIAL_PLAYBOOK_MISSING is unreachable for
//    any active MFRS-V1.1 question.
// ---------------------------------------------------------------------------
// material-findings.ts sets fallbackStatus to 'exact_question_playbook' exactly when
// getQuestionPlaybook(questionCode) is non-null, and checkQualityGates() raises
// QG_MATERIAL_PLAYBOOK_MISSING when fallbackStatus !== 'exact_question_playbook' or the
// playbookSource is absent. Proving a non-null playbook for every active question therefore
// proves the violation cannot fire for a finding on any active question.
for (const code of seedQuestions.keys()) {
  const playbook = getQuestionPlaybook(code);
  assert.notEqual(playbook, null, `${code}: would raise QG_MATERIAL_PLAYBOOK_MISSING.`);
  const fallbackStatus = playbook ? 'exact_question_playbook' : 'missing_question_playbook';
  const playbookSource = playbook ? `question-playbooks:${code}` : null;
  assert.equal(fallbackStatus, 'exact_question_playbook', `${code}: fallbackStatus would not be exact.`);
  assert.ok(playbookSource, `${code}: playbookSource would be absent.`);
}

console.log(`rc1-question-playbook-coverage: PASS (${playbooks.length}/${seedQuestions.size} questions covered, `
  + `${[...seedQuestions.values()].filter((q) => q.isCritical).length} critical, `
  + `${[...seedQuestions.values()].filter((q) => q.isHardGate).length} hard-gate)`);
