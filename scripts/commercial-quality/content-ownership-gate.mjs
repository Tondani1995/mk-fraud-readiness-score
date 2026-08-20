#!/usr/bin/env node
/**
 * Content-ownership gate.
 *
 * Pass 2 lost CASE-03 and CASE-06 to repeated-sentence overlap. The cause was
 * not the writer: three sibling executive sections were each authorised to use
 * the same six domain facts, so three independent calls were asked to interpret
 * the same evidence and converged on one sentence.
 *
 * The rule this enforces is an engine rule, not a prose rule: sibling sections
 * within a chapter must own distinct analytical evidence. Shared *context* —
 * the overall score and maturity, which almost every section legitimately
 * refers to — is separated out and never counted as overlap.
 *
 * Usage:
 *   npm run v11:content-ownership-gate
 *   OVERLAP_REPORT_ONLY=1 npm run v11:content-ownership-gate   (measure, never fail)
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

const DEFAULT_ORDERS = {
  'CASE-01': 'MKORD-2026-B1DN82OG', 'CASE-02': 'MKORD-2026-D1U0CTO8', 'CASE-03': 'MKORD-2026-RHFC6DYH',
  'CASE-04': 'MKORD-2026-HB0OT81P', 'CASE-05': 'MKORD-2026-22FF6B69', 'CASE-06': 'MKORD-2026-7FBBEE23',
  'CASE-07': 'MKORD-2026-O8E19UPV', 'CASE-08': 'MKORD-2026-RXXUNVD9', 'CASE-09': 'MKORD-2026-1EOLBY7Y',
  'CASE-10': 'MKORD-2026-72BCEIDN', 'CASE-11': 'MKORD-2026-O9DT0QTT'
};

/**
 * Facts every section may legitimately refer to. The overall score and maturity
 * are the report's frame of reference, not evidence any one section owns, so
 * two sections both citing the score are not saying the same thing.
 */
function sharedContextRefs(pack) {
  return new Set(pack.facts.filter((fact) => fact.kind === 'score' || fact.kind === 'maturity').map((fact) => fact.id));
}

/**
 * The maximum share of one sibling's owned evidence that may also be authorised
 * to another sibling.
 *
 * This is not an arbitrary number. It is set from measurement: with correct
 * ownership every remediation and sustainment chapter across the eleven real
 * cases sits at 0.00, and the Pass 2 defect measured 1.00 — three sections each
 * authorised the identical domain set. A ceiling of 0.50 fails the defect with
 * a wide margin and still permits a section to draw on half of a sibling's
 * evidence where the analysis genuinely requires it.
 */
const MAX_OWNED_OVERLAP = Number(process.env.MAX_OWNED_OVERLAP ?? 0.5);

/**
 * The second convergence axis.
 *
 * Fixing fact overlap did not fix CASE-03: sibling slots still received a
 * byte-identical `requiredManagementTakeaway`, so two writers with different
 * evidence were still told to reach the same conclusion. Distinct facts plus an
 * identical required conclusion still produces the same sentence.
 *
 * Similarity is measured on content words. Two takeaways may legitimately share
 * the report's vocabulary — "management", "fraud", "control" — without sharing a
 * responsibility, so the ceiling is validated against measurement rather than
 * left as a guess: with the defect present every remediation and sustainment
 * chapter contained byte-identical pairs at similarity 1.00 (79 violations
 * across the eleven cases); with takeaways derived from each slot's own content
 * the portfolio maximum is 0.40 and there are no exact duplicates. A ceiling of
 * 0.60 sits between the two with margin on both sides.
 */
const MAX_TAKEAWAY_SIMILARITY = Number(process.env.MAX_TAKEAWAY_SIMILARITY ?? 0.6);

const TAKEAWAY_STOPWORDS = new Set('the a an and or of to in for on with is are as that this it its by be should must can will not from at their which where what how one any each every management fraud risk organisation'.split(' '));

