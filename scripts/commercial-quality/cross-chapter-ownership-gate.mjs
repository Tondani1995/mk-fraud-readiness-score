#!/usr/bin/env node
/**
 * Cross-chapter derivation ownership gate.
 *
 * Pass 4 lost CASE-08 to two repeated sentences about review cadence and
 * ownership. The cause was not sibling overlap — the existing ownership gate
 * measures siblings within a chapter and reported zero. ROADMAP-002 derives from
 * SUSTAINMENT-002 (`roadmap.sourceId === priority.factRef`), and both slots were
 * instructed to explain the same accountability and the same rhythm, in
 * different chapters.
 *
 * The derivation itself is correct and must stay: a roadmap action should come
 * from a priority, and the same owner may appear as a field in both tables. What
 * must not be shared is the narrative responsibility — the management meaning
 * each slot is asked to explain.
 *
 * Relationships are read from explicit deterministic references only, never
 * inferred from labels.
 *
 * Usage:
 *   npm run v11:cross-chapter-ownership-gate
 *   CROSS_CHAPTER_REPORT_ONLY=1 npm run v11:cross-chapter-ownership-gate
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

const DEFAULT_ORDERS = {
  'CASE-01': 'MKORD-2026-B1DN82OG', 'CASE-02': 'MKORD-2026-D1U0CTO8', 'CASE-03': 'MKORD-2026-RHFC6DYH',
  'CASE-04': 'MKORD-2026-HB0OT81P', 'CASE-05': 'MKORD-2026-22FF6B69', 'CASE-06': 'MKORD-2026-7FBBEE23',
  'CASE-07': 'MKORD-2026-O8E19UPV', 'CASE-08': 'MKORD-2026-RXXUNVD9', 'CASE-09': 'MKORD-2026-1EOLBY7Y',
  'CASE-10': 'MKORD-2026-72BCEIDN', 'CASE-11': 'MKORD-2026-O9DT0QTT'
};

/**
 * Instruction similarity is measured and recorded, but it is not the control.
 *
 * Measuring it first showed why: on CASE-08 the derived pair scored 0.128 — the
 * two slots are briefed quite differently — and the duplicate prose appeared
 * anyway. The duplication does not come from similar instructions. It comes from
 * both slots being authorised to see the same attribute *values*: one accountable
 * executive across every sustainment priority and every roadmap action, and the
 * same review cadence. Two slots that both hold "CEO / Managing Director" and are
 * both asked to talk about accountability will both write it out.
 *
 * So the control is attribute-level: where two slots share an identical
 * ownership or cadence value, exactly one of them may be instructed to explain
 * it. The other carries it as a field.
 */
const MAX_RESPONSIBILITY_SIMILARITY = Number(process.env.MAX_RESPONSIBILITY_SIMILARITY ?? 0.4);

/** Attributes a report states once and shows elsewhere as a field. */
const SHARED_ATTRIBUTE_KEYS = ['accountableExecutive', 'processOwner', 'operatingFrequency'];

/** Instruction language that asks a slot to explain ownership or rhythm. */
const NARRATES_OWNERSHIP = /\b(owner|owners|ownership|accountab\w*|cadence|rhythm|frequency|who owns)\b/i;

/** The ownership and cadence values a slot can actually see. */
function attributeValues(slot, factsByRef) {
  const values = new Set();
  for (const ref of slot.permittedClaimRefs ?? []) {
    const fact = factsByRef.get(ref);
    if (!fact) continue;
    for (const key of SHARED_ATTRIBUTE_KEYS) {
      const value = fact[key];
      if (typeof value === 'string' && value.trim()) values.add(`${key}:${value.trim().toLowerCase()}`);
    }
  }
  return values;
}

/** "Do not re-explain who owns what" asks for less, not more. */
const PROHIBITION = /\b(do not|don't|never|no need to|already (?:established|stated|covered)|without re-?explaining)\b/i;

function narratesOwnership(contract) {
  const parts = [contract.purpose, contract.requiredManagementTakeaway, ...(contract.requiredInsights ?? []).map((item) => item.instruction)];
  return parts
    .flatMap((part) => String(part ?? '').split(/(?<=[.;])\s+/))
    .filter((clause) => !PROHIBITION.test(clause))
    .some((clause) => NARRATES_OWNERSHIP.test(clause));
}

/**
 * Vocabulary that carries management meaning. Function words and the report's
 * universal nouns are excluded so two slots are not flagged merely for being
 * about fraud.
 */
const STOP = new Set('the a an and or of to in for on with is are as that this it its by be should must can will not from at their which where what how one any each every management fraud risk organisation report assessed assessment'.split(' '));

function responsibilityTokens(contract) {
  const text = [contract.purpose, contract.requiredManagementTakeaway, ...(contract.requiredInsights ?? []).map((item) => item.instruction)].join(' ');
  return new Set(String(text).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((word) => word.length > 3 && !STOP.has(word)));
}

function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  const inter = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union ? Number((inter / union).toFixed(4)) : 0;
}

const orders = process.env.ORDERS
  ? Object.fromEntries(process.env.ORDERS.split(',').map((order, index) => [`CASE-${String(index + 1).padStart(2, '0')}`, order.trim()]))
  : DEFAULT_ORDERS;

const cases = [];
const violations = [];

