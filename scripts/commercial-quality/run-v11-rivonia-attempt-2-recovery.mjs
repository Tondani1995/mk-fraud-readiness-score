#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack, assertNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint, buildWholeManuscriptContext, assertReportBlueprint, validateReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { createV11WholeManuscriptWriter } from '../../src/lib/reports/narrative/whole-manuscript-writer.ts';
import { recoverWholeManuscript } from '../../src/lib/reports/narrative/whole-manuscript-recovery.ts';
import { parseBlueprintMarkdown, validateBlueprintTextManuscript } from '../../src/lib/reports/narrative/blueprint-text.ts';
import { emptyNarrativeRecoveryBudget } from '../../src/lib/reports/narrative/recovery-policy.ts';

const assessmentReference = 'MKFRS-2026-F4047D75C0';
const orderReference = 'MKORD-2026-22FF6B69';
const model = 'openai/gpt-5.6-luna';
const outputDir = process.env.V11_RIVONIA_RECOVERY_OUTPUT_DIR ?? 'outputs/v1.1-blueprint-whole-manuscript-rivonia/attempt-02-recovery';

function wordCount(value) { return value.trim().split(/\s+/).filter(Boolean).length; }
function headingCount(value) { return (value.match(/^#{1,3} .+$/gm) ?? []).length; }
function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function markdownReport(report) {
  return [
    `# ${report.title}`,
    '',
    `- Status: **${report.status}**`,
    `- Checked headings: **${report.checkedHeadings ?? report.headingCount ?? 'n/a'}**`,
    `- Checked paragraphs: **${report.checkedParagraphs ?? report.paragraphCount ?? 'n/a'}**`,
    `- Issues: **${report.issues?.length ?? 0}**`,
    '',
    report.issues?.length ? report.issues.map((issue) => `- ${issue.code ?? 'issue'} — ${issue.path ?? 'unknown path'} — ${issue.message}`).join('\n') : 'No blocking issues recorded.'
  ].join('\n') + '\n';
}

const data = await assembleReportData(orderReference);
if (data.assessmentReference !== assessmentReference) throw new Error(`Unexpected assembled assessment ${data.assessmentReference}`);
const evidence = buildAdvisoryEvidenceModel(data);
const projection = buildEssentialProjection(data, evidence);
const factPack = buildEssentialNarrativeFactPack(data, evidence, projection);
assertNarrativeFactPack(factPack);
const storyPlan = buildNarrativeStoryPlan(factPack);
assertNarrativeStoryPlan(storyPlan, factPack);
const blueprint = buildReportBlueprint(factPack, storyPlan);
assertReportBlueprint(blueprint, factPack);
const blueprintValidation = validateReportBlueprint(blueprint, factPack);
if (!blueprintValidation.ok) throw new Error(`Blueprint validation failed: ${blueprintValidation.issues.join('; ')}`);
const blueprintHeadingCount = blueprint.chapters.reduce((sum, chapter) => sum + 1 + chapter.sections.reduce((inner, section) => inner + 1 + section.optionalSubsections.length, 0), 0);
if (blueprintHeadingCount !== 38) throw new Error(`Expected 38 Blueprint headings; received ${blueprintHeadingCount}`);
const context = buildWholeManuscriptContext(factPack, blueprint);

const firstFailedAttemptAudit = {
  attemptIdentity: 'rivonia-essential-attempt-02-initial',
  status: 'FAILED_RELEASE_VALIDATION',
  model,
  aiCalls: 1,
  reason: 'assurance_claim',
  path: 'EXECUTIVE-ASSESSMENT-TAKEAWAY',
  matchedPhrase: 'independently verified',
  recoveryStatus: 'UNAVAILABLE_AT_TIME_OF_FAILURE',
  candidateRetained: false,
  disposition: 'The rejected candidate was not retained, so the owner-approved full manuscript regeneration is consumed by the next fresh generation.'
};

const writer = createV11WholeManuscriptWriter(model);
const fresh = await writer.writeManuscript({ context, blueprint, factPack });
// The prior lost candidate is part of Attempt 2's audit. The fresh provider response consumes the
// single approved full-regeneration slot; it is not an unlimited additional initial generation.
fresh.writerMetadata.recovery = {
  ...fresh.writerMetadata.recovery,
  fullRegenerationCount: 1,
  totalCalls: fresh.writerMetadata.recovery.totalCalls + firstFailedAttemptAudit.aiCalls
};

let activeWriter = writer;
const recovered = await recoverWholeManuscript({
  writer: activeWriter,
  context,
  blueprint,
  factPack,
  initialResult: fresh,
  attemptIdentity: 'rivonia-essential-attempt-02-recovery',
  diagnosticsRootDirectory: outputDir,
  runCoherence: true,
  escalateQuality: async () => {
    activeWriter = createV11WholeManuscriptWriter('openai/gpt-5.6-terra');
    return activeWriter.writeManuscript({ context, blueprint, factPack });
  }
});

const finalParsed = parseBlueprintMarkdown(recovered.markdown, blueprint);
const finalValidation = validateBlueprintTextManuscript(finalParsed, blueprint, factPack);
if (!finalParsed.ok || !finalValidation.ok || finalValidation.quality.status !== 'PASS') throw new Error('Final recovery validation failed.');
const allBlocks = finalParsed.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => [...section.paragraphs, ...section.subsections.flatMap((subsection) => subsection.paragraphs)]));
const factIds = new Set(factPack.facts.map((fact) => fact.id));
const invalidRefs = [...new Set(allBlocks.flatMap((block) => block.permittedClaimRefs).filter((ref) => !factIds.has(ref)))];
if (invalidRefs.length) throw new Error(`Final provenance validation failed: ${invalidRefs.join(', ')}`);

const recoveryAccounting = {
  ...recovered.recovery,
  priorAttempt: firstFailedAttemptAudit,
  currentAttempt: 'Rivonia Essential Attempt 2 recovery',
  limits: { initialGenerationCount: 1, targetedRepairCount: 4, fullRegenerationCount: 1, qualityEscalationCount: 1, coherenceCount: 1, technicalFallback: 'Mini → Luna → Terra → Sol' },
  repairRecords: recovered.repairRecords,
  rejectedCandidateDirectories: recovered.rejectedCandidateDirectories,
  technicalContinuations: recovered.recovery.truncationContinuationCount,
  semanticCorrectionsConsumed: recovered.recovery.targetedRepairCount,
  attempt2FullRegenerations: recovered.recovery.fullRegenerationCount,
  qualityEscalationUsed: recovered.recovery.qualityEscalationCount,
  coherenceUsed: recovered.coherenceUsed
};
const aiCallAccounting = {
  totalCalls: recovered.recovery.totalCalls,
  priorFailedInitialGenerationCalls: 1,
  currentFullRegenerationCalls: 1,
  technicalContinuationCalls: recovered.recovery.truncationContinuationCount,
  targetedRepairCalls: recovered.recovery.targetedRepairCount,
  qualityEscalationCalls: recovered.recovery.qualityEscalationCount,
  coherenceCalls: recovered.recovery.coherenceCount,
  model,
  provider: recovered.writerMetadata.provider,
  calls: [
    { phase: 'initial-generation', model, status: 'FAILED_RELEASE_VALIDATION', reason: 'assurance_claim', sequence: 1 },
    { phase: 'full-regeneration', model, status: 'COMPLETED_AND_RECOVERED', sequence: 2 },
    ...recovered.repairRecords.map((record, index) => ({ phase: 'targeted-repair', model: recovered.writerMetadata.model, status: 'completed', sequence: index + 3, ...record })),
    ...(recovered.recovery.qualityEscalationCount ? [{ phase: 'quality-escalation', model: 'openai/gpt-5.6-terra', status: 'completed' }] : []),
    ...(recovered.coherenceUsed ? [{ phase: 'coherence', model: recovered.writerMetadata.model, status: 'completed' }] : [])
  ]
};
const narrativeValidation = { title: 'Narrative validation report', status: 'PASS', blueprint: `${headingCount(recovered.markdown)}/${blueprintHeadingCount}`, hardTruth: finalValidation.hardTruth, provenance: { status: invalidRefs.length ? 'FAIL' : 'PASS', invalidRefs, checkedBlocks: allBlocks.length }, assurance: { status: finalValidation.hardTruth.issues.some((issue) => issue.code === 'assurance_claim') ? 'FAIL' : 'PASS' }, quality: finalValidation.quality, repairableSemantic: finalValidation.repairableSemantic };
const editorialValidation = { title: 'Editorial / commercial validation report', status: finalValidation.quality.status === 'PASS' ? 'PASS' : 'FAIL', basis: 'Whole-manuscript text-first editorial quality gate after bounded recovery and coherence.', sections: finalValidation.sectionCount, subsections: finalValidation.subsectionCount, paragraphs: finalValidation.paragraphCount, issues: finalValidation.quality.issues };
const ownerNote = [
  '# Rivonia Essential Attempt 2 — owner reading note',
  '',
  'Commercial owner review: **PENDING**.',
  '',
  'This is a plain-text owner-review manuscript. No market-readiness score is assigned and no production release is declared.',
  '',
  `- Organisation: ${factPack.organisation.name}`,
  `- Assessment: ${assessmentReference}`,
  `- Blueprint: ${headingCount(recovered.markdown)}/${blueprintHeadingCount} headings`,
  `- Word count: ${wordCount(recovered.markdown)}`,
  `- Model: ${recovered.writerMetadata.model}`,
  `- AI calls: ${recovered.recovery.totalCalls}`,
  `- Technical continuations: ${recovered.recovery.truncationContinuationCount}`,
  `- Targeted repairs: ${recovered.recovery.targetedRepairCount}/4`,
  `- Full regenerations: ${recovered.recovery.fullRegenerationCount}/1`,
  `- Quality escalation: ${recovered.recovery.qualityEscalationCount}/1`,
  `- Coherence pass: ${recovered.recovery.coherenceCount}/1`,
  '',
  '## Validation',
  '',
  '- Blueprint: PASS',
  '- Hard truth: PASS',
  '- Provenance: PASS',
  '- Assurance: PASS',
  '- Editorial / commercial quality gate: PASS',
  '',
  'PDF: NONE. Workbook: NONE. Snapshot: NOT CALLED. Kestrel: NOT CALLED. Production certification: NOT CLAIMED.'
].join('\n') + '\n';

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, 'fact-pack.json'), json(factPack));
await fs.writeFile(path.join(outputDir, 'report-blueprint.json'), json(blueprint));
await fs.writeFile(path.join(outputDir, 'writer-context.json'), json(context));
await fs.writeFile(path.join(outputDir, 'essential-manuscript.md'), `${recovered.markdown.trim()}\n`);
await fs.writeFile(path.join(outputDir, 'narrative-validation-report.json'), json(narrativeValidation));
await fs.writeFile(path.join(outputDir, 'narrative-validation-report.md'), markdownReport(narrativeValidation));
await fs.writeFile(path.join(outputDir, 'editorial-validation-report.json'), json(editorialValidation));
await fs.writeFile(path.join(outputDir, 'editorial-validation-report.md'), markdownReport(editorialValidation));
await fs.writeFile(path.join(outputDir, 'recovery-accounting.json'), json(recoveryAccounting));
await fs.writeFile(path.join(outputDir, 'ai-call-accounting.json'), json(aiCallAccounting));
await fs.writeFile(path.join(outputDir, 'attempt-02-initial-failure-audit.json'), json(firstFailedAttemptAudit));
await fs.writeFile(path.join(outputDir, 'owner-reading-note.md'), ownerNote);

