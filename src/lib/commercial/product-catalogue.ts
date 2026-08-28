/**
 * Authoritative commercial product catalogue for the joint Essential + Comprehensive launch.
 *
 * This module is the ONE place in the codebase that is allowed to state a price. Server code,
 * routes, migrations verification and tests all read from here; nothing else may carry a price
 * literal. The separation the catalogue deliberately preserves:
 *
 *   - `productCode`  - the internal machine identity. Stable, never shown to a customer, and never
 *                      changed once orders reference it (see the Comprehensive note below).
 *   - `label`        - the customer-facing name. Free to change without touching any contract.
 *   - `priceCents`   - the CURRENT catalogue price. It is NOT an entitlement input on its own.
 *   - order snapshot - `orders.amount_cents`, immutable per order, plus the price VERSION the order
 *                      was created against (see order-price-entitlement.ts). A catalogue price
 *                      change mints a new version and can never invalidate an older legitimate
 *                      order.
 *
 * Advisory is intentionally present as a tier but carries no product code and no platform
 * entitlement: it is manually scoped consulting and is not orderable through this system.
 */

export const COMMERCIAL_TIERS = ['free', 'essential', 'comprehensive', 'advisory'] as const;
export type CommercialTier = (typeof COMMERCIAL_TIERS)[number];

/** Internal machine identity of a product row in public.products. */
export type CommercialProductCode = 'free_snapshot' | 'essential_self_assessment' | 'mk_validated_assessment';

export type CommercialFulfilmentModel =
  /** No paid entitlement; rendered immediately from the score run. */
  | 'instant_snapshot'
  /** Self-service diagnostic: an MK-controlled PDF prepared from the persisted assessment. */
  | 'automated_diagnostic'
  /**
   * Automated in-depth analysis: MK-controlled PDF plus supporting registers.
   * Deeper than the diagnostic, and equally unreviewed — no evidence is
   * validated and no assurance opinion is given.
   */
  | 'automated_analytical'
  /** Manually scoped consulting; no platform fulfilment path at all. */
  | 'manually_scoped';

type OrderableProduct = {
  tier: Exclude<CommercialTier, 'advisory'>;
  productCode: CommercialProductCode;
  label: string;
  /** Current catalogue price in cents. Historical entitlement resolves through a price version. */
  priceCents: number;
  currency: 'ZAR';
  vatInclusive: boolean;
  paid: boolean;
  /** Whether a customer can create this order themselves through the platform. */
  selfServiceOrderable: boolean;
  requiresPaymentVerification: boolean;
  fulfilmentModel: CommercialFulfilmentModel;
  /** public.products.delivery_mode for this product. */
  deliveryMode: string;
  summary: string;
  includes: readonly string[];
};

type AdvisoryProduct = {
  tier: 'advisory';
  productCode: null;
  label: string;
  priceCents: null;
  /** Presentation-only floor. Never an entitlement or order amount. */
  priceFromCents: number;
  currency: 'ZAR';
  vatInclusive: false;
  paid: true;
  selfServiceOrderable: false;
  requiresPaymentVerification: false;
  fulfilmentModel: 'manually_scoped';
  deliveryMode: null;
  summary: string;
  includes: readonly string[];
};

export type CommercialProduct = OrderableProduct | AdvisoryProduct;

export const FREE_SNAPSHOT_PRODUCT_CODE = 'free_snapshot' as const;
export const ESSENTIAL_PRODUCT_CODE = 'essential_self_assessment' as const;

/**
 * Comprehensive keeps the pre-existing `mk_validated_assessment` product code deliberately.
 *
 * Evidence for migrating in place rather than minting a new code (read-only queries against both
 * Supabase environments on 2026-08-10, recorded in
 * docs/v1/joint-launch/comprehensive-product-code-decision.md):
 *   - Production  jvjxlphdyzerrhwcgkup: 0 orders reference this product.
 *   - Staging     authorized project: 0 orders reference this product.
 * With no order anywhere referencing it there is no historical order snapshot to preserve, so
 * repricing the existing row is strictly safer than leaving a live, active R50,000 product row
 * behind while a second Comprehensive row is introduced. The row already carries
 * requires_payment_verification = true and delivery_mode = 'mk_led_validated_engagement', both of
 * which are correct for Comprehensive. Only the customer-facing label and the price change.
 */
