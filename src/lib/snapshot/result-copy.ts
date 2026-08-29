import type { FreeSnapshot } from '@/lib/snapshot/free-snapshot';
import type { GapInventory } from '@/lib/snapshot/gap-inventory';

/**
 * Customer-facing Snapshot strings, in one place.
 *
 * Centralised so the approved copy is testable rather than scattered through JSX, and so the
 * scoring vocabulary can be asserted: the engine records "critical-control gaps" and "major
 * gaps". A control can belong to both classifications, so the two counts are never summed into
 * a unique customer-facing total. No other classification may label a count.
 */

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return count === 1 ? singular : pluralForm;
}

function roundPct(value: number) {
  return Math.round(value);
}

/** The line beneath the score. First match wins. */
export function tensionLine(snapshot: FreeSnapshot): string {
  if (snapshot.overallScore === null) {
    return 'Not issued — the assessment did not provide enough visibility to place a position.';
  }
  if (snapshot.capApplied) {
    const calculated = snapshot.calculatedMaturity;
    return calculated
      ? `Calculated as ${calculated}, capped at ${snapshot.finalMaturity} by a critical-control gap.`
      : `Capped at ${Math.round(snapshot.overallScore)} by a critical-control gap.`;
  }
  if (snapshot.criticalGapCount > 0) {
    return `${snapshot.criticalGapCount} critical-control ${plural(snapshot.criticalGapCount, 'gap')} and ${snapshot.majorGapCount} major ${plural(snapshot.majorGapCount, 'gap')} recorded.`;
  }
  if (snapshot.majorGapCount > 0) {
    return `${snapshot.majorGapCount} major ${plural(snapshot.majorGapCount, 'gap')} recorded. No critical-control gap.`;
  }
  return 'No critical-control or major gap recorded.';
}

/** Heading for the interpretation section. First match wins. */
export function meaningHeading(snapshot: FreeSnapshot): string {
  if (snapshot.resultStatus === 'INSUFFICIENT_VISIBILITY') {
    return 'Too much of this assessment is unconfirmed to read as a position.';
  }
  if (snapshot.capApplied) return 'One weakness is holding your result down.';
  if (snapshot.criticalGapCount >= 3) {
    return `${snapshot.criticalGapCount} controls that should hold on their own are not holding.`;
  }
  if (snapshot.criticalGapCount > 0) return 'A control that should hold on its own is not holding.';
  return 'Your score is a starting position, not a verdict.';
}

/** The fairness statement, placed beside the figures it protects. */
export function fairnessLine(snapshot: FreeSnapshot): string {
  return snapshot.adaptiveMetrics
    ? 'Unknown responses are excluded from your score. They are recorded as uncertainty, not as a control that failed.'
    : 'Not-applicable responses are excluded from your score, so they neither inflate nor reduce it. They reduce the evidence available for interpretation.';
}

/** The totals sentence for the coverage section. One string per inventory variant. */
export function inventoryBody(inventory: GapInventory): string {
  const areas = inventory.applicableAreaCount ?? 0;
  const critical = inventory.criticalGapCount ?? 0;
  const major = inventory.majorGapCount ?? 0;

  switch (inventory.variant) {
    case 'E':
      return 'Too much of this assessment is unconfirmed to report a reliable count of control weaknesses. Unknown responses are recorded as uncertainty, not as controls that failed. The detailed analysis sets out what was assessed, where the information gaps are, and what evidence would close them.';
    case 'D':
      return `Your assessment recorded no critical-control or major gap across the ${areas} ${plural(areas, 'area')} that applied to your organisation. At this level the question changes from whether controls exist to whether they operate consistently, are evidenced, and would hold as the business changes. The detailed analysis examines that directly.`;
    case 'C':
      return `Your assessment recorded ${major} major ${plural(major, 'gap')} across the ${areas} ${plural(areas, 'area')} that applied to your organisation, and no critical-control gap. This Snapshot highlights the signals that matter first. The detailed analysis explains each gap, its implications, and what management should do next.`;
    case 'B':
      return `Your assessment recorded ${critical} critical-control ${plural(critical, 'gap')} across the ${areas} ${plural(areas, 'area')} that applied to your organisation. This Snapshot highlights the signals that matter first. The detailed analysis explains each one, why it exists, and what management should do next.`;
    case 'A':
    default:
      return `Your assessment recorded ${critical} critical-control ${plural(critical, 'gap')} and ${major} major ${plural(major, 'gap')} across the ${areas} ${plural(areas, 'area')} that applied to your organisation. This Snapshot highlights the signals that matter first. The detailed analysis explains the remaining weaknesses, their implications, and what management should do next.`;
  }
}

