#!/usr/bin/env node
/**
 * Essential initial-manuscript structural recovery regression.
 *
 * Replays the affected assessment's real Blueprint (27 deterministic headings) and drives the
 * real writer through a provider seam, so no provider, database or network is reachable.
 *
 * Proves the failure class for the Production shape, that a proven truncation still uses the
 * bounded tail path, that a structurally mutated manuscript gets exactly one bounded technical
 * regeneration, and that provider accounting stays exact and fails closed.
 */
import assert from 'node:assert/strict';

// The writer constructor requires a configured gateway before it will build. Every provider
// dispatch in this test goes through the overridden dispatchGeneration() seam below, so
// generateText() is never reached and this placeholder can never authorise a real call.
process.env.AI_GATEWAY_API_KEY = 'offline-structural-recovery-fixture-not-a-credential';

import { syntheticOrgFixture } from '../../src/lib/reports/evidence-model/__fixtures__/synthetic-org-fixture.ts';
import { getQuestionPlaybook } from '../../src/lib/reports/evidence-model/question-playbooks.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { buildBlueprintMarkdownSkeleton, parseBlueprintMarkdown, deriveMissingBlueprintTail, classifyWholeManuscriptGeneration } from '../../src/lib/reports/narrative/blueprint-text.ts';
import { V11WholeManuscriptWriter, resolveStructuralBindingAction } from '../../src/lib/reports/narrative/whole-manuscript-writer.ts';

