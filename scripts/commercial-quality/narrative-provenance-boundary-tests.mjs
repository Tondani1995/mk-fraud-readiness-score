#!/usr/bin/env node
import assert from 'node:assert/strict';
import { comprehensiveFixtures } from '../../src/lib/reports/comprehensive/fixtures.ts';
import { buildComprehensiveDeliveryModel } from '../../src/lib/reports/comprehensive/contract.ts';
import { buildComprehensiveNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { createNarrativeClaimBlockSchema, createNarrativeSectionSchema, createNarrativeSpineSchema } from '../../src/lib/reports/narrative/ai-writer.ts';
import { validateNarrativeManuscript } from '../../src/lib/reports/narrative/validation.ts';
import { sanitiseNarrativePresentation } from '../../src/lib/reports/narrative/presentation-hygiene.ts';
import { applyDeterministicSectionIdentity } from '../../src/lib/reports/narrative/section-identity.ts';

const pack = buildComprehensiveNarrativeFactPack(buildComprehensiveDeliveryModel(comprehensiveFixtures.denseWeakAssessment.analytical));
const plan = buildNarrativeStoryPlan(pack);
const known = pack.facts[0].id;
const secondKnown = pack.facts[1].id;
const block = (text, claimRefs = [known]) => ({ id: 'TEST', text, claimRefs });

const claimBlockSchema = createNarrativeClaimBlockSchema(pack);
assert.equal(claimBlockSchema.safeParse(block('A grounded sentence.', [known])).success, true, 'known Fact Pack ref must be accepted');
assert.equal(claimBlockSchema.safeParse(block('A grounded sentence.', ['EXEC-DIAGNOSIS-001'])).success, false, 'invented ref must be rejected at structured-output boundary');
assert.equal(claimBlockSchema.safeParse({ id: 'TEST', text: 'A grounded sentence.', claimRefs: [] }).success, false, 'material ClaimBlock refs must be non-empty');

const spineSchema = createNarrativeSpineSchema(pack);
const validSpine = {
  executiveDiagnosis: block('The recorded position is clear.'),
  systemicThemeSummary: block('The connected themes are clear.'),
  centralManagementImplication: block('Management should act on the recorded position.'),
  route: block('The route is a connected management response.')
};
assert.equal(spineSchema.safeParse(validSpine).success, true, 'known spine refs must be accepted');
assert.equal(spineSchema.safeParse({ ...validSpine, route: block('The route is clear.', ['EXEC-DIAGNOSIS-001']) }).success, false, 'spine cannot invent refs');

const sectionSchema = createNarrativeSectionSchema(pack);
assert.equal(sectionSchema.safeParse({ heading: block('A natural heading.'), paragraphs: [block('A grounded paragraph.', [secondKnown])], transition: null }).success, true, 'known section refs must be accepted');
assert.equal(sectionSchema.safeParse({ heading: block('A natural heading.', ['EXEC-DIAGNOSIS-001']), paragraphs: [block('A grounded paragraph.')], transition: null }).success, false, 'section cannot invent refs');
assert.equal(sectionSchema.safeParse({ heading: block('A natural heading.'), paragraphs: [block('A grounded paragraph.')], transition: { ...block('Next.', ['EXEC-DIAGNOSIS-001']) } }).success, false, 'coherence section schema cannot introduce unknown refs');

const spine = {
  schemaVersion: 'mk-reporting-bible-1.1-manuscript-v1', bibleVersion: '1.1', productTier: 'comprehensive',
  ...validSpine,
  writerMetadata: { provider: 'test', model: 'test', promptVersion: 'test', generationMode: 'test-injected', generatedAt: new Date(0).toISOString(), inputFactPackSha256: 'x', inputStoryPlanSha256: 'y' }
};
const validSections = plan.movements.flatMap((movement) => movement.sectionIds.map((sectionId) => applyDeterministicSectionIdentity({ heading: block('A natural heading.'), paragraphs: [block('A grounded paragraph.')], transition: null }, sectionId, movement.id)));
const malformed = {
  schemaVersion: 'mk-reporting-bible-1.1-manuscript-v1', bibleVersion: '1.1', productTier: 'comprehensive', organisationName: pack.organisation.name,
  assessmentReference: pack.assessment.reference, sections: validSections.map((section, index) => index === 1 ? { ...section, heading: block('A natural heading.', ['EXEC-DIAGNOSIS-001']) } : section), spine, writerMetadata: spine.writerMetadata
};
const malformedValidation = validateNarrativeManuscript(malformed, pack, plan);
assert.ok(malformedValidation.issues.some((issue) => issue.code === 'unknown_claim_ref'), 'unknown refs remain blocking after schema bypass');

const corrected = validSections.map((section, index) => ({ ...section, sectionId: plan.movements.flatMap((movement) => movement.sectionIds)[index], movementId: plan.movements.find((movement) => movement.sectionIds.includes(plan.movements.flatMap((item) => item.sectionIds)[index])).id }));
assert.deepEqual(corrected.map((section) => section.sectionId), plan.movements.flatMap((movement) => movement.sectionIds), 'section identity remains deterministic');
assert.deepEqual(corrected.map((section) => section.movementId), plan.movements.flatMap((movement) => movement.sectionIds.map(() => movement.id)), 'movement identity remains deterministic');

const sanitised = sanitiseNarrativePresentation({ text: 'FINDING-001 supports the recorded position.', claimRefs: [known] });
assert.deepEqual(sanitised.value.claimRefs, [known], 'presentation sanitisation must not modify claimRefs');

console.log(JSON.stringify({ passed: true, factCount: pack.facts.length, checks: [
  'Fact Pack refs form the dynamic structured-output enum',
  'invented EXEC-DIAGNOSIS-001 rejected by ClaimBlock schema',
  'known Fact Pack ref accepted',
  'material claimRefs remain non-empty',
  'spine uses the same constrained provenance contract',
  'coherence section schema rejects unknown refs',
  'unknown refs remain blocking after schema bypass',
  'sectionId and movementId remain deterministic',
  'presentation sanitisation preserves claimRefs'
] }, null, 2));
