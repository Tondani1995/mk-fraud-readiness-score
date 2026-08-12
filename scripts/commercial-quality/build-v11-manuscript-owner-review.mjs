#!/usr/bin/env node
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
import { preAiGateMarkdown, runPreAiFactPackGates } from '../../src/lib/reports/narrative/pre-ai-gates.ts';
import { REPORTING_BIBLE_VERSION } from '../../src/lib/reports/reporting-bible.ts';

const outputDir = path.resolve(process.env.V11_OWNER_REVIEW_OUTPUT_DIR ?? 'outputs/v1.1-pre-ai-fact-pack-owner-review');
const essentialOrderReference = process.env.ESSENTIAL_ORDER_REFERENCE ?? 'MKORD-2026-22FF6B69';
const comprehensiveOrderReference = process.env.COMPREHENSIVE_ORDER_REFERENCE ?? 'MKORD-2026-7FBBEE23';
const policyPath = path.resolve('docs/product/MK_Fraud_Readiness_Reporting_Bible_v1.1.md');
const policyBytes = await fs.readFile(policyPath);
const policySha256 = crypto.createHash('sha256').update(policyBytes).digest('hex');
const requestedFiles = ['essential-fact-pack.json', 'essential-story-plan.json', 'comprehensive-fact-pack.json', 'comprehensive-story-plan.json', 'pre-ai-fact-pack-gate-report.md', 'generation-manifest.json'];
if (REPORTING_BIBLE_VERSION !== '1.1') throw new Error(`Expected Reporting Bible 1.1, received ${REPORTING_BIBLE_VERSION}.`);

async function writeJson(name, value) {
  await fs.writeFile(path.join(outputDir, name), `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(name, value) {
  await fs.writeFile(path.join(outputDir, name), `${value.trim()}\n`);
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
  return { pack, storyPlan, summary: { organisation: data.organisationName, assessmentReference: data.assessmentReference, factCount: pack.facts.length, findings: pack.findings.length, scenarios: pack.scenarios.length } };
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
  return { pack, storyPlan, summary: { organisation: data.organisationName, assessmentReference: data.assessmentReference, factCount: pack.facts.length, findings: pack.findings.length, scenarios: pack.scenarios.length } };
}

await fs.mkdir(outputDir, { recursive: true });
await Promise.all(requestedFiles.map((name) => fs.rm(path.join(outputDir, name), { force: true })));
const [essentialResult, comprehensiveResult] = await Promise.all([essential(), comprehensive()]);
const essentialGate = runPreAiFactPackGates(essentialResult.pack, essentialResult.storyPlan);
const comprehensiveGate = runPreAiFactPackGates(comprehensiveResult.pack, comprehensiveResult.storyPlan);
const gateStatus = essentialGate.status === 'PASS' && comprehensiveGate.status === 'PASS' ? 'PASS' : 'FAIL';
await writeText('pre-ai-fact-pack-gate-report.md', [preAiGateMarkdown(essentialGate), '', preAiGateMarkdown(comprehensiveGate)].join('\n'));

const manifest = {
  title: 'MK FRAUD READINESS v1.1 PRE-AI FACT PACK — OWNER REVIEW CANDIDATE',
  bibleVersion: REPORTING_BIBLE_VERSION,
  bibleSha256: policySha256,
  stage: 'PRE_AI_FACT_PACK_AND_STORY_PLAN',
  aiConfigured: false,
  aiCalled: false,
  aiRequiredForNextStage: true,
  aiProvider: null,
  aiModel: null,
  manuscripts: null,
  pdfs: null,
  gateStatus,
  gateReport: 'pre-ai-fact-pack-gate-report.md',
  essential: essentialResult.summary,
  comprehensive: comprehensiveResult.summary,
  sourceOrders: { essential: essentialOrderReference, comprehensive: comprehensiveOrderReference },
  generatedFromCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  generatedFiles: {}
};
for (const name of requestedFiles.filter((item) => item !== 'generation-manifest.json')) {
  const bytes = await fs.readFile(path.join(outputDir, name));
  manifest.generatedFiles[name] = { sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
}
await writeJson('generation-manifest.json', manifest);
console.log(JSON.stringify({ outputDir, ...manifest }, null, 2));
if (gateStatus !== 'PASS') process.exitCode = 1;
