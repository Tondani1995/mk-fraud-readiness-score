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
  cases.push({ caseId, order, mode: pack.narrativeMode, sharedContextRefs: [...shared], chapters });
}

const summary = {
  limit: MAX_OWNED_OVERLAP,
  cases: cases.length,
  violations: violations.length,
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
console.log(JSON.stringify(summary, null, 2));

if (process.env.OVERLAP_REPORT_ONLY) process.exit(0);
if (violations.length) {
  console.error(`\nFAIL: ${violations.length} sibling section pair(s) are authorised to interpret the same evidence.`);
  console.error('Two sections briefed on the same facts write the same sentence. Give each section distinct analytical ownership.');
  process.exit(1);
}
console.log('\nPASS: sibling sections own distinct analytical evidence.');