console.log(JSON.stringify({
  status: 'PASS', outputDir, organisation: factPack.organisation.name, assessmentReference, model: recovered.writerMetadata.model,
  blueprint: `${headingCount(recovered.markdown)}/${blueprintHeadingCount}`, wordCount: wordCount(recovered.markdown),
  fullRegenerations: recovered.recovery.fullRegenerationCount, technicalContinuations: recovered.recovery.truncationContinuationCount,
  targetedRepairs: recovered.recovery.targetedRepairCount, qualityEscalation: recovered.recovery.qualityEscalationCount, coherence: recovered.recovery.coherenceCount,
  totalCalls: recovered.recovery.totalCalls, inputTokens: recovered.writerMetadata.inputTokens ?? null, outputTokens: recovered.writerMetadata.outputTokens ?? null,
  totalTokens: recovered.writerMetadata.totalTokens ?? null, providerCostMicros: recovered.writerMetadata.providerCostMicros ?? null, providerCostRaw: recovered.writerMetadata.providerCostRaw ?? null,
  hardTruth: 'PASS', provenance: 'PASS', assurance: 'PASS', editorial: 'PASS', pdf: 'NONE', workbook: 'NONE', kestrel: 'NOT CALLED', productionCertification: 'NOT CLAIMED', ownerReview: 'PENDING'
}, null, 2));
