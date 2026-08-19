import type { AssembledReportData } from './types';
import { evaluatePaymentVerificationEvidence } from '@/lib/payments/payment-verification';
import { validateOrderPriceEntitlement } from '@/lib/commercial/order-price-entitlement';
import {
  COMPREHENSIVE_PRODUCT_CODE,
  ESSENTIAL_PRODUCT_CODE,
  tierForProductCode
} from '@/lib/commercial/product-catalogue';

export const ESSENTIAL_SELF_ASSESSMENT_PRODUCT_CODE = ESSENTIAL_PRODUCT_CODE;
export const ESSENTIAL_SELF_ASSESSMENT_REPORT_TYPE = 'essential_self_assessment';
/**
 * The Comprehensive report type is the pre-existing `mk_validated`, not a new one.
 * It is the authoritative identifier already carried by report_templates, the reports
 * register, customer report access and the customer order status surfaces, and it is
 * internal only -- it is never shown to a customer, so it makes no assurance claim.
 */
export const COMPREHENSIVE_REPORT_TYPE = 'mk_validated';
export const ESSENTIAL_SELF_ASSESSMENT_CURRENCY = 'ZAR';
export const ESSENTIAL_SELF_ASSESSMENT_DELIVERY_MODE = 'mk_controlled_pdf';
export const PREMIUM_REPORT_ELIGIBLE_ORDER_STATUS = 'payment_received';

export type ReportEntitlementReason =
  | 'order_not_eligible'
  | 'order_not_verified'
  | 'relationship_mismatch'
  | 'assessment_not_scored'
  | 'score_run_not_locked'
  | 'score_run_input_hash_invalid'
  | 'score_run_incomplete'
  | 'order_price_not_entitled';

export class ReportEntitlementError extends Error {
  readonly reason: ReportEntitlementReason;

  // Explicit field + assignment, not TypeScript parameter-property shorthand -- see the matching
  // note on ReportCommercialQualityError (commercial-quality.ts) for why. Behaviourally identical
  // to the prior version.
  constructor(reason: ReportEntitlementReason, message: string) {
    super(message);
    this.name = 'ReportEntitlementError';
    this.reason = reason;
  }
}

function reject(reason: ReportEntitlementReason, message: string): never {
  throw new ReportEntitlementError(reason, message);
}

function productMessage(productCode: string | null) {
  if (!productCode || /free|snapshot/i.test(productCode)) {
    return 'Free products are not eligible for premium report generation.';
  }
  return `Product ${productCode} is not eligible for premium report generation.`;
}

/**
 * The paid tiers and the report each one is entitled to.
 *
 * Comprehensive used to be rejected here outright, on the basis that it was fulfilled
 * through a reviewer-led engagement. That model is retired: Comprehensive is an
 * automated analytical report with no reviewer, no evidence review, no sign-off and no
 * independent assurance. Rejecting it left a paid R35,000 order with no operator
 * fulfilment path at all.
 *
 * The entitlements never cross. The same assessment may carry both an Essential and a
 * Comprehensive order, and each is entitled only to its own report: a Comprehensive
 * purchase can never receive an Essential PDF, and an Essential purchase can never
 * invoke the Comprehensive pipeline.
 */
const TIER_ENTITLEMENTS = {
  essential: {
    productCode: ESSENTIAL_PRODUCT_CODE,
    reportType: ESSENTIAL_SELF_ASSESSMENT_REPORT_TYPE,
    deliveryMode: ESSENTIAL_SELF_ASSESSMENT_DELIVERY_MODE,
    priceLabel: 'Essential'
  },
  comprehensive: {
    productCode: COMPREHENSIVE_PRODUCT_CODE,
    reportType: COMPREHENSIVE_REPORT_TYPE,
    deliveryMode: ESSENTIAL_SELF_ASSESSMENT_DELIVERY_MODE,
    priceLabel: 'Comprehensive'
  }
} as const;

export type PremiumReportType =
  | typeof ESSENTIAL_SELF_ASSESSMENT_REPORT_TYPE
  | typeof COMPREHENSIVE_REPORT_TYPE;

