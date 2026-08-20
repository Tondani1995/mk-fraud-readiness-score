'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

type Props = {
  orderReference: string;
  organisationName: string;
  reportReference: string | null;
  reportFileName: string | null;
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
  const [delivered, setDelivered] = useState<string | null>(props.deliveredAt);

  // The pack named Comprehensive for every order, so an Essential customer was told they
  // were receiving a product they had not bought. Tier comes from the order itself.
  const isEssential = props.productCode === 'essential_self_assessment';
  const productTitle = isEssential ? 'Essential Fraud Readiness Review' : 'Comprehensive Fraud Readiness Report';
  const subject = `Your MK ${productTitle} — ${props.organisationName}`;
  const body = [
    'Good day,',
    '',
    `Your ${productTitle} for ${props.organisationName} is ready and attached to this email.`,
    '',
    `Report reference: ${props.reportReference ?? '—'}`,
    `Attachment: ${props.reportFileName ?? '—'}`,
    '',
    'The report sets out your current fraud readiness position, the exposures that matter most, the target control environment and a prioritised implementation programme.',
    '',
    'Please treat the report as confidential. If you would like to discuss the findings or the implementation programme, reply to this email and we will arrange a session.',
    '',
    'Kind regards,',
    'MK Fraud Insights'
  ].join('\n');

  const canMarkDelivered = props.paymentConfirmed && props.storageReady && Boolean(props.recipientEmail);

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
          <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mk-muted">Attachment</dt>
          <dd className="mt-1 text-sm font-semibold text-mk-ink">{props.reportFileName ?? 'No report yet'}</dd>
        </div>
      </dl>

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
          Delivery can be recorded once payment is confirmed, a verified report exists and a recipient is on file.
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
