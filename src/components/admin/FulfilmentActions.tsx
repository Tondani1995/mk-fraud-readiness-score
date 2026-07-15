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
};

type Notice = { tone: 'success' | 'error' | 'info'; text: string } | null;

export function FulfilmentActions(props: Props) {
  const [running, setRunning] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const requestKeys = useRef<Record<string, string>>({});
  const generationActive = ['REPORT_QUEUED', 'REPORT_GENERATING'].includes(props.generationState) && !props.generationStuck;
  const deliveryActive = ['DELIVERY_PENDING', 'DELIVERING'].includes(props.deliveryState);

  function requestKey(action: string) {
    requestKeys.current[action] ||= crypto.randomUUID();
    return requestKeys.current[action];
  }

  async function generation(action: 'admin_generate' | 'admin_retry' | 'admin_regenerate') {
    if (running) return;
    setRunning(action);
    setNotice({ tone: 'info', text: 'Generating report…' });
    try {
      const response = await fetch(`/score/api/admin/orders/${encodeURIComponent(props.orderReference)}/generate-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': requestKey(action) },
        body: JSON.stringify({ action, requestKey: requestKey(action) })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message ?? 'Report generation failed.');
      setNotice({ tone: 'success', text: result.message ?? 'Report generated successfully.' });
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Report generation failed.' });
    } finally {
      setRunning(null);
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

  async function deliver() {
    if (!props.reportId || running) return;
    const action = props.deliveryState === 'DELIVERY_FAILED' ? 'retry_delivery' : 'initiate_delivery';
    setRunning(action);
    setNotice({ tone: 'info', text: 'Recording delivery request…' });
    try {
      const response = await fetch(`/score/api/admin/reports/${encodeURIComponent(props.reportId)}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': requestKey(action) },
        body: JSON.stringify({ orderReference: props.orderReference, requestKey: requestKey(action) })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message ?? 'Delivery request failed.');
      setNotice({ tone: 'success', text: result.message ?? 'Delivery request recorded.' });
      window.setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Delivery request failed.' });
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {props.canGenerate && props.eligible && !props.storageCandidate && props.generationState !== 'GENERATION_FAILED' ? (
          <Button type="button" disabled={Boolean(running) || generationActive} onClick={() => generation('admin_generate')}>
            {generationActive || running === 'admin_generate' ? 'Generating report…' : 'Generate Report'}
          </Button>
        ) : null}
        {props.canGenerate && props.eligible && (props.generationState === 'GENERATION_FAILED' || props.generationStuck) ? (
          <Button type="button" disabled={Boolean(running)} onClick={() => generation('admin_retry')}>
            {running === 'admin_retry' ? 'Generating report…' : 'Retry Generation'}
          </Button>
        ) : null}
        {props.storageCandidate ? (
          <>
            <Button type="button" variant="secondary" disabled={Boolean(running)} onClick={() => access('preview')}>
              {running === 'preview' ? 'Preparing preview…' : 'Preview Report'}
            </Button>
            <Button type="button" variant="secondary" disabled={Boolean(running)} onClick={() => access('download')}>
              {running === 'download' ? 'Preparing download…' : 'Download Report'}
            </Button>
          </>
        ) : null}
        {props.canDeliver && props.storageReady && props.deliveryState !== 'DELIVERED' ? (
          <Button type="button" disabled={Boolean(running) || deliveryActive} onClick={deliver}>
            {deliveryActive ? 'Delivery Pending' : props.deliveryState === 'DELIVERY_FAILED' ? 'Retry Delivery' : 'Initiate Delivery'}
          </Button>
        ) : null}
        {props.canRegenerate && props.storageReady ? (
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