const SEL = { methodologyVersionId: 'offline-v12', methodologyVersionCode: 'MFRS-V1.2-CANDIDATE-OWNER-CORRECTION' };
const responses = { 'D1-Q01': 4, 'D1-Q02': 4, 'D1-Q03': 4, 'D1-Q04': 4, 'D1-Q05': 4, 'D1-Q06': 3, 'D1-Q07': 4, 'D2-Q01': 2, 'D2-Q02': 3, 'D2-Q03': 2, 'D2-Q04': 2, 'D2-Q05': 2, 'D2-Q06': 2, 'D2-Q07': 3, 'D2-Q08': 3, 'D3-Q01': 3, 'D3-Q02': 3, 'D3-Q03': 3, 'D3-Q04': 4, 'D3-Q05': 3, 'D3-Q06': 2, 'D3-Q07': 2, 'D3-Q08': 3, 'D3-Q09': 3, 'D3-Q10': 3, 'D3-Q11': 3, 'D4-Q01': 2, 'D4-Q02': 2, 'D4-Q03': 2, 'D4-Q04': 2, 'D4-Q05': 2, 'D4-Q06': 2, 'D4-Q07': 2, 'D4-Q08': 2, 'D5-Q01': 4, 'D5-Q03': 4, 'D5-Q04': 4, 'D5-Q05': 4, 'D5-Q06': 3, 'D6-Q01': 3, 'D6-Q02': 3, 'D6-Q03': 3, 'D6-Q04': 4, 'D6-Q05': 3, 'D7-Q01': 3, 'D7-Q02': 2, 'D7-Q03': 2, 'D7-Q04': 3, 'D7-Q05': 1, 'D7-Q06': 2, 'D7-Q07': 2, 'D8-Q01': 3, 'D8-Q02': 3, 'D8-Q03': 3, 'D8-Q04': 4, 'D8-Q06': 2, 'D8-Q07': 2, 'D8-Q08': 3, 'D8-Q09': 3, 'D8-Q10': 2, 'D9-Q01': 4, 'D9-Q02': 4, 'D9-Q03': 4, 'D9-Q05': 3, 'D10-Q01': 2, 'D10-Q02': 2, 'D10-Q03': 2, 'D10-Q06': 2 };
const weights = { 'D1-Q01': 1.5, 'D1-Q02': 1.25, 'D1-Q03': 1.25, 'D1-Q04': 1, 'D1-Q05': 1, 'D1-Q06': 1, 'D1-Q07': 0.5, 'D2-Q01': 1.5, 'D2-Q02': 1.5, 'D2-Q03': 1.25, 'D2-Q04': 1, 'D2-Q05': 1.25, 'D2-Q06': 1, 'D2-Q07': 1.25, 'D2-Q08': 1, 'D3-Q01': 1.5, 'D3-Q02': 1.25, 'D3-Q03': 1.5, 'D3-Q04': 1, 'D3-Q05': 1.25, 'D3-Q06': 1, 'D3-Q07': 1, 'D3-Q08': 0.5, 'D3-Q09': 0.5, 'D3-Q10': 0.5, 'D3-Q11': 0.5, 'D4-Q01': 1.5, 'D4-Q02': 1.25, 'D4-Q03': 1.5, 'D4-Q04': 1, 'D4-Q05': 0.5, 'D4-Q06': 1.25, 'D4-Q07': 1, 'D4-Q08': 0.5, 'D5-Q01': 1.5, 'D5-Q03': 1.25, 'D5-Q04': 1.25, 'D5-Q05': 1.5, 'D5-Q06': 1, 'D6-Q01': 1.5, 'D6-Q02': 1.25, 'D6-Q03': 1.25, 'D6-Q04': 1, 'D6-Q05': 1, 'D7-Q01': 1.5, 'D7-Q02': 1.25, 'D7-Q03': 1.25, 'D7-Q04': 1.5, 'D7-Q05': 1, 'D7-Q06': 1, 'D7-Q07': 1, 'D8-Q01': 1.5, 'D8-Q02': 1.5, 'D8-Q03': 1.25, 'D8-Q04': 1, 'D8-Q06': 1, 'D8-Q07': 1, 'D8-Q08': 1, 'D8-Q09': 0.5, 'D8-Q10': 0.5, 'D9-Q01': 1.25, 'D9-Q02': 1, 'D9-Q03': 1.25, 'D9-Q05': 1, 'D10-Q01': 1.5, 'D10-Q02': 1.25, 'D10-Q03': 1.25, 'D10-Q06': 1.25 };
const critical = new Set(['D1-Q01', 'D1-Q04', 'D2-Q01', 'D2-Q02', 'D3-Q01', 'D3-Q03', 'D3-Q04', 'D4-Q01', 'D4-Q03', 'D5-Q01', 'D5-Q05', 'D6-Q01', 'D7-Q01', 'D7-Q04', 'D8-Q01', 'D8-Q02', 'D8-Q04', 'D8-Q08', 'D10-Q01']);
const hardGates = new Set([...critical].filter((c) => c !== 'D6-Q01' && c !== 'D7-Q01'));
const criticalGaps = new Set(['D10-Q01', 'D2-Q01', 'D4-Q01', 'D4-Q03']);
const domainMeta = { D1: ['Fraud Leadership and Governance', 77.33, 12], D2: ['Fraud Risk Identification', 47.69, 12], D3: ['Operational Fraud Controls', 58.10, 14], D4: ['Fraud Detection Capability', 40, 14], D5: ['Fraud Incident Response', 76.92, 10], D6: ['Whistleblowing and Reporting Culture', 63.33, 6], D7: ['Third-Party and Supply Chain Fraud Risk', 44.71, 10], D8: ['Digital and Identity Fraud Risk', 56.76, 12], D9: ['Fraud Culture and Awareness', 75.56, 5], D10: ['Continuous Improvement and Fraud Risk Monitoring', 40, 5] };

