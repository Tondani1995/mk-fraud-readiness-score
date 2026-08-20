#!/usr/bin/env node
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack, assertNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint, assertReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { assertNarrativeSlotPlan, buildNarrativeSlotPlan, buildReportThesis } from '../../src/lib/reports/narrative/bounded-section-engine.ts';

const orderReference = process.env.ESSENTIAL_ORDER_REFERENCE ?? 'MKORD-2026-22FF6B69';
const data = await assembleReportData(orderReference);
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
if (data.assessmentReference !== 'MKFRS-2026-F4047D75C0') throw new Error(`Unexpected assessment ${data.assessmentReference}.`);
if (blueprint.findingClusters.length !== 3) throw new Error(`Expected three Rivonia exposure clusters, received ${blueprint.findingClusters.length}.`);
console.log(JSON.stringify({
  passed: true,
  organisation: data.organisationName,
  assessmentReference: data.assessmentReference,
  score: pack.assessment.score,
  maturity: pack.assessment.maturity,
  blueprintChapters: blueprint.chapters.length,
  blueprintSections: blueprint.chapters.reduce((sum, chapter) => sum + chapter.sections.length, 0),
  slots: plan.slots.length,
  slotRoles: plan.slots.map((slot) => slot.narrativeRole),
  exposureClusters: blueprint.findingClusters.map((cluster) => cluster.title),
  aiCalls: 0,
  supabaseMutation: 'NONE'
}, null, 2));
