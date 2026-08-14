/**
 * Evidence support for positive capability claims.
 *
 * A report may say an organisation has a foundation, a strength, or something
 * worth preserving only when the assessment supports it. CASE-01 scored 0.00 on
 * all ten domains and the report still told management the assessment "shows
 * foundations in Fraud Leadership and Governance, Fraud Risk Identification and
 * Operational Fraud Controls". Nothing in the assessment supported that. The
 * framing had been generalised from a customer whose profile did contain a
 * genuine strength.
 *
 * The thresholds here are not invented for this module. They are the product's
 * own maturity bands from `src/lib/scoring/scoring-engine.ts`:
 *
 *   Reactive   < 40      Developing 40-59     Structured 60-79     Strategic >= 80
 *
 * A capability that has not left the Reactive band is not a foundation, whatever
 * the overall score is. Equally, a low overall score does not disqualify a
 * genuinely strong domain: an organisation at 35.55 overall with reporting
 * culture at 73.57 does have something to build on, and the report should say so.
 */

/** The floor at which a capability stops being Reactive and becomes something to build on. */
export const FOUNDATION_SCORE_FLOOR = 40;

export type PositiveAssertionClass =
  | 'FOUNDATION'
  | 'RELATIVE_STRENGTH'
  | 'ESTABLISHED_CAPABILITY'
  | 'NOT_STARTING_FROM_ZERO'
  | 'PRESERVE'
  | 'BUILD_ON';

export interface DomainLike { factRef: string; code?: string; name?: string; score?: number | null }

export interface EvidenceSupport {
  /** Domains that have left the Reactive band, strongest first. */
  foundations: DomainLike[];
  /** Highest and lowest assessed domain, and the spread between them. */
  strongest?: DomainLike;
  weakest?: DomainLike;
  spread: number;
  /** True where the profile is uniform, so no domain is relatively stronger than another. */
  flat: boolean;
  supported: Record<PositiveAssertionClass, boolean>;
}

function ranked(domains: DomainLike[]): DomainLike[] {
  return domains.filter((domain) => typeof domain.score === 'number').sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

export function evidenceSupport(domains: DomainLike[]): EvidenceSupport {
  const order = ranked(domains);
  const strongest = order[0];
  const weakest = order[order.length - 1];
  const spread = order.length ? Number(((strongest?.score ?? 0) - (weakest?.score ?? 0)).toFixed(2)) : 0;
  const foundations = order.filter((domain) => (domain.score ?? 0) >= FOUNDATION_SCORE_FLOOR);
  const flat = order.length > 1 && spread === 0;

  // A relative strength needs two things: real separation in the profile, and a
  // capability that is genuinely established rather than merely least weak.
  // Without the second test a domain at 20 in a profile of zeros would be
  // presented to management as a strength.
  const relativeStrength = !flat && spread > 0 && (strongest?.score ?? 0) >= FOUNDATION_SCORE_FLOOR;

  return {
    foundations,
    strongest,
    weakest,
    spread,
    flat,
    supported: {
      FOUNDATION: foundations.length > 0,
      RELATIVE_STRENGTH: relativeStrength,
      ESTABLISHED_CAPABILITY: foundations.length > 0,
      NOT_STARTING_FROM_ZERO: foundations.length > 0,
      PRESERVE: foundations.length > 0,
      BUILD_ON: foundations.length > 0
    }
  };
}

/**
 * Language for the opening position, conditioned on what the assessment shows.
 *
 * Three distinct states, because they are three genuinely different management
 * situations and the report must not blur them.
 */
export function positionAssertion(domains: DomainLike[]): { purpose: string; takeaway: string; assertion: PositiveAssertionClass | 'NO_ESTABLISHED_CAPABILITY' } {
  const support = evidenceSupport(domains);
  if (!support.supported.FOUNDATION) {
    return {
      assertion: 'NO_ESTABLISHED_CAPABILITY',
      // The instruction matters as much as the takeaway. Telling the writer to
      // "name the strongest relevant foundation" on an all-zero profile is what
      // produced the claim that foundations existed.
      purpose: 'State the assessed position plainly. The assessment shows no established capability in any domain, so do not name a foundation, a strength or anything already working.',
      takeaway: 'The assessment does not yet show an established capability in any domain, so the position is a starting point for building fraud control rather than for strengthening it.'
    };
  }
  if (support.flat) {
    return {
      assertion: 'ESTABLISHED_CAPABILITY',
      purpose: 'State the assessed position and the consistent capability level behind it. Every domain is assessed at the same level, so do not present any one capability as stronger or weaker than another.',
      takeaway: 'The assessment shows a consistent capability level across every domain, so the management question is how to hold that level rather than which capability to prioritise.'
    };
  }
  return {
    assertion: 'NOT_STARTING_FROM_ZERO',
    purpose: 'Lead with the management judgement the score and maturity support, naming the strongest established capability and the materially weaker ones.',
    takeaway: 'The assessed position is a starting point for management attention, not a zero-base condition: established capability exists in part of the profile and the weaker capabilities need to be connected to it.'
  };
}
