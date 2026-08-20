'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

// Release C: admin recovery for the real delivery/access-token layer, extending the existing
// order-detail page (docs/safe-launch/15-email-and-secure-delivery-design.md, "Admin recovery")
// rather than a new dashboard. Mirrors FulfilmentReviewPanel.tsx's call()/Notice pattern exactly.

export type DeliveryAuthorizationProps = {
  id: string;
  status: string;
  retryCount: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  providerMessageId: string | null;
  revokedReason: string | null;
  authorisedAt: string;
};

export type CustomerAccessTokenProps = {
  id: string;
  recipientEmail: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
  lastAccessedAt: string | null;
  accessCount: number;
};

type RecipientExceptionProps = {
  pendingReportId: string;
  pendingReportReference: string;
} | null;

type Props = {
  orderReference: string;
  reportId: string | null;
  authorizations: DeliveryAuthorizationProps[];
  accessTokens: CustomerAccessTokenProps[];
  recipientException: RecipientExceptionProps;
  canRetryDelivery: boolean;
  canManageAccessTokens: boolean;
};

type Notice = { tone: 'success' | 'error' | 'info'; text: string } | null;

function dateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString('en-ZA') : 'Not recorded';
}

function cleanStatus(status: string | null | undefined) {
  return (status ?? 'unknown').replace(/_/g, ' ');
}

