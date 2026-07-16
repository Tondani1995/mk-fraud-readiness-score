'use client';

import { useEffect, useState } from 'react';

const labels: Record<string, { title: string; detail: string }> = {
  PAID: { title: 'Payment successful and verified', detail: 'Your payment was verified against the order. Fulfilment status is shown below.' },
  PAYMENT_PROCESSING: { title: 'Payment received and awaiting verification', detail: 'The provider has not yet supplied a final verified payment result.' },
  PAYMENT_FAILED: { title: 'Payment failed', detail: 'The provider reported that this payment did not complete.' },
  PAYMENT_REVIEW_REQUIRED: { title: 'Payment review required', detail: 'The payment details do not match the order exactly and require MK review.' },
  CANCELLED: { title: 'Payment cancelled', detail: 'No verified payment was recorded for this attempt.' },
  REFUNDED: { title: 'Payment refunded', detail: 'The verified payment was subsequently refunded or reversed.' },
  PAYMENT_PENDING: { title: 'Payment awaiting verification', detail: 'Returning from a payment page is not proof of payment. We are waiting for the verified server-side result.' }
};

export function PaymentReturnStatus({ orderReference }: { orderReference: string }) {
  const [state, setState] = useState('PAYMENT_PENDING');
  const [fulfilment, setFulfilment] = useState('NOT_REQUESTED');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function poll() {
      try {
        const response = await fetch(`/score/api/payments/${encodeURIComponent(orderReference)}/status`, { cache: 'no-store', signal: controller.signal });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.ok) { setError('Verified payment status is not available for this browser session.'); return; }
        setState(body.payment.state); setFulfilment(body.payment.fulfilment_trigger_result); setError(null);
        if (['PAYMENT_PENDING', 'PAYMENT_PROCESSING'].includes(body.payment.state)) timer = setTimeout(poll, 3000);
      } catch (pollError) {
        if (pollError instanceof DOMException && pollError.name === 'AbortError') return;
        setError('Verified payment status is temporarily unavailable. Please refresh to retry.');
      }
    }
    void poll();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [orderReference]);
  const content = labels[state] ?? labels.PAYMENT_PENDING;
  return (
    <div className="rounded-3xl border border-mk-line bg-white p-6 shadow-sm" aria-live="polite">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mk-brassDark">Verified payment state</p>
      <h1 className="mt-3 text-2xl font-semibold text-mk-ink">{content.title}</h1>
      <p className="mt-3 text-sm leading-6 text-mk-muted">{error ?? content.detail}</p>
      <p className="mt-4 text-xs text-mk-muted">Order {orderReference} · Fulfilment {fulfilment.replace(/_/g, ' ').toLowerCase()}</p>
    </div>
  );
}
