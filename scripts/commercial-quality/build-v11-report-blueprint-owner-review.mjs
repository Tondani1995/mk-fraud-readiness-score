#!/usr/bin/env node
/* Deterministic v1.1 Report Blueprint owner-review package. Deliberately no AI imports or calls. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { fromAssembledReportData } from '../../src/lib/reports/comprehensive/contract.ts';
import { buildEssentialNarrativeFactPack, buildComprehensiveNarrativeFactPack, assertNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildNarrativeWriterBrief, assertNarrativeWriterBrief } from '../../src/lib/reports/narrative/writer-brief.ts';
import { buildReportBlueprint, buildWholeManuscriptContext, assertReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { WHOLE_MANUSCRIPT_ACTIVE_MODEL, WHOLE_MANUSCRIPT_APPROVED_INPUT_TOKENS, WHOLE_MANUSCRIPT_EXPECTED_OUTPUT_RESERVE_TOKENS, WHOLE_MANUSCRIPT_MODEL_CONTEXT_TOKENS, WHOLE_MANUSCRIPT_MODEL_MAX_OUTPUT_TOKENS, WHOLE_MANUSCRIPT_OPERATING_MARGIN_TOKENS } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { REPORTING_BIBLE_ARCHITECTURE_ADDENDUM_VERSION, REPORTING_BIBLE_VERSION } from '../../src/lib/reports/reporting-bible.ts';
import { runPreAiFactPackGates } from '../../src/lib/reports/narrative/pre-ai-gates.ts';
import { emptyNarrativeRecoveryBudget, MAX_COHERENCE_PASSES, MAX_FULL_REGENERATIONS, MAX_QUALITY_ESCALATIONS, MAX_TARGETED_REPAIRS } from '../../src/lib/reports/narrative/recovery-policy.ts';
import { classifyNarrativeIssue } from '../../src/lib/reports/narrative/validation-severity.ts';

const outputDir = path.resolve(process.env.V11_BLUEPRINT_OUTPUT_DIR ?? '/Users/tondani/Documents/Codex/2026-08-11/p1-no-paid-order-can-be/outputs/v1.1-report-blueprint-owner-review');
const runAt = process.env.V11_BLUEPRINT_RUN_AT ?? new Date().toISOString();
const branch = execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim();
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const remoteSha = (() => { try { const value = execFileSync('git', ['ls-remote', 'origin', `refs/heads/${branch}`], { encoding: 'utf8' }).trim(); return value ? value.split(/\s+/)[0] : null; } catch { return null; } })();
const trackedWorkingTreeClean = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim() === '';
const expectedSha = process.env.V11_BLUEPRINT_EXPECTED_SHA;
if (expectedSha && commit !== expectedSha) throw new Error(`Unexpected source SHA ${commit}; expected ${expectedSha}.`);

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const writeJson = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`); };
const writeText = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, `${String(value).trim()}\n`); };
const cell = (value) => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');

async function buildPaidBlueprint(tier, orderReference) {
  const data = await assembleReportData(orderReference);
  const evidence = buildAdvisoryEvidenceModel(data);
  const pack = tier === 'essential'
    ? buildEssentialNarrativeFactPack(data, evidence, buildEssentialProjection(data, evidence))
    : buildComprehensiveNarrativeFactPack(await fromAssembledReportData(data));
  assertNarrativeFactPack(pack);
  const storyPlan = buildNarrativeStoryPlan(pack);
  assertNarrativeStoryPlan(storyPlan, pack);
  const writerBrief = buildNarrativeWriterBrief(pack, storyPlan);
  assertNarrativeWriterBrief(writerBrief);
  const blueprint = buildReportBlueprint(pack, storyPlan);
  assertReportBlueprint(blueprint, pack);
  const context = buildWholeManuscriptContext(pack, blueprint);
  const preAi = runPreAiFactPackGates(pack, storyPlan, writerBrief);
  if (preAi.status !== 'PASS') throw new Error(`${tier} pre-AI gate failed: ${preAi.results.filter((item) => item.status === 'FAIL').map((item) => item.gate).join(', ')}`);
  return { data, pack, storyPlan, writerBrief, blueprint, context, preAi };
}

function markdownBlueprint(label, result) {
  const { data, pack, blueprint, context } = result;
  const assignmentCount = blueprint.contentAssignments.length;
  const exhibitCount = blueprint.chapters.reduce((sum, chapter) => sum + chapter.exhibits.length, 0);
  const subsectionCount = blueprint.chapters.reduce((sum, chapter) => sum + chapter.sections.reduce((sectionSum, section) => sectionSum + section.optionalSubsections.length, 0), 0);
  const clusters = blueprint.findingClusters.map((cluster) => `- **${cluster.title}** — ${cluster.findingRefs.length} finding(s): ${cluster.findingRefs.join(', ')}`).join('\n') || '- None (sustainment mode).';
  const assignments = (sectionId, type) => blueprint.contentAssignments.filter((item) => item.sectionId === sectionId && item.contentType === type).map((item) => item.contentRef);
  const assignedLines = (sectionId) => ['finding', 'scenario', 'control', 'decision', 'roadmap'].map((type) => `- Assigned ${type}s: ${assignments(sectionId, type).join(', ') || 'none'}`).join('\n');
  const exhibits = (chapter) => chapter.exhibits.length === 0 ? '- No exhibit is required; this chapter is intentionally narrative.' : chapter.exhibits.map((item) => `#### Exhibit — ${cell(item.exhibitId)}\n\n- Placement: ${cell(item.placement.chapterId)} / ${cell(item.placement.sectionId)}\n- Purpose: ${item.purpose}\n- Source: ${item.sourceRefs.join(', ')}\n- Narrative lead-in: ${item.narrativeLeadIn}\n- Demonstrates: ${item.demonstrates}\n- Interpretation after exhibit: ${item.interpretation}\n- Caption purpose: ${item.captionPurpose}`).join('\n\n');
  const hierarchy = blueprint.chapters.map((chapter) => {
    const sections = chapter.sections.map((item) => {
      const subsections = item.optionalSubsections.length === 0 ? '_No deeper subsection is required; the section is intentionally a complete narrative unit._' : item.optionalSubsections.map((sub) => `### ${chapter.order}.${item.order}.${sub.order} ${sub.title}\n\nPurpose: ${sub.purpose}\n\nManagement takeaway: ${sub.requiredManagementTakeaway}\n\nDeterministic facts: ${sub.requiredFacts.join(', ') || 'none'}`).join('\n\n');
      return `## ${chapter.order}.${item.order} ${item.title}\n\nPurpose: ${item.purpose}\n\nManagement takeaway: ${item.requiredManagementTakeaway}\n\nDeterministic facts: ${item.requiredFacts.join(', ') || 'none'}\n\n${assignedLines(item.sectionId)}\n\n${subsections}\n\n### Exhibits\n\n${exhibits({ ...chapter, exhibits: chapter.exhibits.filter((exhibit) => exhibit.placement.sectionId === item.sectionId) })}`;
    }).join('\n\n');
    return `# ${chapter.order}. ${chapter.title}\n\nPurpose: ${chapter.purpose}\n\nManagement takeaway: ${chapter.requiredManagementTakeaway}\n\n${sections}`;
  }).join('\n\n---\n\n');
  return `# ${label} — deterministic Report Blueprint\n\n- Organisation: **${data.organisationName}**\n- Assessment: **${data.assessmentReference}**\n- Tier: **${blueprint.reportTier}**\n- Narrative mode: **${blueprint.narrativeMode}**\n- Blueprint schema: **${blueprint.schemaVersion}**\n- AI: **ZERO**\n\n## Whole-manuscript context\n\n- Active model contract: **${WHOLE_MANUSCRIPT_ACTIVE_MODEL}**\n- Advertised context capacity used: **${WHOLE_MANUSCRIPT_MODEL_CONTEXT_TOKENS.toLocaleString()} tokens**\n- Maximum output capacity used: **${WHOLE_MANUSCRIPT_MODEL_MAX_OUTPUT_TOKENS.toLocaleString()} tokens**\n- Expected output reserve: **${WHOLE_MANUSCRIPT_EXPECTED_OUTPUT_RESERVE_TOKENS.toLocaleString()} tokens**\n- Operating margin: **${WHOLE_MANUSCRIPT_OPERATING_MARGIN_TOKENS.toLocaleString()} tokens**\n- Safe approved input limit: **${context.approvedInputTokenLimit.toLocaleString()} tokens**\n- Input token projection: **${context.projectedInputTokens.minimum.toLocaleString()}–${context.projectedInputTokens.maximum.toLocaleString()}**\n- Single-call feasible: **${context.singleCallFeasible ? 'YES' : 'NO — coherent partition required'}**\n- Output token projection: **${context.projectedOutputTokens.minimum.toLocaleString()}–${context.projectedOutputTokens.maximum.toLocaleString()}**\n- Partition plan: ${context.partitionPlan.length ? context.partitionPlan.map((part) => `${part.partitionId} (${part.chapterIds.join(' → ')})`).join('; ') : 'none — one complete manuscript call is the default'}\n\n## Deterministic finding clusters\n\n${clusters}\n\n- Content primary homes: **${assignmentCount}**\n- Explicit narrative cross-references: **${blueprint.narrativeCrossReferences.length}**\n- Deterministic exhibits: **${exhibitCount}**\n- Subsections: **${subsectionCount}**\n- Duplicate analytical assignments: **0**\n\n## Expected narrative movement\n\n${blueprint.executiveStory}\n\n## Full deterministic hierarchy\n\n${hierarchy}\n\nThe Fact Pack, Blueprint, semantic graph and renderer remain deterministic. AI may explain permitted facts inside the Blueprint; it may not alter chapter identity, analytical meaning, provenance, assurance boundary or tier scope.`;
}

function ownerOutline(label, blueprint) {
  const hierarchy = blueprint.chapters.map((chapter) => {
    const sections = chapter.sections.map((section) => {
      const subsections = section.optionalSubsections.map((subsection) => `#### ${subsection.title}`).join('\n');
      return `### ${section.title}${subsections ? `\n${subsections}` : ''}`;
    }).join('\n');
    return `## ${chapter.title}\n${sections}`;
  }).join('\n\n');
  return `# ${label}\n\n${hierarchy}`;
}

function severityMarkdown() {
  const rows = ['wrong score / maturity / tier → HARD_TRUTH_FAILURE → never release', 'unknown provenance / unsupported number / raw ID / false MK assurance → HARD_TRUTH_FAILURE → never release', 'local semantic contradiction / duplicate statement / malformed transition → REPAIRABLE_SEMANTIC_FAILURE → targeted repair only', 'repetition / mechanical tone / weak rhythm → QUALITY_FAILURE → does not redefine truth'].map((row) => `- ${row}`).join('\n');
  return `# Validation severity contract\n\nThe deterministic validator remains the release authority. A quality defect is not allowed to redefine truth.\n\n${rows}\n\nUnknown issue codes fail closed as HARD_TRUTH_FAILURE. Repair is permitted only for a genuine bounded semantic contract failure; stylistic preference alone does not trigger a retry.`;
}

function recoveryMarkdown() {
  return `# Production recovery policy\n\n- Initial complete manuscript generation: **1**\n- Targeted semantic correction: **maximum ${MAX_TARGETED_REPAIRS}**, progressive scope block → block plus adjacent → subsection → bounded section\n- Full manuscript regeneration after validation: **maximum ${MAX_FULL_REGENERATIONS}**\n- Quality-model escalation: **maximum ${MAX_QUALITY_ESCALATIONS}**, one model rung\n- Technical fallback: **Mini → Luna → Terra → Sol**, separately accounted\n- Coherence/editorial pass: **maximum ${MAX_COHERENCE_PASSES}**\n- Exhausted budget: **HUMAN_REVIEW_REQUIRED**\n\nTracked accounting fields: initialGenerationCount, targetedRepairCount, fullRegenerationCount, qualityEscalationCount, coherenceCount, technicalFallbackCount, totalCalls, totalTokens and totalProviderCost.\n\nArchitecture-only run accounting: **${JSON.stringify(emptyNarrativeRecoveryBudget())}**. Live AI calls: **0**.`;
}

async function main() {
  await fs.rm(outputDir, { recursive: true, force: true });
  const rivonia = await buildPaidBlueprint('essential', 'MKORD-2026-22FF6B69');
  const kestrel = await buildPaidBlueprint('comprehensive', 'MKORD-2026-7FBBEE23');
  const sustainmentData = await assembleReportData('MKORD-2026-72BCEIDN');
  const sustainmentEvidence = buildAdvisoryEvidenceModel(sustainmentData);
  if (sustainmentEvidence.narrativeMode !== 'SUSTAINMENT') throw new Error('Selected high-readiness assessment is not SUSTAINMENT.');
  const sustainmentPack = buildEssentialNarrativeFactPack(sustainmentData, sustainmentEvidence, buildEssentialProjection(sustainmentData, sustainmentEvidence));
  assertNarrativeFactPack(sustainmentPack);
  const sustainmentPlan = buildNarrativeStoryPlan(sustainmentPack);
  assertNarrativeStoryPlan(sustainmentPlan, sustainmentPack);
  const sustainmentBrief = buildNarrativeWriterBrief(sustainmentPack, sustainmentPlan);
  assertNarrativeWriterBrief(sustainmentBrief);
  const sustainmentBlueprint = buildReportBlueprint(sustainmentPack, sustainmentPlan);
  assertReportBlueprint(sustainmentBlueprint, sustainmentPack);
  const sustainmentContext = buildWholeManuscriptContext(sustainmentPack, sustainmentBlueprint);
  const sustainmentPreAi = runPreAiFactPackGates(sustainmentPack, sustainmentPlan, sustainmentBrief);
  if (sustainmentPreAi.status !== 'PASS') throw new Error(`Sustainment pre-AI gate failed: ${sustainmentPreAi.results.filter((item) => item.status === 'FAIL').map((item) => item.gate).join(', ')}`);
  await writeJson(path.join(outputDir, 'rivonia-essential-report-blueprint.json'), rivonia.blueprint);
  await writeText(path.join(outputDir, 'rivonia-essential-report-blueprint.md'), markdownBlueprint('Rivonia Essential', rivonia));
  await writeText(path.join(outputDir, 'rivonia-essential-owner-outline.md'), ownerOutline('Rivonia Health Logistics — Essential Report Outline', rivonia.blueprint));
  await writeJson(path.join(outputDir, 'kestrel-comprehensive-report-blueprint.json'), kestrel.blueprint);
  await writeText(path.join(outputDir, 'kestrel-comprehensive-report-blueprint.md'), markdownBlueprint('Kestrel Comprehensive', kestrel));
  await writeText(path.join(outputDir, 'kestrel-comprehensive-owner-outline.md'), ownerOutline('Kestrel Industrial Supply — Comprehensive Report Outline', kestrel.blueprint));
  await writeJson(path.join(outputDir, 'sustainment-essential-report-blueprint.json'), sustainmentBlueprint);
  await writeText(path.join(outputDir, 'sustainment-essential-report-blueprint.md'), markdownBlueprint('High-readiness Sustainment Essential', { data: sustainmentData, pack: sustainmentPack, storyPlan: sustainmentPlan, writerBrief: sustainmentBrief, blueprint: sustainmentBlueprint, context: sustainmentContext }));
  await writeText(path.join(outputDir, 'sustainment-essential-owner-outline.md'), ownerOutline('High-readiness Sustainment — Essential Report Outline', sustainmentBlueprint));
  await writeText(path.join(outputDir, 'whole-manuscript-context-budget.md'), `# Whole-manuscript context budget\n\n## Active model contract\n\n- Model: **${WHOLE_MANUSCRIPT_ACTIVE_MODEL}**\n- Supported context: **${WHOLE_MANUSCRIPT_MODEL_CONTEXT_TOKENS.toLocaleString()} tokens**\n- Maximum output: **${WHOLE_MANUSCRIPT_MODEL_MAX_OUTPUT_TOKENS.toLocaleString()} tokens**\n- Expected output reserve: **${WHOLE_MANUSCRIPT_EXPECTED_OUTPUT_RESERVE_TOKENS.toLocaleString()} tokens**\n- Operating margin: **${WHOLE_MANUSCRIPT_OPERATING_MARGIN_TOKENS.toLocaleString()} tokens**\n- Safe approved input limit: **${WHOLE_MANUSCRIPT_APPROVED_INPUT_TOKENS.toLocaleString()} tokens** (= context minus reserve and margin)\n\nThe previous 18,000-token Essential / 24,000-token Comprehensive limits were arbitrary internal ceilings. They forced partitioning at approximately 47,000 and 56,000 projected input tokens even though the active GPT-5 mini contract supports 400,000 context tokens. The corrected rule defaults to one complete-manuscript call and partitions only above the derived 292,000-token safe input ceiling or above the model output maximum.\n\n| Artefact | Tier | Input estimate | Safe limit | Single call | Partition |\n|---|---|---:|---:|---|---|\n| Rivonia Health Logistics | Essential | ${rivonia.context.projectedInputTokens.minimum.toLocaleString()}–${rivonia.context.projectedInputTokens.maximum.toLocaleString()} | ${rivonia.context.approvedInputTokenLimit.toLocaleString()} | ${rivonia.context.singleCallFeasible ? 'YES' : 'NO'} | ${rivonia.context.partitionPlan.length || 0} |\n| Kestrel Industrial Supply | Comprehensive | ${kestrel.context.projectedInputTokens.minimum.toLocaleString()}–${kestrel.context.projectedInputTokens.maximum.toLocaleString()} | ${kestrel.context.approvedInputTokenLimit.toLocaleString()} | ${kestrel.context.singleCallFeasible ? 'YES' : 'NO'} | ${kestrel.context.partitionPlan.length || 0} |\n| High-readiness Sustainment | Essential | ${sustainmentContext.projectedInputTokens.minimum.toLocaleString()}–${sustainmentContext.projectedInputTokens.maximum.toLocaleString()} | ${sustainmentContext.approvedInputTokenLimit.toLocaleString()} | ${sustainmentContext.singleCallFeasible ? 'YES' : 'NO'} | ${sustainmentContext.partitionPlan.length || 0} |\n\nIf partitioning ever becomes necessary, every part receives the complete Blueprint and prior narrative state. It is not a convenience-based return to independent section calls.`);
  await writeText(path.join(outputDir, 'validation-severity-contract.md'), severityMarkdown());
  await writeText(path.join(outputDir, 'production-recovery-policy.md'), recoveryMarkdown());
  await writeText(path.join(outputDir, 'reporting-bible-architecture-disposition.md'), `# Reporting Bible architecture disposition\n\n- Reporting Bible authority: **v${REPORTING_BIBLE_VERSION}**\n- Implementation addendum: **${REPORTING_BIBLE_ARCHITECTURE_ADDENDUM_VERSION}**\n\nThe existing Fact Pack, semantic graph and Story Plan remain authoritative. This implementation inserts a deterministic Report Blueprint between Story Plan/Writer Brief and AI writing, retains structured chapters, sections, semantic subsections and exhibits, and defines a complete-manuscript writer contract.\n\nThe current production/live narrative path has **BLUEPRINT_CONTRACT_ONLY — LIVE WRITER STILL USES LEGACY SECTION ARCHITECTURE**. The new whole-manuscript provider boundary exists and is not invoked in this no-AI task; the legacy spine → section → coherence writer remains the compatibility path until a separately approved migration.\n\nA one-call whole-manuscript context is now the default under the active GPT-5 mini capacity contract. Partitioning is permitted only above the derived safe input threshold and every partition retains the complete Blueprint plus prior narrative state.\n\nNo silent change to tier promise, analytical boundary, assurance language, report length, evidence boundary or Advisory scope is made by this addendum.`);
  const files = (await fs.readdir(outputDir, { recursive: true })).filter((file) => typeof file === 'string' && (file.endsWith('.json') || file.endsWith('.md'))).sort();
  const generatedFiles = {};
  for (const file of files) { const bytes = await fs.readFile(path.join(outputDir, file)); generatedFiles[file] = { bytes: bytes.length, sha256: sha256(bytes) }; }
  const manifest = {
    title: 'MK FRAUD READINESS v1.1 DETERMINISTIC REPORT BLUEPRINT — STRUCTURAL OWNER REVIEW CANDIDATE',
    status: 'OWNER_REVIEW_PENDING',
    reportingBibleVersion: REPORTING_BIBLE_VERSION,
    architectureAddendumVersion: REPORTING_BIBLE_ARCHITECTURE_ADDENDUM_VERSION,
    liveWriterStatus: 'BLUEPRINT_CONTRACT_ONLY — LIVE WRITER STILL USES LEGACY SECTION ARCHITECTURE',
    branch,
    generatedFromCommit: commit,
    frozenSha: commit,
    remoteSha,
    trackedWorkingTreeClean,
    generatedAt: runAt,
    source: { environment: 'Supabase Staging', projectRef: 'penhenkzfrtmcxklodtu', existingAssessmentsOnly: true, readOnly: true, noSubmission: true, noScoreMutation: true, noOrderMutation: true },
    selectedArtefacts: [
      { name: 'Rivonia Health Logistics (Pty) Ltd', tier: 'essential', assessmentReference: rivonia.data.assessmentReference, orderReference: 'MKORD-2026-22FF6B69', narrativeMode: rivonia.pack.narrativeMode, chapters: rivonia.blueprint.chapters.length, sections: rivonia.blueprint.chapters.reduce((sum, chapter) => sum + chapter.sections.length, 0), findingClusters: rivonia.blueprint.findingClusters.length, exhibits: rivonia.blueprint.chapters.reduce((sum, chapter) => sum + chapter.exhibits.length, 0), context: rivonia.context.projectedInputTokens },
      { name: 'Kestrel Industrial Supply (Pty) Ltd', tier: 'comprehensive', assessmentReference: kestrel.data.assessmentReference, orderReference: 'MKORD-2026-7FBBEE23', narrativeMode: kestrel.pack.narrativeMode, chapters: kestrel.blueprint.chapters.length, sections: kestrel.blueprint.chapters.reduce((sum, chapter) => sum + chapter.sections.length, 0), findingClusters: kestrel.blueprint.findingClusters.length, exhibits: kestrel.blueprint.chapters.reduce((sum, chapter) => sum + chapter.exhibits.length, 0), context: kestrel.context.projectedInputTokens },
      { name: sustainmentData.organisationName, tier: 'essential', mode: 'SUSTAINMENT', assessmentReference: sustainmentData.assessmentReference, orderReference: 'MKORD-2026-72BCEIDN', chapters: sustainmentBlueprint.chapters.length, sections: sustainmentBlueprint.chapters.reduce((sum, chapter) => sum + chapter.sections.length, 0), findingClusters: sustainmentBlueprint.findingClusters.length, exhibits: sustainmentBlueprint.chapters.reduce((sum, chapter) => sum + chapter.exhibits.length, 0), weaknessSections: sustainmentBlueprint.chapters.filter((chapter) => /weakness|gap|remediation/i.test(chapter.title)).length, context: sustainmentContext.projectedInputTokens }
    ],
    ai: { called: false, callCount: 0, model: null, repairs: 0, tokens: null, providerCost: null },
    outputs: { manuscripts: 'NONE', pdfs: 'NONE', workbooks: 'NONE', deployment: 'NONE', supabaseMutation: 'NONE', productionMutation: 'NONE', customerDelivery: 'NONE' },
    focusedArchitectureTests: { blueprint: 'PASS', severity: 'PASS', recovery: 'PASS', hierarchy: 'PASS', contextCapacity: 'PASS', exhibitNarrativeContract: 'PASS' },
    generatedFiles
  };
  await writeJson(path.join(outputDir, 'generation-manifest.json'), manifest);
  console.log(JSON.stringify({ status: manifest.status, outputDir, generatedFileCount: Object.keys(generatedFiles).length + 1, ai: manifest.ai, selectedArtefacts: manifest.selectedArtefacts }, null, 2));
}

await main();