for (const [caseId, order] of Object.entries(orders)) {
  const data = await assembleReportData(order);
  const evidence = buildAdvisoryEvidenceModel(data);
  const pack = buildEssentialNarrativeFactPack(data, evidence, buildEssentialProjection(data, evidence));
  const blueprint = buildReportBlueprint(pack, buildNarrativeStoryPlan(pack));
  const thesis = buildReportThesis(pack, blueprint);
  const plan = buildNarrativeSlotPlan(pack, blueprint, thesis);
  const contracts = new Map(plan.slots.map((slot) => [slot.slotId, buildNarrativeSectionContract(slot, pack, thesis)]));

  /** Which slot owns a given fact reference as primary content. */
  const ownerOf = new Map();
  for (const slot of plan.slots) {
    for (const ref of slot.primaryContentRefs) ownerOf.set(ref, slot);
  }

  // Every deterministic object that can carry an ownership or cadence attribute.
  const factsByRef = new Map();
  for (const collection of [pack.sustainmentPriorities, pack.roadmap, pack.controls, pack.findings, pack.decisions]) {
    for (const item of collection ?? []) if (item?.factRef) factsByRef.set(item.factRef, item);
  }

  // Derivation edges, from explicit references only.
  const edges = [];
  for (const item of pack.roadmap ?? []) {
    const source = item.sourceId ?? item.sourceFindingRef;
    if (source) edges.push({ kind: 'roadmap-from-source', from: source, to: item.factRef });
  }
  for (const scenario of pack.scenarios ?? []) {
    for (const ref of scenario.linkedFindingRefs ?? []) edges.push({ kind: 'scenario-from-finding', from: ref, to: scenario.factRef });
  }

  const pairs = [];
  for (const edge of edges) {
    const fromSlot = ownerOf.get(edge.from);
    const toSlot = ownerOf.get(edge.to);
    if (!fromSlot || !toSlot) continue;
    if (fromSlot.slotId === toSlot.slotId) continue;
    // Only a genuine cross-chapter relationship can create duplicate
    // communicative responsibility that the sibling gate cannot see.
    if (fromSlot.chapterId === toSlot.chapterId) continue;
    const score = similarity(responsibilityTokens(contracts.get(fromSlot.slotId)), responsibilityTokens(contracts.get(toSlot.slotId)));
    // Scoped exactly as the derivation is: the source slot and the slot derived
    // from it. Two unrelated slots naming the same executive is ordinary; the
    // source and its derivative both explaining that executive is duplication.
    const shared = [...attributeValues(fromSlot, factsByRef)].filter((value) => attributeValues(toSlot, factsByRef).has(value));
    const bothNarrate = narratesOwnership(contracts.get(fromSlot.slotId)) && narratesOwnership(contracts.get(toSlot.slotId));
    const pair = { kind: edge.kind, from: edge.from, to: edge.to, fromSlot: fromSlot.slotId, toSlot: toSlot.slotId, fromChapter: fromSlot.chapterId, toChapter: toSlot.chapterId, responsibilitySimilarity: score, sharedAttributes: shared.slice(0, 4), bothNarrateOwnership: bothNarrate };
    pairs.push(pair);
    if (edge.kind === 'roadmap-from-source' && bothNarrate && shared.length) {
      violations.push({
        caseId, order, code: 'DUPLICATED_OWNERSHIP_NARRATION',
        from: edge.from, to: edge.to, fromSlot: fromSlot.slotId, toSlot: toSlot.slotId,
        fromChapter: fromSlot.chapterId, toChapter: toSlot.chapterId,
        sharedAttributes: shared.slice(0, 4),
        detail: 'a derived slot and its source are both instructed to explain ownership or rhythm while holding the same values'
      });
    }
    if (score > MAX_RESPONSIBILITY_SIMILARITY) {
      violations.push({ caseId, order, code: 'DERIVED_RESPONSIBILITY_OVERLAP', ...pair, limit: MAX_RESPONSIBILITY_SIMILARITY });
    }
  }

  cases.push({ caseId, order, mode: pack.narrativeMode, edges: edges.length, crossChapterPairs: pairs.length, worst: pairs.reduce((worst, pair) => Math.max(worst, pair.responsibilitySimilarity), 0), ownershipNarrators: pairs.filter((pair) => pair.bothNarrateOwnership).length, pairs });
}

const summary = {
  limit: MAX_RESPONSIBILITY_SIMILARITY,
  cases: cases.length,
  violations: violations.length,
  duplicatedOwnershipNarration: violations.filter((v) => v.code === 'DUPLICATED_OWNERSHIP_NARRATION').length,
  derivedResponsibilityOverlap: violations.filter((v) => v.code === 'DERIVED_RESPONSIBILITY_OVERLAP').length,
  byCase: cases.map((c) => ({ caseId: c.caseId, mode: c.mode, edges: c.edges, crossChapterPairs: c.crossChapterPairs, worst: c.worst, bothNarratePairs: c.ownershipNarrators })),
  violationDetail: violations
};

const outDir = process.env.CERT_OUTPUT_DIR ?? '/Users/tondani/Documents/Codex/outputs/essential-targeted-closure/preflight';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'cross-chapter-ownership.json'), `${JSON.stringify({ summary, cases }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

if (process.env.CROSS_CHAPTER_REPORT_ONLY) process.exit(0);
if (violations.length) {
  console.error(`\nFAIL: ${violations.length} derived slot pair(s) share narrative responsibility across chapters.`);
  console.error('The derivation is correct; the duplicated explanation is not. Give the source slot the rationale and the derived slot the execution.');
  process.exit(1);
}
console.log('\nPASS: derived slots across chapters explain different things.');
