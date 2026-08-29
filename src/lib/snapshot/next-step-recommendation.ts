import type { FreeSnapshot } from '@/lib/snapshot/free-snapshot';
import { commercialScoreBand, type CommercialScoreBand } from '@/lib/snapshot/commercial-insights';
import type { SelfServicePaidTier } from '@/lib/commercial/product-catalogue';

/**
 * The deterministic next-step recommendation.
 *
 * A pure function of persisted score-run fields. No model call, no randomisation, no
 * experiment assignment. Rules are evaluated in order, first match wins, and exactly one
 * rule always matches.
 *
 * Two contractual properties the UI depends on:
 *   - the reason is ALWAYS rendered in full beside the recommendation; and
 *   - every number appearing in a reason also appears elsewhere on the page, so the
 *     recommendation never introduces a figure the customer cannot check.
 *
 * INSUFFICIENT_VISIBILITY never resolves to a paid analytical report. Recommending one on a
 * result whose own status says the visibility is insufficient would contradict the page the
 * customer is reading. Both products stay orderable regardless.
 */

export type NextStepRuleId = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'C8';

/** `null` means "no paid tier is recommended" -- rule C1's "Speak to MK first". */
export type NextStepRecommendation = {
  ruleId: NextStepRuleId;
  recommendedTier: SelfServicePaidTier | null;
  /** True only for C1, where the primary action is a conversation rather than an order. */
  speakToMkFirst: boolean;
  /** Rendered in full, always. Never truncated, never behind a disclosure. */
  reason: string;
  /** Mandatory closing clause. The customer is never funnelled. */
  freedomClause: string;
};

const FREEDOM_CLAUSE = 'You can choose either.';
const FREEDOM_CLAUSE_C1 = 'You can still order either report.';

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return count === 1 ? singular : pluralForm;
}

type RecommendationInputs = {
  resultStatus: FreeSnapshot['resultStatus'];
  band: CommercialScoreBand;
  criticalGapCount: number;
  majorGapCount: number;
  capApplied: boolean;
  /** Areas carrying at least one critical-control gap. */
  gapAreas: number;
  /** Applicable, scored areas. */
  areas: number;
  /** Unknown share of applicable control weight (adaptive), else the not-applicable rate. */
  unknownShare: number;
};

/** Every input is a direct read; nothing here is estimated or inferred. */
export function buildRecommendationInputs(snapshot: FreeSnapshot): RecommendationInputs {
  const scored = snapshot.domains.filter((d) => d.rawScore !== null && d.coveragePct > 0);
  const band = snapshot.finalMaturity ?? commercialScoreBand(snapshot.overallScore);
  return {
    resultStatus: snapshot.resultStatus ?? null,
    band: band as CommercialScoreBand,
    criticalGapCount: snapshot.criticalGapCount,
    majorGapCount: snapshot.majorGapCount,
    capApplied: snapshot.capApplied,
    gapAreas: snapshot.domains.filter((d) => d.criticalGapCount > 0).length,
    areas: scored.length,
    unknownShare: snapshot.adaptiveMetrics
      ? Number(snapshot.adaptiveMetrics.unknownSharePct ?? 0)
      : snapshot.nARatePct
  };
}

export function buildNextStepRecommendation(snapshot: FreeSnapshot): NextStepRecommendation {
  const input = buildRecommendationInputs(snapshot);
  const { band, criticalGapCount, majorGapCount, capApplied, gapAreas, areas, unknownShare } = input;

  // C1 -- insufficient visibility. Declines to recommend a paid report.
  if (input.resultStatus === 'INSUFFICIENT_VISIBILITY') {
    return {
      ruleId: 'C1',
      recommendedTier: null,
      speakToMkFirst: true,
      reason: 'Too much of your assessment is unconfirmed for us to suggest a report level honestly. A short conversation with MK is the better next step — we can tell you what would close the gaps and whether a report is worth ordering yet.',
      freedomClause: FREEDOM_CLAUSE_C1
    };
  }

  // C2 -- a capped result, or critical-control gaps at a spread that reads as structural.
  if (capApplied || criticalGapCount >= 3) {
    const capClause = capApplied ? ', and one of them capped your result' : '';
    return {
      ruleId: 'C2',
      recommendedTier: 'comprehensive',
      speakToMkFirst: false,
      reason: `Your assessment records ${criticalGapCount} critical-control ${plural(criticalGapCount, 'gap')} across ${gapAreas} ${plural(gapAreas, 'area')}${capClause}. Where weaknesses are structural rather than isolated, the useful question is usually not which item to fix first but what the control environment should look like.`,
      freedomClause: FREEDOM_CLAUSE
    };
  }

  // C3 -- Reactive across a wide applicable scope.
  if (band === 'Reactive' && areas >= 6) {
    return {
      ruleId: 'C3',
      recommendedTier: 'comprehensive',
      speakToMkFirst: false,
      reason: `Your result sits in the Reactive band across ${areas} applicable areas. At that breadth, isolated fixes tend not to hold — target-state design is what closes the position.`,
      freedomClause: FREEDOM_CLAUSE
    };
  }

  // C4 -- critical-control gaps, but concentrated.
  if (criticalGapCount >= 1 && gapAreas <= 3) {
    return {
      ruleId: 'C4',
      recommendedTier: 'essential',
      speakToMkFirst: false,
      reason: `Your critical-control gaps are concentrated in ${gapAreas} ${plural(gapAreas, 'area')}. Essential diagnoses those and sets the order of work.`,
      freedomClause: FREEDOM_CLAUSE
    };
  }

  // C5 -- no critical-control gap at an already-established position.
  if (criticalGapCount === 0 && (band === 'Structured' || band === 'Strategic')) {
    return {
      ruleId: 'C5',
      recommendedTier: 'essential',
      speakToMkFirst: false,
      reason: `No critical-control gap is recorded and your position is already ${band}. The open question is consistency and evidence, which Essential addresses directly.`,
      freedomClause: FREEDOM_CLAUSE
    };
  }

  // C6 -- a Developing position carrying a heavy major-gap load.
  if (band === 'Developing' && majorGapCount >= 4) {
    return {
      ruleId: 'C6',
      recommendedTier: 'comprehensive',
      speakToMkFirst: false,
      reason: `Your result records ${majorGapCount} major gaps at a Developing maturity. That pattern is usually structural, and target-state design is what closes it.`,
      freedomClause: FREEDOM_CLAUSE
    };
  }

  // C7 -- material uncertainty short of the insufficient-visibility threshold.
  if (unknownShare > 25) {
    return {
      ruleId: 'C7',
      recommendedTier: 'essential',
      speakToMkFirst: false,
      reason: `${Math.round(unknownShare)}% of your applicable control weight is unconfirmed. Essential works from what was recorded and identifies where confirmation is needed before deeper design would be worthwhile.`,
      freedomClause: FREEDOM_CLAUSE
    };
  }

  // C8 -- default.
  return {
    ruleId: 'C8',
    recommendedTier: 'essential',
    speakToMkFirst: false,
    reason: 'Essential is the usual starting point from a result like yours: it diagnoses the position and sets the order of work.',
    freedomClause: FREEDOM_CLAUSE
  };
}
