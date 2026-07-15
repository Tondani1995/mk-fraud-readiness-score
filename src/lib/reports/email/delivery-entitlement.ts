import {
  ESSENTIAL_SELF_ASSESSMENT_CURRENCY,
  ESSENTIAL_SELF_ASSESSMENT_DELIVERY_MODE,
  ESSENTIAL_SELF_ASSESSMENT_PRICE_CENTS,
  ESSENTIAL_SELF_ASSESSMENT_PRODUCT_CODE,
  ESSENTIAL_SELF_ASSESSMENT_REPORT_TYPE,
  PREMIUM_REPORT_ELIGIBLE_ORDER_STATUS
} from '../report-entitlement';

export type PremiumReportDeliveryEntitlement = {
  reportType: string;
  reportStatus: string;
  isCurrentReport: boolean;
  storageBucket: string | null;
  storagePath: string | null;
  checksum: string | null;
  productCode: string | null;
  productActive: boolean;
  productPriceCents: number | null;
  productCurrency: string | null;
  requiresPaymentVerification: boolean;
  deliveryMode: string | null;
  orderStatus: string;
  orderAmountCents: number | null;
  orderCurrency: string | null;
  verifiedAt: string | null;
  verifiedBy: string | null;
  orderAssessmentId: string;
  reportAssessmentId: string;
  scoreAssessmentId: string;
  currentScoreRunId: string;
  reportScoreRunId: string;
  scoreStatus: string;
  scoreLockedAt: string | null;
  scoreInputHash: string | null;
  customerRecipient: string | null;
  recipient: string | null;
  allowNonProductionTestOverride: boolean;
};

export class ReportDeliveryEntitlementError extends Error {
  constructor(public readonly reason: string, message: string) {
    super(message);
    this.name = 'ReportDeliveryEntitlementError';
  }
}

function assertEntitled(condition: unknown, reason: string, message: string): asserts condition {
  if (!condition) throw new ReportDeliveryEntitlementError(reason, message);
}

export function validatePremiumReportDeliveryEntitlement(input: PremiumReportDeliveryEntitlement) {
  assertEntitled(input.reportType === ESSENTIAL_SELF_ASSESSMENT_REPORT_TYPE, 'report_type_ineligible', 'Only Essential Self-Assessment reports can be delivered.');
  assertEntitled(input.productCode === ESSENTIAL_SELF_ASSESSMENT_PRODUCT_CODE, 'product_ineligible', 'The report is not linked to the Essential Self-Assessment product.');
  assertEntitled(input.orderAmountCents === ESSENTIAL_SELF_ASSESSMENT_PRICE_CENTS && input.productPriceCents === ESSENTIAL_SELF_ASSESSMENT_PRICE_CENTS, 'price_mismatch', 'The paid order and product must both be R5,000.');
  assertEntitled(input.orderCurrency === ESSENTIAL_SELF_ASSESSMENT_CURRENCY && input.productCurrency === ESSENTIAL_SELF_ASSESSMENT_CURRENCY, 'currency_mismatch', 'The paid order and product must both be ZAR.');
  assertEntitled(input.orderStatus === PREMIUM_REPORT_ELIGIBLE_ORDER_STATUS, 'order_not_paid', 'The order is not payment received.');
  assertEntitled(input.verifiedAt && input.verifiedBy, 'manual_verification_missing', 'Manual payment verification evidence is incomplete.');
  assertEntitled(input.productActive && input.requiresPaymentVerification && input.deliveryMode === ESSENTIAL_SELF_ASSESSMENT_DELIVERY_MODE, 'product_policy_mismatch', 'The active manual-verification delivery policy is not satisfied.');
  assertEntitled(input.orderAssessmentId === input.reportAssessmentId && input.scoreAssessmentId === input.reportAssessmentId, 'relationship_mismatch', 'Order, report and score run do not belong to the same assessment.');
  assertEntitled(input.currentScoreRunId === input.reportScoreRunId, 'stale_score_run', 'The report does not use the assessment current score run.');
  assertEntitled(input.scoreStatus === 'completed' && input.scoreLockedAt, 'score_not_final', 'The report score run is not completed and locked.');
  assertEntitled(/^[0-9a-f]{64}$/.test(input.scoreInputHash ?? ''), 'score_hash_invalid', 'The report score run input hash is invalid.');
  assertEntitled(input.isCurrentReport && !['draft', 'superseded', 'voided'].includes(input.reportStatus), 'report_not_current', 'The report is voided, superseded or not current.');
  assertEntitled(input.storageBucket && input.storagePath && /^[0-9a-f]{64}$/.test(input.checksum ?? ''), 'storage_metadata_invalid', 'The report storage metadata or checksum is invalid.');
  assertEntitled(input.customerRecipient && input.recipient, 'recipient_missing', 'A valid order customer recipient is required.');
  assertEntitled(
    input.recipient === input.customerRecipient || input.allowNonProductionTestOverride,
    'recipient_override_forbidden',
    'Recipient overrides are disabled for this delivery.'
  );
  return true;
}
