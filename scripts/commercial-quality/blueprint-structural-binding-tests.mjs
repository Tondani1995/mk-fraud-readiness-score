#!/usr/bin/env node
/**
 * Blueprint structural binding — zero provider calls.
 *
 * A paid Essential generation returned HTTP 200, well inside its output ceiling, and was
 * still rejected because parseBlueprintMarkdown could not bind the returned headings to
 * blueprint identities. The response itself was never persisted, so the exact structural
 * error is unknown. These tests pin down which structural differences the parser treats
 * as fatal, so the next instrumented attempt can be classified immediately rather than
 * argued about.
 *
 * The parser compares headings positionally by exact level and title. That strictness is
 * deliberate: prose is bound to a blueprint node by position, so accepting a heading that
 * merely resembles the expected one would attach a customer's narrative to the wrong
 * section. Nothing here loosens it.
 *
 * Usage:
 *   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs \
 *     scripts/commercial-quality/blueprint-structural-binding-tests.mjs
 */
import assert from 'node:assert/strict';
import { parseBlueprintMarkdown, buildBlueprintMarkdownSkeleton } from '../../src/lib/reports/narrative/blueprint-text.ts';

/** Minimal blueprint exercising chapter, section and subsection levels. */
const blueprint = {
  chapters: [
    {
      chapterId: 'C1',
      title: 'Where the organisation stands',
      sections: [
        {
          sectionId: 'C1-S1',
          title: 'Recorded position',
          requiredFacts: [], claimRefs: [],
          optionalSubsections: [{ subsectionId: 'C1-S1-A', title: 'What the evidence shows', requiredFacts: [], claimRefs: [] }]
        }
      ]
    },
    {
      chapterId: 'C2',
      title: 'What management should do next',
      sections: [{ sectionId: 'C2-S1', title: 'Immediate priorities', requiredFacts: [], claimRefs: [], optionalSubsections: [] }]
    }
  ]
};

const skeleton = buildBlueprintMarkdownSkeleton(blueprint);
const prose = 'Management should read the deterministic exhibits alongside this explanation.';
const withProse = (markdown) => markdown.split('\n')
  .map((line) => (line.trim().startsWith('#') ? `${line}\n\n${prose}` : line))
  .join('\n');

const exact = withProse(String(skeleton.markdown ?? skeleton));
const codesOf = (markdown) => parseBlueprintMarkdown(markdown, blueprint).errors.map((issue) => issue.code);

const results = [];
const check = (id, description, classification, passed, detail) => {
  results.push({ id, description, classification, result: passed ? 'PASS' : 'FAIL', detail });
};

// ---- Baseline -------------------------------------------------------------
const baseline = parseBlueprintMarkdown(exact, blueprint);
check('S0', 'Exact skeleton with prose binds cleanly', 'SAFE',
  baseline.ok, baseline.ok ? 'ok' : codesOf(exact).join(','));

// ---- HARD STRUCTURAL FAILURES ---------------------------------------------
// Each of these changes which blueprint node prose would attach to, so none may ever
// be silently repaired.

const missingHeading = exact.split('\n').filter((line) => !line.startsWith('### ')).join('\n');
check('S1', 'Missing heading is fatal', 'HARD',
  !parseBlueprintMarkdown(missingHeading, blueprint).ok, codesOf(missingHeading).join(','));

const renamed = exact.replace('# Where the organisation stands', '# Current fraud readiness position');
check('S2', 'Semantically renamed heading is fatal', 'HARD',
  !parseBlueprintMarkdown(renamed, blueprint).ok, codesOf(renamed).join(','));

const reordered = [
  '# What management should do next', '', prose, '',
  '## Immediate priorities', '', prose, '',
  '# Where the organisation stands', '', prose, '',
  '## Recorded position', '', prose, '',
  '### What the evidence shows', '', prose, ''
].join('\n');
check('S3', 'Reordered headings are fatal', 'HARD',
  !parseBlueprintMarkdown(reordered, blueprint).ok, codesOf(reordered).join(','));

const wrongHierarchy = exact.replace('## Recorded position', '### Recorded position');
check('S4', 'Wrong heading hierarchy is fatal', 'HARD',
  !parseBlueprintMarkdown(wrongHierarchy, blueprint).ok, codesOf(wrongHierarchy).join(','));

