import type { FreeSnapshot, FreeSnapshotDomain } from '@/lib/snapshot/free-snapshot';
import { DOMAIN_CONTENT_BY_CODE } from '@/lib/snapshot/commercial-insights';

/**
 * The Snapshot gap inventory.
 *
 * This exists to tell a customer, honestly, that the assessment recorded a broader control
 * picture than the free Snapshot explains. It is NOT a paywall device: there is no lock, no
 * blur, no scarcity and no invented terminology.
 *
 * The scoring engine records exactly two weakness classifications, and only one of them exists
 * at domain level. A single control can satisfy both predicates when it is both critical and a
 * hard gate, so the run-level figures do not define a unique union:
 *
 *   critical-control gap   question.isCritical  && responseValue <= 2   -> run AND domain
 *   major gap              question.isHardGate  && responseValue <= 1   -> run ONLY
 *
 * `score_domain_results` has `critical_gap_count` and no major-gap column, so a major gap can
 * never be attributed to an area. Every number below is a direct read of a persisted field;
 * nothing is estimated, and the two classifications are never summed into a unique total when
 * both are present. The aggregate is therefore null whenever overlap is possible.
 */

/** Which copy variant the recorded data supports. Selection order is E, D, C, B, A. */
export type GapInventoryVariant = 'A' | 'B' | 'C' | 'D' | 'E';

export type GapInventoryRow = {
  domainCode: string;
  domainName: string;
  /** Critical-control gaps only. Never a combined or derived figure. */
  criticalGapCount: number;
};

export type GapInventory = {
  variant: GapInventoryVariant;
  /** Run-level critical-control gap count. Null in variant E, where no total is supportable. */
  criticalGapCount: number | null;
  /** Run-level major gap count. Null in variant E. */
  majorGapCount: number | null;
  /** A unique total only where one classification is zero; null where overlap is possible. */
  totalWeaknessCount: number | null;
  /** Applicable, scored areas. Null in variant E. */
  applicableAreaCount: number | null;
  /** Per-area rows. Empty unless the variant is A or B. */
  rows: GapInventoryRow[];
  /** Whether the per-area table may render at all. */
  showsAreaTable: boolean;
  /** Whether the definition sentence carries the major-gap attribution note (variant A only). */
  includesMajorGapNote: boolean;
};

export type FalseComfortPairing = {
  strongestDomainName: string;
  weakestDomainName: string;
};

/** Curated area name where one exists, else the persisted domain name. Matches priority-signal naming. */
function areaName(domain: FreeSnapshotDomain) {
  return DOMAIN_CONTENT_BY_CODE[domain.domainCode]?.name ?? domain.domainName ?? 'Readiness area';
}

/** Applicable, scored areas. Identical predicate to commercial-insights' scoredDomains. */
function scoredDomains(snapshot: FreeSnapshot) {
  return snapshot.domains.filter((domain) => domain.rawScore !== null && domain.coveragePct > 0);
}

function inventoryRows(snapshot: FreeSnapshot): GapInventoryRow[] {
  return snapshot.domains
    .map((domain, index) => ({ domain, index }))
    .filter(({ domain }) => domain.criticalGapCount > 0)
    .sort((a, b) => {
      const gapDelta = b.domain.criticalGapCount - a.domain.criticalGapCount;
      if (gapDelta) return gapDelta;
      const weightDelta = b.domain.weightPct - a.domain.weightPct;
      if (weightDelta) return weightDelta;
      return a.index - b.index;
    })
    .map(({ domain }) => ({
      domainCode: domain.domainCode,
      domainName: areaName(domain),
      criticalGapCount: domain.criticalGapCount
    }));
}

export function buildGapInventory(snapshot: FreeSnapshot): GapInventory {
  // Variant E first. An unreliable base cannot produce a reliable count, so no total is stated
  // at all -- stating one would be exactly the overstatement this module exists to prevent.
  if (snapshot.resultStatus === 'INSUFFICIENT_VISIBILITY') {
    return {
      variant: 'E',
      criticalGapCount: null,
      majorGapCount: null,
      totalWeaknessCount: null,
      applicableAreaCount: null,
      rows: [],
      showsAreaTable: false,
      includesMajorGapNote: false
    };
  }

  const critical = snapshot.criticalGapCount;
  const major = snapshot.majorGapCount;
  const areas = scoredDomains(snapshot).length;

  const variant: GapInventoryVariant = critical === 0 && major === 0
    ? 'D'
    : critical === 0
      ? 'C'
      : major === 0
        ? 'B'
        : 'A';

  // The table renders only where per-area attribution is genuinely available, which means at
  // least one recorded critical-control gap. Variant C has weaknesses but no attributable ones.
  const showsAreaTable = variant === 'A' || variant === 'B';

  // With both classifications present, the persisted aggregates cannot tell us whether any
  // control was counted twice. Do not manufacture a unique total from their sum.
  const totalWeaknessCount = critical === 0 || major === 0 ? critical + major : null;

  return {
    variant,
    criticalGapCount: critical,
    majorGapCount: major,
    totalWeaknessCount,
    applicableAreaCount: areas,
    rows: showsAreaTable ? inventoryRows(snapshot) : [],
    showsAreaTable,
    includesMajorGapNote: variant === 'A'
  };
}

/**
 * The false-comfort observation.
 *
 * Renders only when a genuinely strong area and a genuinely weak area both exist with enough
 * separation to be worth remarking on. There is deliberately no fallback copy: a manufactured
 * pairing would be the kind of claim this specification excludes.
 *
 * "Against" describes the score relationship. No claim is made that the two controls interact
 * operationally -- the model records no adjacency.
 */
export function buildFalseComfortPairing(snapshot: FreeSnapshot): FalseComfortPairing | null {
  if (snapshot.resultStatus === 'INSUFFICIENT_VISIBILITY') return null;

  const strongest = snapshot.domains
    .filter((d) => d.rawScore !== null && d.rawScore >= 70 && d.coveragePct >= 70 && d.criticalGapCount === 0)
    .sort((a, b) => Number(b.rawScore) - Number(a.rawScore))[0];

  const weakest = snapshot.domains
    .filter((d) => d.rawScore !== null && d.rawScore < 45 && d.coveragePct >= 70)
    .sort((a, b) => Number(a.rawScore) - Number(b.rawScore))[0];

  if (!strongest || !weakest) return null;
  if (strongest.domainId === weakest.domainId) return null;
  if (Number(strongest.rawScore) - Number(weakest.rawScore) < 25) return null;

  return {
    strongestDomainName: areaName(strongest),
    weakestDomainName: areaName(weakest)
  };
}
