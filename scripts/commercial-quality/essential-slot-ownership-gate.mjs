#!/usr/bin/env node
/**
 * Essential slot-ownership gate — zero provider calls.
 *
 * P06 passed on one run and failed closed on the next with identical input,
 * because two slots were contracted to write the same closing content: the
 * implementation chapter claimed "First 90 days AND management conclusion",
 * and the CONCLUSION slot was granted every roadmap fact plus a takeaway that
 * was itself a 30/60/90 sequencing statement.
 *
 * Duplicate prose was therefore authorised before any provider call, and the
 * exact-sentence duplicate check fired only when the two slots happened to land
 * on identical phrasing. That is a coin flip, which is exactly what intermittent
 * delivery looks like.
 *
 * This gate proves the overlap is gone at contract level, so the condition
 * cannot reach a paid generation again.
 *
 * Usage:
 *   npm run v11:essential-slot-ownership-gate
 */
import fs from 'node:fs';
import path from 'node:path';
import { assembleReportData } from '../../src/lib/reports/assemble-report-data.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildReportBlueprint } from '../../src/lib/reports/narrative/report-blueprint.ts';
import { buildReportThesis, buildNarrativeSlotPlan } from '../../src/lib/reports/narrative/bounded-section-engine.ts';

const DEFAULT_ORDERS = [
  'MKORD-2026-B1DN82OG', 'MKORD-2026-D1U0CTO8', 'MKORD-2026-RHFC6DYH', 'MKORD-2026-HB0OT81P',
  'MKORD-2026-22FF6B69', 'MKORD-2026-7FBBEE23', 'MKORD-2026-O8E19UPV', 'MKORD-2026-RXXUNVD9',
  'MKORD-2026-1EOLBY7Y', 'MKORD-2026-72BCEIDN', 'MKORD-2026-O9DT0QTT',
  'MKORD-2026-OAP06NIM', 'MKORD-2026-OAP08AUR'
];
const orders = (process.env.ORDERS ?? DEFAULT_ORDERS.join(',')).split(',').map((v) => v.trim()).filter(Boolean);

/** Sequencing language: windows, ordering and completion timing. */
const SEQUENCING = /\b(?:30|60|90)\s*days?\b|\bwithin\s+(?:the\s+)?first\b|\bby\s+(?:30|60|90)\b|\bsequence\b|\bwindow\b|\broadmap\b|\bhorizon\b/gi;

/**
 * An instruction telling the writer NOT to sequence is the fix, not the defect.
 *
 * The conclusion's purpose reads "Do not sequence, restate windows or repeat the
 * roadmap", which a bare keyword scan reports as three sequencing violations —
 * the recurring mistake of a validator flagging its own denial. Only count a
 * match that is not governed by a preceding prohibition in the same clause.
 */
