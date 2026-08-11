// Regression: the Comprehensive review-authority reference universe.
//
// P1 closed here. validateComprehensiveSubject() (save time) accepts only refs belonging to the
// specific analytical subject, while requireKnownEvidenceRefs() (generation time) accepted only
// subjectAuthority.allEvidenceRefs, which was built from the evidence checklist alone. Findings
// carry 'evidence:*' refs; risks, control designs, decisions and management actions carry
// 'finding:*', 'question:*' and 'risk:*' refs instead. The two sets were disjoint for four of the
// five record types, so those records could be saved and could never pass generation -- no
// Comprehensive package could ever be produced for any engagement.
//
// The invariant pinned here, not the implementation: every ref that save-time validation accepts
// for a subject must also be known to generation-time validation, and unknown refs must still fail
// on both paths.
//
// Runs against a real order so the assertion is made on the genuine analytical universe rather than
// a fixture that cannot satisfy the materiality engine.
//
//   node --env-file=.env.local --experimental-strip-types \
//     --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs \
//     scripts/joint-launch-review-authority-refs-tests.mjs <orderReference>

import {
  loadComprehensiveSubjectAuthority,
  validateComprehensiveSubject
} from '../src/lib/reports/comprehensive/subject-authority.ts';

const orderReference = process.argv[2];
if (!orderReference) {
  console.error('An order reference is required.');
  process.exit(2);
}

let failures = 0;
const check = (name, condition, detail) => {
  if (condition) { console.log(`  PASS  ${name}`); return; }
  failures += 1;
  console.error(`  FAIL  ${name}${detail ? ` -- ${detail}` : ''}`);
};

console.log(`joint-launch: Comprehensive review-authority reference universe (${orderReference})`);

const authority = await loadComprehensiveSubjectAuthority(orderReference);
const known = new Set(authority.allEvidenceRefs);

const byType = [
  ['finding', authority.findings],
  ['risk', authority.risks],
  ['control_design', authority.controlDesigns],
  ['decision', authority.decisions],
  ['management_action', authority.managementActions]
];

// 1. Every ref attached to an authorised subject of EVERY type is known at generation time.
//    This is the check that failed before the fix for the four non-finding types.
for (const [label, subjects] of byType) {
  check(`${label}: subjects exist`, subjects.length > 0);
  const refs = subjects.flatMap((s) => s.evidenceRefs);
  check(`${label}: at least one authority ref exists to bind`, refs.length > 0);
  const missing = [...new Set(refs.filter((ref) => !known.has(ref)))];
  check(
    `${label}: every subject ref is known at generation time`,
    missing.length === 0,
    missing.length ? `${missing.length} unknown, e.g. ${missing.slice(0, 3).join(', ')}` : ''
  );
}

// 2. Evidence-checklist refs are retained -- the union must not have replaced them.
check(
  'evidence: checklist refs retained in the universe',
  [...known].some((ref) => ref.startsWith('evidence:'))
);

// 3. Unknown refs remain unknown. The fix must not make anything valid that was not already
//    attached to an authorised subject or the checklist.
for (const bogus of ['evidence:EVID-DOES-NOT-EXIST-ZZZ', 'finding:MF-NOT-REAL-ZZZ', 'random-string', '']) {
  check(`unknown ref stays unknown: ${JSON.stringify(bogus)}`, !known.has(bogus));
}

// 4. Subject-specific save-time validation is unchanged. Pick a risk and a ref authorised for a
//    DIFFERENT subject: it is now in allEvidenceRefs, but must still be rejected for this subject.
const risk = authority.risks.find((s) => s.evidenceRefs.length > 0);
const foreignRef = authority.findings
  .flatMap((s) => s.evidenceRefs)
  .find((ref) => !risk.evidenceRefs.includes(ref));
if (risk && foreignRef) {
  let rejected = false;
  try { validateComprehensiveSubject(authority, 'risk', risk.subjectKey, [foreignRef]); }
  catch { rejected = true; }
  check('save-time still rejects a ref authorised for a different subject', rejected, foreignRef);
} else {
  check('save-time cross-subject fixture available', false, 'no suitable risk/foreign ref pair');
}

// 5. A ref genuinely authorised for the subject still passes save-time validation.
if (risk) {
  let accepted = true;
  try { validateComprehensiveSubject(authority, 'risk', risk.subjectKey, [risk.evidenceRefs[0]]); }
  catch (error) { accepted = false; console.error(`        (${error instanceof Error ? error.message : error})`); }
  check('save-time accepts the subject own ref', accepted);
  check('and that same ref is accepted at generation time', known.has(risk.evidenceRefs[0]));
}

// 6. Unknown refs still fail save-time validation.
if (risk) {
  let rejected = false;
  try { validateComprehensiveSubject(authority, 'risk', risk.subjectKey, ['finding:MF-NOT-REAL-ZZZ']); }
  catch { rejected = true; }
  check('save-time still rejects an unknown ref', rejected);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nAll review-authority reference checks passed.');