function takeawayTokens(text) {
  return new Set(String(text ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((word) => word.length > 2 && !TAKEAWAY_STOPWORDS.has(word)));
}

function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  const inter = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union ? Number((inter / union).toFixed(4)) : 0;
}

function overlapOf(a, b) {
  const inter = [...a].filter((ref) => b.has(ref));
  const union = new Set([...a, ...b]);
  return {
    intersection: inter.length,
    union: union.size,
    jaccard: union.size ? Number((inter.length / union.size).toFixed(4)) : 0,
    // Containment matters more than Jaccard here: a small section wholly
    // contained in a large sibling is fully duplicated evidence even though
    // Jaccard looks moderate.
    containment: Math.min(a.size, b.size) ? Number((inter.length / Math.min(a.size, b.size)).toFixed(4)) : 0,
    sharedRefs: inter.slice(0, 12)
  };
}

const orders = process.env.ORDERS
  ? Object.fromEntries(process.env.ORDERS.split(',').map((order, index) => [`CASE-${String(index + 1).padStart(2, '0')}`, order.trim()]))
  : DEFAULT_ORDERS;

const cases = [];
const violations = [];
const takeawayViolations = [];

for (const [caseId, order] of Object.entries(orders)) {
  const data = await assembleReportData(order);
  const evidence = buildAdvisoryEvidenceModel(data);
  const pack = buildEssentialNarrativeFactPack(data, evidence, buildEssentialProjection(data, evidence));
  const blueprint = buildReportBlueprint(pack, buildNarrativeStoryPlan(pack));
  const shared = sharedContextRefs(pack);

  const chapters = [];
  for (const chapter of blueprint.chapters) {
    const owned = chapter.sections.map((section) => ({
      sectionId: section.sectionId,
      // A closing section legitimately spans the sections before it — that is
      // what closing means. The defect this gate exists for is *peer* sections
      // of equal standing being handed the same evidence, so a pair involving a
      // conclusion is measured and recorded but never counted as a violation.
      closing: section.narrativeRole === 'CONCLUSION',
      refs: new Set([...section.requiredFacts, ...(section.claimRefs ?? [])].filter((ref) => !shared.has(ref)))
    }));
    const pairs = [];
    for (let i = 0; i < owned.length; i += 1) {
      for (let j = i + 1; j < owned.length; j += 1) {
        const measure = overlapOf(owned[i].refs, owned[j].refs);
        const closingPair = owned[i].closing || owned[j].closing;
        const pair = { a: owned[i].sectionId, b: owned[j].sectionId, sizeA: owned[i].refs.size, sizeB: owned[j].refs.size, closingPair, ...measure };
        pairs.push(pair);
        // Two sections that own nothing analytical cannot duplicate evidence.
        if (!owned[i].refs.size || !owned[j].refs.size) continue;
        if (closingPair) continue;
        if (pair.containment > MAX_OWNED_OVERLAP) {
          violations.push({ caseId, order, chapterId: chapter.chapterId, ...pair, limit: MAX_OWNED_OVERLAP });
        }
      }
    }
    chapters.push({
      chapterId: chapter.chapterId,
      sections: owned.map((entry) => ({ sectionId: entry.sectionId, ownedRefs: entry.refs.size })),
      worstContainment: pairs.filter((pair) => !pair.closingPair && pair.sizeA && pair.sizeB).reduce((worst, pair) => (pair.containment > (worst?.containment ?? -1) ? pair : worst), null),
      pairs
    });
  }
  // ---- Takeaway ownership, measured on the slots the writer actually receives ----
  const thesis = buildReportThesis(pack, blueprint);
  const plan = buildNarrativeSlotPlan(pack, blueprint, thesis);
  const byChapter = new Map();
  for (const slot of plan.slots) {
    byChapter.set(slot.chapterId, [...(byChapter.get(slot.chapterId) ?? []), slot]);
  }
  const takeawayChapters = [];
  for (const [chapterId, slots] of byChapter) {
    const entries = slots.map((slot) => ({
      slotId: slot.slotId,
      role: slot.narrativeRole,
      takeaway: String(slot.requiredManagementTakeaway ?? '').trim(),
      tokens: takeawayTokens(slot.requiredManagementTakeaway)
    }));
    const pairs = [];
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const exact = entries[i].takeaway && entries[i].takeaway.toLowerCase() === entries[j].takeaway.toLowerCase();
        const score = similarity(entries[i].tokens, entries[j].tokens);
        const pair = { a: entries[i].slotId, b: entries[j].slotId, roleA: entries[i].role, roleB: entries[j].role, exactDuplicate: Boolean(exact), similarity: score };
        pairs.push(pair);
        if (exact || score > MAX_TAKEAWAY_SIMILARITY) {
          takeawayViolations.push({ caseId, order, chapterId, ...pair, limit: MAX_TAKEAWAY_SIMILARITY, takeaway: entries[i].takeaway.slice(0, 120) });
        }
      }
    }
    takeawayChapters.push({
      chapterId,
      slots: entries.map((entry) => ({ slotId: entry.slotId, role: entry.role, takeaway: entry.takeaway })),
      exactDuplicatePairs: pairs.filter((pair) => pair.exactDuplicate).length,
      worstSimilarity: pairs.reduce((worst, pair) => Math.max(worst, pair.similarity), 0)
    });
  }

  cases.push({ caseId, order, mode: pack.narrativeMode, sharedContextRefs: [...shared], chapters, takeawayChapters });
}