const PROHIBITION = /\b(?:do not|don't|never|without|rather than|instead of|avoid)\b/i;
function sequencingMatches(value) {
  const hits = [];
  for (const match of value.matchAll(SEQUENCING)) {
    const lead = value.slice(0, match.index ?? 0);
    // Scope to the sentence, not the clause: "Do not sequence, restate windows
    // or repeat the roadmap" prohibits all three, and cutting at the comma
    // would leave the last two items looking like instructions to do them.
    const sentenceStart = Math.max(lead.lastIndexOf('.'), lead.lastIndexOf(';'));
    if (PROHIBITION.test(lead.slice(sentenceStart + 1))) continue;
    hits.push(match[0]);
  }
  return hits;
}

function slotSurfaces(slot) {
  const out = [];
  const push = (label, value) => { if (typeof value === 'string' && value.trim()) out.push([label, value]); };
  push('takeaway', slot.requiredManagementTakeaway);
  push('purpose', slot.purpose);
  push('title', slot.title);
  for (const insight of slot.requiredInsights ?? []) push('insight', insight.instruction);
  return out;
}

const cases = [];
const violations = [];

for (const order of orders) {
  const data = await assembleReportData(order);
  const evidence = buildAdvisoryEvidenceModel(data);
  const pack = buildEssentialNarrativeFactPack(data, evidence, buildEssentialProjection(data, evidence));
  const blueprint = buildReportBlueprint(pack, buildNarrativeStoryPlan(pack));
  const thesis = buildReportThesis(pack, blueprint);
  const plan = buildNarrativeSlotPlan(pack, blueprint, thesis);
  const add = (code, detail) => violations.push({ order, code, detail });

  const implementation = plan.slots.filter((slot) => slot.narrativeRole === 'IMPLEMENTATION');
  const conclusions = plan.slots.filter((slot) => slot.narrativeRole === 'CONCLUSION');

  // ---- CONCLUSION_OWNS_JUDGEMENT_ONLY -------------------------------------
  for (const slot of conclusions) {
    for (const [label, value] of slotSurfaces(slot)) {
      for (const hit of sequencingMatches(value)) {
        add('CONCLUSION_SEQUENCES', `${slot.slotId} ${label} carries sequencing language "${hit}"`);
      }
    }
    // The roadmap belongs to the implementation slots. A conclusion holding the
    // same roadmap fact refs is being invited to rewrite them.
    const roadmapRefs = new Set(pack.roadmap.map((item) => item.factRef));
    const held = (slot.requiredFacts ?? []).filter((ref) => roadmapRefs.has(ref));
    if (held.length) add('CONCLUSION_HOLDS_ROADMAP_FACTS', `${slot.slotId} holds ${held.length} roadmap fact ref(s)`);
  }

  // ---- CHAPTER_TITLE_SINGLE_RESPONSIBILITY --------------------------------
  for (const slot of implementation) {
    if (/\bconclusion\b/i.test(slot.title ?? '')) add('IMPLEMENTATION_CLAIMS_CONCLUSION', `${slot.slotId} title claims the conclusion: "${slot.title}"`);
    for (const [label, value] of slotSurfaces(slot)) {
      if (/\bclose\s+(?:the\s+)?report\b|\bmanagement conclusion\b/i.test(value)) {
        add('IMPLEMENTATION_CLAIMS_CONCLUSION', `${slot.slotId} ${label} claims the close`);
      }
    }
  }

  // ---- NO_SHARED_FACT_SET BETWEEN IMPLEMENTATION AND CONCLUSION -----------
  for (const conclusion of conclusions) {
    const conclusionFacts = new Set(conclusion.requiredFacts ?? []);
    for (const slot of implementation) {
      const shared = (slot.requiredFacts ?? []).filter((ref) => conclusionFacts.has(ref));
      if (shared.length) add('IMPLEMENTATION_CONCLUSION_SHARED_FACTS', `${slot.slotId} and ${conclusion.slotId} share ${shared.length} fact ref(s)`);
    }
  }

  if (!conclusions.length) add('MISSING_CONCLUSION', 'no CONCLUSION slot planned');

  cases.push({
    order, mode: pack.narrativeMode ?? blueprint.narrativeMode ?? 'UNKNOWN',
    slots: plan.slots.length,
    implementationSlots: implementation.length,
    conclusionSlots: conclusions.length,
    conclusionRoadmapFacts: conclusions.reduce((sum, slot) => {
      const roadmapRefs = new Set(pack.roadmap.map((item) => item.factRef));
      return sum + (slot.requiredFacts ?? []).filter((ref) => roadmapRefs.has(ref)).length;
    }, 0)
  });
}

/**
 * Negative control: rebuild the pre-fix contract shape and require every check
 * to fire. A gate that only ever passes proves nothing about the defect it was
 * written for.
 */
const OLD_SHAPE = {
  implementation: { slotId: 'OLD-IMPL', narrativeRole: 'IMPLEMENTATION', title: 'First 90 days and management conclusion', purpose: 'Sequence the first response and close with one useful management conclusion.', requiredFacts: ['ROADMAP-1', 'ROADMAP-2'], requiredInsights: [] },
  conclusion: { slotId: 'OLD-CONC', narrativeRole: 'CONCLUSION', title: 'Management conclusion', purpose: 'Return to the central judgement rather than restating the sequence.', requiredManagementTakeaway: 'Within 90 days the organisation should have accountable ownership, priority controls and a repeatable first operating cycle.', requiredFacts: ['ROADMAP-1', 'ROADMAP-2'], requiredInsights: [] }
};
const controlFailures = [];
{
  const roadmapRefs = new Set(['ROADMAP-1', 'ROADMAP-2']);
  const sequencingHits = slotSurfaces(OLD_SHAPE.conclusion).flatMap(([, value]) => sequencingMatches(value));
  if (!sequencingHits.length) controlFailures.push('CONCLUSION_SEQUENCES did not fire on the old takeaway');
  if (!(OLD_SHAPE.conclusion.requiredFacts.filter((ref) => roadmapRefs.has(ref)).length)) controlFailures.push('CONCLUSION_HOLDS_ROADMAP_FACTS did not fire');
  if (!/\bconclusion\b/i.test(OLD_SHAPE.implementation.title)) controlFailures.push('IMPLEMENTATION_CLAIMS_CONCLUSION did not fire on the old title');
  const conclusionFacts = new Set(OLD_SHAPE.conclusion.requiredFacts);
  if (!OLD_SHAPE.implementation.requiredFacts.filter((ref) => conclusionFacts.has(ref)).length) controlFailures.push('IMPLEMENTATION_CONCLUSION_SHARED_FACTS did not fire');
}
if (controlFailures.length) {
  for (const failure of controlFailures) violations.push({ order: 'NEGATIVE-CONTROL', code: 'CONTROL_DID_NOT_FIRE', detail: failure });
}

const summary = { cases: cases.length, violations: violations.length, negativeControl: controlFailures.length ? 'FAIL' : 'PASS (all four checks fire on the pre-fix shape)', byCase: cases, violationDetail: violations };
const outDir = process.env.CERT_OUTPUT_DIR ?? 'outputs/product-owner-acceptance/correction-review';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'essential-slot-ownership.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ cases: summary.cases, violations: summary.violations, negativeControl: summary.negativeControl, conclusionRoadmapFacts: cases.reduce((s, c) => s + c.conclusionRoadmapFacts, 0) }, null, 2));

if (violations.length) {
  console.error(`\nFAIL: ${violations.length} slot-ownership violation(s).`);
  for (const violation of violations.slice(0, 10)) console.error(`  ${violation.order} ${violation.code}: ${violation.detail}`);
  process.exit(1);
}
console.log('\nPASS: the implementation slots sequence, the conclusion judges, and they share no facts.');
