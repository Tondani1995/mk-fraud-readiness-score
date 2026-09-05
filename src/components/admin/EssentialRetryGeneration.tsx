'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';

/** A native POST remains available when hydration or a cached client chunk fails. */
export function EssentialRetryGeneration({ orderReference, requestKey }: { orderReference: string; requestKey: string }) {
  const locked = useRef(false);
  const [state, setState] = useState<'idle' | 'submitting' | 'error' | 'uncertain' | 'complete'>('idle');
  const [message, setMessage] = useState('');
  const endpoint = `/score/api/admin/orders/${encodeURIComponent(orderReference)}/generate-report`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    locked.current = true;
    setState('submitting');
    setMessage('Submitting Retry Generation…');
    let dispatched = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Construct everything before dispatch so a browser failure cannot be labelled submitted.
      const body = JSON.stringify({ action: 'admin_retry', requestKey });
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), 310_000);
      dispatched = true;
      const response = await fetch(endpoint, {
        method: 'POST', credentials: 'same-origin', redirect: 'error',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Idempotency-Key': requestKey },
        body, signal: controller.signal
      });
      const result = await response.json();
      if (!result || typeof result.ok !== 'boolean') throw new Error('Invalid response');
      if (!response.ok || !result.ok) {
        setState('error');
        setMessage(typeof result.message === 'string' ? result.message : 'Retry Generation was rejected. Reload the order to review its current status.');
        // A confirmed failure may have consumed this key. Obtain a fresh server key by reloading.
        return;
      }
      setState('complete');
      setMessage(typeof result.message === 'string' ? result.message : 'Report generated successfully. Reload the order to view the report.');
      window.location.reload();
    } catch {
      setState(dispatched ? 'uncertain' : 'error');
      setMessage(dispatched
        ? 'The browser could not confirm whether Retry Generation reached the server or completed. Do not submit again. Reload the order and check Generation history first.'
        : 'Retry Generation could not be submitted by this browser. Reload the order and try again.');
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  return (
    <form method="post" action={endpoint} onSubmit={submit} className="space-y-3">
      <input type="hidden" name="action" value="admin_retry" />
      <input type="hidden" name="requestKey" value={requestKey} />
      <Button type="submit" disabled={state !== 'idle'}>{state === 'submitting' ? 'Submitting Retry Generation…' : 'Retry Generation'}</Button>
      <noscript><p>Retry submits directly to the server. Wait for the order page to return before retrying.</p></noscript>
      {message ? <p role={state === 'error' || state === 'uncertain' ? 'alert' : 'status'} className="rounded-xl border border-mk-line p-3 text-sm">{message}</p> : null}
      {state !== 'idle' && state !== 'submitting' ? <a className="underline" href={`/score/admin/orders/${encodeURIComponent(orderReference)}`}>Reload order and check Generation history</a> : null}
    </form>
  );
}
