#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { fromAssembledReportData } from '../../src/lib/reports/comprehensive/contract.ts';
import { buildEssentialNarrativeFactPack, buildComprehensiveNarrativeFactPack, assertNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { createV11NarrativeWriter } from '../../src/lib/reports/narrative/ai-writer.ts';
import { generateValidatedNarrative } from '../../src/lib/reports/narrative/orchestrator.ts';
import { spineToPlainText } from '../../src/lib/reports/narrative/manuscript.ts';
import { REPORTING_BIBLE_VERSION } from '../../src/lib/reports/reporting-bible.ts';

const outputDir = path.resolve(process.env.V11_OWNER_REVIEW_OUTPUT_DIR ?? 'outputs/v1.1-manuscript-owner-review');
const essentialOrderReference = process.env.ESSENTIAL_ORDER_REFERENCE ?? 'MKORD-2026-22FF6B69';
const comprehensiveOrderReference = process.env.COMPREHENSIVE_ORDER_REFERENCE ?? 'MKORD-2026-7FBBEE23';
const policyPath = path.resolve('docs/product/MK_Fraud_Readiness_Reporting_Bible_v1.1.md');
const policyBytes = await fs.readFile(policyPath);
const policySha256 = crypto.createHash('sha256').update(policyBytes).digest('hex');
if (REPORTING_BIBLE_VERSION !== '1.1') throw new Error(`Expected Reporting Bible 1.1, received ${REPORTING_BIBLE_VERSION}.`);

async function writeJson(name, value) {
  await fs.writeFile(path.join(outputDir, name), `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(name, value) {
  await fs.writeFile(path.join(outputDir, name), `${value.trim()}\n`);
}

const narrativeFiles = [
  'essential-narrative-spine.md', 'essential-manuscript.json', 'essential-manuscript.md', 'essential-narrative-validation.json', 'essential-editorial-validation.json',
  'comprehensive-narrative-spine.md', 'comprehensive-manuscript.json', 'comprehensive-manuscript.md', 'comprehensive-narrative-validation.json', 'comprehensive-editorial-validation.json'
];

async function clearStaleNarrativeFiles() {
  await Promise.all(narrativeFiles.map((name) => fs.rm(path.join(outputDir, name), { force: true })));
}

async function essential() {
  const data = await assembleReportData(essentialOrderReference);
  const evidenceModel = buildAdvisoryEvidenceModel(data);
  const projection = buildEssentialProjection(data, evidenceModel);
  const pack = buildEssentialNarrativeFactPack(data, evidenceModel, projection);
  assertNarrativeFactPack(pack);
  const storyPlan = buildNarrativeStoryPlan(pack);
  assertNarrativeStoryPlan(storyPlan, pack);
  await writeJson('essential-fact-pack.json', pack);
  await writeJson('essential-story-plan.json', storyPlan);
  return { organisation: data.organisationName, assessmentReference: data.assessmentReference, factCount: pack.facts.length, findings: pack.findings.length, scenarios: pack.scenarios.length };
}

async function comprehensive() {
  const data = await assembleReportData(comprehensiveOrderReference);
  const model = await fromAssembledReportData(data);
  const pack = buildComprehensiveNarrativeFactPack(model);
  assertNarrativeFactPack(pack);
  const storyPlan = buildNarrativeStoryPlan(pack);
  assertNarrativeStoryPlan(storyPlan, pack);
  await writeJson('comprehensive-fact-pack.json', pack);
  await writeJson('comprehensive-story-plan.json', storyPlan);
  return { organisation: data.organisationName, assessmentReference: data.assessmentReference, factCount: pack.facts.length, findings: pack.findings.length, scenarios: pack.scenarios.length };
}

await fs.mkdir(outputDir, { recursive: true });
const [essentialResult, comprehensiveResult] = await Promise.all([essential(), comprehensive()]);
await clearStaleNarrativeFiles();
const hasApprovedWriter = Boolean((process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY) && process.env.MK_REPORT_AI_MODEL?.trim());
let manuscriptResults = null;
let blocker = hasApprovedWriter ? null : 'No approved AI Gateway credential and model are configured; manuscript generation is intentionally stopped before AI writing. No deterministic or stitched narrative fallback is permitted.';
if (hasApprovedWriter) {
  const writer = createV11NarrativeWriter();
  const [essentialPack, essentialPlan, comprehensivePack, comprehensivePlan] = await Promise.all([
    fs.readFile(path.join(outputDir, 'essential-fact-pack.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(outputDir, 'essential-story-plan.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(outputDir, 'comprehensive-fact-pack.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(outputDir, 'comprehensive-story-plan.json'), 'utf8').then(JSON.parse)
  ]);
  const [essentialNarrative, comprehensiveNarrative] = await Promise.all([
    generateValidatedNarrative({ factPack: essentialPack, storyPlan: essentialPlan, writer }),
    generateValidatedNarrative({ factPack: comprehensivePack, storyPlan: comprehensivePlan, writer })
  ]);
  for (const [prefix, narrative] of [['essential', essentialNarrative], ['comprehensive', comprehensiveNarrative]]) {
    await writeText(`${prefix}-narrative-spine.md`, spineToPlainText(narrative.spine));
    await writeJson(`${prefix}-manuscript.json`, narrative.manuscript);
    await writeText(`${prefix}-manuscript.md`, narrative.plainText);
    await writeJson(`${prefix}-narrative-validation.json`, narrative.narrativeValidation);
    await writeJson(`${prefix}-editorial-validation.json`, narrative.editorialValidation);
  }
  manuscriptResults = {
    stage: 'MANUSCRIPTS_AND_VALIDATION',
    aiProvider: writer.provider,
    aiModel: writer.model,
    promptVersion: writer.promptVersion,
    essential: { validation: essentialNarrative.narrativeValidation.ok, editorialValidation: essentialNarrative.editorialValidation.ok, sections: essentialNarrative.manuscript.sections.length, paragraphs: essentialNarrative.editorialValidation.summary.paragraphs },
    comprehensive: { validation: comprehensiveNarrative.narrativeValidation.ok, editorialValidation: comprehensiveNarrative.editorialValidation.ok, sections: comprehensiveNarrative.manuscript.sections.length, paragraphs: comprehensiveNarrative.editorialValidation.summary.paragraphs }
  };
}
const manifest = {
  bibleVersion: REPORTING_BIBLE_VERSION,
  bibleSha256: policySha256,
  stage: manuscriptResults?.stage ?? 'FACT_PACK_AND_STORY_PLAN',
  aiRequiredForNextStage: !manuscriptResults,
  aiProvider: manuscriptResults?.aiProvider ?? null,
  aiModel: manuscriptResults?.aiModel ?? null,
  promptVersion: manuscriptResults?.promptVersion ?? null,
  blocker,
  essential: essentialResult,
  comprehensive: comprehensiveResult,
  manuscripts: manuscriptResults,
  finalPdfGeneration: 'blocked_until_owner_approves_manuscripts'
};
if (blocker) {
  const blockerText = `# v1.1 manuscript generation blocker\n\nStatus: BLOCKED before AI manuscript writing.\n\n${blocker}\n\nThe deterministic Fact Pack and Story Plan are complete for both product tiers. Configure the approved AI Gateway credential and explicit model, rerun this owner-review command, and review the resulting plain-text manuscripts before any PDF composition is attempted.\n`;
  await writeText('owner-review-blocker.md', blockerText);
  await writeText('essential-manuscript-blocker.md', blockerText.replace('v1.1', 'Essential v1.1'));
  await writeText('comprehensive-manuscript-blocker.md', blockerText.replace('v1.1', 'Comprehensive v1.1'));
}
const generatedFiles = {};
  for (const name of (await fs.readdir(outputDir)).filter((file) => file !== 'generation-manifest.json' && !file.startsWith('v11-manuscript-gate-report.')).sort()) {
  const bytes = await fs.readFile(path.join(outputDir, name));
  generatedFiles[name] = { sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
}
manifest.generatedFiles = generatedFiles;
await writeJson('generation-manifest.json', manifest);
console.log(JSON.stringify({ outputDir, ...manifest }, null, 2));
if (manifest.blocker) process.exitCode = 2;
