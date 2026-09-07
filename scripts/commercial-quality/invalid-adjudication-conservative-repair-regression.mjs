#!/usr/bin/env node
/**
 * Invalid-adjudication conservative-repair regression.
 *
 * Production attempt 06bcc624 parsed ok:true with a single assurance_claim at
 * EXECUTIVE-ASSESSMENT-DRIVERS.paragraphs[1]. The adjudication call was spent, its answer failed
 * the acceptance contract, and the shared cascade returned invalid_adjudication / AMBIGUOUS with
 * repairCalls 0 -- rejecting the report while the bounded repair call it was entitled to was
 * still unused.
 *
 * An unusable adjudication is now never read as permission. A candidate the pathway has already
 * approved for bounded semantic repair takes the repair route, the unchanged parser and full
 * validator decide release, and anything else fails closed.
 *
 * Provider-free: the writer and both semantic adapters are injected doubles.
 */
import assert from 'node:assert/strict';

import { syntheticOrgFixture } from '../../src/lib/reports/evidence-model/__fixtures__/synthetic-org-fixture.ts';
import { getQuestionPlaybook } from '../../src/lib/reports/evidence-model/question-playbooks.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { buildBlueprintMarkdownSkeleton, parseBlueprintMarkdown, validateBlueprintTextManuscript, findCustomerCopyLeakage } from '../../src/lib/reports/narrative/blueprint-text.ts';
import { classifyAssuranceLanguageDetailed } from '../../src/lib/reports/narrative/validation.ts';
import {
  runSemanticSafetyCascade,
  SemanticCallLedger,
  SemanticAdjudicationUnusableError,
  classifyAdjudicationValidity,
  ADJUDICATION_INVALID_PREDICATES,
  SEMANTIC_ADJUDICATION_MIN_CONFIDENCE
} from '../../src/lib/reports/narrative/semantic-safety-cascade.ts';
import { composeEssentialManuscript } from '../../src/lib/reports/narrative/essential-manuscript-coordinator.ts';
import { emptyNarrativeRecoveryBudget } from '../../src/lib/reports/narrative/recovery-policy.ts';

