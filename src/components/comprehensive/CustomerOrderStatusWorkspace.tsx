'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { getPostPurchaseCopy } from '@/lib/commercial/post-purchase-copy';
import { productForTier, type SelfServicePaidTier } from '@/lib/commercial/product-catalogue';
import type { CustomerPaidOrderStatus } from '@/lib/commercial/customer-order-status';

function customerStatus(order: CustomerPaidOrderStatus) {
  return order.paymentVerified ? 'Payment confirmed by MK' : 'Awaiting manual payment confirmation';
}
export function CustomerOrderStatusWorkspace({
  assessmentReference,
  snapshotToken,
  initialOrder
}: {
  assessmentReference: string;
  snapshotToken: string;
  initialOrder: CustomerPaidOrderStatus;
}) {
  const [order, setOrder] = useState(initialOrder);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    setRefreshMessage(null);
    try {
      const response = await fetch(`/score/api/assessments/${encodeURIComponent(assessmentReference)}/paid-order/status?token=${encodeURIComponent(snapshotToken)}&orderReference=${encodeURIComponent(order.orderReference)}`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.ok && body.order) setOrder(body.order);
      else setRefreshMessage('The order status could not be refreshed.');
    } catch {
      setRefreshMessage('The order status could not be refreshed.');
    } finally {
      setRefreshing(false);
    }
  }

  const tier: SelfServicePaidTier = order.tier === 'comprehensive' ? 'comprehensive' : 'essential';
  const copy = getPostPurchaseCopy(tier);
  const product = productForTier(tier);
  const eft = order.eftInstructions;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>{copy.productLabel}</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-mk-muted">
          <div className="grid gap-3 sm:grid-cols-2">
            <p><strong className="text-mk-ink">Order reference:</strong> {order.orderReference}</p>
            <p><strong className="text-mk-ink">Catalogue price:</strong> {order.amountDisplay}</p>
            <p><strong className="text-mk-ink">Payment status:</strong> {customerStatus(order)}</p>
            <p><strong className="text-mk-ink">VAT invoice requested:</strong> {order.invoiceRequested ? 'Yes' : 'No'}</p>
          </div>
          <p>{copy.paymentSummary}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Payment instructions</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-mk-muted">
          {eft ? <div className="grid gap-3 sm:grid-cols-2">
            <p><strong className="text-mk-ink">Bank:</strong> {eft.bankName}</p>
            <p><strong className="text-mk-ink">Account holder:</strong> {eft.accountHolder}</p>
            <p><strong className="text-mk-ink">Account number:</strong> {eft.accountNumber}</p>
            <p><strong className="text-mk-ink">Branch code:</strong> {eft.branchCode}</p>
            <p><strong className="text-mk-ink">Currency:</strong> {eft.currency}</p>
            {eft.accountType ? <p><strong className="text-mk-ink">Account type:</strong> {eft.accountType}</p> : null}
          </div> : <p className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-mk-danger">EFT instructions are not available for this order. Do not make payment; contact MK Fraud Insights.</p>}
          <p><strong className="text-mk-ink">Payment reference:</strong> {order.paymentReference}</p>
          {eft?.paymentReferenceInstruction ? <p>{eft.paymentReferenceInstruction}</p> : null}
          <p>{eft?.customerInstruction ?? copy.paymentSummary}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>What happens next</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-mk-muted">
          <ol className="grid gap-4">
            {copy.nextSteps.map((step, index) => (
              <li key={step} className="border-t border-mk-accent/40 pt-3">
                <span className="text-[10px] font-semibold tabular-nums tracking-[0.16em] text-mk-accent">{String(index + 1).padStart(2, '0')}</span>
                <p className="mt-1.5">{step}</p>
              </li>
            ))}
          </ol>
          <p className="font-semibold text-mk-ink">{copy.deliverableSummary}</p>
          {tier === 'comprehensive' ? (
            <div>
              <p className="font-semibold text-mk-ink">Comprehensive package includes</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {product.includes.filter((item) => item !== 'Everything in Essential').map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void refresh()} disabled={refreshing} className="inline-flex min-h-12 items-center justify-center rounded-xl border-2 border-mk-accent/25 px-5 py-3 text-[13px] font-semibold text-mk-navy transition hover:border-mk-accent/50 disabled:opacity-60">
          {refreshing ? 'Refreshing…' : 'Refresh order status'}
        </button>
        {refreshMessage ? <p role="status" className="text-sm text-mk-danger">{refreshMessage}</p> : null}
      </div>
    </div>
  );
}
