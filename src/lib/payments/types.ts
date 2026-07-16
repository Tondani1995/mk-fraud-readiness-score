export type PaymentState =
  | 'PAYMENT_PENDING'
  | 'PAYMENT_PROCESSING'
  | 'PAID'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_REVIEW_REQUIRED'
  | 'REFUNDED'
  | 'CANCELLED';

export type PaymentSource = 'manual_admin' | 'stitch_webhook' | 'system_recovery';

export type NormalisedPaymentEvent = {
  eventId: string;
  orderReference: string;
  transactionReference: string | null;
  amountCents: number | null;
  currency: string | null;
  outcome: 'completed' | 'processing' | 'failed' | 'cancelled' | 'refunded' | 'review';
  occurredAt: string;
  verificationResult: string;
  safeNote: string;
  payloadSha256?: string;
};

export type PaymentTransitionResult = {
  ok: boolean;
  duplicate: boolean;
  state: PaymentState;
  eventId?: string;
  fulfilment: 'not_requested' | 'phase1_unavailable' | 'queued' | 'already_active' | 'already_fulfilled' | 'failed';
  message: string;
  technicalReference: string;
};