const duplicated = `${exact}\n\n## Recorded position\n\n${prose}\n`;
check('S5', 'Duplicate heading is fatal', 'HARD',
  !parseBlueprintMarkdown(duplicated, blueprint).ok, codesOf(duplicated).join(','));

const preamble = `Here is the report you requested.\n\n${exact}`;
check('S6', 'Unsupported preamble is fatal', 'HARD',
  !parseBlueprintMarkdown(preamble, blueprint).ok, codesOf(preamble).join(','));

const noNarrative = String(skeleton.markdown ?? skeleton);
check('S7', 'Heading present without prose is fatal', 'HARD',
  !parseBlueprintMarkdown(noNarrative, blueprint).ok, codesOf(noNarrative).join(','));

// ---- Representational difference ------------------------------------------
// Emphasis around an otherwise identical title changes no identity, so it is the only
// candidate for safe canonicalisation. It is recorded, not acted on: with the real
// response unpersisted, adding canonicalisation now could mask the actual failure.
const emphasised = exact.replace('## Recorded position', '## **Recorded position**');
const emphasisRejected = !parseBlueprintMarkdown(emphasised, blueprint).ok;
check('S8', 'Emphasis-wrapped title is currently rejected (candidate for canonicalisation)', 'REPRESENTATIONAL',
  emphasisRejected, emphasisRejected ? codesOf(emphasised).join(',') : 'accepted as-is');

// ---- Analytical safety ----------------------------------------------------
// The parser only ever binds prose to nodes; it must never surface analytical values.
check('S9', 'Parser changes no analytical fact', 'SAFE',
  baseline.ok
  && baseline.chapters.every((chapter) => chapter.sections.every((section) =>
    section.paragraphs.every((block) => typeof block.text === 'string')
    && section.subsections.every((sub) => sub.paragraphs.every((block) => typeof block.text === 'string')))),
  'prose only; no scores, findings or severities produced');

for (const entry of results) {
  console.log(`${entry.result}  ${entry.id}  [${entry.classification}]  ${entry.description}  (${entry.detail})`);
}
const failures = results.filter((entry) => entry.result === 'FAIL');
if (failures.length) {
  console.error(`\nFAIL: ${failures.length} structural-binding expectation(s) not met.`);
  process.exit(1);
}
assert.equal(failures.length, 0);
console.log('\nPASS: every identity-changing structural difference is fatal; only emphasis is representational.');

// ---- Structural diagnostics (call-18 readiness) ----------------------------
const { buildManuscriptStructuralDiagnostics } = await import('../../src/lib/reports/narrative/manuscript-diagnostics.ts');
const diagOf = (markdown) => buildManuscriptStructuralDiagnostics({
  markdown, blueprint, parsed: parseBlueprintMarkdown(markdown, blueprint)
});

const dRenamed = diagOf(renamed);
const mRenamed = dRenamed.mismatches[0];
console.log(`${mRenamed && mRenamed.expectedTitle && mRenamed.receivedTitle ? 'PASS' : 'FAIL'}  D1  renamed heading yields received-vs-expected  (expected="${mRenamed?.expectedTitle}" received="${mRenamed?.receivedTitle}")`);

const dHier = diagOf(wrongHierarchy);
const mHier = dHier.mismatches[0];
console.log(`${mHier && mHier.expectedLevel !== mHier.receivedLevel ? 'PASS' : 'FAIL'}  D2  wrong hierarchy yields level diagnostic  (expected h${mHier?.expectedLevel} received h${mHier?.receivedLevel})`);

const dMissing = diagOf(missingHeading);
console.log(`${dMissing.receivedHeadingCount < dMissing.expectedHeadingCount ? 'PASS' : 'FAIL'}  D3  missing heading yields count diagnostic  (${dMissing.receivedHeadingCount}/${dMissing.expectedHeadingCount})`);

const dNoProse = diagOf(noNarrative);
const absent = dNoProse.parseErrors.filter((e) => e.code.startsWith('missing')).map((e) => e.path);
console.log(`${absent.length > 0 ? 'PASS' : 'FAIL'}  D4  missing narrative yields exact blueprint path  (${absent.slice(0, 3).join(',')})`);

const dExact = diagOf(exact);
console.log(`${dExact.mismatches.length === 0 ? 'PASS' : 'FAIL'}  D5  exact manuscript yields no mismatch  (${dExact.mismatches.length})`);
