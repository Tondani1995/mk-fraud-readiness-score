#!/usr/bin/env node
import assert from 'node:assert/strict';
import { comprehensiveFixtures } from '../../src/lib/reports/comprehensive/fixtures.ts';
import { buildComprehensiveDeliveryModel } from '../../src/lib/reports/comprehensive/contract.ts';
import { assertNarrativeFactPack, buildComprehensiveNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { assertNarrativeStoryPlan, buildNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { V11AiNarrativeWriter } from '../../src/lib/reports/narrative/ai-writer.ts';
import { validateNarrativeSpine } from '../../src/lib/reports/narrative/validation.ts';
import { assertNarrativeCompositionReady, sha256Json } from '../../src/lib/reports/narrative/release-gate.ts';
import { preparePremiumReportNarrative } from '../../src/lib/reports/automation/narrative-pipeline.ts';

const model = buildComprehensiveDeliveryModel(comprehensiveFixtures.denseWeakAssessment.analytical);
const pack = buildComprehensiveNarrativeFactPack(model);
const plan = buildNarrativeStoryPlan(pack);
assert.doesNotThrow(() => assertNarrativeFactPack(pack));
assert.doesNotThrow(() => assertNarrativeStoryPlan(plan, pack));
assert.ok(pack.facts.length > 0);
assert.ok(pack.scenarios.every((scenario) => !/recorded control condition|assessment question/i.test(JSON.stringify(scenario))));
assert.ok(pack.scenarios.every((scenario) => scenario.linkedFindingRefs.every((ref) => pack.findings.some((finding) => finding.factRef === ref))));
assert.throws(() => new V11AiNarrativeWriter(''), /No approved narrative writer\/provider/);

const validRef = pack.facts[0].id;
const invalidSpine = {
  schemaVersion: 'mk-reporting-bible-1.1-manuscript-v1', bibleVersion: '1.1', productTier: 'comprehensive',
  executiveDiagnosis: { id: 'SPINE-1', text: 'A useful diagnosis.', claimRefs: [validRef] },
  systemicThemeSummary: { id: 'SPINE-2', text: 'A useful theme.', claimRefs: [validRef] },
  centralManagementImplication: { id: 'SPINE-3', text: 'ACCOUNTABLE_EXECUTIVE_MANDATE requires attention.', claimRefs: [validRef] },
  route: { id: 'SPINE-4', text: 'The route forward is clear.', claimRefs: [validRef] },
  writerMetadata: { provider: 'test', model: 'test', promptVersion: 'test', generationMode: 'test-injected', generatedAt: new Date(0).toISOString(), inputFactPackSha256: 'x', inputStoryPlanSha256: 'y' }
};
assert.equal(validateNarrativeSpine(invalidSpine, pack).ok, false);
assert.ok(validateNarrativeSpine(invalidSpine, pack).issues.some((item) => item.code === 'raw_machine_identifier'));

const manuscript = { schemaVersion: 'mk-reporting-bible-1.1-manuscript-v1', bibleVersion: '1.1', productTier: 'comprehensive', organisationName: pack.organisation.name, assessmentReference: pack.assessment.reference, sections: [{ sectionId: 'TEST', movementId: 'test', heading: { id: 'H', text: 'Test', claimRefs: [validRef] }, paragraphs: [{ id: 'P', text: 'Test paragraph.', claimRefs: [validRef] }] }], spine: invalidSpine, writerMetadata: invalidSpine.writerMetadata };
assert.throws(() => assertNarrativeCompositionReady({ factPack: pack, storyPlan: plan, manuscript, narrativeValidation: { ok: true }, editorialValidation: { ok: true }, approval: { approved: true, approvedBy: 'Owner', approvedAt: '2026-08-12T00:00:00Z', essentialManuscriptSha256: '', comprehensiveManuscriptSha256: 'wrong-hash' } }), /hash/);
await assert.rejects(() => preparePremiumReportNarrative({}), /Reporting Bible v1\.1 requires a validated/);
console.log(JSON.stringify({ passed: true, factCount: pack.facts.length, scenarios: pack.scenarios.length, movements: plan.movements.length, checks: ['deterministic Fact Pack', 'deterministic Story Plan', 'generic scenario rejection', 'AI writer fail-closed constructor', 'machine-identifier validation', 'hash-bound composition gate'] }, null, 2));
