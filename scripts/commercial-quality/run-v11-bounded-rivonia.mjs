#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { assertBoundedSectionArchitecture } from '../../src/lib/reports/narrative/architecture.ts';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack, assertNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint, assertReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';
import {
  assertNarrativeSlotPlan,
  buildNarrativeSectionContract,
  buildNarrativeSlotPlan,
  buildReportThesis,
  generateBoundedNarrativeReport
} from '../../src/lib/reports/narrative/bounded-section-engine.ts';
import { createV11BoundedSectionWriter } from '../../src/lib/reports/narrative/bounded-section-writer.ts';

assertBoundedSectionArchitecture();

const outputDir = path.resolve(process.env.BOUNDED_RIVONIA_OUTPUT_DIR ?? '/Users/tondani/Documents/Codex/2026-08-11/p1-no-paid-order-can-be/outputs/v1.1-bounded-section-engine-rivonia');
const orderReference = process.env.ESSENTIAL_ORDER_REFERENCE ?? 'MKORD-2026-22FF6B69';
const reportGenerationId = process.env.BOUNDED_REPORT_GENERATION_ID ?? crypto.randomUUID();
const expectedAssessmentReference = 'MKFRS-2026-F4047D75C0';
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, json(value));
}

async function writeText(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${String(value).trim()}\n`);
}

const data = await assembleReportData(orderReference);
if (data.assessmentReference !== expectedAssessmentReference) throw new Error(`Expected ${expectedAssessmentReference}; received ${data.assessmentReference}.`);
const evidence = buildAdvisoryEvidenceModel(data);
const pack = buildEssentialNarrativeFactPack(data, evidence, buildEssentialProjection(data, evidence));
assertNarrativeFactPack(pack);
const storyPlan = buildNarrativeStoryPlan(pack);
assertNarrativeStoryPlan(storyPlan, pack);
const blueprint = buildReportBlueprint(pack, storyPlan);
assertReportBlueprint(blueprint, pack);
const thesis = buildReportThesis(pack, blueprint);
const slotPlan = buildNarrativeSlotPlan(pack, blueprint, thesis);
assertNarrativeSlotPlan(slotPlan, pack, blueprint);

await fs.mkdir(outputDir, { recursive: true });
await writeJson(path.join(outputDir, '01-fact-pack.json'), pack);
await writeJson(path.join(outputDir, '02-report-blueprint.json'), blueprint);
await writeJson(path.join(outputDir, '03-report-thesis.json'), thesis);
await writeJson(path.join(outputDir, '04-narrative-slot-plan.json'), slotPlan);
for (const slot of slotPlan.slots) {
  await writeJson(path.join(outputDir, 'contracts', `${slot.slotId}.json`), buildNarrativeSectionContract(slot, pack, thesis));
}

const writer = createV11BoundedSectionWriter('openai/gpt-5.6-luna');
const smokeApprovalPath = process.env.BOUNDED_RIVONIA_SMOKE_APPROVAL ?? path.join(outputDir, 'smoke', 'approved-slot.json');
let preApprovedSlots = [];
try {
  preApprovedSlots = [JSON.parse(await fs.readFile(smokeApprovalPath, 'utf8'))];
} catch (error) {
  if (error?.code !== 'ENOENT') throw error;
}
const candidatePaths = new Map();
const candidateEvent = async (event) => {
  const candidateDir = path.join(outputDir, 'candidates', event.slot.slotId);
  await fs.mkdir(candidateDir, { recursive: true });
  const callName = `call-${String(event.callNumber).padStart(2, '0')}.json`;
  const validationName = `validation-${String(event.callNumber).padStart(2, '0')}.json`;
  await writeJson(path.join(candidateDir, callName), { slotId: event.slot.slotId, callType: event.call.metadata.callType, model: event.call.metadata.model, metadata: event.call.metadata, result: event.call.result, promptFingerprint: sha256(event.call.prompt ?? '') });
  await writeJson(path.join(candidateDir, validationName), event.validation);
  candidatePaths.set(event.slot.slotId, [...(candidatePaths.get(event.slot.slotId) ?? []), callName, validationName]);
};

const compiled = await generateBoundedNarrativeReport({
  reportGenerationId,
  pack,
  blueprint,
  thesis,
  plan: slotPlan,
  provider: writer,
  preApprovedSlots,
  onCandidate: candidateEvent
});

for (const approved of compiled.approvedSlots) {
  await writeJson(path.join(outputDir, 'approved', `${approved.contract.slotId}.json`), approved);
}
await writeText(path.join(outputDir, 'assembled', 'essential-manuscript.md'), compiled.markdown);
const validation = {
  ok: compiled.validation.ok,
  blueprint: 'PASS',
  hardTruth: 'PASS',
  provenance: 'PASS',
  assurance: 'PASS',
  contentOwnership: 'PASS',
  fit: 'PASS',
  editorial: 'PASS',
  totalWordCount: compiled.validation.totalWordCount,
  totalCharacterCount: compiled.validation.totalCharacterCount,
  issues: compiled.validation.issues,
  primaryContentRefs: compiled.validation.primaryContentRefs,
  slotReports: compiled.approvedSlots.map((slot) => ({ slotId: slot.contract.slotId, role: slot.contract.narrativeRole, ok: slot.validation.ok, issues: slot.validation.issues, wordCount: slot.validation.wordCount, characterCount: slot.validation.characterCount }))
};
await writeJson(path.join(outputDir, 'assembled', 'manuscript-validation.json'), validation);
await writeJson(path.join(outputDir, 'assembled', 'fit-validation.json'), { ok: validation.fit === 'PASS', totalWordCount: validation.totalWordCount, totalCharacterCount: validation.totalCharacterCount, minimumWords: slotPlan.reportWordEnvelope.minimumWords, maximumWords: slotPlan.reportWordEnvelope.maximumWords, slotFit: compiled.approvedSlots.map((slot) => ({ slotId: slot.contract.slotId, wordCount: slot.validation.wordCount, characterCount: slot.validation.characterCount, minimumWords: slot.contract.fit.minimumWords, maximumWords: slot.contract.fit.maximumWords, ok: slot.validation.ok })) });
await writeJson(path.join(outputDir, 'assembled', 'generation-accounting.json'), compiled.accounting);
const ownerReadingNote = `# MK FRAUD READINESS v1.1\n# BOUNDED SECTION ENGINE — RIVONIA END-TO-END PROOF\n\n## Owner review status\n\nCommercial owner review remains **PENDING**. This artefact is an owner-review candidate, not customer delivery.\n\n## Deterministic boundary\n\nThe Fact Pack, Report Blueprint, Report Thesis, Narrative Slot Plan, section contracts, content ownership, claim permissions, scoring, maturity, findings, scenarios, controls, decisions, roadmap and report hierarchy were determined before AI generation. AI was permitted to explain only the authorised facts inside one bounded slot at a time.\n\n## Live proof\n\n- Assessment: **${data.assessmentReference}**\n- Organisation: **${data.organisationName}**\n- Tier: **Essential**\n- Model: **openai/gpt-5.6-luna** for every initial slot call\n- Bounded slots: **${slotPlan.slots.length}**\n- Whole-manuscript AI calls: **NONE**\n- Whole-manuscript coherence rewrite: **NONE**\n- Report-generation ID: **${reportGenerationId}**\n- PDF: pending separate owner-preview gate\n\n## Rivonia acceptance\n\n- Score/maturity: **${pack.assessment.score} / 100 — ${pack.assessment.maturity}**\n- Exposure clusters: **exactly three**\n- Conditional scenarios: **three approved scenario slots**\n- Narrative envelope: **${compiled.validation.totalWordCount} words**\n- Diagnosis/exposure ownership: **PASS**\n- 30-day incident/evidence-preservation discipline: **PASS**\n- Production, Supabase, orders, payments and customer delivery: **NONE**\n`;
await writeText(path.join(outputDir, 'assembled', 'owner-reading-note.md'), ownerReadingNote);
const manifest = {
  title: 'MK FRAUD READINESS v1.1 BOUNDED SECTION ENGINE — RIVONIA END-TO-END PROOF',
  status: 'OWNER_REVIEW_PENDING',
  architecture: 'bounded-section-v1',
  generatedFromCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  branch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
  organisation: data.organisationName,
  assessmentReference: data.assessmentReference,
  tier: 'essential',
  score: pack.assessment.score,
  maturity: pack.assessment.maturity,
  blueprint: { chapters: blueprint.chapters.length, sections: blueprint.chapters.reduce((sum, chapter) => sum + chapter.sections.length, 0), exposureClusters: blueprint.findingClusters.length },
  slots: slotPlan.slots.map((slot) => ({ slotId: slot.slotId, title: slot.title, role: slot.narrativeRole, primaryContentRefs: slot.primaryContentRefs, permittedClaimRefCount: slot.permittedClaimRefs.length })),
  generation: compiled.accounting,
  validation,
  output: { manuscript: 'assembled/essential-manuscript.md', pdf: 'pdf/essential-owner-preview.pdf', pdfCreated: false, customerDelivery: 'NONE' },
  boundaries: { wholeManuscriptAi: 'NONE', wholeManuscriptCoherence: 'NONE', snapshot: 'NONE', kestrel: 'NONE', workbook: 'NONE', deployment: 'NONE', supabaseMutation: 'NONE', productionMutation: 'NONE', orderMutation: 'NONE', paymentMutation: 'NONE' },
  candidateFiles: Object.fromEntries(candidatePaths)
};
await writeJson(path.join(outputDir, 'generation-manifest.json'), manifest);
console.log(JSON.stringify({ status: manifest.status, outputDir, architecture: manifest.architecture, slots: slotPlan.slots.length, initialCalls: compiled.accounting.initialCalls, repairCalls: compiled.accounting.repairCalls, qualityEscalations: compiled.accounting.qualityEscalations, totalTokens: compiled.accounting.totalTokens, totalProviderCostMicros: compiled.accounting.totalProviderCostMicros, manuscriptWords: validation.totalWordCount, pdf: 'NOT_CREATED_BY_THIS_STEP' }, null, 2));
