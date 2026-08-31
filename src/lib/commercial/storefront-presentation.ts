/**
 * Presentation model for the public Fraud Readiness storefront.
 *
 * Every price, label and deliverable list is READ from product-catalogue.ts at render time. This
 * module holds only the editorial framing the catalogue has no opinion about — who a tier is for,
 * and what a buyer is left with. Nothing here may restate a price: a duplicated literal is how a
 * storefront and a checkout end up disagreeing about what something costs.
 *
 * The claims are bounded to what the automated products actually do. Essential and Comprehensive
 * analyse a self-reported assessment; they do not verify evidence, test whether controls operate,
 * or provide assurance. That distinction is Advisory's, and it is stated as Advisory's.
 */

import {
  COMMERCIAL_CATALOGUE,
  type CommercialTier
} from '@/lib/commercial/product-catalogue';

export type StorefrontTier = Extract<CommercialTier, 'essential' | 'comprehensive' | 'advisory'>;

export const STOREFRONT_TIERS: readonly StorefrontTier[] = ['essential', 'comprehensive', 'advisory'];

export type StorefrontCard = {
  tier: StorefrontTier;
  label: string;
  priceLabel: string;
  forWho: string;
  outcome: string;
  includes: readonly string[];
  ctaLabel: string;
  ctaHref: string;
  /** Advisory is scoped and contracted with MK; nothing on this page may order it. */
  selfServiceOrderable: boolean;
};

const ZAR = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0
});

/** The single formatter for every price on the storefront. */
export function storefrontPriceLabel(tier: StorefrontTier): string {
  const product = COMMERCIAL_CATALOGUE[tier];
  if (product.tier === 'advisory') return `From ${ZAR.format(product.priceFromCents / 100)} excl. VAT`;
  if (product.priceCents === null) return '';
  return `${ZAR.format(product.priceCents / 100)} incl. VAT`;
}

const EDITORIAL: Record<StorefrontTier, { forWho: string; outcome: string; ctaLabel: string; ctaHref: string }> = {
  essential: {
    forWho: 'A management team that needs a clear, defensible read on where fraud readiness stands today.',
    outcome: 'A prioritised view of the weaknesses that matter and the actions to take first.',
    ctaLabel: 'Start Essential assessment',
    ctaHref: '/score/start?product=essential'
  },
  comprehensive: {
    forWho: 'An organisation that has decided to rebuild or materially strengthen its fraud-control environment.',
    outcome: 'A designed target state — controls, evidence expectations, owners and a build sequence through 12 months.',
    ctaLabel: 'Start Comprehensive assessment',
    ctaHref: '/score/start?product=comprehensive'
  },
  advisory: {
    forWho: 'An organisation that needs MK to do the work with them, not prepare an analysis for them.',
    outcome: 'A scope agreed with MK, with deliverables, timing and fees set for the engagement.',
    ctaLabel: 'Discuss an Advisory engagement',
    ctaHref: '/contact?enquiry=mk-advisory'
  }
};

/** Deliverables shown on the card. Kept to the decisive few; the catalogue holds the full list. */
const HEADLINE_INCLUDES: Record<StorefrontTier, number> = {
  essential: 5,
  comprehensive: 5,
  advisory: 1
};

export function storefrontCard(tier: StorefrontTier): StorefrontCard {
  const product = COMMERCIAL_CATALOGUE[tier];
  const editorial = EDITORIAL[tier];
  return {
    tier,
    label: product.label,
    priceLabel: storefrontPriceLabel(tier),
    forWho: editorial.forWho,
    outcome: editorial.outcome,
    includes: product.includes.slice(0, HEADLINE_INCLUDES[tier]),
    ctaLabel: editorial.ctaLabel,
    ctaHref: editorial.ctaHref,
    selfServiceOrderable: product.selfServiceOrderable
  };
}

export function storefrontCards(): StorefrontCard[] {
  return STOREFRONT_TIERS.map(storefrontCard);
}

/**
 * The progression a decision-maker is choosing between. Each row states what changes between the
 * tiers — it is a depth ladder, not a feature checklist, and it does not claim validation,
 * independent review or assurance for the two automated tiers.
 */
export const STOREFRONT_COMPARISON: ReadonlyArray<{
  dimension: string;
  essential: string;
  comprehensive: string;
  advisory: string;
}> = Object.freeze([
  {
    dimension: 'What you are buying',
    essential: 'A diagnosis of the current position',
    comprehensive: 'A diagnosis plus the designed target state',
    advisory: 'MK working on the problem with you'
  },
  {
    dimension: 'Depth of analysis',
    essential: 'All applicable fraud-risk areas, with priority actions',
    comprehensive: 'Adds finding and exposure registers, control-level design and evidence expectations',
    advisory: 'Defined by the agreed scope'
  },
  {
    dimension: 'Planning horizon',
    essential: '30/60/90-day management actions',
    comprehensive: 'A 12-month implementation programme with dependencies and owners',
    advisory: 'Set with you for the engagement'
  },
  {
    dimension: 'Basis of the analysis',
    essential: 'Your self-reported assessment responses',
    comprehensive: 'Your self-reported assessment responses',
    advisory: 'Whatever the agreed scope requires MK to examine'
  },
  {
    dimension: 'Evidence and assurance',
    essential: 'MK does not check your answers or give an assurance opinion',
    comprehensive: 'MK does not check your answers or give an assurance opinion',
    advisory: 'Available where the engagement is scoped and contracted for it'
  },
  {
    dimension: 'How you buy it',
    essential: 'Complete the assessment, then confirm from your Snapshot',
    comprehensive: 'Complete the assessment, then confirm from your Snapshot',
    advisory: 'Scoped and contracted directly with MK'
  }
]);