const SEL = { methodologyVersionId: 'offline-v12', methodologyVersionCode: 'MFRS-V1.2-CANDIDATE-OWNER-CORRECTION' };
const responses = { 'D1-Q01': 4, 'D1-Q02': 4, 'D1-Q03': 4, 'D1-Q04': 4, 'D1-Q05': 4, 'D1-Q06': 3, 'D1-Q07': 4, 'D2-Q01': 2, 'D2-Q02': 3, 'D2-Q03': 2, 'D2-Q04': 2, 'D2-Q05': 2, 'D2-Q06': 2, 'D2-Q07': 3, 'D2-Q08': 3, 'D3-Q01': 3, 'D3-Q02': 3, 'D3-Q03': 3, 'D3-Q04': 4, 'D3-Q05': 3, 'D3-Q06': 2, 'D3-Q07': 2, 'D3-Q08': 3, 'D3-Q09': 3, 'D3-Q10': 3, 'D3-Q11': 3, 'D4-Q01': 2, 'D4-Q02': 2, 'D4-Q03': 2, 'D4-Q04': 2, 'D4-Q05': 2, 'D4-Q06': 2, 'D4-Q07': 2, 'D4-Q08': 2, 'D5-Q01': 4, 'D5-Q03': 4, 'D5-Q04': 4, 'D5-Q05': 4, 'D5-Q06': 3, 'D6-Q01': 3, 'D6-Q02': 3, 'D6-Q03': 3, 'D6-Q04': 4, 'D6-Q05': 3, 'D7-Q01': 3, 'D7-Q02': 2, 'D7-Q03': 2, 'D7-Q04': 3, 'D7-Q05': 1, 'D7-Q06': 2, 'D7-Q07': 2, 'D8-Q01': 3, 'D8-Q02': 3, 'D8-Q03': 3, 'D8-Q04': 4, 'D8-Q06': 2, 'D8-Q07': 2, 'D8-Q08': 3, 'D8-Q09': 3, 'D8-Q10': 2, 'D9-Q01': 4, 'D9-Q02': 4, 'D9-Q03': 4, 'D9-Q05': 3, 'D10-Q01': 2, 'D10-Q02': 2, 'D10-Q03': 2, 'D10-Q06': 2 };
const weights = { 'D1-Q01': 1.5, 'D1-Q02': 1.25, 'D1-Q03': 1.25, 'D1-Q04': 1, 'D1-Q05': 1, 'D1-Q06': 1, 'D1-Q07': 0.5, 'D2-Q01': 1.5, 'D2-Q02': 1.5, 'D2-Q03': 1.25, 'D2-Q04': 1, 'D2-Q05': 1.25, 'D2-Q06': 1, 'D2-Q07': 1.25, 'D2-Q08': 1, 'D3-Q01': 1.5, 'D3-Q02': 1.25, 'D3-Q03': 1.5, 'D3-Q04': 1, 'D3-Q05': 1.25, 'D3-Q06': 1, 'D3-Q07': 1, 'D3-Q08': 0.5, 'D3-Q09': 0.5, 'D3-Q10': 0.5, 'D3-Q11': 0.5, 'D4-Q01': 1.5, 'D4-Q02': 1.25, 'D4-Q03': 1.5, 'D4-Q04': 1, 'D4-Q05': 0.5, 'D4-Q06': 1.25, 'D4-Q07': 1, 'D4-Q08': 0.5, 'D5-Q01': 1.5, 'D5-Q03': 1.25, 'D5-Q04': 1.25, 'D5-Q05': 1.5, 'D5-Q06': 1, 'D6-Q01': 1.5, 'D6-Q02': 1.25, 'D6-Q03': 1.25, 'D6-Q04': 1, 'D6-Q05': 1, 'D7-Q01': 1.5, 'D7-Q02': 1.25, 'D7-Q03': 1.25, 'D7-Q04': 1.5, 'D7-Q05': 1, 'D7-Q06': 1, 'D7-Q07': 1, 'D8-Q01': 1.5, 'D8-Q02': 1.5, 'D8-Q03': 1.25, 'D8-Q04': 1, 'D8-Q06': 1, 'D8-Q07': 1, 'D8-Q08': 1, 'D8-Q09': 0.5, 'D8-Q10': 0.5, 'D9-Q01': 1.25, 'D9-Q02': 1, 'D9-Q03': 1.25, 'D9-Q05': 1, 'D10-Q01': 1.5, 'D10-Q02': 1.25, 'D10-Q03': 1.25, 'D10-Q06': 1.25 };
const critical = new Set(['D1-Q01', 'D1-Q04', 'D2-Q01', 'D2-Q02', 'D3-Q01', 'D3-Q03', 'D3-Q04', 'D4-Q01', 'D4-Q03', 'D5-Q01', 'D5-Q05', 'D6-Q01', 'D7-Q01', 'D7-Q04', 'D8-Q01', 'D8-Q02', 'D8-Q04', 'D8-Q08', 'D10-Q01']);
const hardGates = new Set([...critical].filter((c) => c !== 'D6-Q01' && c !== 'D7-Q01'));
const criticalGaps = new Set(['D10-Q01', 'D2-Q01', 'D4-Q01', 'D4-Q03']);
const domainMeta = { D1: ['Fraud Leadership and Governance', 77.33, 12], D2: ['Fraud Risk Identification', 47.69, 12], D3: ['Operational Fraud Controls', 58.10, 14], D4: ['Fraud Detection Capability', 40, 14], D5: ['Fraud Incident Response', 76.92, 10], D6: ['Whistleblowing and Reporting Culture', 63.33, 6], D7: ['Third-Party and Supply Chain Fraud Risk', 44.71, 10], D8: ['Digital and Identity Fraud Risk', 56.76, 12], D9: ['Fraud Culture and Awareness', 75.56, 5], D10: ['Continuous Improvement and Fraud Risk Monitoring', 40, 5] };
const traces = Object.entries(responses).map(([questionCode, responseValue]) => {
  const domainCode = questionCode.split('-')[0];
  return { questionCode, domainCode, domainName: domainMeta[domainCode][0], prompt: getQuestionPlaybook(questionCode, SEL)?.prompt ?? 'Control response.', responseValue, normalisedScore: responseValue * 20, applicable: true, triggeredRules: [], weight: weights[questionCode], isCritical: critical.has(questionCode), isHardGate: hardGates.has(questionCode), isCriticalGap: criticalGaps.has(questionCode), isMajorGap: false };
});
const data = {
  ...structuredClone(syntheticOrgFixture), organisationName: 'Offline invalid-adjudication fixture', assessmentReference: 'OFFLINE-INVALID-ADJUDICATION',
  scoreRun: { id: 'r', assessmentId: 'a', methodologyVersionId: 'offline-v12', methodologyVersionCode: 'MFRS-V1.2-CANDIDATE-OWNER-CORRECTION', status: 'completed', lockedAt: '2026-09-05T00:00:00.000Z', inputHash: 'x', overallScore: 57.29, calculatedMaturity: 'Developing', finalMaturity: 'Developing', exposureScore: null, exposureBand: null, coveragePct: 100, nARatePct: 0, criticalGapCount: 4, majorGapCount: 0, capApplied: false, capReason: 'c' },
  domainResults: Object.entries(domainMeta).map(([domainCode, m]) => ({ domainCode, domainName: m[0], rawScore: m[1], weightPct: m[2] })),
  questionTraces: traces, criticalMajorGaps: traces.filter((t) => t.isCriticalGap || t.isMajorGap), exposureAnswers: [], adaptiveScope: { exposureAssessed: false }, maturityCapEvents: []
};

