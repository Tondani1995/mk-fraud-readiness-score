import type { PaymentSource } from './types';

export type PaymentVerificationEvidence = {
  paymentState: string | null;
  confirmationSource: PaymentSource | null;
  actorReference: string | null;
  providerTransactionReference: string | null;
  providerEventReference: string | null;
  providerEventAt: string | null;
  verificationResult: string | null;
  processingResult: string | null;
  paymentEventId: string | null;
  amountCents: number | null;
  orderAmountCents: number | null;
  currency: string | null;
  orderCurrency: string | null;
  orderVerifiedAt: string | null;
  orderVerifiedBy: string | null;
  manualVerifierStatus: string | null;
  manualVerifierRole: string | null;
  priorValidSourceEvent: boolean;
  transitionCount: number;
  /** Only true for the isolated pre-0024 compatibility schema, where transition events do not exist. */
  legacyOrderVerification?: boolean;
};

export type PaymentVerificationResult = {
  valid: boolean;
  reason:
    | 'missing_payment_event'
    | 'payment_not_paid'
    | 'payment_event_not_applied'
    | 'payment_amount_mismatch'
    | 'payment_currency_mismatch'
    | 'payment_transition_count_invalid'
    | 'manual_verification_invalid'
    | 'manual_verifier_invalid'
    | 'stitch_verification_invalid'
    | 'system_recovery_unverified';
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function result(valid: boolean, reason: PaymentVerificationResult['reason']): PaymentVerificationResult {
  return { valid, reason };
}

function hasCommonValidEvidence(evidence: PaymentVerificationEvidence): PaymentVerificationResult | null {
  if (!evidence.paymentEventId) return result(false, 'missing_payment_event');
  if (evidence.paymentState !== 'PAID') return result(false, 'payment_not_paid');
  if (evidence.processingResult !== 'applied') return result(false, 'payment_event_not_applied');
  if (evidence.confirmationSource === 'system_recovery'
    ? evidence.transitionCount < 2
    : evidence.transitionCount !== 1) {
    return result(false, 'payment_transition_count_invalid');
  }
  if (evidence.amountCents === null || evidence.amountCents !== evidence.orderAmountCents) {
    return result(false, 'payment_amount_mismatch');
  }
  if (String(evidence.currency ?? '').toUpperCase() !== String(evidence.orderCurrency ?? '').toUpperCase()) {
    return result(false, 'payment_currency_mismatch');
  }
  return null;
}

/** Validates one source event without granting system-recovery semantics. */
export function isValidPaymentSourceEvent(evidence: PaymentVerificationEvidence) {
  const common = hasCommonValidEvidence(evidence);
  if (common) return common.valid;

  if (evidence.confirmationSource === 'manual_admin') {
    return evidence.verificationResult === 'authorised_manual_confirmation'
      && Boolean(evidence.orderVerifiedAt)
      && Boolean(evidence.orderVerifiedBy)
      && UUID.test(evidence.actorReference ?? '')
      && evidence.orderVerifiedBy?.toLowerCase() === evidence.actorReference?.toLowerCase()
      && evidence.manualVerifierStatus === 'active'
      && ['platform_admin', 'finance_admin'].includes(evidence.manualVerifierRole ?? '');
  }

  if (evidence.confirmationSource === 'stitch_webhook') {
    return evidence.verificationResult === 'svix_signature_valid'
      && Boolean(evidence.providerTransactionReference?.trim())
      && Boolean(evidence.providerEventReference?.trim())
      && Boolean(evidence.providerEventAt)
      && Boolean(evidence.orderVerifiedAt);
  }

  return false;
}

export function evaluatePaymentVerificationEvidence(
  evidence: PaymentVerificationEvidence
): PaymentVerificationResult {
  const common = hasCommonValidEvidence(evidence);
  if (common) return common;

  if (evidence.confirmationSource === 'manual_admin') {
    if (evidence.verificationResult !== 'authorised_manual_confirmation'
      || !evidence.orderVerifiedAt
      || !evidence.orderVerifiedBy
      || !UUID.test(evidence.actorReference ?? '')
      || evidence.orderVerifiedBy.toLowerCase() !== evidence.actorReference?.toLowerCase()) {
      return result(false, 'manual_verification_invalid');
    }
    if (evidence.manualVerifierStatus !== 'active'
      || !['platform_admin', 'finance_admin'].includes(evidence.manualVerifierRole ?? '')) {
      return result(false, 'manual_verifier_invalid');
    }
    return result(true, 'missing_payment_event');
  }

  if (evidence.confirmationSource === 'stitch_webhook') {
    return isValidPaymentSourceEvent(evidence)
      ? result(true, 'missing_payment_event')
      : result(false, 'stitch_verification_invalid');
  }

  if (evidence.confirmationSource === 'system_recovery') {
    return evidence.verificationResult === 'system_recovery_reconciled' && evidence.priorValidSourceEvent
      ? result(true, 'missing_payment_event')
      : result(false, 'system_recovery_unverified');
  }

  return result(false, 'missing_payment_event');
}