const questionTraces = Object.entries(responses).map(([questionCode, responseValue]) => {
  const domainCode = questionCode.split('-')[0];
  return { questionCode, domainCode, domainName: domainMeta[domainCode][0], prompt: getQuestionPlaybook(questionCode, SEL)?.prompt ?? 'Control response.', responseValue, normalisedScore: responseValue * 20, applicable: true, triggeredRules: [], weight: weights[questionCode], isCritical: critical.has(questionCode), isHardGate: hardGates.has(questionCode), isCriticalGap: criticalGaps.has(questionCode), isMajorGap: false };
});
const data = {
  ...structuredClone(syntheticOrgFixture),
  organisationName: 'Offline Essential structural recovery fixture', assessmentReference: 'OFFLINE-ESSENTIAL-STRUCTURAL',
  scoreRun: { id: 'r', assessmentId: 'a', methodologyVersionId: 'offline-v12', methodologyVersionCode: 'MFRS-V1.2-CANDIDATE-OWNER-CORRECTION', status: 'completed', lockedAt: '2026-09-05T00:00:00.000Z', inputHash: 'x', overallScore: 57.29, calculatedMaturity: 'Developing', finalMaturity: 'Developing', exposureScore: null, exposureBand: null, coveragePct: 100, nARatePct: 0, criticalGapCount: 4, majorGapCount: 0, capApplied: false, capReason: 'c' },
  domainResults: Object.entries(domainMeta).map(([domainCode, m]) => ({ domainCode, domainName: m[0], rawScore: m[1], weightPct: m[2] })),
  questionTraces, criticalMajorGaps: questionTraces.filter((t) => t.isCriticalGap || t.isMajorGap),
  exposureAnswers: [], adaptiveScope: { exposureAssessed: false }, maturityCapEvents: []
};

