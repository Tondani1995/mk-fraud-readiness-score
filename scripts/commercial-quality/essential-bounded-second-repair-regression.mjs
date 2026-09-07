#!/usr/bin/env node
/**
 * Essential bounded second-repair regression -- MKORD-2026-1A22698B attempt 9107326c.
 *
 * The manuscript parsed, needed no adjudication, and carried two direct-repair customer-copy
 * defects on DIFFERENT paragraphs: em_dash on one and customer_copy_leakage on another. One
 * repair call was dispatched, final validation still failed, and the cascade rejected with
 * REPAIR_FAILED / repair_failed_final_validation at generation 1 + adjudication 0 + repair 1 --
 * two of three semantic calls, with one slot unused.
 *
 * Two corrections are proven here. An em dash is now cleared deterministically before any
 * provider call, and when a first repair leaves only approved bounded customer-copy defects
 * behind, the unused semantic slot pays for exactly one targeted retry.
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
import { normaliseEssentialEmDashes } from '../../src/lib/reports/narrative/em-dash-normalisation.ts';
import {
  SEMANTIC_STAGE_CALL_LIMITS,
  SEMANTIC_TOTAL_CALL_LIMIT
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
  ...structuredClone(syntheticOrgFixture), organisationName: 'Offline bounded second-repair fixture', assessmentReference: 'OFFLINE-SECOND-REPAIR',
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
const clean = skeleton.split('\n\n').map((b) => /^#{2,3} /.test(b) ? `${b}\n\nThe recorded management position for bounded section ${label()} should guide the response management sets out here.` : b).join('\n\n');assert.equal(parseBlueprintMarkdown(clean, blueprint).ok, true, 'the reference manuscript binds exactly');
assert.equal(validateBlueprintTextManuscript(parseBlueprintMarkdown(clean, blueprint), blueprint, factPack).ok, true, 'the reference manuscript is clean');

// ---------------------------------------------------------------------------
// Two DISTINCT targets, as in Production: em_dash on one paragraph and
// customer_copy_leakage on a different one.
// ---------------------------------------------------------------------------
const parsedClean = parseBlueprintMarkdown(clean, blueprint);
const sections = parsedClean.chapters.flatMap((chapter) => chapter.sections);
const takeaway = sections.find((section) => section.sectionId === 'EXECUTIVE-ASSESSMENT-TAKEAWAY');
const drivers = sections.find((section) => section.sectionId === 'EXECUTIVE-ASSESSMENT-DRIVERS');
assert.ok(takeaway && drivers, 'the Blueprint carries both executive sections');
const EM_PATH = 'EXECUTIVE-ASSESSMENT-DRIVERS.paragraphs[0]';
const LEAK_PATH = 'EXECUTIVE-ASSESSMENT-TAKEAWAY.paragraphs[0]';
const cleanEmTarget = drivers.paragraphs[0].text;
const cleanLeakTarget = takeaway.paragraphs[0].text;
assert.notEqual(cleanEmTarget, cleanLeakTarget, 'the two targets are different paragraphs');

const EM = '—';
const EM_DASHED = `Management should treat ownership and review together ${EM} both weaknesses run through the same findings.`;
const EM_NORMALISED = 'Management should treat ownership and review together, both weaknesses run through the same findings.';
const LEAKED = 'Management should read this as a connected management story rather than a list of separate issues.';
const LEAK_REPAIRED = 'Management should read these findings together, because the same ownership and review weaknesses run through each of them.';
assert.ok(EM_DASHED.includes(EM), 'the injected paragraph carries U+2014');
assert.ok(findCustomerCopyLeakage(LEAKED).length > 0, 'the injected phrase is detected by the unchanged detector');
assert.equal(findCustomerCopyLeakage(LEAK_REPAIRED).length, 0);

const production = clean.replace(cleanEmTarget, EM_DASHED).replace(cleanLeakTarget, LEAKED);
const productionParsed = parseBlueprintMarkdown(production, blueprint);
assert.equal(productionParsed.ok, true, 'parse succeeds: this is not a structural failure');
const productionValidation = validateBlueprintTextManuscript(productionParsed, blueprint, factPack);
assert.deepEqual(
  productionValidation.hardTruth.issues.map((i) => `${i.path}::${i.code}`).sort(),
  [`${EM_PATH}::em_dash`, `${LEAK_PATH}::customer_copy_leakage`].sort(),
  'exactly the two Production defects, on two different paragraphs'
);

// ---------------------------------------------------------------------------
// A. Deterministic em-dash normalisation clears target 1 with no provider call.
// ---------------------------------------------------------------------------
const beforeNormalisation = parseBlueprintMarkdown(production, blueprint);
assert.equal(beforeNormalisation.markdown.includes(EM), true, 'U+2014 is present before normalisation');
const replacements = normaliseEssentialEmDashes(beforeNormalisation);
assert.equal(replacements, 1, 'exactly one em dash was normalised');
assert.equal(beforeNormalisation.markdown.includes(EM), false, 'U+2014 is absent afterwards');
const normalisedSections = beforeNormalisation.chapters.flatMap((c) => c.sections);
assert.equal(normalisedSections.find((s) => s.sectionId === 'EXECUTIVE-ASSESSMENT-DRIVERS').paragraphs[0].text, EM_NORMALISED, 'the wording is preserved; only the dash becomes a comma');
// Nothing but punctuation moved.
const words = (t) => t.replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter(Boolean);
assert.deepEqual(words(EM_NORMALISED), words(EM_DASHED), 'no word is added, removed or reordered');
const numbers = (t) => (t.match(/\d+(?:\.\d+)?%?/g) ?? []);
assert.deepEqual(numbers(beforeNormalisation.markdown), numbers(production), 'no number changes');
assert.deepEqual(beforeNormalisation.markdown.match(/^#{1,3} .+$/gm), production.match(/^#{1,3} .+$/gm), 'no heading changes');
assert.equal(normalisedSections.length, sections.length, 'no section is added or removed');
assert.equal(normalisedSections.find((s) => s.sectionId === 'EXECUTIVE-ASSESSMENT-TAKEAWAY').paragraphs[0].text, LEAKED, 'paragraph ownership is unchanged: the other target is untouched');
// The validator remains authoritative: em_dash is gone, the copy defect still rejects.
const afterNormalisation = validateBlueprintTextManuscript(parseBlueprintMarkdown(beforeNormalisation.markdown, blueprint), blueprint, factPack);
assert.deepEqual(
  afterNormalisation.hardTruth.issues.map((i) => `${i.path}::${i.code}`),
  [`${LEAK_PATH}::customer_copy_leakage`],
  'normalisation clears em_dash only; another prohibited issue still fails'
);
// The em_dash validator itself is untouched.
assert.equal(validateBlueprintTextManuscript(parseBlueprintMarkdown(clean.replace(cleanEmTarget, EM_DASHED), blueprint), blueprint, factPack).hardTruth.issues.some((i) => i.code === 'em_dash'), true, 'the em_dash validator still rejects an em dash');

// ---------------------------------------------------------------------------
// Provider-free writer and adapters.
// ---------------------------------------------------------------------------
const meta = (recovery) => ({ contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1', architecture: 'whole-manuscript', provider: 'test-double', model: 'test-double', promptVersion: 'test', generationMode: 'ai', generatedAt: new Date(0).toISOString(), inputFactPackSha256: 'f', inputStoryPlanSha256: 'p', recovery });
function harness(initialMarkdown, repairImpl, adjudicateImpl) {
  const calls = { adjudicate: 0, repair: 0, write: 0 };
  const repairContexts = [];
  const writer = {
    provider: 'test-double', model: 'test-double', promptVersion: 'test',
    async writeManuscript() { calls.write += 1; return { contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1', architecture: 'whole-manuscript', markdown: initialMarkdown, blueprint, writerMetadata: meta({ ...emptyNarrativeRecoveryBudget(), initialGenerationCount: 1, totalCalls: 1 }) }; },
    async repairBlock() { throw new Error('block repair must not run on this path'); },
    async coherencePass(i) { return { contractVersion: 'x', architecture: 'whole-manuscript-coherence', markdown: i.previousMarkdown, blueprint, writerMetadata: meta({ ...emptyNarrativeRecoveryBudget(), coherenceCount: 1, totalCalls: 1 }) }; },
    async completeTail() { throw new Error('tail must not run on this path'); }
  };
  const semanticAdapters = {
    async adjudicate(candidates) {
      calls.adjudicate += 1;
      if (!adjudicateImpl) throw new Error('adjudication must not run on this path');
      return adjudicateImpl(candidates);
    },
    async repair(targets, context) {
      calls.repair += 1;
      repairContexts.push({ attempt: context?.attempt, survivingIssueCodes: context?.survivingIssueCodes ?? [], targetIds: targets.map((t) => t.targetId) });
      return repairImpl(targets, context, calls.repair);
    }
  };
  return { writer, semanticAdapters, calls, repairContexts };
}
const run = async (markdown, repairImpl, adjudicateImpl) => {
  const h = harness(markdown, repairImpl, adjudicateImpl);
  try { return { ...h, result: await composeEssentialManuscript({ factPack, writer: h.writer, semanticAdapters: h.semanticAdapters }) }; }
  catch (error) { return { ...h, error }; }
};
const replaceAll = (targets, text) => targets.map((t) => ({ targetId: t.targetId, repairedText: text }));

// ---------------------------------------------------------------------------
// B. The Production shape: repair #1 leaves a repairable customer-copy failure, and the
//    unused semantic slot pays for exactly one targeted retry that clears it.
// ---------------------------------------------------------------------------
const STILL_LEAKING = 'Management should treat this as a connected management story across the findings.';
assert.ok(findCustomerCopyLeakage(STILL_LEAKING).length > 0, 'the first repair deliberately leaves a repairable copy failure');
const recovered = await run(production, (targets, context, attempt) => replaceAll(targets, attempt === 1 ? STILL_LEAKING : LEAK_REPAIRED));
assert.ok(!recovered.error, `the bounded retry must recover the manuscript: ${recovered.error?.message}`);
assert.equal(recovered.calls.write, 1, 'generation 1');
assert.equal(recovered.calls.adjudicate, 0, 'no adjudication is used');
assert.equal(recovered.calls.repair, 2, 'exactly two bounded repair calls');
const semantic = recovered.result.semanticSafety;
assert.equal(semantic.generationCalls, 1);
assert.equal(semantic.adjudicationCalls, 0);
assert.equal(semantic.repairCalls, 2);
assert.equal(semantic.repairAttempts, 2);
assert.equal(semantic.totalProviderCalls, 3);
assert.ok(semantic.totalProviderCalls <= SEMANTIC_TOTAL_CALL_LIMIT, 'the total semantic ceiling is not raised');
assert.equal(SEMANTIC_STAGE_CALL_LIMITS.repair, 2, 'repair is bounded at two attempts');
assert.equal(semantic.finalResult, 'ACCEPT');
// Only the surviving paragraph is sent to the retry, and the instruction names the surviving codes.
assert.deepEqual(recovered.repairContexts[0].attempt, 1);
assert.deepEqual(recovered.repairContexts[1].attempt, 2);
assert.deepEqual(recovered.repairContexts[1].targetIds, [`essential:${LEAK_PATH}`], 'only the surviving target is retried');
assert.deepEqual(recovered.repairContexts[1].survivingIssueCodes, ['customer_copy_leakage'], 'the retry instruction names the surviving validator code');
// The em-dash paragraph never reached a provider at all.
assert.equal(recovered.repairContexts.some((c) => c.targetIds.includes(`essential:${EM_PATH}`)), false, 'the em dash never consumed a repair target');

// Exactly the targeted paragraphs changed, and the full validator decided release.
const finalMarkdown = recovered.result.manuscript.markdown;
const cleanRun = await run(clean, (targets) => replaceAll(targets, LEAK_REPAIRED));
assert.ok(!cleanRun.error, `the clean manuscript must pass untouched: ${cleanRun.error?.message}`);
assert.equal(cleanRun.calls.repair, 0);
const blocks = (t) => t.trim().split(/\n\n+/).map((b) => b.trim());
const cleanBlocks = blocks(cleanRun.result.manuscript.markdown);
const finalBlocks = blocks(finalMarkdown);
assert.equal(finalBlocks.length, cleanBlocks.length, 'no block is added or removed');
const changed = finalBlocks.map((b, i) => (b === cleanBlocks[i] ? null : i)).filter((i) => i !== null);
assert.equal(changed.length, 2, `exactly the two targeted paragraphs changed, received ${changed.length}`);
assert.deepEqual(changed.map((i) => cleanBlocks[i]).sort(), [cleanEmTarget.trim(), cleanLeakTarget.trim()].sort(), 'the changed blocks are the two reported targets');
assert.deepEqual(changed.map((i) => finalBlocks[i]).sort(), [EM_NORMALISED, LEAK_REPAIRED].sort(), 'each target carries its bounded correction');
assert.deepEqual(finalMarkdown.match(/^#{1,3} .+$/gm), cleanRun.result.manuscript.markdown.match(/^#{1,3} .+$/gm), 'Blueprint structure is byte-equivalent');
const finalParsed = parseBlueprintMarkdown(finalMarkdown, blueprint);
assert.equal(finalParsed.ok, true);
assert.equal(validateBlueprintTextManuscript(finalParsed, blueprint, factPack).ok, true, 'the full unchanged validator passes');
assert.equal(finalMarkdown.includes(EM), false, 'no em dash survives');
assert.equal(findCustomerCopyLeakage(finalMarkdown).length, 0, 'no leaked vocabulary survives');

// ---------------------------------------------------------------------------
// Negative: the second repair is still bad -> fail closed, no third call.
// ---------------------------------------------------------------------------
const stillBad = await run(production, (targets) => replaceAll(targets, STILL_LEAKING));
assert.ok(stillBad.error, 'a retry that leaves the defect in place must fail closed');
assert.equal(stillBad.calls.repair, 2, 'exactly two repair calls, never a third');
assert.equal(stillBad.calls.adjudicate, 0);

// ---------------------------------------------------------------------------
// Negative: the first repair introduces an unsupported numeric claim -> hard reject, no retry.
// ---------------------------------------------------------------------------
const NUMERIC = 'Management recorded a verified control coverage of 88.11 percent across the findings.';
const hardTruth = await run(production, (targets) => replaceAll(targets, NUMERIC));
assert.ok(hardTruth.error, 'an objective hard-truth failure introduced by a repair is a hard reject');
assert.equal(hardTruth.calls.repair, 1, 'no second repair is offered to an objective hard-truth failure');

// ---------------------------------------------------------------------------
// Negative: adjudication already used -> no fourth semantic call.
// ---------------------------------------------------------------------------
const AMBIGUOUS = 'Independent verification remains outstanding across the recorded weaknesses.';
const adjudicated = clean.replace(cleanEmTarget, EM_DASHED).replace(cleanLeakTarget, AMBIGUOUS);
const adjudicatedValidation = validateBlueprintTextManuscript(parseBlueprintMarkdown(adjudicated, blueprint), blueprint, factPack);
assert.equal(adjudicatedValidation.hardTruth.issues.some((i) => i.code === 'assurance_claim'), true, 'the fixture carries a genuine adjudication candidate');
const afterAdjudication = await run(
  adjudicated,
  (targets) => replaceAll(targets, STILL_LEAKING),
  (candidates) => candidates.map((c) => ({ targetId: c.targetId, label: 'REPAIRABLE', confidence: 0.93, reasonCode: 'bounded', evidenceRefs: [] }))
);
assert.ok(afterAdjudication.error, 'a failed repair after an adjudication call fails closed');
assert.equal(afterAdjudication.calls.adjudicate, 1);
assert.equal(afterAdjudication.calls.repair, 1, 'no fourth semantic call is created');
assert.equal(afterAdjudication.calls.adjudicate + afterAdjudication.calls.repair + 1, 3, 'the run stops at the unchanged ceiling of three');

// ---------------------------------------------------------------------------
// Negative: invalid repair target IDs -> fail closed.
// ---------------------------------------------------------------------------
const badTargets = await run(production, () => [{ targetId: 'essential:NOT-A-TARGET', repairedText: LEAK_REPAIRED }]);
assert.ok(badTargets.error, 'a repair naming a target it was not given must fail closed');
assert.equal(badTargets.calls.repair, 1, 'a bad target list does not earn a retry');
const emptyRepair = await run(production, (targets) => replaceAll(targets, '   '));
assert.ok(emptyRepair.error, 'blank repaired prose must fail closed');

// ---------------------------------------------------------------------------
// C. Post-repair diagnostics carry closed-vocabulary codes and structural paths only.
// ---------------------------------------------------------------------------
const diagnostics = stillBad.error.diagnostics?.semanticSafety ?? {};
assert.equal(Array.isArray(diagnostics.postRepair), true, 'post-repair diagnostics are recorded');
assert.equal(diagnostics.postRepair.length, 2, 'one record per repair attempt');
assert.deepEqual(diagnostics.postRepair.map((e) => e.attempt), [1, 2]);
for (const entry of diagnostics.postRepair) {
  assert.deepEqual(entry.remainingIssueCodes, ['customer_copy_leakage'], 'remaining issue codes are closed-vocabulary validator codes');
  assert.deepEqual(entry.remainingIssuePaths, [`essential:${LEAK_PATH}`], 'remaining issue paths are structural Blueprint coordinates');
  assert.equal(entry.remainingHardCount, 0);
  assert.equal(entry.remainingRepairableCount, 1, 'the hard-versus-repairable split is recorded');
  assert.equal(entry.generationCalls, 1);
  assert.equal(entry.adjudicationCalls, 0);
  assert.equal(entry.totalProviderCalls, 1 + entry.repairCalls);
  for (const value of [...entry.remainingIssueCodes, ...entry.remainingIssuePaths]) {
    assert.equal(STILL_LEAKING.includes(value), false, 'no customer prose is carried in diagnostics');
    assert.match(value, /^[A-Za-z0-9_.:\-[\]]+$/, 'diagnostics carry structural tokens only');
  }
}

console.log(JSON.stringify({
  status: 'PASS', providerCalls: 0, databaseWrites: 0, emailsSent: 0,
  targets: { emDash: EM_PATH, customerCopyLeakage: LEAK_PATH },
  deterministicEmDash: { replacements, emDashPresentBefore: true, emDashPresentAfter: false, wordsUnchanged: true, numbersUnchanged: true, headingsUnchanged: true },
  recoveredFlow: {
    generationCalls: semantic.generationCalls,
    adjudicationCalls: semantic.adjudicationCalls,
    repairCalls: semantic.repairCalls,
    totalProviderCalls: semantic.totalProviderCalls,
    finalResult: semantic.finalResult,
    retryTargets: recovered.repairContexts[1].targetIds,
    retrySurvivingIssueCodes: recovered.repairContexts[1].survivingIssueCodes,
    changedBlocks: changed.length
  },
  failClosed: {
    secondRepairStillBad: { repairCalls: stillBad.calls.repair },
    firstRepairIntroducedHardTruth: { repairCalls: hardTruth.calls.repair },
    adjudicationAlreadyUsed: { adjudicationCalls: afterAdjudication.calls.adjudicate, repairCalls: afterAdjudication.calls.repair },
    invalidRepairTargets: { repairCalls: badTargets.calls.repair }
  },
  ceilings: { perStage: SEMANTIC_STAGE_CALL_LIMITS, total: SEMANTIC_TOTAL_CALL_LIMIT }
}, null, 2));
