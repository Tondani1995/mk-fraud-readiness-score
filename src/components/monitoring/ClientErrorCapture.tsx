'use client';

import { useEffect } from 'react';

const MAX_UNIQUE_ERRORS = 20;

function routePath() {
  if (typeof window === 'undefined') return '/unknown';
  return window.location.pathname;
}

export function ClientErrorCapture() {
  useEffect(() => {
    const seen = new Set<string>();
    const send = (name: string, category: string) => {
      const key = `${routePath()}:${name}:${category}`;
      if (seen.has(key) || seen.size >= MAX_UNIQUE_ERRORS) return;
      seen.add(key);
      void fetch('/score/api/internal/client-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, errorCategory: category, route: routePath() }),
        keepalive: true
      }).catch(() => null);
    };

    const onError = (event: ErrorEvent) => {
      send(event.error?.name ?? 'Error', 'uncaught_client_exception');
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      const name = event.reason instanceof Error ? event.reason.name : 'Error';
      send(name, 'unhandled_promise_rejection');
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
