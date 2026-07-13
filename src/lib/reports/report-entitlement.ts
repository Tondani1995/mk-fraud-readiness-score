import type { AssembledReportData } from './types';

export const ESSENTIAL_SELF_ASSESSMENT_PRODUCT_CODE = 'essential_self_assessment';
export const ESSENTIAL_SELF_ASSESSMENT_REPORT_TYPE = 'essential_self_assessment';
export const ESSENTIAL_SELF_ASSESSMENT_PRICE_CENTS = 500000;
export const ESSENTIAL_SELF_ASSESSMENT_CURRENCY = 'ZAR';
export const ESSENTIAL_SELF_ASSESSMENT_DELIVERY_MODE = 'mk_controlled_pdf';
export const PREMIUM_REPORT_ELIGIBLE_ORDER_STATUS = 'payment_received';

export type ReportEntitlementReason = 'order_not_eligible' | 'assessment_not_scored';

export class ReportEntitlementError extends Error {
  constructor(
    public readonly reason: ReportEntitlementReason,
    message: string
  ) {
    super(message);
    this.name = 'ReportEntitlementError';
  }
}

function reject(reason: ReportEntitlementReason, message: string): never {
  throw new ReportEntitlementError(reason, message);
}

function productMessage(productCode: string | null) {
  if (productCode === 'mk_validated_assessment') {
    return 'The R50,000 personalised engagement is not eligible for automatic premium report generation.';
  }
  if (!productCode || /free|snapshot/i.test(productCode)) {
    return 'Free products are not eligible for premium report generation.';
  }
  return `Product ${productCode} is not eligible for premium report generation.`;
}

export function validatePremiumReportGenerationEntitlement(
  assembled: AssembledReportData
): typeof ESSENTIAL_SELF_ASSESSMENT_REPORT_TYPE {
  if (!assembled?.scoreRun?.id || !assembled.scoreRun.assessmentId) {
    reject('assessment_not_scored', 'Premium report generation requires a completed assessment score run.');
  }

  if (assembled.productCode !== ESSENTIAL_SELF_ASSESSMENT_PRODUCT_CODE) {
    reject('order_not_eligible', productMessage(assembled.productCode));
  }

  if (assembled.orderStatus !== PREMIUM_REPORT_ELIGIBLE_ORDER_STATUS) {
    reject(
      'order_not_eligible',
      `Order has status "${assembled.orderStatus ?? 'unknown'}" and is not eligible for premium report generation.`
    );
  }

  if (assembled.amountCents !== ESSENTIAL_SELF_ASSESSMENT_PRICE_CENTS) {
    reject('order_not_eligible', 'Premium report generation is restricted to the paid R5,000 Essential Self-Assessment order.');
  }

  if (assembled.productPriceCents !== ESSENTIAL_SELF_ASSESSMENT_PRICE_CENTS) {
    reject('order_not_eligible', 'The selected product price does not match the R5,000 Essential Self-Assessment entitlement.');
  }

  if (assembled.currency !== ESSENTIAL_SELF_ASSESSMENT_CURRENCY || assembled.productCurrency !== ESSENTIAL_SELF_ASSESSMENT_CURRENCY) {
    reject('order_not_eligible', 'Premium report generation only supports the ZAR Essential Self-Assessment entitlement.');
  }

  if (assembled.requiresPaymentVerification !== true) {
    reject('order_not_eligible', 'Premium report generation requires manual payment verification before fulfilment.');
  }

  if (assembled.deliveryMode !== ESSENTIAL_SELF_ASSESSMENT_DELIVERY_MODE) {
    reject('order_not_eligible', 'The selected product delivery mode is not supported by premium report generation.');
  }

  if (assembled.productActive !== true) {
    reject('order_not_eligible', 'The selected product entitlement is not active.');
  }

  return ESSENTIAL_SELF_ASSESSMENT_REPORT_TYPE;
}