export const COMPREHENSIVE_PRODUCT_CODE = 'mk_validated_assessment' as const;

export const ESSENTIAL_PRICE_CENTS = 750_000;
export const COMPREHENSIVE_PRICE_CENTS = 3_500_000;
export const ADVISORY_PRICE_FROM_CENTS = 15_000_000;
export const COMMERCIAL_CURRENCY = 'ZAR' as const;

/**
 * The Essential price that applied before the joint launch. Present only so the price-version
 * contract can describe the superseded window; it is never a current, orderable price and never a
 * standalone entitlement allowance.
 */
export const ESSENTIAL_SUPERSEDED_PRICE_CENTS = 500_000;

const FREE: OrderableProduct = {
  tier: 'free',
  productCode: FREE_SNAPSHOT_PRODUCT_CODE,
  label: 'Free',
  priceCents: 0,
  currency: COMMERCIAL_CURRENCY,
  vatInclusive: true,
  paid: false,
  selfServiceOrderable: true,
  requiresPaymentVerification: false,
  fulfilmentModel: 'instant_snapshot',
  deliveryMode: 'instant_snapshot',
  summary: 'Immediate on-screen fraud readiness snapshot from the submitted assessment.',
  includes: [
    'Overall readiness score and maturity position',
    'Executive interpretation',
    'Priority-area preview'
  ]
};

const ESSENTIAL: OrderableProduct = {
  tier: 'essential',
  productCode: ESSENTIAL_PRODUCT_CODE,
  label: 'Essential',
  priceCents: ESSENTIAL_PRICE_CENTS,
  currency: COMMERCIAL_CURRENCY,
  vatInclusive: true,
  paid: true,
  selfServiceOrderable: true,
  requiresPaymentVerification: true,
  fulfilmentModel: 'automated_diagnostic',
  deliveryMode: 'mk_controlled_pdf',
  summary: 'Self-service fraud readiness diagnostic, delivered as a professionally prepared PDF report.',
  includes: [
    'Detailed analysis across all applicable domains',
    'Critical weaknesses and false-comfort risks',
    'Prioritised management actions and a 30/60/90-day roadmap',
    'Embedded proof and evidence requirements for prioritised actions',
    'Professionally prepared PDF report'
  ]
};

/**
 * Comprehensive is an automated analytical product.
 *
 * It was previously defined as a reviewed engagement — evidence intake, named
 * reviewer validation and reviewer sign-off before delivery. That definition was
 * pre-launch implementation and was never sold: the joint-launch catalogue
 * migration records zero orders against this product code in both Production and
 * Staging. The definition is migrated in place to the approved product rather
 * than superseded by a second SKU.
 *
 * Everything the old definition promised — independent validation of evidence,
 * reviewer observations, sign-off — is Advisory work and is priced there.
 * Comprehensive analyses the assessment; it does not verify anything.
 */
const COMPREHENSIVE: OrderableProduct = {
  tier: 'comprehensive',
  productCode: COMPREHENSIVE_PRODUCT_CODE,
  label: 'Comprehensive',
  priceCents: COMPREHENSIVE_PRICE_CENTS,
  currency: COMMERCIAL_CURRENCY,
  vatInclusive: true,
  paid: true,
  selfServiceOrderable: true,
  requiresPaymentVerification: true,
  fulfilmentModel: 'automated_analytical',
  deliveryMode: 'mk_controlled_pdf',
  summary: 'Automated in-depth fraud readiness analysis, delivered as a PDF report with its supporting registers. No evidence is independently validated and no assurance opinion is provided.',
  includes: [
    'Everything in Essential',
    'Full material finding register with fraud mechanism and management implication',
    'Fraud exposure and risk register with treatment direction and ownership',
    'Target-state control blueprint per priority control: objective, population, frequency, proof and failure response',
    'Evidence requirements: what management should hold for each control, and what an acceptable example looks like',
    'Leadership decision library with options, trade-offs and accountable owners',
    'Implementation programme through 12 months, with dependencies and proof of completion',
    'Target operating model, governance rhythm and management scorecard'
  ]
};