const summary = {
  factOverlapLimit: MAX_OWNED_OVERLAP,
  takeawaySimilarityLimit: MAX_TAKEAWAY_SIMILARITY,
  cases: cases.length,
  factViolations: violations.length,
  takeawayViolations: takeawayViolations.length,
  violations: violations.length + takeawayViolations.length,
  takeawayByCase: cases.map((entry) => ({
    caseId: entry.caseId,
    mode: entry.mode,
    exactDuplicatePairs: entry.takeawayChapters.reduce((sum, chapter) => sum + chapter.exactDuplicatePairs, 0),
    worstSimilarity: entry.takeawayChapters.reduce((worst, chapter) => Math.max(worst, chapter.worstSimilarity), 0)
  })),
  takeawayViolationDetail: takeawayViolations,
  worstByCase: cases.map((entry) => ({
    caseId: entry.caseId,
    mode: entry.mode,
    worst: entry.chapters.reduce((worst, chapter) => {
      const candidate = chapter.worstContainment;
      if (!candidate) return worst;
      return candidate.containment > (worst?.containment ?? -1) ? { chapterId: chapter.chapterId, ...candidate } : worst;
    }, null)
  })),
  violationDetail: violations
};

const outDir = process.env.CERT_OUTPUT_DIR ?? '/Users/tondani/Documents/Codex/outputs/essential-pass3-final-certification/preflight';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'fact-overlap-matrix.json'), `${JSON.stringify({ summary, cases }, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, 'takeaway-overlap-matrix.json'), `${JSON.stringify({ summary: { limit: MAX_TAKEAWAY_SIMILARITY, violations: takeawayViolations.length, byCase: summary.takeawayByCase, detail: takeawayViolations }, cases: cases.map((entry) => ({ caseId: entry.caseId, mode: entry.mode, chapters: entry.takeawayChapters })) }, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

if (process.env.OVERLAP_REPORT_ONLY) process.exit(0);
if (violations.length || takeawayViolations.length) {
  if (violations.length) console.error(`\nFAIL: ${violations.length} sibling pair(s) authorised to interpret the same evidence.`);
  if (takeawayViolations.length) console.error(`FAIL: ${takeawayViolations.length} sibling slot pair(s) required to reach the same management conclusion.`);
  console.error('Two slots given the same facts, or the same required conclusion, write the same sentence.');
  process.exit(1);
}
console.log('\nPASS: sibling slots own distinct analytical evidence and distinct management conclusions.');
