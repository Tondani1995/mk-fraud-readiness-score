'use client';

import { useState } from 'react';

type SyntheticProofFixture = {
  label: string;
  assessmentReference: string;
  requestKey: string;
};

export function SyntheticComprehensiveProofActions(props: { fixtures: readonly SyntheticProofFixture[] }) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function generate(fixture: SyntheticProofFixture) {
    setBusyKey(fixture.requestKey);
    setMessage(null);
    try {
      const response = await fetch('/score/api/admin/comprehensive/synthetic', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-idempotency-key': fixture.requestKey
        },
        body: JSON.stringify({ assessmentReference: fixture.assessmentReference, requestKey: fixture.requestKey })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        setMessage(payload.message ?? 'The synthetic Comprehensive generation could not be completed.');
        return;
      }
      setMessage(`${fixture.label}: ${payload.reportReference} generated and private storage verified.`);
    } catch {
      setMessage('The synthetic Comprehensive generation could not be completed.');
    } finally {
      setBusyKey(null);
    }
  }

  return <div className="space-y-4"><div className="grid gap-3 md:grid-cols-3">{props.fixtures.map((fixture) => <div key={fixture.assessmentReference} className="rounded-xl border border-mk-line bg-mk-cream/40 p-4"><p className="mb-3 text-sm font-semibold text-mk-ink">{fixture.label}</p><button type="button" disabled={Boolean(busyKey)} onClick={() => generate(fixture)} className="inline-flex items-center justify-center rounded-full bg-mk-ink px-5 py-3 text-sm font-semibold text-mk-cream shadow-soft transition duration-200 hover:bg-mk-slate disabled:cursor-not-allowed disabled:opacity-60">{busyKey === fixture.requestKey ? 'Generating…' : 'Generate Comprehensive'}</button></div>)}</div>{message ? <p className="rounded-xl bg-mk-cream px-3 py-2 text-sm text-mk-ink">{message}</p> : null}</div>;
}
