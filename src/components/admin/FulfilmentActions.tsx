'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';

type Props = {
  orderReference: string;
  reportId?: string | null;
  generationState: string;
  generationStuck: boolean;
  deliveryState: string;
  eligible: boolean;
  storageReady: boolean;
  storageCandidate: boolean;
  canGenerate: boolean;
  canRegenerate: boolean;
  canDeliver: boolean;
  capabilityAvailable: boolean;
};

type Notice = { tone: 'success' | 'error' | 'info'; text: string } | null;

export function FulfilmentActions(props: Props) {
  const [running, setRunning] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const requestKeys = useRef<Record<string, string>>({});
  // QUEUED means generation is pending and ready to be started; only GENERATING is work
  // actually executing. Treating QUEUED as active disabled the operator's own Generate
  // button and told them a report was being produced while nothing was running -- which,
  // under manual fulfilment where nothing drains the queue, was permanent.
  const generationActive = props.generationState === 'REPORT_GENERATING' && !props.generationStuck;
  const generationPending = props.generationState === 'REPORT_QUEUED' && !props.generationStuck;

  function requestKey(action: string) {
    requestKeys.current[action] ||= crypto.randomUUID();
    return requestKeys.current[action];
  }

  async function generation(action: 'admin_generate' | 'admin_retry' | 'admin_regenerate') {
    if (running) return;
    setRunning(action);
    setNotice({ tone: 'info', text: 'Generating report…' });
    let statusUncertain = false;
    const slowNoticeTimer = window.setTimeout(() => {
      setNotice({ tone: 'info', text: 'Still generating — do not retry. The page will update when the server confirms the final status.' });
    }, 45_000);
    try {
      const response = await fetch(`/score/api/admin/orders/${encodeURIComponent(props.orderReference)}/generate-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': requestKey(action) },
        body: JSON.stringify({ action, requestKey: requestKey(action) })
      });
      let result: Record<string, unknown>;
      try {
        result = await response.json() as Record<string, unknown>;
      } catch {
        statusUncertain = true;
        setNotice({ tone: 'info', text: 'The generation request was submitted, but completion could not be confirmed in this browser response. Do not retry — this page will refresh to reconcile the server status.' });
        window.setTimeout(() => window.location.reload(), 5_000);
        return;
      }
      if (!response.ok || !result.ok) {
        setNotice({ tone: 'error', text: typeof result.message === 'string' ? result.message : 'Report generation failed.' });
        return;
      }
      setNotice({ tone: 'success', text: typeof result.message === 'string' ? result.message : 'Report generated successfully.' });
      window.setTimeout(() => window.location.reload(), 700);
    } catch {
      statusUncertain = true;
      setNotice({ tone: 'info', text: 'The generation request was submitted, but completion could not be confirmed. Do not retry — this page will refresh to reconcile the server status.' });
      window.setTimeout(() => window.location.reload(), 5_000);
    } finally {
      window.clearTimeout(slowNoticeTimer);
      if (!statusUncertain) setRunning(null);
    }
  }

  async function access(mode: 'preview' | 'download') {
    if (!props.reportId || running) return;
    setRunning(mode);
    setNotice({ tone: 'info', text: mode === 'preview' ? 'Preparing secure preview…' : 'Preparing secure download…' });
    try {
      const response = await fetch(
        `/score/api/admin/reports/${encodeURIComponent(props.reportId)}/${mode}?order=${encodeURIComponent(props.orderReference)}`,
        { headers: { Accept: 'application/json' }, cache: 'no-store' }
      );
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message ?? `Report ${mode} failed.`);
      setNotice({ tone: 'success', text: `Secure ${mode} access created for 60 seconds.` });
      window.open(result.url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : `Report ${mode} failed.` });
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {props.capabilityAvailable && props.canGenerate && props.eligible && !props.storageCandidate && props.generationState !== 'GENERATION_FAILED' ? (
          <Button type="button" disabled={Boolean(running) || generationActive} onClick={() => generation('admin_generate')}>
            {generationActive || running === 'admin_generate' ? 'Generating report…' : generationPending ? 'Generate Report (queued)' : 'Generate Report'}
          </Button>
        ) : null}
        {props.capabilityAvailable && props.canGenerate && props.eligible && (props.generationState === 'GENERATION_FAILED' || props.generationStuck) ? (
          <Button type="button" disabled={Boolean(running)} onClick={() => generation('admin_retry')}>
            {running === 'admin_retry' ? 'Generating report…' : 'Retry Generation'}
          </Button>
        ) : null}
        {props.capabilityAvailable && props.storageCandidate ? (
          <>
            <Button type="button" variant="secondary" disabled={Boolean(running)} onClick={() => access('preview')}>
              {running === 'preview' ? 'Preparing preview…' : 'Preview Report'}
            </Button>
            <Button type="button" variant="secondary" disabled={Boolean(running)} onClick={() => access('download')}>
              {running === 'download' ? 'Preparing download…' : 'Download Report'}
            </Button>
          </>
        ) : null}
        {props.capabilityAvailable && props.canRegenerate && props.storageReady ? (
          <Button type="button" variant="secondary" disabled={Boolean(running) || generationActive} onClick={() => generation('admin_regenerate')}>
            {running === 'admin_regenerate' ? 'Generating report…' : 'Create New Version'}
          </Button>
        ) : null}
      </div>
      {generationActive ? (
        <p className="rounded-xl border border-mk-brass/40 bg-mk-cream p-3 text-sm text-mk-ink">
          Report generation is already in progress for this order.
        </p>
      ) : null}
      {generationPending ? (
        <p className="rounded-xl border border-mk-brass/40 bg-mk-cream p-3 text-sm text-mk-ink">
          Payment is confirmed and this report is ready for an authorised administrator to start preparation from this console.
        </p>
      ) : null}
      {props.generationStuck ? (
        <p className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-3 text-sm text-mk-danger">
          The active generation attempt is older than 15 minutes and may be stuck. An authorised retry will close it as failed before starting one new attempt.
        </p>
      ) : null}
      {props.storageCandidate && !props.storageReady ? (
        <p className="rounded-xl border border-mk-brass/40 bg-mk-cream p-3 text-sm text-mk-ink">
          This legacy report has storage metadata but is not ready for delivery until Preview or Download verifies the private file.
        </p>
      ) : null}
      {props.capabilityAvailable && props.canDeliver && props.storageReady ? (
        <p className="rounded-xl border border-mk-line bg-mk-cream p-3 text-sm text-mk-ink">
          Customer delivery is handled directly by MK. Download the verified files below, send them from the approved MK mailbox, then record delivery in the manual-delivery panel.
        </p>
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