const evidenceModel = buildAdvisoryEvidenceModel(data);
const projection = buildEssentialProjection(data, evidenceModel);
const pack = buildEssentialNarrativeFactPack(data, evidenceModel, projection);
const plan = buildNarrativeStoryPlan(pack);
const blueprint = buildReportBlueprint(pack, plan);
const skeleton = buildBlueprintMarkdownSkeleton(blueprint).markdown;
const headingCount = (text) => (text.match(/^#{1,3}\s+.+$/gm) ?? []).length;

// 8. The affected Fact Pack is unchanged by this work.
assert.equal(pack.findings.length, 8, 'the affected order keeps 8 findings');
assert.deepEqual(pack.scenarios.map((s) => s.scenarioFamily), ['DETECTION_EVASION', 'THIRD_PARTY_COLLUSION']);
assert.deepEqual(pack.roadmap.map((i) => `${i.targetPeriod}/${i.phase}`), ['30 days/STABILISE', '60 days/ESTABLISH', '90 days/ESTABLISH', '90 days/ESTABLISH', '90 days/ESTABLISH', '90 days/ESTABLISH']);
assert.equal(headingCount(skeleton), 27, 'the affected order Blueprint has 27 deterministic headings, matching Production');

// Digit-free, distinct prose: numbers would register as unsupported numeric claims and
// identical paragraphs would register as repetition, neither of which is under test here.
let prose = 0;
const label = () => { prose += 1; return `${String.fromCharCode(96 + Math.ceil(prose / 26))}${String.fromCharCode(96 + ((prose - 1) % 26) + 1)}`; };
const complete = skeleton.split('\n\n').map((b) => /^#{1,3} /.test(b) ? `${b}\n\nThe recorded management position for bounded section ${label()} should guide the response management sets out here.` : b).join('\n\n');
assert.equal(parseBlueprintMarkdown(complete, blueprint).ok, true, 'the reference manuscript binds exactly');

// Production shape: 25 headings, renamed and mis-levelled from heading 16.
let seen = 0;
const mutated = complete.replace(/^(#{1,3})\s+(.+)$/gm, (m, hashes, title) => {
  seen += 1;
  return seen >= 16 && seen <= 24 ? `${hashes.length === 2 ? '###' : '##'} ${title} review` : m;
});
const productionShape = mutated.slice(0, [...mutated.matchAll(/^#{1,3}\s+.+$/gm)][25].index).trimEnd();
// Pure truncation shape: clean prefix of 25 headings, deterministic suffix missing.
const truncatedShape = complete.slice(0, [...complete.matchAll(/^#{1,3}\s+.+$/gm)][25].index).trimEnd();

// ---------------------------------------------------------------------------
// Proven failure class for the Production shape.
// ---------------------------------------------------------------------------
assert.equal(headingCount(productionShape), 25);
assert.equal(headingCount(truncatedShape), 25);
const truncatedTail = deriveMissingBlueprintTail(truncatedShape, blueprint);
const productionTail = deriveMissingBlueprintTail(productionShape, blueprint);
assert.equal(truncatedTail.ok, true, 'a clean prefix with a missing suffix is provable');
assert.equal(truncatedTail.errors.length, 0);
assert.equal(truncatedTail.missingHeadings.length, 2);
assert.equal(productionTail.ok, false, 'the Production shape has no provable clean prefix');
assert.ok(productionTail.errors.length > 0, 'the Production shape reports heading divergence');
assert.match(productionTail.errors[0], /^heading 16 diverges/, 'divergence begins at heading 16 as reported in Production');
const productionParsed = parseBlueprintMarkdown(productionShape, blueprint);
assert.equal(productionParsed.ok, false);
assert.ok(productionParsed.errors.some((e) => /Expected 27 deterministic headings; received 25/.test(e.message)), 'the reported heading count error is reproduced');
assert.ok(productionParsed.errors.some((e) => /Expected ## .*; received ### /.test(e.message)), 'the reported heading hierarchy error is reproduced');

// 5. The discriminator never repairs heuristically: an unprovable prefix can only regenerate.
const outcomeFor = (markdown, missing) => classifyWholeManuscriptGeneration({ finishReason: 'stop', providerFinishReason: 'stop', outputTokens: 4000, maxOutputTokens: 9288, missingHeadingCount: missing.missingHeadings.length });
assert.equal(resolveStructuralBindingAction({ parsedOk: true, missing: truncatedTail, generationOutcome: 'COMPLETE' }), 'ACCEPT');
assert.equal(resolveStructuralBindingAction({ parsedOk: false, missing: truncatedTail, generationOutcome: 'TECHNICAL_TRUNCATION' }), 'TAIL_COMPLETION');
assert.equal(resolveStructuralBindingAction({ parsedOk: false, missing: productionTail, generationOutcome: 'TECHNICAL_TRUNCATION' }), 'TECHNICAL_REGENERATION', 'an unprovable prefix must never take the tail path');
assert.equal(resolveStructuralBindingAction({ parsedOk: false, missing: productionTail, generationOutcome: 'COMPLETE' }), 'TECHNICAL_REGENERATION');
assert.equal(resolveStructuralBindingAction({ parsedOk: false, missing: truncatedTail, generationOutcome: 'COMPLETE' }), 'TECHNICAL_REGENERATION', 'a clean prefix without a truncation signal is not tail-completed');

// ---------------------------------------------------------------------------
// The real writer, driven through its provider seam.
// ---------------------------------------------------------------------------
const context = { singleCallFeasible: true, partitionPlan: [], outputBudget: { hardOutputTokenLimit: 9288 }, boundaries: { assurance: 'The assessment does not independently verify operating effectiveness.' }, permittedDeterministicFacts: pack.facts };
// Distinguishable per-call accounting: a "second call only" aggregation cannot pass.
const CALL_TOKENS = [{ input: 600, output: 400, total: 1000, costMicros: 1200 }, { input: 500, output: 200, total: 700, costMicros: 800 }, { input: 100, output: 50, total: 150, costMicros: 90 }];
class SeamWriter extends V11WholeManuscriptWriter {
  constructor(responsesToReturn, budget, finishReasons = []) { super('openai/gpt-5-mini', { providerCallBudget: budget }); this.queue = [...responsesToReturn]; this.dispatches = []; this.finishReasons = finishReasons; }
  async dispatchGeneration(args) {
    const call = CALL_TOKENS[this.dispatches.length] ?? CALL_TOKENS[CALL_TOKENS.length - 1];
    this.dispatches.push(args.system.slice(0, 140));
    const text = this.queue.shift();
    if (text === undefined) throw new Error('unexpected extra provider dispatch');
    // Gateway routing shape the writer verifies. Fixed offline values; no call is made.
    return {
      text,
      usage: { inputTokens: call.input, outputTokens: call.output, totalTokens: call.total },
      finishReason: this.finishReasons[this.dispatches.length - 1] ?? 'stop',
      response: { modelId: 'gpt-5-mini' },
      providerMetadata: {
        gateway: {
          cost: String(call.costMicros / 1_000_000),
          generationId: `gen_offline_structural_fixture_${this.dispatches.length}`,
          routing: { originalModelId: 'openai/gpt-5-mini', canonicalSlug: 'openai/gpt-5-mini', resolvedProvider: 'openai', finalProvider: 'openai', resolvedProviderApiModelId: 'gpt-5-mini' }
        }
      }
    };
  }
}
const run = async (queue, budget = 2, finishReasons = []) => {
  const writer = new SeamWriter(queue, budget, finishReasons);
  try { return { writer, result: await writer.writeManuscript({ context, factPack: pack, blueprint, semanticSafety: true }) }; }
  catch (error) { return { writer, error }; }
};

// 1. Structurally perfect initial manuscript: one generation, no technical recovery.
const perfect = await run([complete]);
assert.ok(!perfect.error, `perfect manuscript must succeed: ${perfect.error?.message}`);
assert.equal(perfect.writer.dispatches.length, 1, 'exactly one provider call');
assert.equal(perfect.result.writerMetadata.recovery.initialGenerationCount, 1);
assert.equal(perfect.result.writerMetadata.recovery.technicalFallbackCount, 0, 'no technical recovery');
assert.equal(perfect.result.writerMetadata.recovery.totalCalls, 1);

// 3. Production shape then a valid second response: exactly one bounded regeneration.
const regenerated = await run([productionShape, complete]);
assert.ok(!regenerated.error, `bounded technical regeneration must succeed: ${regenerated.error?.message}`);
assert.equal(regenerated.writer.dispatches.length, 2, 'exactly two provider calls');
assert.equal(parseBlueprintMarkdown(regenerated.result.markdown, blueprint).ok, true, 'the recovered manuscript binds exactly');
const recovery = regenerated.result.writerMetadata.recovery;
assert.equal(recovery.initialGenerationCount, 1, 'initial generation counted once');
assert.equal(recovery.technicalFallbackCount, 1, 'the regeneration is counted as a technical operation');
assert.equal(recovery.totalCalls, 2, 'total provider calls are exact');
assert.equal(recovery.totalTokens, 1700, 'recovery tokens are call 1 (1000) + call 2 (700)');
// Top-level writerMetadata is what Production persistence reads: it must carry combined spend.
const aggregated = regenerated.result.writerMetadata;
assert.equal(aggregated.totalTokens, 1700, `persisted totalTokens must be 1000 + 700, received ${aggregated.totalTokens}`);
assert.equal(aggregated.inputTokens, 1100, 'persisted inputTokens must be 600 + 500');
assert.equal(aggregated.outputTokens, 600, 'persisted outputTokens must be 400 + 200');
assert.equal(aggregated.providerCostMicros, 2000, 'persisted providerCostMicros must be 1200 + 800');
assert.equal(recovery.totalProviderCostMicros, 2000, 'recovery cost is call 1 + call 2');
// The second call's identity is retained while the spend stays aggregate.
assert.equal(aggregated.generationId, 'gen_offline_structural_fixture_2', 'second-call generation identity is preserved');
// Semantic budgets stay distinguishable and untouched by a structural operation.
assert.equal(recovery.targetedRepairCount, 0);
assert.equal(recovery.fullRegenerationCount, 0);
assert.equal(recovery.qualityEscalationCount, 0);
assert.equal(recovery.coherenceCount, 0);
assert.equal(recovery.truncationContinuationCount, 0);

// 2. Proven missing deterministic suffix: the REAL tail path runs provider-free end to end.
//    The tail dispatch now shares the technical-generation seam, so this exercises
//    completeTail() -> appendBlueprintTail/reconcile, not just the discriminator.
const tailBoundary = [...complete.matchAll(/^#{1,3}\s+.+$/gm)][25];
const tailContinuation = complete.slice(tailBoundary.index).trimEnd();
assert.equal(headingCount(tailContinuation), 2, 'the continuation carries exactly the two missing headings');
// Call 1 stops at the token limit, which is what a real truncation reports.
const tailRun = await run([truncatedShape, tailContinuation], 2, ['length']);
assert.ok(!tailRun.error, `the proven-suffix tail path must succeed: ${tailRun.error?.message}`);
assert.equal(tailRun.writer.dispatches.length, 2, 'exactly one tail dispatch follows the initial generation');
assert.ok(/tail-completion writer/.test(tailRun.writer.dispatches[1]), 'the second dispatch is the tail operation, not a regeneration');
assert.equal(headingCount(tailRun.result.markdown), 27, 'the reconciled manuscript carries all 27 Blueprint headings');
const tailParsed = parseBlueprintMarkdown(tailRun.result.markdown, blueprint);
assert.equal(tailParsed.ok, true, `the reconciled manuscript must bind exactly: ${tailParsed.errors.map((e) => e.message).join(' | ')}`);
const tailRecovery = tailRun.result.writerMetadata.recovery;
assert.equal(tailRecovery.truncationContinuationCount, 1, 'the tail is counted as a truncation continuation');
assert.equal(tailRecovery.technicalFallbackCount, 0, 'no technical full regeneration occurred');
assert.equal(tailRecovery.initialGenerationCount, 1);
assert.equal(tailRecovery.totalCalls, 2, 'exactly two provider calls');
assert.equal(tailRecovery.targetedRepairCount, 0);
assert.equal(tailRecovery.fullRegenerationCount, 0);
// Aggregated spend across both tail-path calls, not the tail response alone.
assert.equal(tailRun.result.writerMetadata.totalTokens, 1700, 'tail-path persisted totalTokens must be 1000 + 700');
assert.equal(tailRun.result.writerMetadata.providerCostMicros, 2000, 'tail-path persisted cost must be 1200 + 800');
// A third call is never attempted.
assert.equal(tailRun.writer.queue.length, 0, 'no unconsumed response remains');

// 4. Second technical response still invalid: fail closed, no third attempt.
const stillInvalid = await run([productionShape, productionShape]);
assert.ok(stillInvalid.error, 'a still-invalid regeneration must fail closed');
assert.equal(stillInvalid.error.code, 'initial_manuscript_not_recoverable');
assert.equal(stillInvalid.writer.dispatches.length, 2, 'no third structural attempt');
assert.equal(stillInvalid.error.writerDiagnostics.stage, 'technical_regeneration_not_recoverable');
assert.equal(stillInvalid.error.writerDiagnostics.classification, 'STRUCTURAL_BINDING_FAILURE', 'the failure is no longer mislabelled as truncation');
assert.equal(stillInvalid.error.writerDiagnostics.technicalRegenerations, 1);
assert.ok(stillInvalid.error.writerDiagnostics.structural, 'structural evidence is attached');

// 7. The ceiling is enforced: a 1-call budget cannot dispatch the regeneration.
const ceilinged = await run([productionShape, complete], 1);
assert.ok(ceilinged.error, 'a 1-call ceiling must refuse the second dispatch');
assert.equal(ceilinged.writer.dispatches.length, 1, 'no call beyond the declared ceiling');

// 6. A structurally valid manuscript is returned even when semantics may fail, so the existing
//    semantic cascade owns adjudication and repair unchanged.
const semanticCase = await run([complete]);
assert.ok(!semanticCase.error);
assert.equal(parseBlueprintMarkdown(semanticCase.result.markdown, blueprint).ok, true);
assert.equal(semanticCase.writer.dispatches.length, 1, 'no structural call is spent on a semantic problem');

console.log(JSON.stringify({
  status: 'PASS', providerCalls: 0, aiCalls: 0,
  blueprintHeadings: headingCount(skeleton),
  productionShape: { headings: 25, tailProvable: productionTail.ok, firstDivergence: productionTail.errors[0], action: resolveStructuralBindingAction({ parsedOk: false, missing: productionTail, generationOutcome: 'TECHNICAL_TRUNCATION' }) },
  truncationShape: { headings: 25, tailProvable: truncatedTail.ok, missing: truncatedTail.missingHeadings.length, action: resolveStructuralBindingAction({ parsedOk: false, missing: truncatedTail, generationOutcome: 'TECHNICAL_TRUNCATION' }) },
  accounting: { perfect: perfect.result.writerMetadata.recovery.totalCalls, regenerated: recovery.totalCalls, technicalFallbackCount: recovery.technicalFallbackCount },
  factPack: { findings: pack.findings.length, scenarios: pack.scenarios.length, roadmap: pack.roadmap.map((i) => i.targetPeriod) }
}, null, 2));
