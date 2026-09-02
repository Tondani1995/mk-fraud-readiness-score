'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { REQUIRED_LEGAL_ACCEPTANCE } from '@/lib/legal/fraud-readiness-terms';
import { rememberProductIntent, type ProductIntent } from '@/lib/commercial/product-intent';
import { trackEventBeforeNavigation } from '@/lib/website/gtag';

export function AdaptiveStartForm({ productIntent = null }: { productIntent?: ProductIntent | null }) {
  const [form, setForm] = useState({ fullName: '', email: '', organisationName: '', roleTitle: '', consentResearch: false });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const update = (key: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setErrors([]);
    const response = await fetch('/score/api/adaptive/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // The accepted versions travel with the request. The server re-checks them against the
      // versions in force and takes its own timestamps; nothing here is trusted as evidence.
      // consentPrivacy is NOT collected as a form checkbox. The privacy acknowledgement is the
      // versioned one made in the Fraud Readiness Terms gate, and the server derives the legacy
      // respondents.consent_privacy flag from it. The authority representation lives in Terms
      // clause 1.2 and is a term of the agreement, not a privacy consent.
      body: JSON.stringify({ ...form, consentResearch: Boolean(form.consentResearch), legalAcceptance: REQUIRED_LEGAL_ACCEPTANCE })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) { setErrors(body.errors ?? ['We could not start your assessment right now. Please try again. If the problem continues, contact hello@mkfraud.co.za.']); setBusy(false); return; }
    // Intent is remembered only once the assessment exists, and only as a browser-local preference
    // so the Snapshot selector can open on the tier the customer arrived with.
    rememberProductIntent(body.data?.assessmentReference ?? '', productIntent);
    trackEventBeforeNavigation(
      'fraud_readiness_start',
      { flow: 'adaptive' },
      () => window.location.assign(body.data.resumeUrl)
    );
  }

  return <form data-adaptive-assessment-start="true" onSubmit={submit} className="space-y-5">
    {errors.length ? <div role="alert" className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-sm text-mk-danger">{errors.map((error) => <p key={error}>{error}</p>)}</div> : null}
    <div className="grid gap-5 sm:grid-cols-2">
      <label className="block text-sm font-medium text-mk-ink">Full name<input name="fullName" autoComplete="name" required value={form.fullName} onChange={(event) => update('fullName', event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-mk-line bg-white px-4" /></label>
      <label className="block text-sm font-medium text-mk-ink">Work email<input name="email" autoComplete="email" required type="email" value={form.email} onChange={(event) => update('email', event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-mk-line bg-white px-4" /></label>
    </div>
    <label className="block text-sm font-medium text-mk-ink">Organisation name<input name="organisationName" autoComplete="organization" required value={form.organisationName} onChange={(event) => update('organisationName', event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-mk-line bg-white px-4" /></label>
    <label className="block text-sm font-medium text-mk-ink">Role (optional)<input name="roleTitle" autoComplete="organization-title" value={form.roleTitle} onChange={(event) => update('roleTitle', event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-mk-line bg-white px-4" /></label>
    <label className="flex items-start gap-3 text-sm leading-6 text-mk-muted"><input name="consentResearch" type="checkbox" checked={form.consentResearch} onChange={(event) => update('consentResearch', event.target.checked)} className="mt-1 h-4 w-4" />Optional: I am happy for anonymised assessment information to support product improvement.</label>
    <Button type="submit" disabled={busy}>{busy ? 'Starting…' : 'Start assessment'}</Button>
  </form>;
}
