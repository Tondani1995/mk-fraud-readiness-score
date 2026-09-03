#!/usr/bin/env node
import assert from 'node:assert/strict';
import { bindBlueprintTextProvenance, parseBlueprintMarkdown, validateBlueprintTextManuscript } from '../../src/lib/reports/narrative/blueprint-text.ts';
import { buildBoundedFixtureMarkdown, buildMotheoDeterministicFixture } from './comprehensive-phase-g-fixture.mjs';

const fixture = buildMotheoDeterministicFixture();
const conclusion = (value) => `Motheo's assessed position is ${value} out of 100 with Strategic maturity.`;

function validate(blueprint, markdown) {
  const parsed = parseBlueprintMarkdown(markdown, blueprint);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.errors));
  const narrative = bindBlueprintTextProvenance(parsed, { factPack: fixture.factPack, blueprint, generationId: 'numeric-provenance-regression' });
  return validateBlueprintTextManuscript(narrative, blueprint, fixture.factPack);
}

const eighty = validate(fixture.blueprint, buildBoundedFixtureMarkdown(fixture.blueprint, conclusion(80)));
assert.equal(eighty.hardTruth.status, 'PASS', JSON.stringify(eighty.hardTruth.issues));

const eightyOne = validate(fixture.blueprint, buildBoundedFixtureMarkdown(fixture.blueprint, conclusion(81)));
assert.equal(eightyOne.hardTruth.issues.some((issue) => issue.code === 'unsupported_numeric_claim' && /81/.test(issue.message)), true);

const scoreRemoved = structuredClone(fixture.blueprint);
const conclusionChapter = scoreRemoved.chapters.find((chapter) => chapter.chapterId === 'MANAGEMENT-CONCLUSION');
assert.ok(conclusionChapter);
const conclusionSection = conclusionChapter.sections.find((section) => section.sectionId === 'MANAGEMENT-CONCLUSION-SECTION');
assert.ok(conclusionSection);
for (const key of ['requiredFacts', 'claimRefs']) conclusionSection[key] = conclusionSection[key].filter((ref) => ref !== 'SCORE-001');
conclusionChapter.requiredFacts = conclusionChapter.requiredFacts.filter((ref) => ref !== 'SCORE-001');
conclusionChapter.claimRefs = conclusionChapter.claimRefs.filter((ref) => ref !== 'SCORE-001');
const removed = validate(scoreRemoved, buildBoundedFixtureMarkdown(scoreRemoved, conclusion(80)));
assert.equal(removed.hardTruth.issues.some((issue) => issue.code === 'unsupported_numeric_claim' && /80/.test(issue.message)), true);

const domainWide = validate(fixture.blueprint, buildBoundedFixtureMarkdown(fixture.blueprint, "Motheo's assessed position is 80 out of 100 across 10 domains with Strategic maturity."));
assert.equal(domainWide.hardTruth.issues.some((issue) => issue.code === 'unsupported_numeric_claim' && /10/.test(issue.message)), true, 'domain-wide counts must remain separately provenance-bound');

console.log(JSON.stringify({
  status: 'PASS',
  providerCalls: 0,
  scoreFactInConclusionScope: conclusionSection.requiredFacts.includes('SCORE-001') === false ? 'fixture-clone-only' : undefined,
  cases: {
    eightyWithScore001: 'PASS',
    eightyOneWithScore001: 'FAIL_AS_EXPECTED',
    eightyWithoutScore001: 'FAIL_AS_EXPECTED',
    domainWideCountWithoutDomainScope: 'FAIL_AS_EXPECTED'
  }
}, null, 2));
