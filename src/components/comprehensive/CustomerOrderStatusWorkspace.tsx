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
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState('');
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const response = await fetch(`/score/api/assessments/${encodeURIComponent(assessmentReference)}/paid-order/status?token=${encodeURIComponent(snapshotToken)}&orderReference=${encodeURIComponent(order.orderReference)}`, { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.ok && body.order) setOrder(body.order);
  }

  async function uploadEvidence() {
    if (!file) {
      setError('Choose one evidence file before uploading.');
      return;
    }
    setUploading(true);
    setMessage(null);
    setError(null);
    const form = new FormData();
    form.set('snapshotToken', snapshotToken);
    form.set('file', file);
    if (label.trim()) form.set('evidenceLabel', label.trim());
    const response = await fetch(`/score/api/assessments/${encodeURIComponent(assessmentReference)}/comprehensive-evidence`, { method: 'POST', body: form });
    const body = await response.json().catch(() => ({}));
    setUploading(false);
    if (!response.ok || !body.ok) {
      setError(body.errors?.[0] ?? 'The evidence file could not be uploaded.');
      return;
    }
    setMessage('Evidence uploaded securely. The named reviewer will record its validation state.');
    setFile(null);
    setLabel('');
    await refresh();
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
          <p><strong className="text-mk-ink">Payment reference:</strong> {eft?.paymentReferenceInstruction ?? order.paymentReference}</p>
          <p>{eft?.customerInstruction ?? 'MK confirms payment manually before any deliverable is released.'}</p>
        </CardContent>
      </Card>

      {comprehensive ? <>
        <Card>
          <CardHeader><CardTitle>Comprehensive engagement status</CardTitle></CardHeader>
          <CardContent className="grid gap-4 text-sm leading-6 text-mk-muted sm:grid-cols-2">
            <p><strong className="text-mk-ink">Stage:</strong> {comprehensive.state.replaceAll('_', ' ')}</p>
            <p><strong className="text-mk-ink">Reviewer:</strong> {comprehensive.reviewerAssigned ? 'Named reviewer assigned' : 'Awaiting reviewer assignment'}</p>
            <p><strong className="text-mk-ink">Evidence reviewed:</strong> {comprehensive.reviewedEvidenceCount} of {comprehensive.evidenceCount}</p>
            <p><strong className="text-mk-ink">Sign-off:</strong> {comprehensive.signedOff ? 'Complete' : 'Pending'} </p>
          </CardContent>
        </Card>

        {comprehensive.evidenceAccepting ? <Card>
          <CardHeader><CardTitle>Submit requested evidence</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-mk-muted">{comprehensive.evidenceGuidance.map((item) => <li key={item}>{item}</li>)}</ul>
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
              <label className="text-sm font-semibold text-mk-ink">Evidence file<input className="mt-2 block w-full rounded-xl border border-mk-line bg-white px-3 py-3 text-sm font-normal" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} accept="application/pdf,image/png,image/jpeg,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation" /></label>
              <label className="text-sm font-semibold text-mk-ink">Optional label<input className="mt-2 block w-full rounded-xl border border-mk-line bg-white px-3 py-3 text-sm font-normal" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={200} placeholder="e.g. Detection tuning log" /></label>
              <Button type="button" onClick={() => void uploadEvidence()} disabled={uploading}>{uploading ? 'Uploading…' : 'Upload evidence'}</Button>
            </div>
            {error ? <p role="alert" className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-sm text-mk-danger">{error}</p> : null}
            {message ? <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">{message}</p> : null}
          </CardContent>
        </Card> : null}

        <Card>
          <CardHeader><CardTitle>Evidence submitted</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {comprehensive.evidence.length ? comprehensive.evidence.map((item) => <div key={item.id} className="rounded-xl border border-mk-line p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-mk-ink">{item.evidenceLabel || item.originalFilename}</strong><Badge>{item.validationStatus.replaceAll('_', ' ')}</Badge></div>
              <p className="mt-2 text-mk-muted">{item.originalFilename} · {item.contentType} · {formatBytes(item.sizeBytes)}</p>
              {item.reviewerObservation ? <p className="mt-2 text-mk-muted">Reviewer note: {item.reviewerObservation}</p> : null}
            </div>) : <p className="text-sm text-mk-muted">No evidence has been uploaded yet.</p>}
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
