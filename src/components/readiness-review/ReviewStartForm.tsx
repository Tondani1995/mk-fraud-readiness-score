'use client';

import { useState } from 'react';
import { consentedReviewCampaignContent } from '@/lib/website/assessment-entry-campaign';

/** Fictional confirmation in every test environment; organisation name and terms acceptance for a real organisation. */
export function ReviewStartForm({ production = false }: { production?: boolean } = {}) {
  const [label, setLabel] = useState('');
  const [contact, setContact] = useState({ fullName: '', email: '', roleTitle: '' });
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="mt-8"
      data-review-start-form
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        if (!confirmed) {
          setError(production ? 'Accept the assessment terms and privacy notice to start.' : 'Confirm that the organisation is fictional before starting.');
          return;
        }
        setBusy(true);
        try {
          let campaignContent: string | null = null;
          if (production) {
            try { campaignContent = consentedReviewCampaignContent(window.location.search, window.localStorage); } catch { /* consent/storage unavailable */ }
          }
          const res = await fetch('/review/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(production ? { organisationLabel: label, termsAccepted: true, contact, ...(campaignContent ? { campaignContent } : {}) } : { organisationLabel: label, fictionalConfirmed: true })
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.message ?? 'The session could not be created.');
          // A full page load: the role link never enters a document that was running analytics. A real organisation goes
          // straight into the interview (one person, start to finish); the test environments keep the session links page.
          window.location.assign(`/review/s/${production ? json.respondent : json.links}`);
        } catch (e) {
          setBusy(false);
          setError(e instanceof Error ? e.message : 'The session could not be created.');
        }
      }}
    >
      {production && (
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-mk-ink">
            Full name
            <input name="fullName" autoComplete="name" required maxLength={120} className="mt-2 block w-full rounded-md border border-mk-line px-3 py-3 text-base text-mk-ink" value={contact.fullName} onChange={(e) => setContact({ ...contact, fullName: e.target.value })} />
          </label>
          <label className="block text-sm font-medium text-mk-ink">
            Work email
            <input name="email" type="email" autoComplete="email" required maxLength={254} className="mt-2 block w-full rounded-md border border-mk-line px-3 py-3 text-base text-mk-ink" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
          </label>
        </div>
      )}
      <label className="block text-sm font-medium text-mk-ink" htmlFor="review-org">
        {production ? 'Organisation name' : 'Name for the fictional organisation'}
      </label>
      <input
        id="review-org"
        className="mt-2 block w-full rounded-md border border-mk-line px-3 py-3 text-base text-mk-ink"
        maxLength={80}
        autoComplete={production ? 'organization' : 'off'}
        placeholder={production ? 'Registered or trading name' : 'For example: Fictional Retail Group'}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      {production && (
        <label className="mt-4 block text-sm font-medium text-mk-ink">
          Role <span className="font-normal text-mk-muted">(optional)</span>
          <input name="roleTitle" autoComplete="organization-title" maxLength={120} className="mt-2 block w-full rounded-md border border-mk-line px-3 py-3 text-base text-mk-ink" value={contact.roleTitle} onChange={(e) => setContact({ ...contact, roleTitle: e.target.value })} />
        </label>
      )}
      <label className="mt-4 flex items-start gap-3 text-sm leading-6 text-mk-ink">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-[#001030]" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        {production
          ? <span>I accept the <a className="font-medium text-mk-navy underline underline-offset-4" href="/fraud-readiness-assessment-terms" target="_blank" rel="noreferrer">Fraud Readiness Assessment Terms</a> and acknowledge the <a className="font-medium text-mk-navy underline underline-offset-4" href="/privacy-policy" target="_blank" rel="noreferrer">Privacy Notice</a>.</span>
          : <span>This organisation is fictional, and I will not enter information about a real organisation or person.</span>}
      </label>
      {error && <p role="alert" className="mt-3 text-sm text-mk-danger">{error}</p>}
      <div className="mt-6">
        <button type="submit" disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-mk-navy px-6 text-base font-semibold text-white disabled:opacity-60 sm:w-auto">
          {busy ? 'Starting…' : production ? 'Start the assessment' : 'Create a fictional review'}
        </button>
      </div>
    </form>
  );
}