const ADVISORY: AdvisoryProduct = {
  tier: 'advisory',
  productCode: null,
  label: 'Advisory',
  priceCents: null,
  priceFromCents: ADVISORY_PRICE_FROM_CENTS,
  currency: COMMERCIAL_CURRENCY,
  vatInclusive: false,
  paid: true,
  selfServiceOrderable: false,
  requiresPaymentVerification: false,
  fulfilmentModel: 'manually_scoped',
  deliveryMode: null,
  summary: 'Manually scoped fraud advisory consulting. Scoped and contracted directly with MK Fraud Insights.',
  includes: ['Scope, deliverables and commercials agreed per engagement']
};

export const COMMERCIAL_CATALOGUE: Readonly<Record<CommercialTier, CommercialProduct>> = Object.freeze({
  free: FREE,
  essential: ESSENTIAL,
  comprehensive: COMPREHENSIVE,
  advisory: ADVISORY
});

export function productForTier(tier: CommercialTier): CommercialProduct {
  return COMMERCIAL_CATALOGUE[tier];
}

/** Tiers a customer can order for themselves through the paid entitlement system. */
export const SELF_SERVICE_PAID_TIERS = ['essential', 'comprehensive'] as const;
export type SelfServicePaidTier = (typeof SELF_SERVICE_PAID_TIERS)[number];

export function isSelfServicePaidTier(value: unknown): value is SelfServicePaidTier {
  return typeof value === 'string' && (SELF_SERVICE_PAID_TIERS as readonly string[]).includes(value);
}

/** The paid product a customer chose, or null when the value is not a self-service paid tier. */
export function paidProductForTier(tier: unknown): OrderableProduct | null {
  if (!isSelfServicePaidTier(tier)) return null;
  return COMMERCIAL_CATALOGUE[tier] as OrderableProduct;
}

const TIER_BY_PRODUCT_CODE: Readonly<Record<CommercialProductCode, CommercialTier>> = Object.freeze({
  [FREE_SNAPSHOT_PRODUCT_CODE]: 'free',
  [ESSENTIAL_PRODUCT_CODE]: 'essential',
  [COMPREHENSIVE_PRODUCT_CODE]: 'comprehensive'
});

export function tierForProductCode(productCode: string | null | undefined): CommercialTier | null {
  if (!productCode) return null;
  return TIER_BY_PRODUCT_CODE[productCode as CommercialProductCode] ?? null;
}

/**
 * Presentation payload for the customer-facing catalogue surface. Advisory is included so the
 * customer sees the full ladder, but it is explicitly marked non-orderable so no UI can route it
 * into order creation.
 */
export type CatalogueListing = {
  tier: CommercialTier;
  label: string;
  summary: string;
  includes: readonly string[];
  paid: boolean;
  selfServiceOrderable: boolean;
  currency: 'ZAR';
  vatInclusive: boolean;
  priceCents: number | null;
  priceFromCents: number | null;
  fulfilmentModel: CommercialFulfilmentModel;
};

export function listCatalogue(): CatalogueListing[] {
  return COMMERCIAL_TIERS.map((tier) => {
    const product = COMMERCIAL_CATALOGUE[tier];
    return {
      tier,
      label: product.label,
      summary: product.summary,
      includes: product.includes,
      paid: product.paid,
      selfServiceOrderable: product.selfServiceOrderable,
      currency: product.currency,
      vatInclusive: product.vatInclusive,
      priceCents: product.priceCents,
      priceFromCents: product.tier === 'advisory' ? product.priceFromCents : null,
      fulfilmentModel: product.fulfilmentModel
    };
  });
}

export function formatZarAmount(amountCents: number, currency: string = COMMERCIAL_CURRENCY) {
  const amount = amountCents / 100;
  return `${currency} ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
