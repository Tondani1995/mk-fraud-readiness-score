'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

// Release B: extends the existing order-detail admin experience (docs/safe-launch/
// 12-durable-fulfilment-design.md, "Admin recovery" -- "extend the existing order/admin
// experience rather than building an unrelated dashboard") with the durable-fulfilment
// states the synchronous FulfilmentActions.tsx panel above it does not cover:
// AWAITING_QUALITY_REVIEW (reviewer/approver decision), RETRY_SCHEDULED (automatic, worker-
// driven, shown for visibility only), MANUAL_REVIEW_REQUIRED (admin retry/recover), and
// DELIVERY_QUEUED (the durable handoff point Release C's real delivery will pick up from).

type Props = {
  orderReference: string;
  attemptId: string;
  status: string;
  retryCount: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  leaseExpiresAt: string | null;
  canReview: boolean;
  canRecover: boolean;
};

type Notice = { tone: 'success' | 'error' | 'info'; text: string } | null;

export function FulfilmentReviewPanel(props: Props) {
  const [running, setRunning] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<Notice>(null);

  async function call(action: 'approve' | 'reject' | 'retry' | 'recover', requiresReason: boolean) {
    if (running) return;
    if (requiresReason && reason.trim().length < 5) {
      setNotice({ tone: 'error', text: 'A reason of at least 5 characters is required.' });
      return;
    }
    setRunning(action);
    setNotice({ tone: 'info', text: 'Submitting…' });
    try {
      const response = await fetch(`/score/api/admin/orders/${encodeURIComponent(props.orderReference)}/fulfilment/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId: props.attemptId, reason })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message ?? 'The action could not be completed.');
      setNotice({ tone: 'success', text: 'Done. Refreshing…' });
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'The action could not be completed.' });
    } finally {
      setRunning(null);
    }
  }

  if (props.status === 'AWAITING_QUALITY_REVIEW' && props.canReview) {
    return (
      <div className="space-y-3 rounded-xl border border-mk-brass/40 bg-mk-cream p-4">
        <p className="text-sm font-semibold text-mk-ink">Awaiting MK quality review before delivery.</p>
        <textarea
          className="w-full rounded-lg border border-mk-line p-2 text-sm"
          placeholder="Reason (minimum 5 characters) — required for both approve and reject"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
        />
        <div className="flex gap-2">
          <Button type="button" disabled={Boolean(running)} onClick={() => call('approve', true)}>
            {running === 'approve' ? 'Approving…' : 'Approve for Delivery'}
          </Button>
          <Button type="button" variant="secondary" disabled={Boolean(running)} onClick={() => call('reject', true)}>
            {running === 'reject' ? 'Rejecting…' : 'Reject & Regenerate'}
          </Button>
        </div>
        {notice ? <Notice notice={notice} /> : null}
      </div>
    );
  }

  if (props.status === 'MANUAL_REVIEW_REQUIRED' && props.canRecover) {
    return (
      <div className="space-y-3 rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-4">
        <p className="text-sm font-semibold text-mk-danger">
          Generation failed {props.retryCount} time(s) (max {props.maxAttempts}) and needs a human decision.
        </p>
        <Button type="button" disabled={Boolean(running)} onClick={() => call('retry', false)}>
          {running === 'retry' ? 'Requeuing…' : 'Retry Generation'}
        </Button>
        {notice ? <Notice notice={notice} /> : null}
      </div>
    );
  }

  if (props.status === 'REPORT_GENERATING' && props.canRecover) {
    const leaseExpired = props.leaseExpiresAt ? new Date(props.leaseExpiresAt).getTime() < Date.now() : false;
    return (
      <div className="space-y-3 rounded-xl border border-mk-brass/40 bg-mk-cream p-4">
        <p className="text-sm text-mk-ink">
          Generating (worker lease {leaseExpired ? 'expired' : `active until ${props.leaseExpiresAt ? new Date(props.leaseExpiresAt).toLocaleTimeString('en-ZA') : 'unknown'}`}).
        </p>
        {leaseExpired ? (
          <Button type="button" disabled={Boolean(running)} onClick={() => call('recover', false)}>
            {running === 'recover' ? 'Recovering…' : 'Recover Stuck Job'}
          </Button>
        ) : null}
        {notice ? <Notice notice={notice} /> : null}
      </div>
    );
  }

  if (props.status === 'RETRY_SCHEDULED') {
    return (
      <div className="rounded-xl border border-mk-brass/40 bg-mk-cream p-4 text-sm text-mk-ink">
        Retry {props.retryCount}/{props.maxAttempts} scheduled for {props.nextAttemptAt ? new Date(props.nextAttemptAt).toLocaleString('en-ZA') : 'the next worker run'}.
      </div>
    );
  }

  if (props.status === 'DELIVERY_QUEUED') {
    return (
      <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">
        Approved and queued for delivery. Real email delivery is implemented in Release C.
      </div>
    );
  }

  return null;
}

function Notice({ notice }: { notice: NonNullable<Notice> }) {
  return (
    <p role="status" className={`rounded-xl border p-3 text-sm ${
      notice.tone === 'error'
        ? 'border-mk-danger/30 bg-mk-danger/10 text-mk-danger'
        : notice.tone === 'success'
          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
          : 'border-mk-line bg-mk-cream text-mk-ink'
    }`}>
      {notice.text}
    </p>
  );
}