export function DeliveryAccessPanel(props: Props) {
  const [running, setRunning] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const [blockedReissueReason, setBlockedReissueReason] = useState<string | null>(null);
  const [correctionEmail, setCorrectionEmail] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');

  async function post(path: string, actionKey: string, body: Record<string, unknown>): Promise<{ ok: boolean; reason?: string; message?: string; data?: any }> {
    if (running) return { ok: false };
    setRunning(actionKey);
    setNotice({ tone: 'info', text: 'Submitting…' });
    try {
      const response = await fetch(`/score/api/admin/orders/${encodeURIComponent(props.orderReference)}/delivery/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const result = await response.json();
      if (!response.ok || !result.ok) return result;
      const emailWarning = result.data?.emailSent === false ? ` A new link was issued, but the resend email failed: ${result.data.emailError ?? 'unknown error'}.` : '';
      setNotice({ tone: emailWarning ? 'error' : 'success', text: `Done.${emailWarning} Refreshing…` });
      window.setTimeout(() => window.location.reload(), 900);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The action could not be completed.';
      setNotice({ tone: 'error', text: message });
      return { ok: false, message };
    } finally {
      setRunning(null);
    }
  }

  function retryDelivery(authorizationId: string) {
    post('retry', `retry:${authorizationId}`, { authorizationId });
  }

  function revokeToken(tokenId: string) {
    if (reason.trim().length < 5) {
      setNotice({ tone: 'error', text: 'A reason of at least 5 characters is required.' });
      return;
    }
    post('revoke-token', `revoke:${tokenId}`, { tokenId, reason });
  }

  async function reissueToken(override: boolean) {
    if (!props.reportId) {
      setNotice({ tone: 'error', text: 'No generated report is available to link yet.' });
      return;
    }
    if (reason.trim().length < 5) {
      setNotice({ tone: 'error', text: 'A reason of at least 5 characters is required.' });
      return;
    }
    setBlockedReissueReason(null);
    const result = await post('reissue-token', 'reissue', { reportId: props.reportId, reason, overrideSuppression: override });
    if (!result.ok && (result.reason === 'blocked_prior_bounced' || result.reason === 'blocked_prior_complained')) {
      setBlockedReissueReason(result.message ?? 'This recipient has a prior bounce or complaint on record.');
      setNotice(null);
    } else if (!result.ok && result.message) {
      setNotice({ tone: 'error', text: result.message });
    }
  }

  async function correctRecipient() {
    if (!props.recipientException) return;
    if (correctionReason.trim().length < 5) {
      setNotice({ tone: 'error', text: 'A reason of at least 5 characters is required.' });
      return;
    }
    await post('correct-recipient', 'correct-recipient', { newRecipientEmail: correctionEmail, reason: correctionReason });
  }

  return (
    <div className="space-y-5">
      {props.recipientException ? (
        <div className="space-y-3 rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-4">
          <p className="text-sm font-semibold text-mk-danger">Delivery blocked: no customer email on file</p>
          <p className="text-sm text-mk-ink">
            Report {props.recipientException.pendingReportReference} was approved and released, but no delivery could
            be queued because this order has no customer email. Enter the correct address to queue delivery for this
            report — it will not be regenerated.
          </p>
          <input
            type="email"
            className="w-full rounded-lg border border-mk-line p-2 text-sm"
            placeholder="Corrected customer email"
            value={correctionEmail}
            onChange={(event) => setCorrectionEmail(event.target.value)}
          />
          <textarea
            className="w-full rounded-lg border border-mk-line p-2 text-sm"
            placeholder="Reason (minimum 5 characters)"
            value={correctionReason}
            onChange={(event) => setCorrectionReason(event.target.value)}
            rows={2}
          />
          <Button type="button" disabled={Boolean(running) || !correctionEmail} onClick={correctRecipient}>
            {running === 'correct-recipient' ? 'Correcting…' : 'Correct Recipient & Queue Delivery'}
          </Button>
        </div>
      ) : null}

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mk-muted">Delivery attempts</p>
        <div className="mt-2 space-y-3">
          {props.authorizations.map((auth) => (
            <div key={auth.id} className="rounded-xl border border-mk-line bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{cleanStatus(auth.status)}</Badge>
                <span className="text-mk-muted">{dateTime(auth.authorisedAt)}</span>
              </div>
              <p className="mt-2 text-mk-muted">Retry {auth.retryCount}/{auth.maxAttempts}{auth.providerMessageId ? ` · Provider message ${auth.providerMessageId}` : ''}</p>
              {auth.nextAttemptAt ? <p className="mt-1 text-xs text-mk-muted">Next attempt: {dateTime(auth.nextAttemptAt)}</p> : null}
              {auth.revokedReason ? <p className="mt-2 text-mk-danger">{auth.revokedReason}</p> : null}
              {props.canRetryDelivery && ['failed_terminal', 'reconciliation_required'].includes(auth.status) ? (
                <Button type="button" variant="secondary" className="mt-3" disabled={Boolean(running)} onClick={() => retryDelivery(auth.id)}>
                  {running === `retry:${auth.id}` ? 'Requeuing…' : 'Retry Delivery'}
                </Button>
              ) : null}
            </div>
          ))}
          {!props.authorizations.length ? <p className="text-sm text-mk-muted">No delivery attempts recorded.</p> : null}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mk-muted">Customer report access links</p>
        <div className="mt-2 space-y-3">
          {props.accessTokens.map((token) => {
            const active = !token.revokedAt && new Date(token.expiresAt).getTime() > Date.now();
            return (
              <div key={token.id} className="rounded-xl border border-mk-line bg-white p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{active ? 'active' : token.revokedAt ? 'revoked' : 'expired'}</Badge>
                  <span className="text-mk-muted">{token.recipientEmail}</span>
                </div>
                <p className="mt-2 text-mk-muted">Issued {dateTime(token.issuedAt)} · Expires {dateTime(token.expiresAt)} · Accessed {token.accessCount} time(s){token.lastAccessedAt ? ` (last ${dateTime(token.lastAccessedAt)})` : ''}</p>
                {token.revokedReason ? <p className="mt-1 text-xs text-mk-muted">{token.revokedReason}</p> : null}
                {props.canManageAccessTokens && active ? (
                  <Button type="button" variant="secondary" className="mt-3" disabled={Boolean(running)} onClick={() => revokeToken(token.id)}>
                    {running === `revoke:${token.id}` ? 'Revoking…' : 'Revoke Link'}
                  </Button>
                ) : null}
              </div>
            );
          })}
          {!props.accessTokens.length ? <p className="text-sm text-mk-muted">No access links issued yet.</p> : null}
        </div>
      </div>

      {props.canManageAccessTokens ? (
        <div className="space-y-3 rounded-xl border border-mk-brass/40 bg-mk-cream p-4">
          <p className="text-sm font-semibold text-mk-ink">Reissue link &amp; resend report-ready email</p>
          <p className="text-xs text-mk-muted">Revokes any active link for this report and customer, issues a new one, and immediately emails it to the customer on file.</p>
          <textarea
            className="w-full rounded-lg border border-mk-line p-2 text-sm"
            placeholder="Reason (minimum 5 characters) — required for revoke and reissue"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
          />
          <Button type="button" disabled={Boolean(running) || !props.reportId} onClick={() => reissueToken(false)}>
            {running === 'reissue' ? 'Reissuing…' : 'Reissue & Resend'}
          </Button>
          {blockedReissueReason ? (
            <div className="space-y-2 rounded-lg border border-mk-danger/30 bg-mk-danger/10 p-3">
              <p className="text-sm text-mk-danger">{blockedReissueReason}</p>
              <Button type="button" variant="secondary" disabled={Boolean(running)} onClick={() => reissueToken(true)}>
                {running === 'reissue' ? 'Reissuing…' : 'Override and Resend Anyway'}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {notice ? (
        <p role="status" className={`rounded-xl border p-3 text-sm ${
          notice.tone === 'error'
            ? 'border-mk-danger/30 bg-mk-danger/10 text-mk-danger'
            : notice.tone === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
              : 'border-mk-line bg-mk-cream text-mk-ink'
        }`}>
          {notice.text}
        </p>
      ) : null}
    </div>
  );
}
