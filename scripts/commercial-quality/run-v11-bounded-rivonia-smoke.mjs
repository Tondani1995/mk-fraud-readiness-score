#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { assertBoundedSectionArchitecture } from '../../src/lib/reports/narrative/architecture.ts';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack, assertNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint, assertReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';
import {
  BoundedTechnicalFailure,
  assertNarrativeSlotPlan,
  buildNarrativeSectionContract,
  buildNarrativeSlotPlan,
  buildReportThesis,
  validateNarrativeSlotResult
} from '../../src/lib/reports/narrative/bounded-section-engine.ts';
import { createV11BoundedSectionWriter } from '../../src/lib/reports/narrative/bounded-section-writer.ts';

assertBoundedSectionArchitecture();

const outputDir = path.resolve(process.env.BOUNDED_RIVONIA_OUTPUT_DIR ?? '/Users/tondani/Documents/Codex/2026-08-11/p1-no-paid-order-can-be/outputs/v1.1-bounded-section-engine-rivonia');
const orderReference = process.env.ESSENTIAL_ORDER_REFERENCE ?? 'MKORD-2026-22FF6B69';
const expectedAssessmentReference = 'MKFRS-2026-F4047D75C0';
const smokeDir = path.join(outputDir, 'smoke');
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const json = (value) => JSON.stringify(value, null, 2) + '\n';

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, json(value));
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
const plan = buildNarrativeSlotPlan(pack, blueprint, thesis);
assertNarrativeSlotPlan(plan, pack, blueprint);
const slot = plan.slots[0];
if (!slot || slot.narrativeRole !== 'JUDGEMENT') throw new Error('Rivonia smoke test must target the first JUDGEMENT slot.');
const contract = buildNarrativeSectionContract(slot, pack, thesis);
await fs.mkdir(outputDir, { recursive: true });
await writeJson(path.join(outputDir, '01-fact-pack.json'), pack);
await writeJson(path.join(outputDir, '02-report-blueprint.json'), blueprint);
await writeJson(path.join(outputDir, '03-report-thesis.json'), thesis);
await writeJson(path.join(outputDir, '04-narrative-slot-plan.json'), plan);
await writeJson(path.join(outputDir, 'contracts', `${slot.slotId}.json`), contract);

const model = 'openai/gpt-5.6-luna';
const writer = createV11BoundedSectionWriter(model);
let call;
try {
  call = await writer.generate(contract);
  const validation = validateNarrativeSlotResult(call.result, contract);
  await writeJson(path.join(smokeDir, 'approved-slot.json'), {
    contract,
    result: call.result,
    validation,
    metadata: call.metadata,
    calls: [call],
    promptFingerprint: sha256(call.prompt ?? '')
  });
  if (!validation.ok) {
    await writeJson(path.join(smokeDir, 'failure.json'), { status: 'FAILED_CLOSED', slotId: slot.slotId, model, providerResponse: true, jsonParse: 'PASS', schema: 'PASS', validation: 'FAIL', validationIssues: validation.issues, semanticRepairs: 0, qualityEscalations: 0 });
    throw new Error(`First Rivonia slot failed closed: ${validation.issues.map((issue) => issue.message).join(' | ')}`);
  }
  const result = {
    status: 'PASS',
    slotId: slot.slotId,
    role: slot.narrativeRole,
    model,
    providerResponse: 'YES',
    jsonParse: 'PASS',
    schema: 'PASS',
    validation: 'PASS',
    hardTruth: 'PASS',
    provenance: 'PASS',
    assurance: 'PASS',
    fit: 'PASS',
    requiredInsights: 'PASS',
    words: validation.wordCount,
    tokens: call.metadata.totalTokens,
    cost: call.metadata.providerCostMicros,
    semanticRepairs: 0,
    qualityEscalations: 0,
    approvedSlotPath: 'smoke/approved-slot.json'
  };
  await writeJson(path.join(smokeDir, 'result.json'), result);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (error instanceof BoundedTechnicalFailure) {
    const failure = {
      status: 'FAILED_CLOSED',
      slotId: slot.slotId,
      role: slot.narrativeRole,
      model,
      providerResponse: error.kind === 'TECHNICAL_OUTPUT_PARSE_FAILURE' ? 'YES' : 'UNKNOWN',
      jsonParse: error.kind === 'TECHNICAL_OUTPUT_PARSE_FAILURE' ? 'FAIL' : 'NOT_REACHED',
      schema: error.kind === 'TECHNICAL_OUTPUT_PARSE_FAILURE' ? 'NOT_REACHED_OR_FAILED' : 'NOT_REACHED',
      validation: 'NOT_REACHED',
      technicalFailureKind: error.kind,
      diagnostics: error.diagnostics,
      aiCallCount: 1,
      semanticRepairs: 0,
      qualityEscalations: 0,
      tokens: undefined,
      cost: undefined
    };
    await writeJson(path.join(smokeDir, 'failure.json'), failure);
    console.error(JSON.stringify(failure, null, 2));
    process.exitCode = 1;
  } else {
    throw error;
  }
}

