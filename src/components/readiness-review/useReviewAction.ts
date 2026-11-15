'use client';

import { useCallback, useRef, useState } from 'react';

export type ReviewActionInput = { type: string; [key: string]: unknown };
export type ActionOutcome<V> =
  | { ok: true; view: V; duplicate: boolean }
  | { ok: false; code: string; message: string; view?: V; retryable: boolean };

function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Sends review actions for one link. The server applies each action through the readiness engine and returns the
 * refreshed view; the page never interprets an answer itself. A failed save keeps the action so it can be retried with
 * the same reference, which the server applies at most once.
 */
export function useReviewAction<V extends { seq: number }>(token: string, initial: V, options?: { faultOnce?: boolean }) {
  const [view, setView] = useState<V>(initial);
  const viewRef = useRef(view);
  viewRef.current = view;
  const pending = useRef<{ actionId: string; action: ReviewActionInput; expectedSeq: number } | null>(null);
  const faultOnce = useRef(Boolean(options?.faultOnce));

  const reload = useCallback(async (): Promise<V | undefined> => {
    try {
      const res = await fetch(`/review/api/s/${token}`, { cache: 'no-store' });
      if (!res.ok) return undefined;
      const json = await res.json();
      viewRef.current = json.view;
      setView(json.view);
      return json.view as V;
    } catch {
      return undefined;
    }
  }, [token]);

  const send = useCallback(
    async (action: ReviewActionInput, opts?: { retry?: boolean; defer?: boolean }): Promise<ActionOutcome<V>> => {
      const retrying = Boolean(opts?.retry && pending.current);
      const attempt = retrying ? pending.current! : { actionId: newId(), action, expectedSeq: viewRef.current.seq };
      pending.current = attempt;
      const simulateFailure = faultOnce.current;
      faultOnce.current = false;
      try {
        const res = await fetch(`/review/api/s/${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actionId: attempt.actionId, expectedSeq: attempt.expectedSeq, action: attempt.action, simulateFailure })
        });
        const json = await res.json().catch(() => ({}));
        if (res.ok) {
          pending.current = null;
          // Updated immediately so that a second action sent before the next render carries the new sequence.
          viewRef.current = json.current.view;
          // A deferred caller applies the view itself once its question transition has confirmed the save.
          if (!opts?.defer) setView(json.current.view);
          return { ok: true, view: json.current.view, duplicate: Boolean(json.duplicate) };
        }
        if (json.code === 'conflict' || json.code === 'stale_question') {
          pending.current = null;
          const fresh = await reload();
          return { ok: false, code: json.code, message: json.message, view: fresh, retryable: false };
        }
        if (json.code === 'save_failed' || res.status >= 500) {
          return { ok: false, code: 'save_failed', message: json.message ?? 'Your answer could not be saved. Nothing was recorded; you can try again.', retryable: true };
        }
        pending.current = null;
        return { ok: false, code: json.code ?? 'error', message: json.message ?? 'That change could not be made.', retryable: false };
      } catch {
        return { ok: false, code: 'network', message: 'Your answer could not be sent. Check the connection and try again.', retryable: true };
      }
    },
    [token, reload]
  );

  const retry = useCallback(() => (pending.current ? send(pending.current.action, { retry: true }) : Promise.resolve(null)), [send]);
  const discardPending = useCallback(() => {
    pending.current = null;
  }, []);

  return { view, setView, applyView: setView, send, retry, reload, discardPending, hasPending: () => Boolean(pending.current) };
}
