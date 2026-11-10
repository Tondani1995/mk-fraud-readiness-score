'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

export function ReviewStartForm() {
  const [label, setLabel] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mt-6 rounded-md border border-mk-line bg-white p-5"
      data-review-start-form
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        if (!confirmed) {
          setError('Confirm that the organisation is fictional before starting.');
          return;
        }
        setBusy(true);
        try {
          const res = await fetch('/review/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ organisationLabel: label, fictionalConfirmed: true })
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.message ?? 'The session could not be created.');
          // A full page load: the role link never enters a document that was running analytics.
          window.location.assign(`/review/s/${json.links}`);
        } catch (e) {
          setBusy(false);
          setError(e instanceof Error ? e.message : 'The session could not be created.');
        }
      }}
    >
      <label className="block text-sm font-medium text-mk-ink" htmlFor="review-org">
        Name for the fictional organisation
      </label>
      <input
        id="review-org"
        className="mt-2 block w-full rounded-md border border-mk-line px-3 py-3 text-base text-mk-ink"
        maxLength={80}
        placeholder="For example: Fictional Retail Group"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-mk-ink">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-[#001030]" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        <span>This organisation is fictional, and I will not enter information about a real organisation or person.</span>
      </label>
      {error && <p role="alert" className="mt-3 text-sm text-mk-danger">{error}</p>}
      <div className="mt-5">
        <Button type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create a fictional review'}
        </Button>
      </div>
    </form>
  );
}
