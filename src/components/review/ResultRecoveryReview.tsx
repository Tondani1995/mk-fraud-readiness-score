'use client';
import { useState } from 'react';
import { AdaptiveAssessmentExperience } from '@/components/adaptive/AdaptiveAssessmentExperience';
import { buildAdaptiveVisualReviewState } from '@/lib/visual-review/fixtures';

/** Presentation-only recovery double. No authentication/persistence claim and no private records. */
export function ResultRecoveryReview() {
  const [mode, setMode] = useState('ready');
  const [generation, setGeneration] = useState(0);
  const [requests, setRequests] = useState(0);
  const transport: typeof fetch = async (url) => {
    if (!String(url).endsWith('/result'))
      throw new Error('Only result recovery is permitted in this fixture.');
    setRequests((value) => value + 1);
    if (mode === 'failed') return Response.json({ ok: false }, { status: 503 });
    if (mode === 'pending') return Response.json({ ok: false }, { status: 202 });
    return Response.json({ ok: true, snapshotUrl: '/score/snapshot/RECOVERY-REVIEW?token=synthetic-only' });
  };
  return (
    <main className="mk-product mx-auto max-w-4xl space-y-6 px-5 py-10">
      <aside className="rounded-[var(--mk-radius-card)] border border-mk-line bg-white p-5 text-sm leading-6">
        <p>
          LOCAL/PREVIEW · Synthetic completed-result presentation only. No database, scoring, authentication,
          reports or email.
        </p>
        <label>
          Recovery response{' '}
          <select
            value={mode}
            onChange={(event) => {
              setMode(event.target.value);
              setGeneration((value) => value + 1);
            }}
          >
            <option value="ready">Recorded result ready</option>
            <option value="pending">Result not ready</option>
            <option value="failed">Temporary failure</option>
          </select>
        </label>
        <p>{requests} recovery requests. No submission requests are supported.</p>
      </aside>
      <AdaptiveAssessmentExperience
        key={generation}
        assessmentReference="RECOVERY-REVIEW"
        token="synthetic-only"
        initialState={buildAdaptiveVisualReviewState('submitted')}
        visualReview
        reviewTransport={transport}
      />
    </main>
  );
}
