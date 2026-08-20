'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { CustomerPaidOrderStatus } from '@/lib/commercial/customer-order-status';

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
  const register = fulfilment?.customerAccessToken
    ? `${pdf}?artefact=register`
    : null;

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
          <p>Payment is verified before the automated analytical package is released.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{order.tier === 'comprehensive' ? 'Comprehensive automated assessment' : 'Automated assessment'}</CardTitle>
          <p className="text-sm text-mk-muted">{order.productName} · {order.amountDisplay}</p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-mk-muted">
          <div className="grid gap-3 sm:grid-cols-2">
            <p><strong className="text-mk-ink">Order status:</strong> {lifecycleLabel(order.orderStatus)}</p>
            <p><strong className="text-mk-ink">Payment:</strong> {order.paymentVerified ? 'verified' : 'awaiting verification'}</p>
            <p><strong className="text-mk-ink">Assessment lifecycle:</strong> {fulfilment ? lifecycleLabel(fulfilment.state) : 'awaiting payment'}</p>
            <p><strong className="text-mk-ink">Report version:</strong> {fulfilment?.versionNumber ?? '—'}</p>
          </div>
          <p>This is an automated analytical assessment of the self-assessment information provided. It does not independently validate evidence, test operating effectiveness, or provide an assurance opinion.</p>
          <button type="button" onClick={refresh} disabled={refreshing} className="rounded-xl border border-mk-line px-4 py-2 font-semibold text-mk-ink hover:border-mk-brass disabled:opacity-60">
            {refreshing ? 'Refreshing…' : 'Refresh status'}
          </button>
        </CardContent>
      </Card>

      {pdf && fulfilment?.deliverables.length ? <Card>
        <CardHeader><CardTitle>Secure delivery</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <DownloadLink label="Comprehensive report PDF" href={pdf} />
          {register ? <DownloadLink label="Comprehensive supporting register XLSX" href={register} /> : null}
        </CardContent>
      </Card> : <Card>
        <CardHeader><CardTitle>Next step</CardTitle></CardHeader>
        <CardContent className="text-sm leading-6 text-mk-muted">Once payment is verified, MK Fraud Insights generates the PDF and supporting register, verifies both private files, and makes them available through the secure delivery link.</CardContent>
      </Card>}
    </div>
  );
}

function DownloadLink({ label, href }: { label: string; href: string }) {
  return <a className="rounded-xl border border-mk-line bg-mk-cream/40 px-4 py-4 text-sm font-semibold text-mk-ink hover:border-mk-brass" href={href} download>{label}</a>;
}
