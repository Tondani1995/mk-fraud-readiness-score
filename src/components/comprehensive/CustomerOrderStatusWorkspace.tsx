'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { CustomerPaidOrderStatus } from '@/lib/commercial/customer-order-status';
import { getCustomerOrderStatusCopy } from './customer-order-status-copy';

function lifecycleLabel(value: string) {
  return value.replace(/_/g, ' ');
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

  async function refresh() {
    setRefreshing(true);
    try {
      const response = await fetch(`/score/api/assessments/${encodeURIComponent(assessmentReference)}/paid-order/status?token=${encodeURIComponent(snapshotToken)}&orderReference=${encodeURIComponent(order.orderReference)}`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.ok && body.order) setOrder(body.order);
    } finally {
      setRefreshing(false);
    }
  }

  const fulfilment = order.automatedFulfilment;
  const pdf = fulfilment?.customerAccessToken
    ? `/score/report/access/${encodeURIComponent(fulfilment.customerAccessToken)}`
    : null;
  const register = order.tier === 'comprehensive' && fulfilment?.customerAccessToken
    ? `${pdf}?artefact=register`
    : null;
  const copy = getCustomerOrderStatusCopy(order.tier === 'comprehensive' ? 'comprehensive' : 'essential');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Payment instructions</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-mk-muted">
          {order.eftInstructions ? <div className="grid gap-3 sm:grid-cols-2">
            <p><strong className="text-mk-ink">Bank:</strong> {order.eftInstructions.bankName}</p>
            <p><strong className="text-mk-ink">Account holder:</strong> {order.eftInstructions.accountHolder}</p>
            <p><strong className="text-mk-ink">Account number:</strong> {order.eftInstructions.accountNumber}</p>
            <p><strong className="text-mk-ink">Branch code:</strong> {order.eftInstructions.branchCode}</p>
            <p><strong className="text-mk-ink">Currency:</strong> {order.eftInstructions.currency}</p>
            {order.eftInstructions.accountType ? <p><strong className="text-mk-ink">Account type:</strong> {order.eftInstructions.accountType}</p> : null}
          </div> : <p className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-mk-danger">EFT instructions are not available for this order. Do not make payment; contact MK Fraud Insights.</p>}
          <p><strong className="text-mk-ink">Payment reference:</strong> {order.paymentReference}</p>
          {order.eftInstructions?.paymentReferenceInstruction ? <p>{order.eftInstructions.paymentReferenceInstruction}</p> : null}
          <p>{copy.paymentReleaseDescription}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{copy.assessmentTitle}</CardTitle>
          <p className="text-sm text-mk-muted">{order.productName} · {order.amountDisplay}</p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-mk-muted">
          <div className="grid gap-3 sm:grid-cols-2">
            <p><strong className="text-mk-ink">Order status:</strong> {lifecycleLabel(order.orderStatus)}</p>
            <p><strong className="text-mk-ink">Payment:</strong> {order.paymentVerified ? 'verified' : 'awaiting verification'}</p>
            <p><strong className="text-mk-ink">Assessment lifecycle:</strong> {fulfilment ? lifecycleLabel(fulfilment.state) : 'awaiting payment'}</p>
            <p><strong className="text-mk-ink">Report version:</strong> {fulfilment?.versionNumber ?? '—'}</p>
          </div>
          <p>{copy.assessmentDescription}</p>
          <button type="button" onClick={refresh} disabled={refreshing} className="rounded-xl border border-mk-line px-4 py-2 font-semibold text-mk-ink hover:border-mk-brass disabled:opacity-60">
            {refreshing ? 'Refreshing…' : 'Refresh status'}
          </button>
        </CardContent>
      </Card>

      {pdf && fulfilment?.deliverables.length ? <Card>
        <CardHeader><CardTitle>Report delivery</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <DownloadLink label={copy.pdfLabel} href={pdf} />
          {register ? <DownloadLink label={copy.registerLabel ?? 'Supporting register XLSX'} href={register} /> : null}
        </CardContent>
      </Card> : <Card>
        <CardHeader><CardTitle>Next step</CardTitle></CardHeader>
        <CardContent className="text-sm leading-6 text-mk-muted">{copy.nextStepDescription}</CardContent>
      </Card>}
    </div>
  );
}

function DownloadLink({ label, href }: { label: string; href: string }) {
  return <a className="rounded-xl border border-mk-line bg-mk-cream/40 px-4 py-4 text-sm font-semibold text-mk-ink hover:border-mk-brass" href={href} download>{label}</a>;
}
