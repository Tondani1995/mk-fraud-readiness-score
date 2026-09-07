#!/usr/bin/env node
/**
 * Essential customer_copy_leakage recovery-routing regression.
 *
 * validateBlueprintTextManuscript() emits customer_copy_leakage into its hardTruth collection,
 * but validation-severity.ts classifies it REPAIRABLE_SEMANTIC_FAILURE with repairEligible true.
 * The Essential partition treated every non-assurance hard entry as objective hard truth, so a
 * leaked report-engine phrase was HARD_REJECTed with adjudicationCalls 0 and repairCalls 0.
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
import { buildBlueprintMarkdownSkeleton, parseBlueprintMarkdown, validateBlueprintTextManuscript, findCustomerCopyLeakage, CUSTOMER_COPY_LEAKAGE_CHECKS } from '../../src/lib/reports/narrative/blueprint-text.ts';
import { classifyNarrativeIssue } from '../../src/lib/reports/narrative/validation-severity.ts';
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
  ...structuredClone(syntheticOrgFixture), organisationName: 'Offline copy-leakage routing fixture', assessmentReference: 'OFFLINE-COPY-LEAKAGE',
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

// The leaked paragraph sits at EXECUTIVE-ASSESSMENT-TAKEAWAY.paragraphs[0], as in Production.
const takeawayParsed = parseBlueprintMarkdown(clean, blueprint);
const takeawaySection = takeawayParsed.chapters.flatMap((c) => c.sections).find((s) => s.sectionId === 'EXECUTIVE-ASSESSMENT-TAKEAWAY');
assert.ok(takeawaySection, 'the Blueprint carries EXECUTIVE-ASSESSMENT-TAKEAWAY');
const cleanTakeaway = takeawaySection.paragraphs[0].text;
const LEAKED = 'Management should read this as a connected management story rather than a list of separate issues.';
const REPAIRED = 'Management should read these findings together, because the same ownership and review weaknesses run through each of them.';
assert.ok(findCustomerCopyLeakage(LEAKED).length > 0, 'the injected phrase is detected by the unchanged detector');
assert.equal(findCustomerCopyLeakage(REPAIRED).length, 0, 'the replacement carries no leaked vocabulary');
const leaked = clean.replace(cleanTakeaway, LEAKED);

// ---------------------------------------------------------------------------
// BEFORE: the proven inconsistency.
// ---------------------------------------------------------------------------
const leakedParsed = parseBlueprintMarkdown(leaked, blueprint);
assert.equal(leakedParsed.ok, true, 'the parser passes: this is not a structural failure');
const leakedValidation = validateBlueprintTextManuscript(leakedParsed, blueprint, factPack);
assert.equal(leakedValidation.ok, false);
assert.deepEqual(leakedValidation.hardTruth.issues.map((i) => `${i.path}::${i.code}`), ['EXECUTIVE-ASSESSMENT-TAKEAWAY.paragraphs[0]::customer_copy_leakage'], 'exactly one blocking issue, on the reported path');
// The contradiction that caused the Production hard reject.
assert.equal(classifyNarrativeIssue('customer_copy_leakage').severity, 'REPAIRABLE_SEMANTIC_FAILURE');
assert.equal(classifyNarrativeIssue('customer_copy_leakage').repairEligible, true);
assert.equal(classifyNarrativeIssue('customer_copy_leakage').blocking, true, 'it stays release-blocking');

// ---------------------------------------------------------------------------
// Provider-free writer and adapters.
// ---------------------------------------------------------------------------
const meta = (recovery) => ({ contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1', architecture: 'whole-manuscript', provider: 'test-double', model: 'test-double', promptVersion: 'test', generationMode: 'ai', generatedAt: new Date(0).toISOString(), inputFactPackSha256: 'f', inputStoryPlanSha256: 'p', recovery });
function harness(initialMarkdown, repairText) {
  const calls = { adjudicate: 0, repair: 0, write: 0 };
  const writer = {
    provider: 'test-double', model: 'test-double', promptVersion: 'test',
    async writeManuscript() { calls.write += 1; return { contractVersion: 'mk-reporting-bible-1.1-whole-manuscript-writer-v1', architecture: 'whole-manuscript', markdown: initialMarkdown, blueprint, writerMetadata: meta({ ...emptyNarrativeRecoveryBudget(), initialGenerationCount: 1, totalCalls: 1 }) }; },
    async repairBlock() { throw new Error('block repair must not run on this path'); },
    async coherencePass(i) { return { contractVersion: 'x', architecture: 'whole-manuscript-coherence', markdown: i.previousMarkdown, blueprint, writerMetadata: meta({ ...emptyNarrativeRecoveryBudget(), coherenceCount: 1, totalCalls: 1 }) }; },
    async completeTail() { throw new Error('tail must not run on this path'); }
  };
  const semanticAdapters = {
    async adjudicate(candidates) { calls.adjudicate += 1; return candidates.map((c) => ({ targetId: c.targetId, disposition: 'AMBIGUOUS', candidateHash: c.candidateHash })); },
    async repair(targets) { calls.repair += 1; return targets.map((t) => ({ targetId: t.targetId, repairedText: repairText, candidateHash: t.candidateHash })); }
  };
  return { writer, semanticAdapters, calls };
}
const run = async (markdown, repairText) => {
  const h = harness(markdown, repairText);
  try { return { ...h, result: await composeEssentialManuscript({ factPack, writer: h.writer, semanticAdapters: h.semanticAdapters }) }; }
  catch (error) { return { ...h, error }; }
};

// ---------------------------------------------------------------------------
// AFTER: bounded direct repair, no adjudication.
// ---------------------------------------------------------------------------
const repaired = await run(leaked, REPAIRED);
assert.ok(!repaired.error, `the leaked paragraph must be repaired, not rejected: ${repaired.error?.message}`);
assert.equal(repaired.calls.adjudicate, 0, 'no semantic adjudication call is spent on a regex-detected copy defect');
assert.equal(repaired.calls.repair, 1, 'exactly one bounded repair call');
const finalMarkdown = repaired.result.manuscript.markdown;
assert.equal(finalMarkdown.includes(LEAKED), false, 'the leaked paragraph is gone');
assert.equal(finalMarkdown.includes(REPAIRED), true, 'the bounded replacement is present');
// Only the target paragraph changed. Compared against a clean run through the same pipeline so
// the assertion isolates the repair from any pipeline normalisation.
const cleanRun = await run(clean, REPAIRED);
assert.ok(!cleanRun.error, `the clean manuscript must pass untouched: ${cleanRun.error?.message}`);
assert.equal(cleanRun.calls.repair, 0, 'a clean manuscript spends no repair call');
assert.equal(cleanRun.calls.adjudicate, 0, 'a clean manuscript spends no adjudication call');
const cleanFinal = cleanRun.result.manuscript.markdown;
// Paragraph-level proof, immune to blank-line normalisation: every block is identical except
// the single repaired target.
const blocks = (t) => t.trim().split(/\n\n+/).map((b) => b.trim());
const cleanBlocks = blocks(cleanFinal);
const finalBlocks = blocks(finalMarkdown);
assert.equal(finalBlocks.length, cleanBlocks.length, 'no block is added or removed');
const changed = finalBlocks.map((b, i) => (b === cleanBlocks[i] ? null : i)).filter((i) => i !== null);
assert.equal(changed.length, 1, `exactly one block changed, received ${changed.length}`);
assert.equal(cleanBlocks[changed[0]], cleanTakeaway.trim(), 'the changed block is the reported target paragraph');
assert.equal(finalBlocks[changed[0]], REPAIRED, 'the changed block carries the bounded replacement');
assert.deepEqual(finalMarkdown.match(/^#{1,3} .+$/gm), cleanFinal.match(/^#{1,3} .+$/gm), 'Blueprint structure is byte-equivalent');
// The unchanged detector and full validator decide release.
assert.equal(findCustomerCopyLeakage(REPAIRED).length, 0);
const finalParsed = parseBlueprintMarkdown(finalMarkdown, blueprint);
assert.equal(finalParsed.ok, true);
assert.equal(validateBlueprintTextManuscript(finalParsed, blueprint, factPack).ok, true, 'the full unchanged validator passes');
// Fact Pack untouched.
assert.equal(factPack.findings.length, 8);
assert.deepEqual(factPack.scenarios.map((s) => s.scenarioFamily), ['DETECTION_EVASION', 'THIRD_PARTY_COLLUSION']);
assert.deepEqual(factPack.roadmap.map((i) => `${i.targetPeriod}/${i.phase}`), ['30 days/STABILISE', '60 days/ESTABLISH', '90 days/ESTABLISH', '90 days/ESTABLISH', '90 days/ESTABLISH', '90 days/ESTABLISH']);

// ---------------------------------------------------------------------------
// Negative: repaired prose still leaks -> fail closed, no second repair.
// ---------------------------------------------------------------------------
const stillLeaking = 'Management should treat this as a connected management story across the findings.';
assert.ok(findCustomerCopyLeakage(stillLeaking).length > 0);
const failed = await run(leaked, stillLeaking);
assert.ok(failed.error, 'a still-leaking repair must fail closed');
// customer_copy_leakage is an approved bounded customer-copy class, so the unused semantic slot
// pays for exactly one targeted retry. It is still a hard ceiling: a second failure fails closed
// and there is never a third call.
assert.equal(failed.calls.repair, 2, 'exactly one bounded retry, then fail closed');
assert.equal(failed.calls.adjudicate, 0, 'the retry never becomes an adjudication call');

// ---------------------------------------------------------------------------
// Negative: leakage plus an objective hard-truth failure in the same paragraph.
// ---------------------------------------------------------------------------
const leakedPlusHard = clean.replace(cleanTakeaway, `${LEAKED.replace(/\.$/, '')} recorded at 88.11 percent.`);
const mixedValidation = validateBlueprintTextManuscript(parseBlueprintMarkdown(leakedPlusHard, blueprint), blueprint, factPack);
assert.equal(mixedValidation.hardTruth.issues.some((i) => i.code === 'customer_copy_leakage'), true);
assert.equal(mixedValidation.hardTruth.issues.some((i) => i.code === 'unsupported_numeric_claim'), true);
const mixed = await run(leakedPlusHard, REPAIRED);
assert.ok(mixed.error, 'an objective hard-truth failure in the same paragraph must remain a hard reject');
assert.equal(mixed.calls.repair, 0, 'no unsafe rescue repair is attempted');

// ---------------------------------------------------------------------------
// em_dash: the identical repository-level inconsistency, same bounded routing.
// ---------------------------------------------------------------------------
const EM = '\u2014';
const EM_DASHED = `Management should treat ownership and review together ${EM} both weaknesses run through the same findings.`;
const EM_REPAIRED = 'Management should treat ownership and review together, because both weaknesses run through the same findings.';
assert.ok(EM_DASHED.includes(EM), 'the injected paragraph carries U+2014');
assert.equal(EM_REPAIRED.includes(EM), false, 'the replacement carries no U+2014');
const emOnly = clean.replace(cleanTakeaway, EM_DASHED);
const emValidation = validateBlueprintTextManuscript(parseBlueprintMarkdown(emOnly, blueprint), blueprint, factPack);
assert.deepEqual(emValidation.hardTruth.issues.map((i) => `${i.path}::${i.code}`), ['EXECUTIVE-ASSESSMENT-TAKEAWAY.paragraphs[0]::em_dash'], 'em_dash is the only blocking defect');
assert.equal(classifyNarrativeIssue('em_dash').severity, 'REPAIRABLE_SEMANTIC_FAILURE');
assert.equal(classifyNarrativeIssue('em_dash').repairEligible, true);
assert.equal(classifyNarrativeIssue('em_dash').blocking, true, 'em_dash stays release-blocking');

// 1. em_dash alone -> cleared deterministically, with NO provider call at all.
//    An em dash is mechanical typography, not semantic judgement, so it no longer consumes the
//    bounded repair slot that a genuine copy defect on another paragraph may need.
const emRun = await run(emOnly, EM_REPAIRED);
assert.ok(!emRun.error, `an em dash alone must be normalised, not rejected: ${emRun.error?.message}`);
assert.equal(emRun.calls.adjudicate, 0, 'no adjudication call for a deterministic em dash');
assert.equal(emRun.calls.repair, 0, 'an em dash is cleared without any provider repair call');
const emFinal = emRun.result.manuscript.markdown;
assert.equal(emFinal.includes(EM), false, 'no U+2014 survives anywhere in the manuscript');
assert.equal(validateBlueprintTextManuscript(parseBlueprintMarkdown(emFinal, blueprint), blueprint, factPack).ok, true, 'the unchanged validator passes');
const emBlocks = blocks(emFinal);
const emChanged = emBlocks.map((b, i) => (b === cleanBlocks[i] ? null : i)).filter((i) => i !== null);
assert.equal(emChanged.length, 1, 'exactly one block changed');
assert.equal(emBlocks[emChanged[0]].includes(EM), false, 'the changed block carries no em dash');
// The wording survives the normalisation: only the dash becomes punctuation.
const emWords = (t) => t.replace(/[^A-Za-z ]/g, ' ').split(/\s+/).filter(Boolean);
assert.deepEqual(emWords(emBlocks[emChanged[0]]), emWords(EM_DASHED), 'no word is added, removed or reordered');

// 2. A repair that INTRODUCES U+2014 is still caught by the unchanged validator and fails closed
//    after the one permitted bounded retry.
const emStillDashed = await run(leaked, `Management should act now ${EM} the weaknesses persist.`);
assert.ok(emStillDashed.error, 'a repair that introduces U+2014 must fail closed');
assert.equal(emStillDashed.calls.repair, 2, 'one bounded retry, then fail closed');

// 3. Both defects on one paragraph -> one target, one repair call, both cleared.
const bothDefects = clean.replace(cleanTakeaway, `Management should read this as a connected management story ${EM} not a list of separate issues.`);
const bothValidation = validateBlueprintTextManuscript(parseBlueprintMarkdown(bothDefects, blueprint), blueprint, factPack);
const bothCodes = bothValidation.hardTruth.issues.map((i) => i.code).sort();
assert.deepEqual(bothCodes, ['customer_copy_leakage', 'em_dash'], 'both defects are detected on the one paragraph');
assert.equal(new Set(bothValidation.hardTruth.issues.map((i) => i.path)).size, 1, 'both defects share one paragraph target');
const bothRun = await run(bothDefects, REPAIRED);
assert.ok(!bothRun.error, `both defects must clear in one bounded repair: ${bothRun.error?.message}`);
assert.equal(bothRun.calls.adjudicate, 0, 'no adjudication call');
// The em dash is normalised deterministically first, so the single repair call is spent on the
// customer-copy defect alone.
assert.equal(bothRun.calls.repair, 1, 'one repair call, not two, for a single paragraph target');
const bothFinal = bothRun.result.manuscript.markdown;
assert.equal(bothFinal.includes(EM), false, 'the em dash is cleared');
assert.equal(findCustomerCopyLeakage(REPAIRED).length, 0, 'the leaked vocabulary is cleared');
assert.equal(validateBlueprintTextManuscript(parseBlueprintMarkdown(bothFinal, blueprint), blueprint, factPack).ok, true, 'the unchanged validator passes');

// 4. em_dash plus an objective hard-truth failure -> HARD_REJECT, no repair.
const emPlusHard = clean.replace(cleanTakeaway, `Management should act on the recorded position ${EM} coverage sits at 88.11 percent.`);
const emHardValidation = validateBlueprintTextManuscript(parseBlueprintMarkdown(emPlusHard, blueprint), blueprint, factPack);
assert.equal(emHardValidation.hardTruth.issues.some((i) => i.code === 'em_dash'), true);
assert.equal(emHardValidation.hardTruth.issues.some((i) => i.code === 'unsupported_numeric_claim'), true);
const emHardRun = await run(emPlusHard, EM_REPAIRED);
assert.ok(emHardRun.error, 'an objective hard-truth failure keeps the paragraph a hard reject');
assert.equal(emHardRun.calls.repair, 0, 'no unsafe rescue repair is attempted');

// ---------------------------------------------------------------------------
// Negative: objective hard-truth codes stay hard.
// ---------------------------------------------------------------------------
for (const code of ['unsupported_numeric_claim', 'raw_internal_id', 'unknown_claim_ref', 'invented_finding', 'wrong_product_tier', 'missing_provenance']) {
  assert.equal(classifyNarrativeIssue(code).repairEligible, false, `${code} must stay a hard reject`);
}
assert.equal(CUSTOMER_COPY_LEAKAGE_CHECKS.length > 0, true, 'the detector is unchanged and non-empty');

console.log(JSON.stringify({
  status: 'PASS', providerCalls: 0, aiCalls: 0,
  before: { parserOk: true, blockingIssues: leakedValidation.hardTruth.issues.map((i) => i.code), severityContradiction: { validatorBucket: 'hardTruth', policyClass: classifyNarrativeIssue('customer_copy_leakage').severity } },
  after: { adjudicationCalls: repaired.calls.adjudicate, repairCalls: repaired.calls.repair, validatorOk: true, onlyTargetChanged: true },
  emDash: {
    alone: { adjudicationCalls: emRun.calls.adjudicate, repairCalls: emRun.calls.repair, validatorOk: true },
    stillDashedFailsClosed: { repairCalls: emStillDashed.calls.repair, failedClosed: Boolean(emStillDashed.error) },
    withCopyLeakage: { adjudicationCalls: bothRun.calls.adjudicate, repairCalls: bothRun.calls.repair, bothCleared: true },
    withObjectiveHardTruth: { repairCalls: emHardRun.calls.repair, hardRejected: Boolean(emHardRun.error) }
  },
  factPack: { findings: factPack.findings.length, scenarios: factPack.scenarios.length, roadmap: factPack.roadmap.map((i) => i.targetPeriod) }
}, null, 2));
