import type { MaturityBand } from '../types/domain';

/**
 * The single authoritative maturity scale for MK Fraud Readiness.
 *
 * Before this module the product carried three incompatible definitions, and a
 * customer could read two different maturity labels for the same number on one
 * page:
 *
 *   scoring-engine / adaptive-scoring / snapshot   40 / 60 / 80   (authoritative)
 *   select-content-blocks / report-template        40 / 65 / 80   (right names, wrong middle boundary)
 *   essential/presentation-model                   Initial 0-20, Reactive 20-45,
 *                                                  Developing 45-65, Defined 65-85,
 *                                                  Managed 85-100
 *
 * CASE-08 printed overall maturity "Structured" for 60 while labelling every
 * 60.00 domain "Developing". CASE-11 printed "Strategic" for 100 while labelling
 * every 100 domain "Managed".
 *
 * The four names below are the product contract: `MaturityBand` in
 * `src/lib/types/domain.ts` and `src/lib/reports/types.ts` admits exactly these,
 * the scoring engine's maturity caps operate on them, and the Free Snapshot uses
 * them. `Initial`, `Defined` and `Managed` existed only in the Essential
 * presentation layer and in fixture data, never in the product contract.
 *
 * Every customer-facing maturity label — overall or per domain — must come from
 * here. Add no local copies.
 */
export const MATURITY_BAND_THRESHOLDS: ReadonlyArray<{ label: MaturityBand; min: number; max: number }> = [
  { label: 'Reactive', min: 0, max: 40 },
  { label: 'Developing', min: 40, max: 60 },
  { label: 'Structured', min: 60, max: 80 },
  { label: 'Strategic', min: 80, max: Number.POSITIVE_INFINITY }
];

/**
 * The maturity band for a score on the 0..100 readiness scale.
 *
 * Boundaries are inclusive of the lower bound: 40 is Developing, 60 is
 * Structured, 80 is Strategic. Scores outside 0..100 clamp to the nearest band
 * rather than falling through, so a defect upstream cannot silently produce an
 * unlabelled row.
 */
export function getMaturityBand(score: number): MaturityBand {
  if (!Number.isFinite(score)) return 'Reactive';
  if (score < 40) return 'Reactive';
  if (score < 60) return 'Developing';
  if (score < 80) return 'Structured';
  return 'Strategic';
}

/** Ordering for comparisons and caps. Higher is more mature. */
export const MATURITY_RANK: Readonly<Record<MaturityBand, number>> = {
  Reactive: 0,
  Developing: 1,
  Structured: 2,
  Strategic: 3
};