const evidenceModel = buildAdvisoryEvidenceModel(data);
const projection = buildEssentialProjection(data, evidenceModel);
const factPack = buildEssentialNarrativeFactPack(data, evidenceModel, projection);
const blueprint = buildReportBlueprint(factPack, buildNarrativeStoryPlan(factPack));
const skeleton = buildBlueprintMarkdownSkeleton(blueprint).markdown;
const headingCount = (t) => (t.match(/^#{1,3}\s+.+$/gm) ?? []).length;
assert.equal(headingCount(skeleton), 27, 'the affected order Blueprint has 27 headings');

let n = 0;
const label = () => { n += 1; return `${String.fromCharCode(96 + Math.ceil(n / 26))}${String.fromCharCode(96 + ((n - 1) % 26) + 1)}`; };
// Prose belongs under Blueprint section and subsection nodes only; chapter headings carry none.
const clean = skeleton.split('\n\n').map((b) => /^#{2,3} /.test(b) ? `${b}\n\nThe recorded management position for bounded section ${label()} should guide the response management sets out here.` : b).join('\n\n');
assert.equal(parseBlueprintMarkdown(clean, blueprint).ok, true, 'the reference manuscript binds exactly');
assert.equal(validateBlueprintTextManuscript(parseBlueprintMarkdown(clean, blueprint), blueprint, factPack).ok, true, 'the reference manuscript is clean');

// The ambiguous assurance paragraph sits at EXECUTIVE-ASSESSMENT-DRIVERS.paragraphs[1], as in
// Production attempt 06bcc624, so the reference manuscript carries a genuine second paragraph in
// that section rather than targeting the only one.
const skeletonParsed = parseBlueprintMarkdown(clean, blueprint);
const skeletonDrivers = skeletonParsed.chapters.flatMap((c) => c.sections).find((s) => s.sectionId === 'EXECUTIVE-ASSESSMENT-DRIVERS');
assert.ok(skeletonDrivers, 'the Blueprint carries EXECUTIVE-ASSESSMENT-DRIVERS');
const SECOND_PARAGRAPH = 'Management should treat the recorded ownership and review weaknesses as one connected response rather than separate items.';
const reference = clean.replace(skeletonDrivers.paragraphs[0].text, `${skeletonDrivers.paragraphs[0].text}\n\n${SECOND_PARAGRAPH}`);
const cleanParsed = parseBlueprintMarkdown(reference, blueprint);
assert.equal(cleanParsed.ok, true, 'the two-paragraph reference manuscript still binds exactly');
assert.equal(validateBlueprintTextManuscript(cleanParsed, blueprint, factPack).ok, true, 'the two-paragraph reference manuscript is clean');
const driversSection = cleanParsed.chapters.flatMap((c) => c.sections).find((s) => s.sectionId === 'EXECUTIVE-ASSESSMENT-DRIVERS');
assert.equal(driversSection.paragraphs.length, 2, 'the section carries the reported paragraph index');
const TARGET_PATH = 'EXECUTIVE-ASSESSMENT-DRIVERS.paragraphs[1]';
const cleanTarget = driversSection.paragraphs[1].text;
assert.equal(cleanTarget.trim(), SECOND_PARAGRAPH, 'the reported path resolves to the injected second paragraph');

const AMBIGUOUS = 'Independent verification remains outstanding across the recorded weaknesses.';
const REPAIRED = 'Management has not recorded an owner or completion date for reviewing these weaknesses.';
assert.equal(classifyAssuranceLanguageDetailed(AMBIGUOUS)?.category, 'AMBIGUOUS_ASSURANCE', 'the injected paragraph is a genuinely ambiguous assurance candidate');
assert.equal(classifyAssuranceLanguageDetailed(REPAIRED), null, 'the bounded replacement makes no assurance claim at all');
const ambiguousMarkdown = reference.replace(cleanTarget, AMBIGUOUS);

const ambiguousValidation = validateBlueprintTextManuscript(parseBlueprintMarkdown(ambiguousMarkdown, blueprint), blueprint, factPack);
assert.equal(parseBlueprintMarkdown(ambiguousMarkdown, blueprint).ok, true, 'parse ok:true, exactly as Production reported');
assert.deepEqual(
  ambiguousValidation.hardTruth.issues.map((i) => `${i.path}::${i.code}`),
  [`${TARGET_PATH}::assurance_claim`],
  'exactly one issue, assurance_claim, on the reported path'
);

// ---------------------------------------------------------------------------
// Provider-free writer and adapters.
// ---------------------------------------------------------------------------
const meta = (recovery) => ({ contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1', architecture: 'whole-manuscript', provider: 'test-double', model: 'test-double', promptVersion: 'test', generationMode: 'ai', generatedAt: new Date(0).toISOString(), inputFactPackSha256: 'f', inputStoryPlanSha256: 'p', recovery });
function harness(initialMarkdown, adjudicateImpl, repairText) {
  const calls = { adjudicate: 0, repair: 0, write: 0 };
  const writer = {
    provider: 'test-double', model: 'test-double', promptVersion: 'test',
    async writeManuscript() { calls.write += 1; return { contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1', architecture: 'whole-manuscript', markdown: initialMarkdown, blueprint, writerMetadata: meta({ ...emptyNarrativeRecoveryBudget(), initialGenerationCount: 1, totalCalls: 1 }) }; },
    async repairBlock() { throw new Error('block repair must not run on this path'); },
    async coherencePass(i) { return { contractVersion: 'x', architecture: 'whole-manuscript-coherence', markdown: i.previousMarkdown, blueprint, writerMetadata: meta({ ...emptyNarrativeRecoveryBudget(), coherenceCount: 1, totalCalls: 1 }) }; },
    async completeTail() { throw new Error('tail must not run on this path'); }
  };
  const semanticAdapters = {
    async adjudicate(candidates) { calls.adjudicate += 1; return adjudicateImpl(candidates); },
    async repair(targets) { calls.repair += 1; return targets.map((t) => ({ targetId: t.targetId, repairedText: repairText, candidateHash: t.candidateHash })); }
  };
  return { writer, semanticAdapters, calls };
}
const run = async (markdown, adjudicateImpl, repairText) => {
  const h = harness(markdown, adjudicateImpl, repairText);
  try { return { ...h, result: await composeEssentialManuscript({ factPack, writer: h.writer, semanticAdapters: h.semanticAdapters }) }; }
  catch (error) { return { ...h, error }; }
};
const valid = (label) => (candidates) => candidates.map((c) => ({ targetId: c.targetId, label, confidence: 0.93, reasonCode: 'bounded_assessment', evidenceRefs: ['validation:assurance_claim'] }));

// ---------------------------------------------------------------------------
// 1. Valid ALLOW_CONTEXT: unchanged existing behaviour.
// ---------------------------------------------------------------------------
const allowed = await run(ambiguousMarkdown, valid('ALLOW_CONTEXT'), REPAIRED);
assert.ok(!allowed.error, `a valid ALLOW_CONTEXT must still release: ${allowed.error?.message}`);
assert.equal(allowed.calls.adjudicate, 1);
assert.equal(allowed.calls.repair, 0, 'an allowed candidate spends no repair call');
assert.equal(allowed.result.manuscript.markdown.includes(AMBIGUOUS), true, 'allowed prose is left exactly as written');
assert.equal(allowed.result.semanticSafety.finalResult, 'ACCEPT');
assert.equal(allowed.result.semanticSafety.invalidAdjudicationPredicate, undefined, 'a valid adjudication records no predicate');

// ---------------------------------------------------------------------------
// 2. Valid REPAIRABLE: one repair, validator pass.
// ---------------------------------------------------------------------------
const repairable = await run(ambiguousMarkdown, valid('REPAIRABLE'), REPAIRED);
assert.ok(!repairable.error, `a valid REPAIRABLE must be repaired: ${repairable.error?.message}`);
assert.equal(repairable.calls.adjudicate, 1);
assert.equal(repairable.calls.repair, 1, 'exactly one bounded repair call');
assert.equal(repairable.result.manuscript.markdown.includes(REPAIRED), true);
assert.equal(repairable.result.semanticSafety.finalResult, 'ACCEPT');

// ---------------------------------------------------------------------------
// 3. Invalid adjudication + repairable assurance candidate: adjudication 1, repair 1, pass.
//    Every closed-vocabulary predicate reaches the same conservative route.
// ---------------------------------------------------------------------------
const invalidAdjudications = {
  result_count_mismatch: () => [],
  unknown_target: (c) => c.map((x) => ({ targetId: 'essential:NOT-A-TARGET', label: 'REPAIRABLE', confidence: 0.9, reasonCode: 'x', evidenceRefs: [] })),
  label_not_recognised: (c) => c.map((x) => ({ targetId: x.targetId, label: 'PROBABLY_FINE', confidence: 0.9, reasonCode: 'x', evidenceRefs: [] })),
  confidence_not_finite: (c) => c.map((x) => ({ targetId: x.targetId, label: 'REPAIRABLE', confidence: Number.NaN, reasonCode: 'x', evidenceRefs: [] })),
  confidence_below_threshold: (c) => c.map((x) => ({ targetId: x.targetId, label: 'ALLOW_CONTEXT', confidence: 0.42, reasonCode: 'x', evidenceRefs: [] })),
  reason_code_not_safe_token: (c) => c.map((x) => ({ targetId: x.targetId, label: 'REPAIRABLE', confidence: 0.9, reasonCode: 'the wording is fine in my view', evidenceRefs: [] })),
  evidence_refs_not_array: (c) => c.map((x) => ({ targetId: x.targetId, label: 'REPAIRABLE', confidence: 0.9, reasonCode: 'x', evidenceRefs: 'validation' })),
  evidence_ref_not_safe_token: (c) => c.map((x) => ({ targetId: x.targetId, label: 'REPAIRABLE', confidence: 0.9, reasonCode: 'x', evidenceRefs: ['a free text explanation'] })),
  provider_schema_violation: () => { throw new SemanticAdjudicationUnusableError('provider_schema_violation'); }
};
const fallbackOutcomes = {};
for (const [predicate, impl] of Object.entries(invalidAdjudications)) {
  const attempt = await run(ambiguousMarkdown, impl, REPAIRED);
  assert.ok(!attempt.error, `${predicate} must take the conservative repair route: ${attempt.error?.message}`);
  assert.equal(attempt.calls.adjudicate, 1, `${predicate}: exactly one adjudication call`);
  assert.equal(attempt.calls.repair, 1, `${predicate}: exactly one repair call, no second adjudication`);
  assert.equal(attempt.result.semanticSafety.invalidAdjudicationPredicate, predicate, `${predicate}: the failed predicate is named`);
  assert.equal(attempt.result.semanticSafety.invalidAdjudicationDisposition, 'conservative_repair');
  assert.equal(attempt.result.semanticSafety.finalResult, 'ACCEPT');
  assert.equal(attempt.result.manuscript.markdown.includes(REPAIRED), true, `${predicate}: the bounded replacement is present`);
  assert.equal(attempt.result.manuscript.markdown.includes(AMBIGUOUS), false, `${predicate}: the ambiguous prose is gone`);
  // 8. Provider budget stays bounded at generation + adjudication + repair.
  assert.equal(attempt.result.semanticSafety.totalProviderCalls, 3, `${predicate}: bounded at three provider calls`);
  assert.equal(attempt.result.semanticSafety.generationCalls, 1);
  fallbackOutcomes[predicate] = {
    adjudicationCalls: attempt.result.semanticSafety.adjudicationCalls,
    repairCalls: attempt.result.semanticSafety.repairCalls,
    finalResult: attempt.result.semanticSafety.finalResult
  };
}
// The diagnostics vocabulary is closed and carries no prose.
for (const predicate of Object.keys(fallbackOutcomes)) {
  assert.ok(ADJUDICATION_INVALID_PREDICATES.includes(predicate), `${predicate} is in the closed vocabulary`);
  assert.match(predicate, /^[a-z_]+$/, 'diagnostic predicates are fixed tokens, never customer or provider prose');
}

// ---------------------------------------------------------------------------
// 4. Invalid adjudication where the repair does not fix the defect: fail closed, no second repair.
// ---------------------------------------------------------------------------
const stillAmbiguous = 'Independent review of the recorded position remains unclear.';
assert.equal(classifyAssuranceLanguageDetailed(stillAmbiguous)?.category, 'AMBIGUOUS_ASSURANCE');
const stillFailing = await run(ambiguousMarkdown, invalidAdjudications.confidence_below_threshold, stillAmbiguous);
assert.ok(stillFailing.error, 'a repair that leaves the defect in place must fail closed');
assert.equal(stillFailing.calls.repair, 1, 'no second repair call for the same target');
assert.equal(stillFailing.calls.adjudicate, 1, 'no second adjudication call');

// A repair that introduces a NEW hard issue also fails closed.
const introducesHardTruth = 'Management recorded a verified control coverage of 88.11 percent across the weaknesses.';
const worsened = await run(ambiguousMarkdown, invalidAdjudications.result_count_mismatch, introducesHardTruth);
assert.ok(worsened.error, 'a repair that introduces another hard issue must fail closed');
assert.equal(worsened.calls.repair, 1);

// ---------------------------------------------------------------------------
// 5. Objective hard truth is never rescued by this route.
// ---------------------------------------------------------------------------
const hardTruthParagraph = `${AMBIGUOUS.replace(/\.$/, '')} recorded at 88.11 percent.`;
const mixedMarkdown = reference.replace(cleanTarget, hardTruthParagraph);
const mixedValidation = validateBlueprintTextManuscript(parseBlueprintMarkdown(mixedMarkdown, blueprint), blueprint, factPack);
assert.equal(mixedValidation.hardTruth.issues.some((i) => i.code === 'unsupported_numeric_claim'), true, 'the paragraph carries an objective hard-truth failure');
const mixed = await run(mixedMarkdown, invalidAdjudications.confidence_below_threshold, REPAIRED);
assert.ok(mixed.error, 'an objective hard-truth failure stays a hard reject');
assert.equal(mixed.calls.adjudicate, 0, 'no adjudication call is spent on objective hard truth');
assert.equal(mixed.calls.repair, 0, 'no unsafe rescue repair is attempted');

// ---------------------------------------------------------------------------
// 6/7. Only the target paragraph changed; Blueprint, Fact Pack, scenarios and roadmap unchanged.
// ---------------------------------------------------------------------------
const cleanRun = await run(reference, valid('ALLOW_CONTEXT'), REPAIRED);
assert.ok(!cleanRun.error, `the clean manuscript must pass untouched: ${cleanRun.error?.message}`);
assert.equal(cleanRun.calls.adjudicate, 0, 'a clean manuscript spends no adjudication call');
assert.equal(cleanRun.calls.repair, 0);
const conservative = await run(ambiguousMarkdown, invalidAdjudications.confidence_below_threshold, REPAIRED);
const blocks = (t) => t.trim().split(/\n\n+/).map((b) => b.trim());
const cleanBlocks = blocks(cleanRun.result.manuscript.markdown);
const finalBlocks = blocks(conservative.result.manuscript.markdown);
assert.equal(finalBlocks.length, cleanBlocks.length, 'no block is added or removed');
const changed = finalBlocks.map((b, i) => (b === cleanBlocks[i] ? null : i)).filter((i) => i !== null);
assert.equal(changed.length, 1, `exactly one block changed, received ${changed.length}`);
assert.equal(cleanBlocks[changed[0]], cleanTarget.trim(), 'the changed block is the reported target paragraph');
assert.equal(finalBlocks[changed[0]], REPAIRED, 'the changed block carries the bounded replacement');
assert.deepEqual(
  conservative.result.manuscript.markdown.match(/^#{1,3} .+$/gm),
  cleanRun.result.manuscript.markdown.match(/^#{1,3} .+$/gm),
  'Blueprint structure is byte-equivalent'
);
const finalParsed = parseBlueprintMarkdown(conservative.result.manuscript.markdown, blueprint);
assert.equal(finalParsed.ok, true, 'the unchanged parser is rerun and binds');
assert.equal(validateBlueprintTextManuscript(finalParsed, blueprint, factPack).ok, true, 'the full unchanged validator decides release');
assert.equal(factPack.findings.length, 8, 'Fact Pack findings unchanged');
assert.deepEqual(factPack.scenarios.map((s) => s.scenarioFamily), ['DETECTION_EVASION', 'THIRD_PARTY_COLLUSION'], 'scenarios unchanged');
assert.deepEqual(
  factPack.roadmap.map((i) => `${i.targetPeriod}/${i.phase}`),
  ['30 days/STABILISE', '60 days/ESTABLISH', '90 days/ESTABLISH', '90 days/ESTABLISH', '90 days/ESTABLISH', '90 days/ESTABLISH'],
  'roadmap unchanged'
);

// ---------------------------------------------------------------------------
// 9. Direct-repair routing for customer_copy_leakage and em_dash is unchanged.
// ---------------------------------------------------------------------------
const LEAKED = 'Management should read this as a connected management story rather than a list of separate issues.';
const LEAK_REPAIRED = 'Management should read these findings together, because the same ownership and review weaknesses run through each of them.';
assert.ok(findCustomerCopyLeakage(LEAKED).length > 0);
const leakRun = await run(reference.replace(cleanTarget, LEAKED), () => { throw new Error('adjudication must not run for a direct-repair code'); }, LEAK_REPAIRED);
assert.ok(!leakRun.error, `customer_copy_leakage must still route to direct repair: ${leakRun.error?.message}`);
assert.equal(leakRun.calls.adjudicate, 0, 'customer_copy_leakage still spends no adjudication call');
assert.equal(leakRun.calls.repair, 1, 'customer_copy_leakage still spends exactly one repair call');
const EM_DASHED = 'Management should treat ownership and review together — both weaknesses run through the same findings.';
const EM_REPAIRED = 'Management should treat ownership and review together, because both weaknesses run through the same findings.';
const emRun = await run(reference.replace(cleanTarget, EM_DASHED), () => { throw new Error('adjudication must not run for a direct-repair code'); }, EM_REPAIRED);
assert.ok(!emRun.error, `em_dash must still route to direct repair: ${emRun.error?.message}`);
assert.equal(emRun.calls.adjudicate, 0, 'em_dash still spends no adjudication call');
assert.equal(emRun.calls.repair, 1, 'em_dash still spends exactly one repair call');

// ---------------------------------------------------------------------------
// 10. A pipeline that does not mark a candidate semantically repair-eligible -- which is every
//     Comprehensive candidate -- still fails closed on an invalid adjudication.
// ---------------------------------------------------------------------------
const notEligible = {
  targetId: 'comprehensive:CHAPTER.paragraphs[0]', candidateHash: 'h', text: 'x', fieldRole: 'paragraph',
  issueCode: 'assurance_claim', issueFamily: 'assurance', deterministicFeatures: {}, evidenceRefs: [], evidence: {}
};
const ledger = new SemanticCallLedger();
ledger.claim('generation');
let repairAttempted = false;
const closed = await runSemanticSafetyCascade({
  initialValue: { text: 'x' },
  ledger,
  evaluate: () => ({ hardCandidates: [], candidates: [notEligible], valid: false }),
  adjudicate: async () => [],
  repair: async () => { repairAttempted = true; return []; },
  applyRepairs: (value) => value
});
assert.equal(closed.outcome, 'REJECT', 'a candidate with no bounded repair approval fails closed');
assert.equal(closed.diagnostics.reasonCode, 'invalid_adjudication');
assert.equal(closed.diagnostics.invalidAdjudicationDisposition, 'fail_closed');
assert.equal(closed.diagnostics.repairCalls, 0, 'no repair call is spent');
assert.equal(repairAttempted, false, 'the repair adapter is never reached');

// A transport failure is a different condition and must stay a provider failure.
const transportLedger = new SemanticCallLedger();
transportLedger.claim('generation');
const transport = await runSemanticSafetyCascade({
  initialValue: { text: 'x' },
  ledger: transportLedger,
  evaluate: () => ({ hardCandidates: [], candidates: [{ ...notEligible, semanticRepairEligible: true }], valid: false }),
  adjudicate: async () => { throw new Error('fetch failed'); },
  repair: async () => [],
  applyRepairs: (value) => value
});
assert.equal(transport.outcome, 'REJECT');
assert.equal(transport.diagnostics.reasonCode, 'semantic_provider_failure', 'a provider that never answered is not routed to repair');
assert.equal(transport.diagnostics.repairCalls, 0);

// ---------------------------------------------------------------------------
// The classifier itself, and the preserved confidence threshold.
// ---------------------------------------------------------------------------
assert.equal(SEMANTIC_ADJUDICATION_MIN_CONFIDENCE, 0.8, 'the confidence threshold is unchanged');
const probe = [{ targetId: 't', candidateHash: 'h', text: 'x', fieldRole: 'p', issueCode: 'c', issueFamily: 'f', deterministicFeatures: {}, evidenceRefs: [], evidence: {} }];
assert.equal(classifyAdjudicationValidity(probe, [{ targetId: 't', label: 'REPAIRABLE', confidence: 0.8, reasonCode: 'ok', evidenceRefs: [] }]).valid, true, '0.8 exactly is accepted');
assert.equal(classifyAdjudicationValidity(probe, [{ targetId: 't', label: 'REPAIRABLE', confidence: 0.79, reasonCode: 'ok', evidenceRefs: [] }]).predicate, 'confidence_below_threshold');
assert.equal(classifyAdjudicationValidity(probe, [
  { targetId: 't', label: 'REPAIRABLE', confidence: 0.9, reasonCode: 'ok', evidenceRefs: [] },
  { targetId: 't', label: 'REPAIRABLE', confidence: 0.9, reasonCode: 'ok', evidenceRefs: [] }
]).predicate, 'result_count_mismatch');

console.log(JSON.stringify({
  status: 'PASS', providerCalls: 0, databaseWrites: 0, emailsSent: 0,
  targetPath: TARGET_PATH,
  validAdjudication: { allow: { adjudicationCalls: allowed.calls.adjudicate, repairCalls: allowed.calls.repair, finalResult: allowed.result.semanticSafety.finalResult }, repairable: { adjudicationCalls: repairable.calls.adjudicate, repairCalls: repairable.calls.repair, finalResult: repairable.result.semanticSafety.finalResult } },
  invalidAdjudicationFallback: fallbackOutcomes,
  failClosed: { repairDidNotFix: 'REJECT', repairIntroducedHardIssue: 'REJECT', objectiveHardTruth: { adjudicationCalls: mixed.calls.adjudicate, repairCalls: mixed.calls.repair, outcome: 'HARD_REJECT' }, notRepairEligible: closed.diagnostics.reasonCode, transportFailure: transport.diagnostics.reasonCode },
  changedBlocks: changed.length,
  directRepairUnchanged: { customer_copy_leakage: { adjudicate: leakRun.calls.adjudicate, repair: leakRun.calls.repair }, em_dash: { adjudicate: emRun.calls.adjudicate, repair: emRun.calls.repair } },
  confidenceThreshold: SEMANTIC_ADJUDICATION_MIN_CONFIDENCE
}, null, 2));
