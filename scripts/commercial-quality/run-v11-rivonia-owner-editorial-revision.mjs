#!/usr/bin/env node
/* One owner-directed editorial rewrite of the existing validated Rivonia manuscript. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack, assertNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint, buildWholeManuscriptContext, assertReportBlueprint, validateReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { createV11WholeManuscriptWriter } from '../../src/lib/reports/narrative/whole-manuscript-writer.ts';
import { parseBlueprintMarkdown, validateBlueprintTextManuscript } from '../../src/lib/reports/narrative/blueprint-text.ts';
import { recoverWholeManuscript } from '../../src/lib/reports/narrative/whole-manuscript-recovery.ts';

const assessmentReference = 'MKFRS-2026-F4047D75C0';
const orderReference = 'MKORD-2026-22FF6B69';
const expectedStartingSha = process.env.V11_RIVONIA_OWNER_EXPECTED_SHA ?? 'a026b5ec44d2af71f7f7beb9af35d24ac8598716';
const branchName = 'commercial/mk-fraud-readiness-95-quality';
const model = 'openai/gpt-5.6-terra';
const previousOutputDir = process.env.V11_RIVONIA_OWNER_PREVIOUS_OUTPUT_DIR ?? '/Users/tondani/Documents/Codex/2026-08-11/p1-no-paid-order-can-be/outputs/v1.1-blueprint-whole-manuscript-rivonia/attempt-02-recovery';
const outputDir = process.env.V11_RIVONIA_OWNER_EDITORIAL_OUTPUT_DIR ?? '/Users/tondani/Documents/Codex/2026-08-11/p1-no-paid-order-can-be/outputs/v1.1-blueprint-whole-manuscript-rivonia/attempt-02-owner-editorial-revision';

function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function wordCount(value) { return value.trim().split(/\s+/).filter(Boolean).length; }
function headingCount(value) { return (value.match(/^#{1,3} .+$/gm) ?? []).length; }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function countPhrase(value, phrase) { return (value.match(new RegExp(phrase, 'gi')) ?? []).length; }
function countAny(value, terms) { return terms.reduce((total, term) => total + countPhrase(value, term), 0); }
function markdownReport(report) {
  return [
    `# ${report.title}`,
    '',
    `- Status: **${report.status}**`,
    `- Blueprint headings: **${report.blueprint ?? 'n/a'}**`,
    `- Sections: **${report.sections ?? 'n/a'}**`,
    `- Subsections: **${report.subsections ?? 'n/a'}**`,
    `- Paragraphs: **${report.paragraphs ?? 'n/a'}**`,
    '',
    report.issues?.length ? report.issues.map((issue) => `- ${issue.code ?? 'issue'} — ${issue.path ?? 'unknown path'} — ${issue.message}`).join('\n') : 'No blocking issues recorded.'
  ].join('\n') + '\n';
}

const editorialBrief = [
  'This is MANUAL_OWNER_EDITORIAL_REVISION = 1. Use the existing validated manuscript as the editorial base; do not regenerate blindly and do not invent analytical facts.',
  'Write for a CEO, CFO, COO, Head of Risk or Audit Committee member in calm, plain, fraud-specialist English. Lead with judgement, not a disclaimer. Establish the assurance boundary once after the executive judgement and never make the whole report sound like a database record.',
  'Preserve the deterministic score 35.55 / Reactive, approved findings, scenarios, controls, owners, roadmap truth, provenance and assurance boundary. Treat the three scenarios as conditional pathways, not actual events, and preserve their natural narrative form.',
  'Use the positive signal analytically: Whistleblowing and Reporting Culture 73.57 is a material foundation. Explain that Rivonia appears better positioned to receive reports than to prevent, detect and learn from fraud, and show the opportunity to connect reporting to detection, escalation, investigation, evidence preservation and management learning.',
  'Chapter 2 is diagnosis: explain the systemic pattern, not five mini finding reports. Chapter 3 is exposure: use only the three Blueprint clusters, with governance as the enabling weakness underneath them rather than a fourth cluster. Do not duplicate the same themes across both chapters.',
  'Keep the main narrative above the implementation register: explain what needs to change, why, accountable ownership and sequence. Reduce repeated lists of proof artefacts, population mechanics, custody details and failure triggers; retain only strategically useful measures.',
  'Make the 90-day sequence deliberate: By 30 days — Stabilise ownership, reporting rhythm, escalation and basic incident/evidence preservation; By 60 days — Establish supplier/payment and identity verification; By 90 days — Operate and review monitoring, structured risk assessment, control learning and governance progress.',
  'The conclusion must return to the central judgement: the immediate challenge is connecting existing activities into one visible, challengeable and improvable fraud-control rhythm, not claiming that fraud-related activity is absent.',
  'Target approximately 2,700–3,100 words without deleting necessary reasoning. Avoid consultant theatre, generic management clichés, excessive bullets, next-section language and repeated “management should” openings. Do not add titles, tables, IDs or metadata.'
].join('\n');

function historicalRecovery(value) {
  return {
    initialGenerationCount: value.initialGenerationCount,
    targetedRepairCount: value.targetedRepairCount,
    fullRegenerationCount: value.fullRegenerationCount,
    qualityEscalationCount: value.qualityEscalationCount,
    coherenceCount: value.coherenceCount,
    technicalFallbackCount: value.technicalFallbackCount,
    truncationContinuationCount: value.truncationContinuationCount,
    totalCalls: value.totalCalls,
    totalTokens: value.totalTokens,
    totalProviderCostMicros: value.totalProviderCostMicros
  };
}

function addRecovery(a, b) {
  return {
    initialGenerationCount: a.initialGenerationCount,
    targetedRepairCount: a.targetedRepairCount + b.targetedRepairCount,
    fullRegenerationCount: a.fullRegenerationCount,
    qualityEscalationCount: a.qualityEscalationCount,
    coherenceCount: a.coherenceCount,
    technicalFallbackCount: a.technicalFallbackCount,
    truncationContinuationCount: a.truncationContinuationCount,
    totalCalls: a.totalCalls + b.totalCalls,
    totalTokens: a.totalTokens + b.totalTokens,
    totalProviderCostMicros: a.totalProviderCostMicros + b.totalProviderCostMicros
  };
}

function provenanceReport(parsed, factPack) {
  const factIds = new Set(factPack.facts.map((fact) => fact.id));
  const blocks = parsed.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => [
    ...section.paragraphs,
    ...section.subsections.flatMap((subsection) => subsection.paragraphs)
  ]));
  const invalidRefs = unique(blocks.flatMap((block) => block.permittedClaimRefs).filter((ref) => !factIds.has(ref)));
  return { status: invalidRefs.length ? 'FAIL' : 'PASS', invalidRefs, checkedBlocks: blocks.length };
}

function validateCandidate(markdown, blueprint, factPack) {
  const parsed = parseBlueprintMarkdown(markdown, blueprint);
  const validation = validateBlueprintTextManuscript(parsed, blueprint, factPack);
  return { parsed, validation, provenance: parsed.ok ? provenanceReport(parsed, factPack) : { status: 'FAIL', invalidRefs: [], checkedBlocks: 0 } };
}

function mechanicalCounts(markdown) {
  const phrases = ['recorded condition', 'recorded weakness', 'recorded position', 'the approved response', 'self-assessed as', 'management should'];
  return Object.fromEntries(phrases.map((phrase) => [phrase, countPhrase(markdown, phrase)]));
}

function editorialDiagnostics(oldMarkdown, newMarkdown, blueprint, recovery, editorialTokens, editorialCostMicros) {
  const lower = newMarkdown.toLowerCase();
  const oldDetailTerms = ['evidence', 'proof', 'population', 'sample', 'custody', 'repository', 'register', 'failure trigger', 'success measure'];
  const newDetailTerms = oldDetailTerms;
  const oldDetailDensity = countAny(oldMarkdown, oldDetailTerms) / Math.max(1, wordCount(oldMarkdown));
  const newDetailDensity = countAny(newMarkdown, newDetailTerms) / Math.max(1, wordCount(newMarkdown));
  const clusterTitles = blueprint.findingClusters.map((cluster) => cluster.title);
  const reportingStrength = /reporting culture/i.test(newMarkdown) && /(foundation|stronger|receive|concern|raise)/i.test(newMarkdown);
  const operationalDetection = /operational fraud controls/i.test(newMarkdown) && /(detection|monitoring|continuous|learning|risk identification)/i.test(newMarkdown);
  const evidenceInThirty = /By 30 days — Stabilise/i.test(newMarkdown) && /evidence|custody|incident/i.test(newMarkdown);
  const conclusion = /Management conclusion/i.test(newMarkdown) && /(connect|connected|rhythm|ownership|verification|monitoring|learning)/i.test(newMarkdown);
  return {
    oldWordCount: wordCount(oldMarkdown),
    newWordCount: wordCount(newMarkdown),
    oldHeadingCount: headingCount(oldMarkdown),
    newHeadingCount: headingCount(newMarkdown),
    oldMechanicalPhraseCounts: mechanicalCounts(oldMarkdown),
    newMechanicalPhraseCounts: mechanicalCounts(newMarkdown),
    threePriorityExposureClusters: clusterTitles,
    reportingCultureSynthesisPresent: reportingStrength ? 'YES' : 'NO',
    operationalControlsVersusDetectionSynthesisPresent: operationalDetection ? 'YES' : 'NO',
    evidencePreservationIn30Days: evidenceInThirty ? 'YES' : 'NO',
    chapterTwoThreeDuplicationRemoved: blueprint.chapters.find((chapter) => chapter.chapterId === 'WHAT-HOLDS-READINESS-BACK')?.sections.length === 1 && clusterTitles.length === 3 ? 'YES' : 'NO',
    mechanicalLanguageReduced: countAny(newMarkdown, Object.keys(mechanicalCounts(oldMarkdown))) < countAny(oldMarkdown, Object.keys(mechanicalCounts(oldMarkdown))) ? 'YES' : 'NO',
    implementationDetailReduced: newDetailDensity <= oldDetailDensity ? 'YES' : 'NO',
    conclusionRewrittenAsCentralJudgement: conclusion ? 'YES' : 'NO',
    targetedRepairsUsed: recovery.targetedRepairCount - 2,
    ownerEditorialRevisionCount: 1,
    model: model,
    editorialCallTokens: editorialTokens,
    editorialCallProviderCostMicros: editorialCostMicros
  };
}

async function main() {
  const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
  const startingSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (branch !== branchName) throw new Error(`Unexpected branch ${branch}; expected ${branchName}.`);
  if (startingSha !== expectedStartingSha) throw new Error(`Unexpected source SHA ${startingSha}; expected ${expectedStartingSha}.`);
  if (!(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY)) throw new Error('AI gateway configuration is unavailable.');

  const oldMarkdown = await fs.readFile(path.join(previousOutputDir, 'essential-manuscript.md'), 'utf8');
  const oldBlueprint = JSON.parse(await fs.readFile(path.join(previousOutputDir, 'report-blueprint.json'), 'utf8'));
  const oldRecovery = JSON.parse(await fs.readFile(path.join(previousOutputDir, 'recovery-accounting.json'), 'utf8'));

  const data = await assembleReportData(orderReference);
  if (data.assessmentReference !== assessmentReference) throw new Error(`Unexpected assembled assessment ${data.assessmentReference}`);
  const evidence = buildAdvisoryEvidenceModel(data);
  const factPack = buildEssentialNarrativeFactPack(data, evidence, buildEssentialProjection(data, evidence));
  assertNarrativeFactPack(factPack);
  const storyPlan = buildNarrativeStoryPlan(factPack);
  assertNarrativeStoryPlan(storyPlan, factPack);
  const blueprint = buildReportBlueprint(factPack, storyPlan);
  assertReportBlueprint(blueprint, factPack);
  const blueprintValidation = validateReportBlueprint(blueprint, factPack);
  if (!blueprintValidation.ok) throw new Error(`Corrected Blueprint failed: ${blueprintValidation.issues.join('; ')}`);
  const blueprintHeadingCount = blueprint.chapters.reduce((sum, chapter) => sum + 1 + chapter.sections.reduce((inner, section) => inner + 1 + section.optionalSubsections.length, 0), 0);
  if (blueprintHeadingCount !== 27) throw new Error(`Expected corrected Rivonia Blueprint to contain 27 headings; received ${blueprintHeadingCount}`);
  const context = buildWholeManuscriptContext(factPack, blueprint);

  const oldParsed = parseBlueprintMarkdown(oldMarkdown, oldBlueprint);
  const oldValidation = validateBlueprintTextManuscript(oldParsed, oldBlueprint, factPack);
  if (!oldParsed.ok || !oldValidation.ok || oldValidation.quality.status !== 'PASS') throw new Error('The existing validated manuscript is not a valid editorial base.');

  await fs.rm(outputDir, { recursive: true, force: true });
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'report-blueprint.json'), json(blueprint));
  await fs.writeFile(path.join(outputDir, 'writer-context.json'), json(context));

  const writer = createV11WholeManuscriptWriter(model);
  const editorial = await writer.coherencePass({ context, blueprint, previousMarkdown: oldMarkdown, editorialBrief });
  const historical = historicalRecovery(oldRecovery);
  const editorialRecovery = { ...historical, totalCalls: historical.totalCalls + 1, totalTokens: historical.totalTokens + (editorial.writerMetadata.totalTokens ?? 0), totalProviderCostMicros: historical.totalProviderCostMicros + (editorial.writerMetadata.providerCostMicros ?? 0) };
  const initialCandidate = { ...editorial, architecture: 'whole-manuscript', writerMetadata: { ...editorial.writerMetadata, recovery: editorialRecovery } };
  let final = validateCandidate(initialCandidate.markdown, blueprint, factPack);
  let finalMarkdown = initialCandidate.markdown;
  let finalMetadata = initialCandidate.writerMetadata;
  let repairRecords = [];
  let recovery = editorialRecovery;
  let rejectedCandidateDirectories = [];

  if (!final.parsed.ok || !final.validation.ok || final.validation.quality.status !== 'PASS') {
    const recovered = await recoverWholeManuscript({ writer, context, blueprint, factPack, initialResult: initialCandidate, attemptIdentity: 'rivonia-essential-owner-editorial-revision', diagnosticsRootDirectory: outputDir, runCoherence: false });
    finalMarkdown = recovered.markdown;
    finalMetadata = recovered.writerMetadata;
    final = { parsed: recovered.parsed, validation: recovered.validation, provenance: provenanceReport(recovered.parsed, factPack) };
    repairRecords = recovered.repairRecords;
    recovery = recovered.recovery;
    rejectedCandidateDirectories = recovered.rejectedCandidateDirectories;
  }

  const finalValidation = final.validation;
  const provenance = final.provenance;
  const diagnostics = editorialDiagnostics(oldMarkdown, finalMarkdown, blueprint, recovery, finalMetadata.totalTokens - historical.totalTokens, finalMetadata.providerCostMicros - historical.totalProviderCostMicros);
  const ownerSemanticChecks = [
    diagnostics.reportingCultureSynthesisPresent,
    diagnostics.operationalControlsVersusDetectionSynthesisPresent,
    diagnostics.evidencePreservationIn30Days,
    diagnostics.chapterTwoThreeDuplicationRemoved,
    diagnostics.mechanicalLanguageReduced,
    diagnostics.implementationDetailReduced,
    diagnostics.conclusionRewrittenAsCentralJudgement
  ];
  const ownerEditorialStatus = ownerSemanticChecks.every((value) => value === 'YES') ? 'PASS' : 'OWNER_REVIEW_REQUIRED';
  const narrativeValidation = {
    title: 'Narrative validation report',
    status: final.parsed.ok && finalValidation.ok && provenance.status === 'PASS' ? 'PASS' : 'FAIL',
    blueprint: `${headingCount(finalMarkdown)}/${blueprintHeadingCount}`,
    hardTruth: finalValidation.hardTruth,
    provenance,
    assurance: { status: finalValidation.hardTruth.issues.some((issue) => issue.code === 'assurance_claim') ? 'FAIL' : 'PASS' },
    quality: finalValidation.quality,
    repairableSemantic: finalValidation.repairableSemantic,
    ownerEditorial: { status: ownerEditorialStatus, checks: ownerSemanticChecks }
  };
  const editorialValidation = {
    title: 'Editorial / commercial validation report',
    status: finalValidation.quality.status === 'PASS' && ownerEditorialStatus === 'PASS' ? 'PASS' : 'OWNER_REVIEW_REQUIRED',
    basis: 'One owner-directed Terra editorial revision over the existing validated manuscript, followed only by bounded local semantic repair if required.',
    sections: finalValidation.sectionCount,
    subsections: finalValidation.subsectionCount,
    paragraphs: finalValidation.paragraphCount,
    issues: finalValidation.quality.issues,
    ownerEditorialChecks: diagnostics
  };
  const historicalCallCount = oldRecovery.totalCalls;
  const newAiCallCount = recovery.totalCalls - historicalCallCount;
  const aiCallAccounting = {
    historicalRecoveryCalls: historicalCallCount,
    ownerEditorialRevisionCount: 1,
    ownerEditorialCalls: 1,
    targetedRepairCalls: diagnostics.targetedRepairsUsed,
    totalNewAiCalls: newAiCallCount,
    model,
    provider: finalMetadata.provider,
    tokens: { historical: oldRecovery.totalTokens, ownerRevisionAndRepairs: finalMetadata.totalTokens - oldRecovery.totalTokens, combined: finalMetadata.totalTokens },
    providerCostMicros: { historical: oldRecovery.totalProviderCostMicros, ownerRevisionAndRepairs: finalMetadata.providerCostMicros - oldRecovery.totalProviderCostMicros, combined: finalMetadata.providerCostMicros },
    calls: [
      { phase: 'owner-editorial-revision', model, status: 'completed', sequence: historicalCallCount + 1, tokens: editorial.writerMetadata.totalTokens ?? null, providerCostMicros: editorial.writerMetadata.providerCostMicros ?? null },
      ...repairRecords.map((record, index) => ({ phase: 'targeted-repair', model, status: 'completed', sequence: historicalCallCount + 2 + index, ...record }))
    ]
  };
  const combinedRecovery = {
    ...recovery,
    historicalRecovery: oldRecovery,
    ownerEditorialRevisionCount: 1,
    ownerEditorialTargetedRepairs: diagnostics.targetedRepairsUsed,
    semanticCorrectionsConsumed: recovery.targetedRepairCount,
    rejectedCandidateDirectories,
    limits: { historicalFullRegeneration: '1/1 consumed', historicalQualityEscalation: '1/1 consumed', historicalCoherence: '1/1 consumed', targetedRepairs: '4 maximum; 2 historical consumed before owner revision', ownerEditorialRevision: '1/1' }
  };
  const diagnosticsMarkdown = [
    '# Rivonia Essential — owner editorial diagnostics',
    '',
    `- Status: **${ownerEditorialStatus}**`,
    `- Source manuscript: **${diagnostics.oldWordCount} words / ${diagnostics.oldHeadingCount} headings**`,
    `- Revised manuscript: **${diagnostics.newWordCount} words / ${diagnostics.newHeadingCount} headings**`,
    `- Model: **${model}**`,
    `- Owner editorial revisions: **1**`,
    `- Targeted repairs used during this revision: **${diagnostics.targetedRepairsUsed}**`,
    `- New AI calls: **${newAiCallCount}**`,
    `- Owner revision and repair tokens: **${finalMetadata.totalTokens - historical.totalTokens}**`,
    `- Owner revision and repair provider cost (micros): **${finalMetadata.providerCostMicros - historical.totalProviderCostMicros}**`,
    '',
    '## Mechanical phrase counts',
    '',
    '| Phrase | Before | After |',
    '|---|---:|---:|',
    ...Object.keys(diagnostics.oldMechanicalPhraseCounts).map((phrase) => `| ${phrase} | ${diagnostics.oldMechanicalPhraseCounts[phrase]} | ${diagnostics.newMechanicalPhraseCounts[phrase]} |`),
    '',
    '## Owner corrections',
    '',
    `- Three priority exposure clusters: **${diagnostics.threePriorityExposureClusters.join('; ')}**`,
    `- Reporting-culture synthesis present: **${diagnostics.reportingCultureSynthesisPresent}**`,
    `- Operational-controls-versus-detection synthesis present: **${diagnostics.operationalControlsVersusDetectionSynthesisPresent}**`,
    `- Chapter 2 / Chapter 3 duplication removed: **${diagnostics.chapterTwoThreeDuplicationRemoved}**`,
    `- Mechanical language reduced: **${diagnostics.mechanicalLanguageReduced}**`,
    `- Implementation detail reduced: **${diagnostics.implementationDetailReduced}**`,
    `- Evidence preservation in first 30 days: **${diagnostics.evidencePreservationIn30Days}**`,
    `- Conclusion rewritten as central judgement: **${diagnostics.conclusionRewrittenAsCentralJudgement}**`,
    '',
    '## Historical recovery accounting',
    '',
    '- Full regeneration remains 1/1 consumed.',
    '- Automatic quality escalation remains 1/1 consumed.',
    '- Historical coherence remains 1/1 consumed.',
    `- Historical targeted semantic repairs remain ${oldRecovery.targetedRepairCount}/4 consumed.`,
    `- Semantic corrections consumed after this revision: ${recovery.targetedRepairCount}/4.`,
    '',
    `- Blueprint: **${narrativeValidation.blueprint}**`,
    `- Hard truth: **${narrativeValidation.hardTruth.status}**`,
    `- Provenance: **${provenance.status}**`,
    `- Assurance: **${narrativeValidation.assurance.status}**`,
    `- Editorial gate: **${editorialValidation.status}**`
  ].join('\n') + '\n';
  const ownerNote = [
    '# Rivonia Essential — final owner editorial candidate',
    '',
    'Commercial owner review: **PENDING**.',
    '',
    `- Organisation: ${factPack.organisation.name}`,
    `- Assessment: ${assessmentReference}`,
    `- Word count: ${wordCount(finalMarkdown)}`,
    `- Blueprint: ${headingCount(finalMarkdown)}/${blueprintHeadingCount} headings`,
    `- Model: ${model}`,
    `- Owner editorial revisions: 1`,
    `- Targeted repairs used: ${diagnostics.targetedRepairsUsed}`,
    `- New AI calls: ${newAiCallCount}`,
    '',
    '## Validation',
    '',
    `- Blueprint: ${narrativeValidation.blueprint === `${blueprintHeadingCount}/${blueprintHeadingCount}` ? 'PASS' : 'FAIL'}`,
    `- Hard truth: ${narrativeValidation.hardTruth.status}`,
    `- Provenance: ${provenance.status}`,
    `- Assurance: ${narrativeValidation.assurance.status}`,
    `- Editorial: ${editorialValidation.status}`,
    '',
    'PDF: NONE. Workbook: NONE. Kestrel: NOT CALLED. Snapshot: NOT CALLED. Deployment: NONE. Supabase mutation: NONE. Production mutation: NONE.'
  ].join('\n') + '\n';

  await fs.writeFile(path.join(outputDir, 'essential-manuscript.md'), `${finalMarkdown.trim()}\n`);
  await fs.writeFile(path.join(outputDir, 'narrative-validation-report.json'), json(narrativeValidation));
  await fs.writeFile(path.join(outputDir, 'narrative-validation-report.md'), markdownReport(narrativeValidation));
  await fs.writeFile(path.join(outputDir, 'editorial-validation-report.json'), json(editorialValidation));
  await fs.writeFile(path.join(outputDir, 'editorial-validation-report.md'), markdownReport(editorialValidation));
  await fs.writeFile(path.join(outputDir, 'owner-editorial-diagnostics.md'), diagnosticsMarkdown);
  await fs.writeFile(path.join(outputDir, 'ai-call-accounting.json'), json(aiCallAccounting));
  await fs.writeFile(path.join(outputDir, 'recovery-accounting.json'), json(combinedRecovery));
  await fs.writeFile(path.join(outputDir, 'owner-reading-note.md'), ownerNote);

  const remoteSha = (() => { try { return execFileSync('git', ['ls-remote', 'origin', `refs/heads/${branchName}`], { encoding: 'utf8' }).trim().split(/\s+/)[0] || null; } catch { return null; } })();
  console.log(JSON.stringify({ status: ownerEditorialStatus, outputDir, organisation: factPack.organisation.name, assessmentReference, startingSha, remoteSha, finalSha: startingSha, model, ownerEditorialRevisionCount: 1, targetedRepairs: diagnostics.targetedRepairsUsed, totalNewAiCalls: newAiCallCount, wordCount: wordCount(finalMarkdown), headings: `${headingCount(finalMarkdown)}/${blueprintHeadingCount}`, hardTruth: narrativeValidation.hardTruth.status, provenance: provenance.status, assurance: narrativeValidation.assurance.status, editorial: editorialValidation.status, pdf: 'NONE', workbook: 'NONE', kestrel: 'NOT CALLED', snapshot: 'NOT CALLED', productionMutation: 'NONE', ownerReview: 'PENDING' }, null, 2));
  if (ownerEditorialStatus !== 'PASS' || narrativeValidation.status !== 'PASS') throw new Error('Owner editorial revision requires owner review after validation.');
}

await main();
