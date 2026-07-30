/**
 * RC1 question-playbook semantic content review.
 *
 * scripts/rc1-question-playbook-coverage-tests.mjs proves *structural* completeness: 68/68
 * questions covered, every field populated, no exact-string duplication. That is not sufficient
 * for a paid advisory product -- 68 playbooks can each be structurally unique while being the same
 * paragraph with the control name substituted in. This suite tests the semantic claim instead:
 * that each playbook is actually about its own question, that fraud mechanisms and control designs
 * differ in substance rather than wording, that evidence is concrete and question-specific, and
 * that the text renders sensibly at maturity scores 0, 1 and 2 without inventing legal, regulatory
 * or assurance claims.
 *
 * Similarity is measured on content-word sets (stopwords and shared control vocabulary removed) so
 * that two playbooks describing genuinely different mechanisms score far apart even though both
 * legitimately use words like "control", "review" and "evidence".
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  AUTHORITATIVE_QUESTION_MAPPINGS,
  getQuestionPlaybook,
  listQuestionPlaybooks
} from '../src/lib/reports/evidence-model/question-playbooks.ts';

const root = process.cwd();
const seed = fs.readFileSync(path.join(root, 'supabase', 'migrations', '0003_phase5_methodology_seed.sql'), 'utf8');

const seedRowPattern =
  /\(\s*'(D\d+)'\s*,\s*'(D\d+-Q\d+)'\s*,\s*'(?:[^']|'')*'\s*,\s*'(?:[^']|'')*'\s*,\s*[\d.]+\s*,\s*(true|false)\s*,\s*(true|false)\s*,/g;
const questions = new Map();
for (const [, domainCode, code, isCritical, isHardGate] of seed.matchAll(seedRowPattern)) {
  questions.set(code, { domainCode, isCritical: isCritical === 'true', isHardGate: isHardGate === 'true' });
}
assert.equal(questions.size, 68);

const playbooks = listQuestionPlaybooks();
const byCode = new Map(playbooks.map((p) => [p.questionCode, p]));

// The 14 playbooks approved before RC1. The semantic bar applies to the whole registry, but the
// 54 new ones are the ones this review exists to police.
const PRE_RC1_APPROVED = new Set([
  'D1-Q01', 'D1-Q04', 'D3-Q03', 'D3-Q04', 'D4-Q02', 'D5-Q01', 'D5-Q05',
  'D6-Q01', 'D7-Q01', 'D7-Q04', 'D8-Q02', 'D8-Q04', 'D8-Q05', 'D9-Q01'
]);

let failures = 0;
let checks = 0;
function test(name, fn) {
  checks += 1;
  try {
    fn();
    console.log(`  ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`  FAIL - ${name}`);
    console.log(`    ${error.message.split('\n').slice(0, 6).join('\n    ')}`);
  }
}

// ---------------------------------------------------------------------------
// Text utilities
// ---------------------------------------------------------------------------
const STOPWORDS = new Set(`a an and are as at be been before between both by can cannot could
did do does each either every for from had has have how if in into is it its may might must no
nor not of on once only or other our out over own same should since so some such than that the
their them then there these they this those through to under until up upon was were what when
where whether which while who whom why will with within without would you your`.split(/\s+/));

// Vocabulary every fraud-control playbook legitimately shares. Excluded from similarity scoring so
// that shared professional register does not read as duplication.
const SHARED_CONTROL_VOCAB = new Set(`control controls fraud risk risks evidence review reviews
reviewed reviewer process processes owner owners ownership approve approved approval approvals
record records recorded recording report reports reporting escalate escalated escalation manage
management organisation organisations period periodic periodically must named name defined define
defines document documented documentation operate operates operating operational date dated due
complete completed completion require required requires requirement ensure ensures within against
each any all its per via such including include includes`.split(/\s+/));

function words(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
}

function contentWords(text) {
  return new Set(words(text).filter((w) => !SHARED_CONTROL_VOCAB.has(w)));
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared / (a.size + b.size - shared);
}

const label = (value, text, meaning, score) => ({ responseValue: value, label: text, operationalMeaning: meaning, normalisedScore: score });

// ---------------------------------------------------------------------------
// 1. Review-set coverage mandated by the controller.
// ---------------------------------------------------------------------------
const criticalCodes = [...questions].filter(([, q]) => q.isCritical).map(([c]) => c);
const hardGateCodes = [...questions].filter(([, q]) => q.isHardGate).map(([c]) => c);
const d2d10Codes = [...questions].filter(([, q]) => q.domainCode === 'D2' || q.domainCode === 'D10').map(([c]) => c);

const otherDomains = [...new Set([...questions.values()].map((q) => q.domainCode))].filter((d) => d !== 'D2' && d !== 'D10');
const nonCriticalByDomain = new Map();
for (const [code, q] of questions) {
  if (q.isCritical || q.domainCode === 'D2' || q.domainCode === 'D10') continue;
  if (!nonCriticalByDomain.has(q.domainCode)) nonCriticalByDomain.set(q.domainCode, []);
  nonCriticalByDomain.get(q.domainCode).push(code);
}

const reviewSet = new Set([
  ...criticalCodes,
  ...hardGateCodes,
  ...d2d10Codes,
  ...otherDomains.flatMap((d) => (nonCriticalByDomain.get(d) ?? []).slice(0, 2))
]);

test('R1. review set covers all critical, all hard-gate, all D2/D10 and >=2 non-critical per other domain', () => {
  assert.equal(criticalCodes.length, 19, 'expected 19 critical questions');
  assert.equal(hardGateCodes.length, 17, 'expected 17 hard-gate questions');
  assert.equal(d2d10Codes.length, 14, 'expected 14 D2+D10 questions');
  for (const code of [...criticalCodes, ...hardGateCodes, ...d2d10Codes]) {
    assert.ok(reviewSet.has(code), `${code} missing from the review set`);
  }
  for (const domain of otherDomains) {
    const picked = (nonCriticalByDomain.get(domain) ?? []).slice(0, 2);
    assert.ok(picked.length >= 2, `domain ${domain} contributed fewer than two non-critical questions`);
    for (const code of picked) assert.ok(reviewSet.has(code), `${code} missing from the review set`);
  }
  for (const code of reviewSet) assert.ok(byCode.has(code), `${code} has no playbook to review`);
});

// ---------------------------------------------------------------------------
// 2. Each playbook is anchored to its own question, not a neighbouring one.
// ---------------------------------------------------------------------------
test('R2. every reviewed playbook is anchored to distinctive terms from its own question prompt', () => {
  for (const code of reviewSet) {
    const playbook = byCode.get(code);
    const prompt = AUTHORITATIVE_QUESTION_MAPPINGS[code].prompt;

    // Terms that are distinctive to this prompt across the whole question population.
    const promptWords = contentWords(prompt);
    const distinctive = [...promptWords].filter((w) => {
      let occurrences = 0;
      for (const other of questions.keys()) {
        if (contentWords(AUTHORITATIVE_QUESTION_MAPPINGS[other].prompt).has(w)) occurrences += 1;
      }
      return occurrences <= 6;
    });
    if (distinctive.length === 0) continue;

    const body = contentWords([
      playbook.controlObjective, playbook.expectedStandard, playbook.fraudMechanism,
      playbook.recommendedControlDesign, playbook.evidenceRequired.join(' ')
    ].join(' '));
    const hits = distinctive.filter((w) => body.has(w) || [...body].some((b) => b.startsWith(w.slice(0, 6))));
    assert.ok(
      hits.length > 0,
      `${code}: playbook body shares no distinctive term with its own question prompt (distinctive: ${distinctive.slice(0, 8).join(', ')})`
    );
  }
});

// ---------------------------------------------------------------------------
// 3. Fraud mechanisms differ materially between questions.
// ---------------------------------------------------------------------------
test('R3. fraud mechanisms are materially different across all question pairs', () => {
  const worst = [];
  const codes = [...byCode.keys()];
  for (let i = 0; i < codes.length; i += 1) {
    for (let j = i + 1; j < codes.length; j += 1) {
      const score = jaccard(contentWords(byCode.get(codes[i]).fraudMechanism), contentWords(byCode.get(codes[j]).fraudMechanism));
      if (score >= 0.5) worst.push(`${codes[i]} vs ${codes[j]} = ${score.toFixed(2)}`);
    }
  }
  assert.deepEqual(worst, [], `fraud mechanisms too similar:\n  ${worst.slice(0, 10).join('\n  ')}`);
});

// ---------------------------------------------------------------------------
// 4. Control designs differ in mechanism, not only in the control's name.
// ---------------------------------------------------------------------------
test('R4. control designs differ in substance across all question pairs', () => {
  const worst = [];
  const codes = [...byCode.keys()];
  for (let i = 0; i < codes.length; i += 1) {
    for (let j = i + 1; j < codes.length; j += 1) {
      const score = jaccard(contentWords(byCode.get(codes[i]).recommendedControlDesign), contentWords(byCode.get(codes[j]).recommendedControlDesign));
      if (score >= 0.45) worst.push(`${codes[i]} vs ${codes[j]} = ${score.toFixed(2)}`);
    }
  }
  assert.deepEqual(worst, [], `control designs too similar:\n  ${worst.slice(0, 10).join('\n  ')}`);
});

// ---------------------------------------------------------------------------
// 5. Template-substitution detection: strip each playbook's own distinctive
//    terms and confirm the remaining skeleton is not shared.
// ---------------------------------------------------------------------------
test('R5. no playbook is another playbook with the question name substituted in', () => {
  const skeletons = new Map();
  for (const [code, playbook] of byCode) {
    const own = contentWords(AUTHORITATIVE_QUESTION_MAPPINGS[code].prompt);
    const skeleton = words(`${playbook.controlObjective} ${playbook.expectedStandard} ${playbook.recommendedControlDesign}`)
      .filter((w) => !own.has(w))
      .join(' ');
    skeletons.set(code, skeleton);
  }
  const collisions = [];
  const codes = [...skeletons.keys()];
  for (let i = 0; i < codes.length; i += 1) {
    for (let j = i + 1; j < codes.length; j += 1) {
      const a = new Set(skeletons.get(codes[i]).split(' '));
      const b = new Set(skeletons.get(codes[j]).split(' '));
      const score = jaccard(a, b);
      if (score >= 0.6) collisions.push(`${codes[i]} vs ${codes[j]} = ${score.toFixed(2)}`);
    }
  }
  assert.deepEqual(collisions, [], `template-substitution suspected:\n  ${collisions.slice(0, 10).join('\n  ')}`);
});

// ---------------------------------------------------------------------------
// 6. Evidence requirements are concrete and question-specific.
// ---------------------------------------------------------------------------
test('R6. evidence requirements are concrete artefacts, not generic "documentation"', () => {
  const GENERIC_ONLY = new Set(['documentation', 'documents', 'evidence', 'records', 'reports', 'policy', 'process', 'procedure', 'controls']);
  for (const code of reviewSet) {
    for (const item of byCode.get(code).evidenceRequired) {
      const tokens = words(item);
      assert.ok(tokens.length >= 2, `${code}: evidence item "${item}" is not specific enough`);
      assert.ok(
        tokens.some((t) => !GENERIC_ONLY.has(t)),
        `${code}: evidence item "${item}" is generic boilerplate`
      );
    }
  }
});

test('R7. evidence sets are question-specific rather than a shared checklist', () => {
  const worst = [];
  const codes = [...byCode.keys()];
  for (let i = 0; i < codes.length; i += 1) {
    for (let j = i + 1; j < codes.length; j += 1) {
      const score = jaccard(contentWords(byCode.get(codes[i]).evidenceRequired.join(' ')), contentWords(byCode.get(codes[j]).evidenceRequired.join(' ')));
      if (score >= 0.5) worst.push(`${codes[i]} vs ${codes[j]} = ${score.toFixed(2)}`);
    }
  }
  assert.deepEqual(worst, [], `evidence sets too similar:\n  ${worst.slice(0, 10).join('\n  ')}`);
});

// ---------------------------------------------------------------------------
// 7. Ownership and operating rhythm are differentiated, not one default.
// ---------------------------------------------------------------------------
test('R8. accountability, ownership and operating rhythm vary across the registry', () => {
  const distinct = (field) => new Set(playbooks.map((p) => p[field].trim().toLowerCase())).size;
  assert.ok(distinct('executiveAccountability') >= 6, `executiveAccountability only has ${distinct('executiveAccountability')} distinct values`);
  assert.ok(distinct('processOwnership') >= 20, `processOwnership only has ${distinct('processOwnership')} distinct values`);
  assert.ok(distinct('oversightFunction') >= 6, `oversightFunction only has ${distinct('oversightFunction')} distinct values`);
  assert.ok(distinct('operatingFrequency') >= 25, `operatingFrequency only has ${distinct('operatingFrequency')} distinct values`);

  // No single owner may dominate the registry.
  const counts = new Map();
  for (const p of playbooks) counts.set(p.processOwnership, (counts.get(p.processOwnership) ?? 0) + 1);
  const [topOwner, topCount] = [...counts].sort((a, b) => b[1] - a[1])[0];
  assert.ok(topCount <= 8, `process ownership concentrated on "${topOwner}" for ${topCount} questions`);
});

// ---------------------------------------------------------------------------
// 8. The finding renders sensibly at maturity scores 0, 1 and 2.
// ---------------------------------------------------------------------------
test('R9. diagnosis text is score-appropriate and distinct at 0, 1 and 2', () => {
  const scale = [
    label(0, 'Not in place', 'no control operating', 0),
    label(1, 'Ad hoc or informal', 'inconsistent and undocumented', 20),
    label(2, 'Partially implemented', 'operating for part of the population', 40)
  ];
  for (const code of reviewSet) {
    const playbook = byCode.get(code);
    const rendered = scale.map((l) => playbook.currentStateDiagnosis(l));
    assert.equal(new Set(rendered).size, 3, `${code}: diagnosis does not differ across scores 0, 1 and 2`);
    for (const [index, text] of rendered.entries()) {
      assert.ok(text.includes(scale[index].label), `${code}: diagnosis at score ${index} does not state the selected label`);
      assert.match(text, /self-reported/i, `${code}: diagnosis at score ${index} must not present the response as verified`);
      // The recommended control is a target state and must not assume the control already operates.
      assert.doesNotMatch(text, /\b(?:we|the assessor) (?:confirmed|verified|found)\b/i, `${code}: diagnosis claims verification`);
    }
  }
});

// ---------------------------------------------------------------------------
// 9. No invented legal, regulatory or assurance claims.
// ---------------------------------------------------------------------------
test('R10. no invented legal, regulatory, standards or assurance claims', () => {
  const FORBIDDEN = [
    /\bPOPIA\b/i, /\bFICA?\b/, /\bB-?BBEE\b/i, /\bKing\s+I?V\b/i, /\bCompanies Act\b/i,
    /\bsection\s+\d+/i, /\bregulation\s+\d+/i, /\bISO\s?\d{4,}/i, /\bSOC\s?[12]\b/i,
    /\bPCI[\s-]?DSS\b/i, /\bGDPR\b/i, /\bSARB\b/i, /\bFSCA\b/i, /\bSARS\b/i,
    /\baudit opinion\b/i, /\bassurance opinion\b/i,
    /\blegally required\b/i, /\bstatutory requirement\b/i, /\bregulator requires\b/i,
    // External certification claims only. "recertify"/"recertification" and "independently
    // certified" describe internal periodic control recertification (an access-review term used by
    // the approved D1-Q04, D3-Q04 and D8-Q04 playbooks) and are legitimate; what must never appear
    // is a claim that the organisation holds, or that this report confers, an external certificate.
    /\bcertification (?:body|authority|standard|scheme)\b/i,
    /\bcertificate of\b/i,
    /\bwe (?:certify|are certified)\b/i,
    /\b(?:is|are|becomes?) certified (?:to|under|against)\b/i
  ];
  for (const [code, playbook] of byCode) {
    const haystack = [
      playbook.controlObjective, playbook.expectedStandard, playbook.fraudMechanism,
      playbook.recommendedControlDesign, playbook.effectivenessMeasure, playbook.escalationThreshold,
      playbook.evidenceRequired.join(' '), playbook.minimumAcceptableEvidenceCharacteristics.join(' '),
      playbook.dependencies.join(' ')
    ].join('\n');
    for (const pattern of FORBIDDEN) {
      assert.doesNotMatch(haystack, pattern, `${code}: contains an invented legal/regulatory/assurance claim matching ${pattern}`);
    }
  }
});

// ---------------------------------------------------------------------------
// 10. D2 and D10 receive explicit scrutiny -- they had zero prior coverage.
// ---------------------------------------------------------------------------
test('R11. every D2 and D10 playbook is substantive and mutually distinct', () => {
  for (const code of d2d10Codes) {
    const playbook = byCode.get(code);
    assert.ok(playbook.recommendedControlDesign.trim().length >= 200, `${code}: control design is too thin for a zero-coverage domain`);
    assert.ok(playbook.fraudMechanism.trim().length >= 80, `${code}: fraud mechanism is too thin`);
    assert.ok(playbook.evidenceRequired.length >= 3, `${code}: fewer than three evidence artefacts`);
    assert.equal(PRE_RC1_APPROVED.has(code), false, `${code}: unexpectedly treated as pre-RC1 approved`);
  }
  for (let i = 0; i < d2d10Codes.length; i += 1) {
    for (let j = i + 1; j < d2d10Codes.length; j += 1) {
      const score = jaccard(
        contentWords(byCode.get(d2d10Codes[i]).recommendedControlDesign),
        contentWords(byCode.get(d2d10Codes[j]).recommendedControlDesign)
      );
      assert.ok(score < 0.4, `${d2d10Codes[i]} vs ${d2d10Codes[j]}: D2/D10 control designs too similar (${score.toFixed(2)})`);
    }
  }
});

// ---------------------------------------------------------------------------
// 11. Critical and hard-gate questions carry differentiated escalation and
//     effectiveness language, not one shared threshold sentence.
// ---------------------------------------------------------------------------
test('R12. critical and hard-gate escalation and effectiveness text is question-specific', () => {
  const gated = [...new Set([...criticalCodes, ...hardGateCodes])];
  for (const field of ['escalationThreshold', 'effectivenessMeasure']) {
    const worst = [];
    for (let i = 0; i < gated.length; i += 1) {
      for (let j = i + 1; j < gated.length; j += 1) {
        const score = jaccard(contentWords(byCode.get(gated[i])[field]), contentWords(byCode.get(gated[j])[field]));
        if (score >= 0.5) worst.push(`${gated[i]} vs ${gated[j]} = ${score.toFixed(2)}`);
      }
    }
    assert.deepEqual(worst, [], `${field} too similar across gated questions:\n  ${worst.slice(0, 8).join('\n  ')}`);
  }
});

console.log('');
console.log(`rc1-question-playbook-semantic-review: ${checks - failures}/${checks} checks passed `
  + `(review set ${reviewSet.size} questions: ${criticalCodes.length} critical, ${hardGateCodes.length} hard-gate, ${d2d10Codes.length} D2/D10)`);
if (failures > 0) process.exit(1);
