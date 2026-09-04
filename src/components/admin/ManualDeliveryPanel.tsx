'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

type Props = {
  orderReference: string;
  organisationName: string;
  reportReference: string | null;
  reportId: string | null;
  reportFileName: string | null;
  supportingRegisterFileName?: string | null;
  supportingRegisterReady?: boolean;
  recipientEmail: string | null;
  /** Product code of the paid order, so the pack names the tier the customer bought. */
  productCode?: string | null;
  storageReady: boolean;
  paymentConfirmed: boolean;
  deliveredAt: string | null;
  deliveredBy: string | null;
};

type Notice = { tone: 'success' | 'error' | 'info'; text: string } | null;

/**
 * Manual delivery: MK emails the report, then records it here.
 *
 * The operator previously had no way to complete a paid order without triggering the
 * provider resend, which the launch model has disabled. This gives them the email to
 * send and a control that records the delivery without sending anything.
 *
 * The email text deliberately says nothing about how the report was produced, who
 * looked at it, or what the internal workflow is -- it is the customer's email.
 */
export function ManualDeliveryPanel(props: Props) {
  const [notice, setNotice] = useState<Notice>(null);
  const [running, setRunning] = useState(false);
  const [downloadingWorkbook, setDownloadingWorkbook] = useState(false);
  const [delivered, setDelivered] = useState<string | null>(props.deliveredAt);

  // The pack named Comprehensive for every order, so an Essential customer was told they
  // were receiving a product they had not bought. Tier comes from the order itself.
  const isEssential = props.productCode === 'essential_self_assessment';
  const isComprehensive = props.productCode === 'mk_validated_assessment';
  const productTitle = isEssential ? 'Essential Fraud Readiness Review' : 'Comprehensive Fraud Readiness Report';
  const subject = `Your MK ${productTitle} — ${props.organisationName}`;
  const supportingRegisterReady = !isComprehensive || props.supportingRegisterReady === true;
  const attachmentLines = [
    `PDF report: ${props.reportFileName ?? '—'}`,
    ...(isComprehensive ? [`Supporting workbook: ${props.supportingRegisterFileName ?? '—'}`] : [])
  ];
  const body = [
    'Good day,',
    '',
    `Your ${productTitle} for ${props.organisationName} is ready. The following files are attached:`,
    '',
    `Report reference: ${props.reportReference ?? '—'}`,
    ...attachmentLines,
    '',
    'The report sets out your current fraud readiness position, the exposures that matter most, the target control environment and a prioritised implementation programme.',
    '',
    'Please treat the report as confidential. If you would like to discuss the findings or the implementation programme, reply to this email and we will arrange a session.',
    '',
    'Kind regards,',
    'MK Fraud Insights'
  ].join('\n');

  const canMarkDelivered = props.paymentConfirmed
    && props.storageReady
    && supportingRegisterReady
    && Boolean(props.recipientEmail);

  async function copy(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice({ tone: 'success', text: `${label} copied.` });
    } catch {
      setNotice({ tone: 'error', text: `${label} could not be copied. Select and copy it manually.` });
    }
  }

  async function markDelivered() {
    if (running || !canMarkDelivered) return;
    setRunning(true);
    setNotice({ tone: 'info', text: 'Recording delivery…' });
    try {
      const response = await fetch(
        `/score/api/admin/orders/${encodeURIComponent(props.orderReference)}/mark-delivered`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }
      );
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setNotice({ tone: 'error', text: result.message ?? 'The delivery could not be recorded.' });
        return;
      }
      setDelivered(result.deliveredAt);
      setNotice({ tone: 'success', text: result.message });
    } catch {
      setNotice({ tone: 'error', text: 'The delivery could not be recorded. Try again.' });
    } finally {
      setRunning(false);
    }
  }

  async function downloadSupportingWorkbook() {
    if (!props.reportId || !isComprehensive || !supportingRegisterReady || downloadingWorkbook) return;
    setDownloadingWorkbook(true);
    setNotice({ tone: 'info', text: 'Preparing secure workbook download…' });
    try {
      const response = await fetch(
        `/score/api/admin/reports/${encodeURIComponent(props.reportId)}/artifacts/supporting_register/download?order=${encodeURIComponent(props.orderReference)}`,
        { headers: { Accept: 'application/json' }, cache: 'no-store' }
      );
      const result = await response.json();
      if (!response.ok || !result.ok || typeof result.url !== 'string') {
        throw new Error(result.message ?? 'The supporting workbook could not be prepared.');
      }
      setNotice({ tone: 'success', text: 'Secure workbook access created for 60 seconds.' });
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'The supporting workbook could not be prepared.' });
    } finally {
      setDownloadingWorkbook(false);
    }
  }

  return (
    <section className="rounded-2xl border border-mk-brass/30 bg-white p-5 shadow-sm" id="manual-delivery">
      <h2 className="text-lg font-semibold text-mk-ink">Manual delivery</h2>
      <p className="mt-1 text-sm text-mk-muted">
        Send the report to the customer from your own mailbox, then record the delivery here.
        Recording delivery does not send anything.
      </p>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mk-muted">Recipient</dt>
          <dd className="mt-1 text-sm font-semibold text-mk-ink">{props.recipientEmail ?? 'No recipient on file'}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mk-muted">Attachments</dt>
          <dd className="mt-1 space-y-1 text-sm font-semibold text-mk-ink">
            <p>PDF: {props.reportFileName ?? 'No report yet'}</p>
            {isComprehensive ? <p>Workbook: {props.supportingRegisterFileName ?? 'Not available yet'}</p> : null}
          </dd>
        </div>
      </dl>

      {isComprehensive ? (
        <div className="mt-4 rounded-xl border border-mk-line bg-mk-cream/50 p-3 text-sm text-mk-ink">
          <p className="font-semibold">Supporting workbook</p>
          <p className="mt-1 text-mk-muted">The workbook is private and checksum-verified. Use the secure download below, attach it from the approved MK mailbox, then record the same manual delivery.</p>
          <Button type="button" variant="secondary" className="mt-3" onClick={() => void downloadSupportingWorkbook()} disabled={!supportingRegisterReady || downloadingWorkbook}>
            {downloadingWorkbook ? 'Preparing workbook…' : supportingRegisterReady ? 'Download supporting workbook' : 'Workbook not ready'}
          </Button>
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mk-muted">Subject</p>
          <p className="mt-1 rounded-lg border border-mk-brass/30 bg-mk-cream p-2 text-sm text-mk-ink">{subject}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mk-muted">Body</p>
          <textarea
            readOnly
            value={body}
            rows={12}
            aria-label="Delivery email body"
            className="mt-1 w-full rounded-lg border border-mk-brass/30 bg-mk-cream p-2 text-sm text-mk-ink"
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => copy('Recipient', props.recipientEmail ?? '')} disabled={!props.recipientEmail}>
          Copy recipient
        </Button>
        <Button type="button" variant="secondary" onClick={() => copy('Subject', subject)}>
          Copy subject
        </Button>
        <Button type="button" variant="secondary" onClick={() => copy('Email body', body)}>
          Copy email body
        </Button>
        <Button type="button" onClick={markDelivered} disabled={running || !canMarkDelivered || Boolean(delivered)}>
          {delivered ? 'Delivered' : running ? 'Recording…' : 'Mark delivered'}
        </Button>
      </div>

      {delivered ? (
        <p className="mt-3 rounded-xl border border-mk-brass/40 bg-mk-cream p-3 text-sm text-mk-ink">
          Recorded as delivered on {new Date(delivered).toLocaleString('en-ZA')}
          {props.deliveredBy ? ` by ${props.deliveredBy}` : ''}.
        </p>
      ) : null}
      {!canMarkDelivered && !delivered ? (
        <p className="mt-3 rounded-xl border border-mk-brass/40 bg-mk-cream p-3 text-sm text-mk-ink">
          Delivery can be recorded once payment is confirmed, all required verified files exist and a recipient is on file.
        </p>
      ) : null}
      {notice ? (
        <p className={`mt-3 rounded-xl p-3 text-sm ${notice.tone === 'error' ? 'border border-mk-danger/30 bg-mk-danger/10 text-mk-danger' : 'border border-mk-brass/40 bg-mk-cream text-mk-ink'}`}>
          {notice.text}
        </p>
      ) : null}
    </section>
  );
}
