'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import type { CustomerPaidOrderStatus } from '@/lib/commercial/customer-order-status';

const artefactLabels: Record<string, string> = {
  pdf: 'Comprehensive report PDF',
  register: 'Annotated register XLSX',
  board: 'Board readout PDF',
  presentation: 'Executive presentation',
  workshop: 'Workshop material'
};

function formatBytes(value: number) {
  if (value < 1024) return `${value} bytes`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
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
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch(`/score/api/assessments/${encodeURIComponent(assessmentReference)}/paid-order/status?token=${encodeURIComponent(snapshotToken)}&orderReference=${encodeURIComponent(order.orderReference)}`, { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.ok && body.order) setOrder(body.order);
  }

  const eft = order.eftInstructions;
  const comprehensive = order.tier === 'comprehensive' && order.engagement;
  return (
    <div className="space-y-6">
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
          {/*
            The reference the customer must type, always. This previously rendered
            the profile's instruction text *instead of* the reference, so a
            customer following the page had no reference to quote and MK had
            nothing to reconcile against. Show the reference, then the guidance.
          */}
          <p><strong className="text-mk-ink">Payment reference:</strong> {order.paymentReference}</p>
          {eft?.paymentReferenceInstruction ? <p className="text-mk-muted">{eft.paymentReferenceInstruction}</p> : null}
          <p>{eft?.customerInstruction ?? 'MK confirms payment manually before any deliverable is released.'}</p>
        </CardContent>
      </Card>

      {comprehensive ? <>
        {/*
          The reviewer, evidence-review and sign-off cards described the retired
          reviewed-engagement Comprehensive, which was migrated to an automated
          analytical product. Those cards promised human work, including an assigned
          person, an evidence review and a sign-off, that the product does not
          include.
          The released-package card below is the real deliverable and is gated on
          the access token, not on any review state, so it is unaffected.
        */}
        <Card>
          <CardHeader><CardTitle>Your report</CardTitle></CardHeader>
          <CardContent className="grid gap-4 text-sm leading-6 text-mk-muted sm:grid-cols-2">
            <p><strong className="text-mk-ink">Report:</strong> {comprehensive.releasedArtifacts.length ? 'Ready. Download below.' : 'Being prepared'}</p>
            <p><strong className="text-mk-ink">Delivery:</strong> Sent to the delivery email held for this order</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Independent validation</CardTitle></CardHeader>
          <CardContent className="text-sm leading-6 text-mk-muted">
            <p>This Comprehensive report is an automated analysis of the assessment your organisation completed. It does not independently validate evidence, test whether controls operate, or provide an assurance opinion.</p>
            <p className="mt-3">Independent evidence validation and specialist review are available separately through MK Advisory.</p>
          </CardContent>
        </Card>

        {comprehensive.customerAccessToken && comprehensive.releasedArtifacts.length ? <Card>
          <CardHeader><CardTitle>Released Comprehensive package</CardTitle></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <DownloadLink label={artefactLabels.pdf} href={`/score/report/access/${encodeURIComponent(String(comprehensive.customerAccessToken))}`} />
            {comprehensive.releasedArtifacts.map((artifact) => {
              const selector = artifact.artefactType === 'supporting_register' ? 'register' : artifact.artefactType === 'board_readout' ? 'board' : artifact.artefactType === 'executive_presentation' ? 'presentation' : 'workshop';
              return <DownloadLink key={artifact.artefactType} label={artefactLabels[selector] ?? artifact.fileName} href={`/score/report/access/${encodeURIComponent(String(comprehensive.customerAccessToken))}?artefact=${selector}`} />;
            })}
          </CardContent>
        </Card> : null}
      </> : <Card><CardHeader><CardTitle>Next step</CardTitle></CardHeader><CardContent className="text-sm leading-6 text-mk-muted">Once payment is confirmed, MK Fraud Insights prepares your report and sends it to the delivery email held for this order. We will be in touch if anything is needed from you.</CardContent></Card>}
    </div>
  );
}

function DownloadLink({ label, href }: { label: string; href: string }) {
  return <a className="rounded-xl border border-mk-line bg-mk-cream/40 px-4 py-4 text-sm font-semibold text-mk-ink hover:border-mk-brass" href={href} download>{label}</a>;
}
