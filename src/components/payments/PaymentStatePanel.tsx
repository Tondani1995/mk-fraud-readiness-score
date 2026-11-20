export const PAYMENT_STATE_LABELS: Record<
  string,
  { title: string; detail: string }
> = {
  PAID: {
    title: "Payment successful and verified",
    detail:
      "Your payment was verified against the order. Fulfilment status is shown below.",
  },
  PAYMENT_PROCESSING: {
    title: "Payment received and awaiting verification",
    detail:
      "The provider has not yet supplied a final verified payment result.",
  },
  PAYMENT_FAILED: {
    title: "Payment failed",
    detail: "The provider reported that this payment did not complete.",
  },
  PAYMENT_REVIEW_REQUIRED: {
    title: "Payment review required",
    detail:
      "The payment details do not match the order exactly and require MK review.",
  },
  CANCELLED: {
    title: "Payment cancelled",
    detail: "No verified payment was recorded for this attempt.",
  },
  REFUNDED: {
    title: "Payment refunded",
    detail: "The verified payment was subsequently refunded or reversed.",
  },
  PAYMENT_PENDING: {
    title: "Payment awaiting verification",
    detail:
      "Returning from a payment page is not proof of payment. We are waiting for the verified server-side result.",
  },
};

/** Presentation only. The caller supplies verified server state or a labelled isolated fixture. */
export function PaymentStatePanel({
  state,
  fulfilment,
  error,
  orderReference,
}: {
  state: string;
  fulfilment: string;
  error?: string | null;
  orderReference: string;
}) {
  const content =
    PAYMENT_STATE_LABELS[state] ?? PAYMENT_STATE_LABELS.PAYMENT_PENDING;
  return (
    <div
      data-payment-state={state}
      className="clarity-payment rounded-brand border border-mk-line bg-white p-6 shadow-soft"
      aria-live="polite"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-mk-brassDark">
        Verified payment state
      </p>
      <h1 className="mt-3 text-2xl font-semibold text-mk-ink">
        {content.title}
      </h1>
      <p className="mt-3 text-sm leading-6 text-mk-muted">
        {error ?? content.detail}
      </p>
      <p className="mt-4 text-xs text-mk-muted">
        Order {orderReference} · Fulfilment{" "}
        {fulfilment.replace(/_/g, " ").toLowerCase()}
      </p>
    </div>
  );
}
