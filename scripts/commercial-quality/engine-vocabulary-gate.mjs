#!/usr/bin/env node
/**
 * Engine-vocabulary gate.
 *
 * The mechanical-language check polices the writer's prose. This gate polices
 * what the engine asks for in the first place, because the two are connected:
 * CASE-02 failed on "management should" nine times against an allowance of
 * eight, and the phrase was seeded by the engine itself — the writer's output
 * template described the implication field as "what management should take from
 * it", and several section takeaways opened with the same words. Raising the
 * allowance would have hidden that; cleaning the source removes it.
 *
 * Titles are exempt. A heading is customer-facing presentation, not an
 * instruction, and the mechanical-language check does not count it.
 *
 * Usage:
 *   npm run v11:engine-vocabulary-gate
 */
import fs from 'node:fs';
import path from 'node:path';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { buildReportThesis, buildNarrativeSlotPlan, buildNarrativeSectionContract } from '../../src/lib/reports/narrative/bounded-section-engine.ts';
import { MECHANICAL_TERM_FAMILIES } from '../../src/lib/reports/narrative/mechanical-language.ts';
import { buildBoundedSectionPrompt } from '../../src/lib/reports/narrative/bounded-section-writer.ts';

const DEFAULT_ORDERS = [
  'MKORD-2026-B1DN82OG', 'MKORD-2026-D1U0CTO8', 'MKORD-2026-RHFC6DYH', 'MKORD-2026-HB0OT81P',
  'MKORD-2026-22FF6B69', 'MKORD-2026-7FBBEE23', 'MKORD-2026-O8E19UPV', 'MKORD-2026-RXXUNVD9',
  'MKORD-2026-1EOLBY7Y', 'MKORD-2026-72BCEIDN', 'MKORD-2026-O9DT0QTT'
];
const orders = (process.env.ORDERS ?? DEFAULT_ORDERS.join(',')).split(',').map((entry) => entry.trim()).filter(Boolean);

/** Instruction text the writer is asked to satisfy. Titles are excluded by design. */
function instructionSurfaces(contract) {
  return [
    contract.purpose,
    contract.readerQuestion,
    contract.requiredManagementTakeaway,
    ...(contract.requiredInsights ?? []).map((item) => item.instruction),
    ...(contract.style ? Object.values(contract.style).flat() : []),
    contract.reportThesis?.centralJudgement,
    contract.context?.precedingContext,
    contract.context?.followingContext
  ].filter((value) => typeof value === 'string' && value.trim());
}

/**
 * What the engine seeds beyond the instruction surfaces: the fixed prompt
 * scaffold every slot receives, minus the contract JSON it embeds.
 */
function promptScaffold() {
  const probe = {
    contractVersion: 'probe', slotId: 'PROBE', tier: 'essential', organisationName: 'Probe', assessmentReference: 'PROBE',
    title: 'Probe', purpose: '', readerQuestion: '', requiredManagementTakeaway: '', narrativeRole: 'JUDGEMENT',
    requiredInsights: [], reportThesis: { centralJudgement: '', supportingMovements: [], contrasts: [], closingCommitment: '' },
    authorisedFacts: [], primaryContentRefs: [], permittedCrossReferenceRefs: [], permittedClaimRefs: [],
    contentOwnedElsewhere: [], forbiddenTopics: [], prohibitedClaims: [],
    style: { voice: '', mustDo: [], mustNotDo: [] },
    fit: { targetWords: 200, minimumWords: 150, maximumWords: 250, targetCharacters: 1200, minimumCharacters: 900, maximumCharacters: 1500 },
    context: { precedingContext: '', followingContext: '', chapterId: 'PROBE', sectionId: 'PROBE' }
  };
  return buildBoundedSectionPrompt(probe).split(JSON.stringify(probe)).join(' ');
}

const violations = [];
const perOrder = [];

const scaffold = promptScaffold();
for (const family of MECHANICAL_TERM_FAMILIES) {
  for (const pattern of family.patterns) {
    const hits = scaffold.match(new RegExp(pattern.source, 'gi')) ?? [];
    if (hits.length) violations.push({ scope: 'prompt scaffold', order: null, family: family.family, count: hits.length, sample: hits.slice(0, 3) });
  }
}

for (const order of orders) {
  const data = await assembleReportData(order);
  const evidence = buildAdvisoryEvidenceModel(data);
  const pack = buildEssentialNarrativeFactPack(data, evidence, buildEssentialProjection(data, evidence));
  const blueprint = buildReportBlueprint(pack, buildNarrativeStoryPlan(pack));
  const thesis = buildReportThesis(pack, blueprint);
  const plan = buildNarrativeSlotPlan(pack, blueprint, thesis);
  const counts = {};
  for (const slot of plan.slots) {
    const text = instructionSurfaces(buildNarrativeSectionContract(slot, pack, thesis)).join('\n');
    for (const family of MECHANICAL_TERM_FAMILIES) {
      for (const pattern of family.patterns) {
        const hits = text.match(new RegExp(pattern.source, 'gi')) ?? [];
        if (!hits.length) continue;
        counts[family.family] = (counts[family.family] ?? 0) + hits.length;
        // One slot's instructions must never seed more than that slot is
        // allowed to write, or the engine has spent the budget before the
        // writer starts.
        if (hits.length > family.perSlotAllowance) {
          violations.push({ scope: 'slot instructions', order, slotId: slot.slotId, family: family.family, count: hits.length, allowance: family.perSlotAllowance, sample: hits.slice(0, 3) });
        }
      }
    }
  }
  // Across the report, engine instructions must leave room for the writer.
  for (const family of MECHANICAL_TERM_FAMILIES) {
    const total = counts[family.family] ?? 0;
    if (total >= family.perReportAllowance) {
      violations.push({ scope: 'report instructions', order, family: family.family, count: total, allowance: family.perReportAllowance });
    }
  }
  perOrder.push({ order, slots: plan.slots.length, counts });
}

const summary = { orders: orders.length, violations: violations.length, perOrder, detail: violations };
const outDir = process.env.CERT_OUTPUT_DIR ?? '/Users/tondani/Documents/Codex/outputs/essential-clean-live-certification';
fs.mkdirSync(path.join(outDir, 'analysis'), { recursive: true });
fs.writeFileSync(path.join(outDir, 'analysis', 'engine-vocabulary-gate.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

if (violations.length) {
  console.error(`\nFAIL: the engine seeds mechanical vocabulary it then penalises the writer for using (${violations.length} violation(s)).`);
  process.exit(1);
}
console.log('\nPASS: engine instructions do not seed the vocabulary the mechanical-language gate polices.');
