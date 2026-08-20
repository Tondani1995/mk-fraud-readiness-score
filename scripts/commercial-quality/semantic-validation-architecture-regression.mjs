#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  adjudicateTextFirstValidation,
  essentialCandidateId,
  essentialSemanticSpanHash,
  validateEssentialFinalHtml
} from '../../src/lib/reports/essential-validation-cascade.ts';
import { assertProtectedRepairFacts } from '../../src/lib/reports/narrative/essential-manuscript-coordinator.ts';
import { composeEssentialManuscript } from '../../src/lib/reports/narrative/essential-manuscript-coordinator.ts';
import { buildComprehensiveDeliveryModel } from '../../src/lib/reports/comprehensive/contract.ts';
import { comprehensiveFixtures } from '../../src/lib/reports/comprehensive/fixtures.ts';
import { buildComprehensiveNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildBlueprintMarkdownSkeleton, parseBlueprintMarkdown, validateBlueprintTextManuscript } from '../../src/lib/reports/narrative/blueprint-text.ts';
import { buildReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { emptyNarrativeRecoveryBudget } from '../../src/lib/reports/narrative/recovery-policy.ts';
import { replaceTargetBlock } from '../../src/lib/reports/narrative/whole-manuscript-recovery.ts';
import { buildSemanticReviewRequestPayload } from '../../src/lib/reports/narrative/whole-manuscript-writer.ts';
import {
  assertInternalSemanticReviewResult,
  semanticReviewEnvelopeSchema,
  validateSemanticReviewEnvelope
} from '../../src/lib/reports/narrative/semantic-reviewer.ts';

const emptyFacts = { facts: [] };

const CORPUS = [
  {
    category: 'MUST_ALLOW',
    code: 'assurance_claim',
    text: 'Neither measure is independent assurance.',
    disposition: 'ALLOW'
  },
  {
    category: 'MUST_ALLOW',
    code: 'assurance_claim',
    text: 'No document, interview, transaction sample or system evidence has been independently verified for any item.',
    disposition: 'ALLOW'
  },
  {
    category: 'MUST_REPAIR',
    code: 'unsupported_workforce_claim',
    text: 'Knowledge is held by one or two people.',
    disposition: 'REPAIR',
    replacementProse: 'Control responsibility should be documented and cross-trained across the relevant process so that continuity does not depend on undocumented knowledge concentration.'
  },
  {
    category: 'MUST_REPAIR',
    code: 'unsupported_detection_absolute',
    text: 'Without deliberate monitoring, fraud is found only by accident.',
    candidateSpan: 'fraud is found only by accident',
    disposition: 'REPAIR',
    replacementProse: 'Without deliberate monitoring, suspicious activity may not be detected or escalated consistently before losses or exceptions compound.'
  },
  {
    category: 'MUST_REJECT',
    code: 'assurance_claim',
    text: 'This report provides independent assurance that the controls are effective.',
    disposition: 'REJECT'
  },
  {
    category: 'MUST_REJECT',
    code: 'unsupported_comparative_claim',
    text: 'The organisation is ahead of peers of similar size.',
    disposition: 'REJECT'
  },
  {
    category: 'MUST_HOLD',
    code: 'assurance_claim',
    text: 'Independent review outcomes vary.',
    disposition: 'HOLD'
  }
];

function minimalParsed(text) {
  return {
    ok: true,
    markdown: `# Chapter\n\n## Section\n\n${text}`,
    errors: [],
    chapters: [{
      chapterId: 'C',
      title: 'Chapter',
      sections: [{
        chapterId: 'C',
        sectionId: 'SEC',
        title: 'Section',
        paragraphs: [{ text, permittedClaimRefs: [] }],
        subsections: [],
        permittedClaimRefs: []
      }]
    }]
  };
}

function reportFor(entry) {
  const candidateSpan = entry.candidateSpan ?? entry.text;
  return {
    ok: true,
    hardTruth: { status: 'PASS', issues: [] },
    semanticCandidates: {
      status: 'CANDIDATES',
      issues: [{
        code: entry.code,
        severity: 'SEMANTIC_CANDIDATE',
        path: 'SEC.paragraphs[0]',
        matchedSpan: candidateSpan,
        message: `Candidate: ${entry.text}`
      }]
    },
    repairableSemantic: { status: 'PASS', issues: [] },
    quality: { status: 'PASS', issues: [] },
    sectionCount: 1,
    subsectionCount: 0,
    paragraphCount: 1
  };
}

function reviewerInput(entry) {
  const candidateSpan = entry.candidateSpan ?? entry.text;
  return {
    candidateId: essentialCandidateId(entry.code, 'SEC.paragraphs[0]', candidateSpan),
    ruleCode: entry.code,
    path: 'SEC.paragraphs[0]',
    candidateSpan,
    paragraph: entry.text,
    surroundingProse: entry.text,
    blueprintPath: 'SEC',
    chapterTitle: 'Chapter',
    sectionTitle: 'Section',
    permittedClaimRefs: [],
    permittedFacts: [],
    requiredManagementTakeaway: 'Keep the management implication supported and actionable.',
    assuranceBoundary: 'The assessment does not independently verify operating effectiveness.'
  };
}

function fakeReviewer(entries) {
  let calls = 0;
  return {
    get calls() { return calls; },
    async review(input) {
      calls += 1;
      assert.equal(input.candidates.length, entries.length);
      assert.ok(input.candidates.every((candidate) => candidate.paragraph && candidate.blueprintPath && candidate.assuranceBoundary));
      return {
        decisions: input.candidates.map((candidate, index) => {
          const entry = entries[index];
          return {
            candidateId: candidate.candidateId,
            disposition: entry.disposition,
            reasonCode: `${entry.category.toLowerCase()}_fixture`,
            reason: `Provider-free ${entry.category} semantic fixture.`,
            ...(entry.disposition === 'REPAIR' ? { replacementProse: entry.replacementProse } : {})
          };
        })
      };
    }
  };
}

async function adjudicate(entry) {
  const input = reviewerInput(entry);
  const reviewer = fakeReviewer([entry]);
  const result = assertInternalSemanticReviewResult({ candidates: [input] }, await reviewer.review({ candidates: [input] }));
  const cascade = adjudicateTextFirstValidation({
    parsed: minimalParsed(entry.text),
    report: reportFor(entry),
    factPack: emptyFacts,
    semanticDecisions: result.decisions,
    requireSemanticReviewer: true
  });
  return { cascade, reviewer, result };
}

for (const entry of CORPUS) {
  test(`${entry.category}: ${entry.text}`, async () => {
    const { cascade, reviewer, result } = await adjudicate(entry);
    assert.equal(reviewer.calls, 1, 'all candidates in a case use one bounded reviewer call');
    assert.equal(result.decisions.length, 1);
    if (entry.disposition === 'ALLOW') {
      assert.equal(cascade.publishable, true);
      assert.equal(cascade.candidates[0].finalDisposition, 'ACCEPT');
    } else if (entry.disposition === 'REPAIR') {
      assert.equal(cascade.publishable, false);
      assert.deepEqual(cascade.repairCodes, [entry.code]);
      assert.equal(cascade.blockingCodes.length, 0);
      assert.equal(cascade.heldForReviewCodes.length, 0);
    } else if (entry.disposition === 'REJECT') {
      assert.equal(cascade.publishable, false);
      assert.ok(cascade.blockingCodes.includes(entry.code));
      assert.equal(cascade.heldForReviewCodes.length, 0);
    } else {
      assert.equal(cascade.publishable, false);
      assert.ok(cascade.heldForReviewCodes.includes(entry.code));
      assert.equal(cascade.blockingCodes.length, 0);
    }
  });
}

test('one reviewer request covers multiple candidates', async () => {
  const entries = CORPUS.slice(0, 2);
  const inputs = entries.map(reviewerInput);
  const reviewer = fakeReviewer(entries);
  const result = assertInternalSemanticReviewResult({ candidates: inputs }, await reviewer.review({ candidates: inputs }));
  assert.equal(reviewer.calls, 1);
  assert.equal(result.decisions.length, 2);
});

test('hard deterministic gates cannot be overridden by semantic ALLOW', () => {
  const text = 'The reported score is 91.';
  const result = adjudicateTextFirstValidation({
    parsed: minimalParsed(text),
    report: {
      ok: false,
      hardTruth: { status: 'FAIL', issues: [{ code: 'unsupported_numeric_claim', severity: 'HARD_TRUTH_FAILURE', path: 'SEC.paragraphs[0]', message: '91 is absent.' }] },
      semanticCandidates: { status: 'PASS', issues: [] },
      repairableSemantic: { status: 'PASS', issues: [] },
      quality: { status: 'PASS', issues: [] },
      sectionCount: 1,
      subsectionCount: 0,
      paragraphCount: 1
    },
    factPack: emptyFacts,
    semanticDecisions: [{ candidateId: 'unsupported_numeric_claim:fixture', disposition: 'ALLOW', reasonCode: 'fixture', reason: 'not applicable' }],
    requireSemanticReviewer: true
  });
  assert.equal(result.publishable, false);
  assert.ok(result.blockingCodes.includes('unsupported_numeric_claim'));
});

test('bounded repair replaces exactly one Blueprint block and preserves protected numeric facts', () => {
  const before = '# Chapter\n\n## Section\n\nThe score is 42 and the action is due in 30 days.';
  const after = replaceTargetBlock(
    before,
    'Section',
    2,
    'The score is 42 and the action is due in 30 days.',
    'The score is 42 and the action remains due in 30 days, with ownership documented.'
  );
  assert.doesNotMatch(after, /The score is 42 and the action is due in 30 days\.$/);
  assert.match(after, /score is 42/);
  assert.match(after, /due in 30 days/);
  assert.throws(() => assertProtectedRepairFacts(
    'The score is 42 and the action is due in 30 days.',
    'The score is 43 and the action remains due in 30 days.'
  ), /protected_numeric_facts/);
  assert.doesNotThrow(() => assertProtectedRepairFacts(
    'The score is 42 and the action is due in 30 days.',
    'The score is 42 and the action remains due in 30 days.'
  ));
});

test('final HTML carries forward unchanged semantic acceptance and holds new candidates', async () => {
  const entry = CORPUS.find((item) => item.code === 'unsupported_detection_absolute');
  assert.ok(entry);
  const { cascade } = await adjudicate(entry);
  assert.equal(cascade.acceptedSemanticDecisions.length, 0, 'the repair case is not carried as ALLOW');

  const allowed = { ...entry, disposition: 'ALLOW' };
  const allowedResult = await adjudicate(allowed);
  const html = '<html><body><p>Without deliberate monitoring, fraud is found only by accident.</p></body></html>';
  const inherited = validateEssentialFinalHtml({
    html,
    data: {},
    carryForwardSemanticDecisions: allowedResult.cascade.acceptedSemanticDecisions
  });
  assert.equal(inherited.publishable, true);
  assert.equal(inherited.candidates[0].finalDisposition, 'ACCEPT');

  const held = validateEssentialFinalHtml({ html, data: {} });
  assert.equal(held.publishable, false);
  assert.ok(held.heldForReviewCodes.includes('unsupported_detection_absolute'));
  assert.equal(held.blockingCodes.length, 0);
  assert.equal(allowedResult.cascade.acceptedSemanticDecisions[0]?.spanHash, essentialSemanticSpanHash('fraud is found only by accident'));
});

test('final HTML binds reviewed provider blocks by exact Blueprint path and content', () => {
  const paragraph = 'Oversight is coordinated through a regional hub.';
  const path = 'SEC.paragraphs[0]';
  const result = adjudicateTextFirstValidation({
    parsed: minimalParsed(paragraph),
    report: {
      ok: true,
      hardTruth: { status: 'PASS', issues: [] },
      semanticCandidates: { status: 'PASS', issues: [] },
      repairableSemantic: { status: 'PASS', issues: [] },
      quality: { status: 'PASS', issues: [] },
      sectionCount: 1,
      subsectionCount: 0,
      paragraphCount: 1
    },
    factPack: emptyFacts,
    semanticGroundingBlocks: [{ path, span: paragraph }],
    semanticDecisions: [{
      candidateId: essentialCandidateId('semantic_grounding_block', path, paragraph),
      disposition: 'ALLOW',
      reasonCode: 'fixture_allow',
      reason: 'Provider-free exact-block allow.'
    }],
    requireSemanticReviewer: true
  });
  assert.equal(result.publishable, true);
  const carry = result.acceptedSemanticDecisions;
  const valid = validateEssentialFinalHtml({
    html: `<html><body><p data-narrative-block="${path}">${paragraph}</p></body></html>`,
    data: {},
    carryForwardSemanticDecisions: carry
  });
  assert.equal(valid.publishable, true);
  const changed = validateEssentialFinalHtml({
    html: `<html><body><p data-narrative-block="${path}">Oversight is coordinated through a local team.</p></body></html>`,
    data: {},
    carryForwardSemanticDecisions: carry
  });
  assert.equal(changed.publishable, false);
  assert.ok(changed.blockingCodes.includes('semantic_grounding_block_content_changed'));
});

test('structured semantic envelope accepts all four dispositions and truthfully retains multiple repairs', () => {
  const entries = CORPUS.slice(0, 5);
  const inputs = entries.map(reviewerInput);
  const envelope = {
    decisions: inputs.map((candidate, index) => ({
      reviewId: `B${String(index + 1).padStart(2, '0')}`,
      disposition: ['ALLOW', 'REPAIR', 'REJECT', 'HOLD', 'REPAIR'][index],
      reasonCode: `fixture_${index}`
    })),
    repair: null
  };
  const schemaResult = semanticReviewEnvelopeSchema.parse(envelope);
  const result = validateSemanticReviewEnvelope({ candidates: inputs }, schemaResult);
  assert.deepEqual(result.decisions.map((decision) => decision.disposition), ['ALLOW', 'REPAIR', 'REJECT', 'HOLD', 'REPAIR']);
  assert.equal(result.decisions.filter((decision) => decision.disposition === 'REPAIR').length, 2);
});

test('semantic provider envelope fails closed on omission, duplicate, unknown and malformed IDs', () => {
  const entries = CORPUS.slice(2, 4);
  const inputs = entries.map(reviewerInput);
  assert.throws(
    () => validateSemanticReviewEnvelope({ candidates: inputs }, { decisions: [{ reviewId: 'B01', disposition: 'ALLOW', reasonCode: 'fixture' }], repair: null }),
    (error) => error?.semanticReviewFailureCode === 'semantic_candidate_count_mismatch'
  );
  assert.throws(
    () => validateSemanticReviewEnvelope({ candidates: inputs }, {
      decisions: [
        { reviewId: 'B01', disposition: 'ALLOW', reasonCode: 'fixture' },
        { reviewId: 'B01', disposition: 'ALLOW', reasonCode: 'fixture' }
      ],
      repair: null
    }),
    (error) => error?.semanticReviewFailureCode === 'semantic_deterministic_validation_failed'
  );
  assert.throws(
    () => validateSemanticReviewEnvelope({ candidates: inputs }, {
      decisions: [
        { reviewId: 'B99', disposition: 'ALLOW', reasonCode: 'fixture' },
        { reviewId: 'B02', disposition: 'ALLOW', reasonCode: 'fixture' }
      ],
      repair: null
    }),
    (error) => error?.semanticReviewFailureCode === 'semantic_unknown_candidate'
  );
  const malformed = semanticReviewEnvelopeSchema.parse({ decisions: [{ reviewId: 'B01', disposition: 'REPAIR', reasonCode: 'fixture' }], repair: null });
  assert.throws(() => validateSemanticReviewEnvelope({ candidates: [reviewerInput(entries[0])] }, malformed), /exactly one REPAIR/);
  const malformedRepair = semanticReviewEnvelopeSchema.parse({
    decisions: [
      { reviewId: 'B01', disposition: 'REPAIR', reasonCode: 'fixture' },
      { reviewId: 'B02', disposition: 'ALLOW', reasonCode: 'fixture' }
    ],
    repair: { reviewId: 'B99', replacementProse: 'Management should document the bounded control route.' }
  });
  assert.throws(
    () => validateSemanticReviewEnvelope({ candidates: inputs }, malformedRepair),
    (error) => error?.semanticReviewFailureCode === 'semantic_unknown_candidate'
  );
  assert.throws(
    () => validateSemanticReviewEnvelope({ candidates: inputs }, {
      decisions: [
        { reviewId: 'B01', disposition: 'REPAIR', reasonCode: 'fixture' },
        { reviewId: 'B02', disposition: 'ALLOW', reasonCode: 'fixture' }
      ],
      repair: { reviewId: 'malformed', replacementProse: 'Management should document the bounded control route.' }
    }),
    (error) => error?.semanticReviewFailureCode === 'semantic_structured_output_invalid'
  );
});

test('semantic request preserves every grounding field and does not compact input evidence', () => {
  const sharedFact = { id: 'FACT-SHARED', kind: 'finding', value: 'A shared deterministic fact used by multiple blocks.' };
  const inputs = [reviewerInput(CORPUS[0]), reviewerInput(CORPUS[1])].map((candidate) => ({
    ...candidate,
    permittedFacts: [sharedFact]
  }));
  const payload = buildSemanticReviewRequestPayload({ candidates: inputs });
  assert.deepEqual(payload.blocks.map((block) => block.reviewId), ['B01', 'B02']);
  assert.deepEqual(payload.blocks.map((block) => block.permittedFacts), [[sharedFact], [sharedFact]]);
  for (const [index, block] of payload.blocks.entries()) {
    const source = inputs[index];
    assert.equal(block.candidateId, source.candidateId);
    assert.equal(block.ruleCode, source.ruleCode);
    assert.equal(block.path, source.path);
    assert.equal(block.candidateSpan, source.candidateSpan);
    assert.equal(block.paragraph, source.paragraph);
    assert.equal(block.surroundingProse, source.surroundingProse);
    assert.equal(block.blueprintPath, source.blueprintPath);
    assert.equal(block.chapterTitle, source.chapterTitle);
    assert.equal(block.sectionTitle, source.sectionTitle);
    assert.deepEqual(block.permittedClaimRefs, source.permittedClaimRefs);
    assert.deepEqual(block.permittedFacts, source.permittedFacts);
    assert.equal(block.requiredManagementTakeaway, source.requiredManagementTakeaway);
    assert.equal(block.assuranceBoundary, source.assuranceBoundary);
    assert.deepEqual(block.warningSignals, source.warningSignals);
  }
  assert.equal(JSON.stringify(payload).split('A shared deterministic fact used by multiple blocks.').length - 1, 2);
});

test('semantic reviewer source uses provider structured output and never reparses free-text JSON', () => {
  const source = fs.readFileSync('src/lib/reports/narrative/whole-manuscript-writer.ts', 'utf8');
  assert.match(source, /Output\.object\(\{\s*schema:\s*semanticReviewEnvelopeSchema/);
  assert.match(source, /response\.output/);
  assert.doesNotMatch(source, /const raw = JSON\.parse\(String\(response\.text/);
  assert.match(source, /maxRetries:\s*0/);
  assert.match(source, /structuredOutput:\s*true/);
  assert.match(source, /semanticReviewExecutionContract/);
  const coordinatorSource = fs.readFileSync('src/lib/reports/narrative/essential-manuscript-coordinator.ts', 'utf8');
  assert.match(coordinatorSource, /reviewed = await semanticReviewer\.review\(\{ candidates: reviewInput \}\)/);
  assert.doesNotMatch(coordinatorSource, /validateSemanticReview(?:Envelope|Result)/);
});

function coordinatorFixture() {
  const deliveryModel = buildComprehensiveDeliveryModel(comprehensiveFixtures.denseWeakAssessment.analytical);
  const factPack = buildComprehensiveNarrativeFactPack(deliveryModel);
  const storyPlan = buildNarrativeStoryPlan(factPack);
  assertNarrativeStoryPlan(storyPlan, factPack);
  const blueprint = buildReportBlueprint(factPack, storyPlan);
  const firstSection = blueprint.chapters.flatMap((chapter) => chapter.sections)[0];
  assert.ok(firstSection);
  const skeleton = buildBlueprintMarkdownSkeleton(blueprint);
  const markdown = skeleton.headings.map((heading, index) => {
    const headingLine = `${'#'.repeat(heading.level)} ${heading.title}`;
    if (heading.kind === 'chapter') return headingLine;
    const paragraph = heading.title === firstSection.title
      ? 'Knowledge is held by one or two people. Management should document the control response.'
      : `Management should preserve the deterministic management takeaway for this Blueprint section, with distinct action context ${String.fromCharCode(65 + (index % 26))}.`;
    return `${headingLine}\n\n${paragraph}`;
  }).join('\n\n');

  return {
    factPack,
    blueprint,
    markdown,
    writerMetadata: {
    contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
    architecture: 'whole-manuscript',
    provider: 'test-injected',
    model: 'test-injected/semantic-reviewer',
    promptVersion: 'test',
    generationMode: 'test-injected',
    generatedAt: new Date(0).toISOString(),
    inputFactPackSha256: 'fixture',
    inputStoryPlanSha256: 'fixture',
    recovery: { ...emptyNarrativeRecoveryBudget(), initialGenerationCount: 1, totalCalls: 1 }
    }
  };
}

function fixtureWriter({ blueprint, markdown, writerMetadata }) {
  const writer = {
    provider: 'test-injected',
    model: 'test-injected/semantic-reviewer',
    promptVersion: 'test',
    async writeManuscript() { return { contractVersion: writerMetadata.contractVersion, architecture: 'whole-manuscript', markdown, blueprint, writerMetadata }; },
    async completeTail() { throw new Error('tail recovery must not be called'); },
    async repairBlock() { throw new Error('legacy repair path must not be called'); },
    async coherencePass() { throw new Error('coherence recovery must not be called'); }
  };
  return writer;
}

function providerEnvelopeFor(input, repairCandidateId) {
  const repairIndex = repairCandidateId
    ? input.candidates.findIndex((candidate) => candidate.candidateId === repairCandidateId)
    : -1;
  if (repairCandidateId) assert.ok(repairIndex >= 0);
  else assert.equal(repairIndex, -1);
  return {
    decisions: input.candidates.map((candidate, index) => ({
      reviewId: `B${String(index + 1).padStart(2, '0')}`,
      disposition: index === repairIndex ? 'REPAIR' : 'ALLOW',
      reasonCode: index === repairIndex ? 'provider_mapped_repair' : 'provider_mapped_allow'
    })),
    repair: repairIndex >= 0
      ? { reviewId: `B${String(repairIndex + 1).padStart(2, '0')}`, replacementProse: 'Management should document and cross-train control responsibilities across the relevant process.' }
      : null
  };
}

test('all-ALLOW provider envelope maps once and reaches the coordinator as an internal result', async () => {
  const fixture = coordinatorFixture();
  const writer = fixtureWriter(fixture);
  let reviewerCalls = 0;
  let mapped;
  writer.reviewSemanticCandidates = async (input) => {
    reviewerCalls += 1;
    mapped = validateSemanticReviewEnvelope({ candidates: input.candidates }, semanticReviewEnvelopeSchema.parse(providerEnvelopeFor(input)));
    assert.equal(mapped.repair, null);
    assert.ok(mapped.decisions.every((decision) => decision.candidateId && !('reviewId' in decision)));
    return { ...mapped, accounting: { providerCalls: 0, repairCount: 0 } };
  };
  const composed = await composeEssentialManuscript({ factPack: fixture.factPack, writer });
  assert.equal(reviewerCalls, 1);
  assert.equal(composed.manuscript.writerMetadata.totalProviderCalls, 1, 'the provider-free seam adds no physical provider call');
  assert.equal(composed.manuscript.writerMetadata.semanticReviewRepairCount, 0);
});

test('one provider REPAIR maps reviewId to candidateId once and reaches the existing bounded repair path', async () => {
  const fixture = coordinatorFixture();
  const writer = fixtureWriter(fixture);
  let reviewerCalls = 0;
  let mapped;
  writer.reviewSemanticCandidates = async (input) => {
    reviewerCalls += 1;
    const target = input.candidates.find((candidate) => /one or two people/i.test(candidate.paragraph));
    assert.ok(target);
    mapped = validateSemanticReviewEnvelope({ candidates: input.candidates }, semanticReviewEnvelopeSchema.parse(providerEnvelopeFor(input, target.candidateId)));
    assert.equal(mapped.repair?.candidateId, target.candidateId);
    assert.equal(Object.prototype.hasOwnProperty.call(mapped.repair, 'reviewId'), false, 'the internal repair must not retain provider reviewId');
    return { ...mapped, accounting: { providerCalls: 0, repairCount: 1 } };
  };
  const composed = await composeEssentialManuscript({ factPack: fixture.factPack, writer });
  assert.equal(reviewerCalls, 1, 'the mapped internal result must not trigger a second validation or provider call');
  assert.doesNotMatch(composed.manuscript.markdown, /one or two people/i);
  assert.match(composed.manuscript.markdown, /document and cross-train control responsibilities/i);
  assert.equal(composed.manuscript.writerMetadata.semanticReviewRepairCount, 1);
  assert.equal(composed.manuscript.writerMetadata.totalProviderCalls, 1);
});

test('coordinator injects one fake reviewer, applies one exact repair, and never calls recursive recovery', async () => {
  const fixture = coordinatorFixture();
  const { factPack, blueprint, markdown, writerMetadata } = fixture;
  const writer = fixtureWriter(fixture);
  let reviewerCalls = 0;
  const semanticReviewer = {
    async review(input) {
      reviewerCalls += 1;
      assert.ok(input.candidates.length > 1, 'the coordinator must send every narrative block, not only the lexical hit');
      const candidate = input.candidates.find((item) => /one or two people/i.test(item.paragraph));
      assert.ok(candidate);
      assert.equal(candidate.ruleCode, 'semantic_grounding_block');
      assert.ok(candidate.permittedClaimRefs.length > 0);
      return {
        decisions: input.candidates.map((item) => item.candidateId === candidate.candidateId
          ? {
            candidateId: item.candidateId,
            disposition: 'REPAIR',
            reasonCode: 'unsupported_concentration_reframed',
            reason: 'The management implication is useful, but the workforce fact is not established.',
            replacementProse: 'Management should document and cross-train control responsibilities across the relevant process.'
          }
          : {
            candidateId: item.candidateId,
            disposition: 'ALLOW',
            reasonCode: 'provider_free_block_allow',
            reason: 'No unsupported customer-specific proposition remains after block review.'
          }),
        accounting: { providerCalls: 0, repairCount: 1 }
      };
    }
  };
  const composed = await composeEssentialManuscript({ factPack, writer, semanticReviewer });
  assert.equal(reviewerCalls, 1);
  assert.doesNotMatch(composed.manuscript.markdown, /one or two people/i);
  assert.match(composed.manuscript.markdown, /document and cross-train control responsibilities/i);
  assert.equal(composed.acceptedSemanticDecisions.length, composed.manuscript.writerMetadata.semanticReviewCandidateCount);
  assert.equal(composed.manuscript.writerMetadata.recovery.totalCalls, 1, 'the injected provider-free reviewer adds no provider call');
  assert.equal(composed.manuscript.writerMetadata.semanticReviewCandidateCount, composed.manuscript.writerMetadata.semanticReviewAllowCount + 1);
});

test('multiple truthful REPAIR findings fail closed with a distinct policy code and no second repair call', async () => {
  const fixture = coordinatorFixture();
  let reviewerCalls = 0;
  const semanticReviewer = {
    async review(input) {
      reviewerCalls += 1;
      const repairIds = new Set(input.candidates.slice(0, 2).map((candidate) => candidate.candidateId));
      return {
        decisions: input.candidates.map((candidate) => repairIds.has(candidate.candidateId)
          ? {
            candidateId: candidate.candidateId,
            disposition: 'REPAIR',
            reasonCode: 'multiple_repairs_fixture',
            reason: 'This block requires a bounded evidence-safe rewrite.',
            replacementProse: 'Management should document the relevant control responsibility and review route.'
          }
          : {
            candidateId: candidate.candidateId,
            disposition: 'ALLOW',
            reasonCode: 'fixture_allow',
            reason: 'The block is grounded.'
          }),
        accounting: { providerCalls: 0, repairCount: 2 }
      };
    }
  };
  await assert.rejects(
    composeEssentialManuscript({ factPack: fixture.factPack, writer: fixtureWriter(fixture), semanticReviewer }),
    (error) => {
      assert.equal(error?.diagnostics?.validationCode, 'multiple_semantic_repairs_required');
      assert.equal(error?.diagnostics?.totalProviderCalls, 1, 'provider-free fixture adds no live call');
      return true;
    }
  );
  assert.equal(reviewerCalls, 1, 'multiple repair truth is handled after the single batch response');
});

test('semantic provider diagnostics survive a failed batch without customer paragraph text', async () => {
  const fixture = coordinatorFixture();
  const diagnostic = {
    provider: 'gateway',
    model: 'provider-free/fixture',
    dispatchOccurred: true,
    startedAt: new Date(0).toISOString(),
    endedAt: new Date(100).toISOString(),
    elapsedMs: 100,
    generationId: 'gen-semantic-fixture',
    responseId: 'resp-semantic-fixture',
    inputTokens: 123,
    outputTokens: 45,
    totalTokens: 168,
    providerCostMicros: 456,
    candidateCount: 3,
    blockCount: 3,
    responseSchemaValid: false,
    providerCalls: 1,
    failureCode: 'semantic_structured_output_invalid'
  };
  const semanticReviewer = {
    async review() {
      const error = new Error('provider response body omitted from safe diagnostics');
      error.semanticReviewerDiagnostics = diagnostic;
      throw error;
    }
  };
  await assert.rejects(
    composeEssentialManuscript({ factPack: fixture.factPack, writer: fixtureWriter(fixture), semanticReviewer }),
    (error) => {
      assert.equal(error?.diagnostics?.validationCode, 'semantic_structured_output_invalid');
      assert.equal(error?.diagnostics?.semanticReviewDiagnostics?.generationId, 'gen-semantic-fixture');
      assert.equal(error?.diagnostics?.totalProviderCalls, 2);
      assert.doesNotMatch(JSON.stringify(error?.diagnostics), /Knowledge is held by one or two people/i);
      assert.doesNotMatch(error?.message ?? '', /Knowledge is held by one or two people/i);
      return true;
    }
  );
});

test('unseen provider-free corpus has zero lexical candidates but every block reaches one reviewer batch', async () => {
  const deliveryModel = buildComprehensiveDeliveryModel(comprehensiveFixtures.denseWeakAssessment.analytical);
  const factPack = buildComprehensiveNarrativeFactPack(deliveryModel);
  const storyPlan = buildNarrativeStoryPlan(factPack);
  assertNarrativeStoryPlan(storyPlan, factPack);
  const blueprint = buildReportBlueprint(factPack, storyPlan);
  const unseen = [
    'Oversight is coordinated through a regional hub.',
    'The review team samples only a fraction of activity.',
    'Cases are retained by the originating business unit.',
    'Operational monitoring is centralised before escalation.',
    'The control environment is stronger than comparable charities.',
    'A small group carries most of the institutional knowledge.'
  ];
  const skeleton = buildBlueprintMarkdownSkeleton(blueprint);
  let proseIndex = 0;
  const markdown = skeleton.headings.map((heading) => {
    const headingLine = `${'#'.repeat(heading.level)} ${heading.title}`;
    if (heading.kind === 'chapter') return headingLine;
    const prose = unseen[proseIndex] ?? 'Management should preserve the deterministic takeaway and document the next supported control action.';
    proseIndex += 1;
    return `${headingLine}\n\n${prose}`;
  }).join('\n\n');
  const parsed = parseBlueprintMarkdown(markdown, blueprint);
  assert.equal(parsed.ok, true);
  const lexicalReport = validateBlueprintTextManuscript(parsed, blueprint, factPack);
  assert.equal(lexicalReport.semanticCandidates.issues.length, 0, 'the unseen corpus must bypass the current lexical candidate patterns');
  assert.ok(lexicalReport.paragraphCount > unseen.length);

  const writerMetadata = {
    contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1',
    architecture: 'whole-manuscript',
    provider: 'test-injected',
    model: 'test-injected/semantic-reviewer',
    promptVersion: 'test',
    generationMode: 'test-injected',
    generatedAt: new Date(0).toISOString(),
    inputFactPackSha256: 'fixture',
    inputStoryPlanSha256: 'fixture',
    recovery: { ...emptyNarrativeRecoveryBudget(), initialGenerationCount: 1, totalCalls: 1 }
  };
  const writer = {
    provider: 'test-injected',
    model: 'test-injected/semantic-reviewer',
    promptVersion: 'test',
    async writeManuscript() { return { contractVersion: writerMetadata.contractVersion, architecture: 'whole-manuscript', markdown, blueprint, writerMetadata }; },
    async completeTail() { throw new Error('tail recovery must not be called'); },
    async repairBlock() { throw new Error('legacy repair path must not be called'); },
    async coherencePass() { throw new Error('coherence recovery must not be called'); }
  };
  const outcomes = new Map([
    [unseen[0], 'ALLOW'],
    [unseen[1], 'REPAIR'],
    [unseen[2], 'REJECT'],
    [unseen[3], 'HOLD'],
    [unseen[4], 'ALLOW'],
    [unseen[5], 'ALLOW']
  ]);
  let reviewerCalls = 0;
  const reviewedParagraphs = [];
  const semanticReviewer = {
    async review(input) {
      reviewerCalls += 1;
      reviewedParagraphs.push(...input.candidates.map((candidate) => candidate.paragraph));
      assert.equal(input.candidates.length, lexicalReport.paragraphCount);
      return {
        decisions: input.candidates.map((candidate) => {
          const disposition = outcomes.get(candidate.paragraph) ?? 'ALLOW';
          return {
            candidateId: candidate.candidateId,
            disposition,
            reasonCode: `unseen_${disposition.toLowerCase()}`,
            reason: `Provider-free unseen corpus outcome: ${disposition}.`,
            ...(disposition === 'REPAIR' ? { replacementProse: 'Management should define and evidence the relevant review coverage and escalation route.' } : {})
          };
        }),
        accounting: { providerCalls: 0, repairCount: 1 }
      };
    }
  };
  await assert.rejects(
    composeEssentialManuscript({ factPack, writer, semanticReviewer }),
    (error) => {
      assert.equal(error?.diagnostics?.validationCode, 'semantic_reject');
      return true;
    },
    'REJECT and HOLD outcomes must fail closed after the one batch review'
  );
  assert.equal(reviewerCalls, 1, 'all unseen blocks use one bounded reviewer call');
  for (const phrase of unseen) assert.ok(reviewedParagraphs.includes(phrase), `unseen paragraph reached reviewer: ${phrase}`);
  assert.equal(reviewedParagraphs.length, lexicalReport.paragraphCount);

  let cleanReviewerCalls = 0;
  const clean = await composeEssentialManuscript({
    factPack,
    writer,
    semanticReviewer: {
      async review(input) {
        cleanReviewerCalls += 1;
        return {
          decisions: input.candidates.map((candidate) => ({
            candidateId: candidate.candidateId,
            disposition: 'ALLOW',
            reasonCode: 'clean_block_allow',
            reason: 'Provider-free clean-generation accounting fixture.'
          })),
          // Simulated provider accounting proves the production 1 + 1 = 2 envelope without a
          // live request or customer report generation.
          accounting: { providerCalls: 1, repairCount: 0 }
        };
      }
    }
  });
  assert.equal(cleanReviewerCalls, 1);
  assert.equal(clean.manuscript.writerMetadata.manuscriptProviderCalls, 1);
  assert.equal(clean.manuscript.writerMetadata.semanticReviewProviderCalls, 1);
  assert.equal(clean.manuscript.writerMetadata.totalProviderCalls, 2);
  assert.equal(clean.manuscript.writerMetadata.semanticReviewBlockCount, lexicalReport.paragraphCount);
  assert.equal(clean.manuscript.writerMetadata.semanticReviewCandidateCount, lexicalReport.paragraphCount);
  assert.equal(clean.manuscript.writerMetadata.semanticReviewRepairCount, 0);
});

console.log(JSON.stringify({
  status: 'PASS',
  ai: 'ZERO',
  corpusCategories: ['MUST_ALLOW', 'MUST_REPAIR', 'MUST_REJECT', 'MUST_HOLD'],
  architecture: 'single-bounded-semantic-review-with-exact-repair-and-hard-gates'
}, null, 2));