/**
 * The definition sentence beneath the per-area table.
 *
 * Showing the customer what the term means is the credibility device. It is what makes the
 * inventory transparent rather than a concealment pattern, so it is not optional.
 */
export function inventoryDefinition(inventory: GapInventory): string {
  const base = 'A critical control is one the methodology expects to hold on its own. A gap is recorded where it scored 2 or below out of 5.';
  return inventory.includesMajorGapNote
    ? `${base} Major gaps are counted across the assessment as a whole and are not attributed to an individual area.`
    : base;
}

export const INVENTORY_HEADING = 'This Snapshot shows you where to look. The detailed analysis explains why, and what to do.';
export const INVENTORY_TABLE_LABEL = 'Critical-control gaps by area';

/** Fact-strip cells. Two paths, because the adaptive and legacy runs persist different metrics. */
export function factStrip(snapshot: FreeSnapshot, areaCount: number): Array<{ label: string; value: string }> {
  if (snapshot.adaptiveMetrics) {
    return [
      { label: 'Assessment coverage', value: `${roundPct(snapshot.adaptiveMetrics.assessmentCoveragePct)}%` },
      { label: 'Control visibility', value: `${roundPct(snapshot.adaptiveMetrics.controlVisibilityPct)}%` },
      { label: 'Unknown responses', value: `${roundPct(snapshot.adaptiveMetrics.unknownSharePct)}%` },
      { label: 'Areas assessed', value: String(areaCount) }
    ];
  }
  return [
    { label: 'Coverage', value: `${roundPct(snapshot.coveragePct)}%` },
    { label: 'Not applicable', value: `${roundPct(snapshot.nARatePct)}%` },
    { label: 'Critical-control gaps', value: String(snapshot.criticalGapCount) },
    { label: 'Areas assessed', value: String(areaCount) }
  ];
}

export const MATURITY_BANDS = ['Reactive', 'Developing', 'Structured', 'Strategic'] as const;

/**
 * Band labels for the narrow gauge scale.
 *
 * Written out rather than machine-truncated: slicing to six characters produced
 * "REACTI DEVELO STRUCT STRATE", which reads as a rendering fault.
 */
export const MATURITY_BAND_SHORT: Record<(typeof MATURITY_BANDS)[number], string> = {
  Reactive: 'React.',
  Developing: 'Devel.',
  Structured: 'Struct.',
  Strategic: 'Strat.'
};

export const ASSURANCE_BOUNDARY = 'Essential and Comprehensive are analytical products prepared from what you reported. Advisory is where MK works with you directly — investigating, designing, implementing or strengthening the environment alongside your team, including the evidence examination and independent review the analytical reports do not provide.';

export const ORDER_RELEASE_NOTE = 'Your report is prepared once payment is confirmed. No report is generated or released against an unconfirmed order.';

export const WHAT_HAPPENS_NEXT = [
  'You pay by EFT using your order reference.',
  'MK confirms the payment.',
  'MK prepares your report from your recorded assessment result.',
  'We email you a private link to your report.'
] as const;

export const PRICE_DIFFERENCE_LEAD = 'Why the difference.';
export const PRICE_DIFFERENCE_NOTE = 'Essential tells you what to fix. Comprehensive designs what you fix it with — every priority control specified to the level a team can build from, with the governance and measurement to run it afterwards. Essential is a diagnosis. Comprehensive is a diagnosis and a blueprint.';

export const METHODOLOGY_DISCLOSURE = [
  'This is a self-assessment. Your readiness score is calculated by a controlled, deterministic methodology from the answers you submitted. It is not recalculated when you open this page, and ordering or paying for a report does not change it.',
  'Both detailed reports are prepared from your recorded assessment result. They analyse what you reported. They do not independently validate evidence, test whether your controls operate, or provide an assurance opinion. That work is available through MK Advisory.',
  'Your information is used only for this assessment and any service you request. This result link is private — anyone holding it can open this page, so share it deliberately.'
] as const;
