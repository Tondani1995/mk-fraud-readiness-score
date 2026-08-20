#!/usr/bin/env node
import assert from 'node:assert/strict';
import { comprehensiveFixtures } from '../../src/lib/reports/comprehensive/fixtures.ts';
import { buildComprehensiveDeliveryModel } from '../../src/lib/reports/comprehensive/contract.ts';
import { buildComprehensiveNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { applyDeterministicSectionIdentity } from '../../src/lib/reports/narrative/section-identity.ts';
import { validateNarrativeManuscript } from '../../src/lib/reports/narrative/validation.ts';

const pack = buildComprehensiveNarrativeFactPack(buildComprehensiveDeliveryModel(comprehensiveFixtures.denseWeakAssessment.analytical));
const plan = buildNarrativeStoryPlan(pack);
const expected = plan.movements.flatMap((movement) => movement.sectionIds.map((sectionId) => ({ sectionId, movementId: movement.id })));
const ref = pack.facts[0].id;
const block = (text) => ({ id: 'TEST', text, claimRefs: [ref] });

// Simulate provider output that supplies a lower-case section identity and a made-up movement.
const providerContent = {
  sectionId: 'executive-diagnosis',
  movementId: 'MADE-UP-MOVEMENT',
  heading: block('A natural executive heading.'),
  paragraphs: [block('A grounded paragraph.')],
  transition: null
};
const corrected = applyDeterministicSectionIdentity(providerContent, 'EXECUTIVE-DIAGNOSIS', 'diagnosis');
assert.equal(corrected.sectionId, 'EXECUTIVE-DIAGNOSIS');
assert.equal(corrected.movementId, 'diagnosis');
assert.equal(corrected.heading.text, 'A natural executive heading.');
assert.equal(corrected.paragraphs[0].text, 'A grounded paragraph.');

const correctedSections = expected.map((identity, index) => applyDeterministicSectionIdentity({
  sectionId: index === 0 ? 'executive-diagnosis' : 'made-up-section',
  movementId: 'wrong-movement',
  heading: block(`Heading ${index + 1}`),
  paragraphs: [block(`Paragraph ${index + 1}`)],
  transition: null
}, identity.sectionId, identity.movementId));
assert.deepEqual(correctedSections.map((section) => section.sectionId), expected.map((item) => item.sectionId));
assert.deepEqual(correctedSections.map((section) => section.movementId), expected.map((item) => item.movementId));
assert.equal(new Set(correctedSections.map((section) => section.sectionId)).size, expected.length);

const spine = {
  schemaVersion: 'mk-reporting-bible-1.1-manuscript-v1', bibleVersion: '1.1', productTier: 'comprehensive',
  executiveDiagnosis: block('The recorded position is clear.'),
  systemicThemeSummary: block('The linked pattern is clear.'),
  centralManagementImplication: block('Management should act on the linked pattern.'),
  route: block('The route is a connected management response.'),
  writerMetadata: { provider: 'test', model: 'test', promptVersion: 'test', generationMode: 'test-injected', generatedAt: new Date(0).toISOString(), inputFactPackSha256: 'x', inputStoryPlanSha256: 'y' }
};
const wrongValidation = validateNarrativeManuscript({
  schemaVersion: 'mk-reporting-bible-1.1-manuscript-v1', bibleVersion: '1.1', productTier: 'comprehensive', organisationName: pack.organisation.name,
  assessmentReference: pack.assessment.reference, sections: correctedSections.map((section) => ({ ...section, sectionId: 'made-up-section' })), spine, writerMetadata: spine.writerMetadata
}, pack, plan);
assert.ok(wrongValidation.issues.some((issue) => issue.code === 'missing_section'));
assert.ok(wrongValidation.issues.some((issue) => issue.code === 'unexpected_section'));

const validValidation = validateNarrativeManuscript({
  schemaVersion: 'mk-reporting-bible-1.1-manuscript-v1', bibleVersion: '1.1', productTier: 'comprehensive', organisationName: pack.organisation.name,
  assessmentReference: pack.assessment.reference, sections: correctedSections, spine, writerMetadata: spine.writerMetadata
}, pack, plan);
assert.equal(validValidation.ok, true, JSON.stringify(validValidation.issues));

console.log(JSON.stringify({
  passed: true,
  checks: ['provider lower-case identity replaced', 'made-up section identity replaced', 'wrong movement identity replaced', 'natural heading preserved', 'all Story Plan sections exactly once in order', 'existing missing/unexpected identity validation remains active'],
  sectionCount: expected.length,
  sectionIds: expected.map((item) => item.sectionId),
  movementIds: expected.map((item) => item.movementId)
}, null, 2));