export function validatePremiumReportGenerationEntitlement(
  assembled: AssembledReportData
): PremiumReportType {
  if (!assembled?.scoreRun?.id || !assembled.scoreRun.assessmentId) {
    reject('assessment_not_scored', 'Premium report generation requires a completed assessment score run.');
  }

  if (!assembled.paymentVerification.legacyOrderVerification) {
    const paymentVerification = evaluatePaymentVerificationEvidence(assembled.paymentVerification);
    if (!paymentVerification.valid) {
      reject('order_not_verified', `Premium report generation requires valid payment verification evidence (${paymentVerification.reason}).`);
    }
  }

  if (
    assembled.orderAssessmentId !== assembled.assessmentId
    || assembled.scoreRun.assessmentId !== assembled.assessmentId
  ) {
    reject('relationship_mismatch', 'Order, assessment and score-run relationships are inconsistent.');
  }

  if (assembled.currentScoreRunId !== assembled.scoreRun.id) {
    reject('assessment_not_scored', 'The selected score run is not the assessment current score run.');
  }

  if (assembled.scoreRun.status !== 'completed') {
    reject('assessment_not_scored', 'Premium report generation requires a completed score run.');
  }

  if (!assembled.scoreRun.lockedAt) {
    reject('score_run_not_locked', 'Premium report generation requires an immutable locked score run.');
  }

  if (!/^[0-9a-f]{64}$/.test(assembled.scoreRun.inputHash ?? '')) {
    reject('score_run_input_hash_invalid', 'Premium report generation requires a valid SHA-256 score input hash.');
  }

  if (
    assembled.expectedDomainResultCount <= 0
    || assembled.actualDomainResultCount !== assembled.expectedDomainResultCount
    || assembled.expectedQuestionTraceCount <= 0
    || assembled.actualQuestionTraceCount !== assembled.expectedQuestionTraceCount
  ) {
    reject('score_run_incomplete', 'Premium report generation requires complete domain results and question traces.');
  }

  // Resolve the tier from the product the customer actually paid for. Both the product
  // code and the catalogue tier must agree, so a mislabelled product cannot select a
  // pipeline it was not sold under.
  const tier = tierForProductCode(assembled.productCode);
  const entitlement = tier === 'essential' || tier === 'comprehensive' ? TIER_ENTITLEMENTS[tier] : null;
  if (!entitlement || assembled.productCode !== entitlement.productCode) {
    reject('order_not_eligible', productMessage(assembled.productCode));
  }

  // Payment verification above is the commercial authority. `under_review` is a valid
  // post-payment fulfilment/recovery state and must not revoke an already verified paid
  // entitlement after a generation failure. Unpaid, cancelled, refunded and other
  // workflow states remain blocked here.
  const paidWorkflowStatus = assembled.orderStatus === PREMIUM_REPORT_ELIGIBLE_ORDER_STATUS
    || assembled.orderStatus === 'under_review';
  if (!paidWorkflowStatus) {
    reject(
      'order_not_eligible',
      `Order has status "${assembled.orderStatus ?? 'unknown'}" and is not eligible for premium report generation.`
    );
  }

  // Price entitlement resolves against the price VERSION the order was sold under -- never against
  // the live catalogue price and never against a hard-coded amount. A legitimately paid R5,000
  // order created while R5,000 was the Essential price stays entitled after the R7,500 migration;
  // an order created at R5,000 AFTER the migration does not, because no version priced Essential at
  // R5,000 at that instant. There is no standing dual-price allowance.
  // Fail closed: without the product identity, the order's creation instant or the product's price
  // history there is no way to prove the amount was ever a legitimate price, so it is not entitled.
  if (!assembled.productId || !assembled.orderCreatedAt || !assembled.productPriceVersions?.length) {
    reject(
      'order_price_not_entitled',
      'Premium report generation requires the order product identity and its price-version history.'
    );
  }

  // The tier is resolved from the product code, but the price is proven against the
  // product id's price history. If those two ever disagree -- a mislabelled order, a
  // partially migrated row -- the order could be priced as one tier and fulfilled as
  // the other. Require the price history to belong to the order's own product before
  // trusting either.
  if (assembled.productPriceVersions.some((version) => version.productId !== assembled.productId)) {
    reject(
      'order_price_not_entitled',
      'The order product identity does not match its price history, so the entitled tier cannot be proven.'
    );
  }

  const priceEntitlement = validateOrderPriceEntitlement(
    {
      orderId: assembled.orderId,
      productId: assembled.productId,
      amountCents: assembled.amountCents,
      currency: assembled.currency,
      createdAt: assembled.orderCreatedAt,
      productPriceVersionId: assembled.productPriceVersionId ?? null
    },
    assembled.productPriceVersions
  );

  if (!priceEntitlement.valid) {
    reject(
      'order_price_not_entitled',
      `The order amount is not the ${entitlement.priceLabel} price that applied when the order was created (${priceEntitlement.reason}).`
    );
  }

  if (assembled.currency !== ESSENTIAL_SELF_ASSESSMENT_CURRENCY || assembled.productCurrency !== ESSENTIAL_SELF_ASSESSMENT_CURRENCY) {
    reject('order_not_eligible', 'Premium report generation only supports ZAR entitlements.');
  }

  if (assembled.requiresPaymentVerification !== true) {
    reject('order_not_eligible', 'Premium report generation requires manual payment verification before fulfilment.');
  }

  if (assembled.deliveryMode !== entitlement.deliveryMode) {
    reject('order_not_eligible', 'The selected product delivery mode is not supported by premium report generation.');
  }

  if (assembled.productActive !== true) {
    reject('order_not_eligible', 'The selected product entitlement is not active.');
  }

  return entitlement.reportType;
}
