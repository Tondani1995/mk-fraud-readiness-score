'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';

export function AdaptiveStartForm() {
  const [form, setForm] = useState({ fullName: '', email: '', organisationName: '', roleTitle: '', consentPrivacy: false, consentResearch: false });
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const update = (key: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setErrors([]);
    const response = await fetch('/score/api/adaptive/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, consentResearch: Boolean(form.consentResearch) }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) { setErrors(body.errors ?? ['We could not start your assessment right now. Please try again. If the problem continues, contact hello@mkfraud.co.za.']); setBusy(false); return; }
    window.location.assign(body.data.resumeUrl);
  }

  return <form data-adaptive-assessment-start="true" onSubmit={submit} className="space-y-5">
    {errors.length ? <div role="alert" className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-sm text-mk-danger">{errors.map((error) => <p key={error}>{error}</p>)}</div> : null}
    <div className="grid gap-5 sm:grid-cols-2">
      <label className="block text-sm font-medium text-mk-ink">Full name<input name="fullName" required value={form.fullName} onChange={(event) => update('fullName', event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-mk-line bg-white px-4" /></label>
      <label className="block text-sm font-medium text-mk-ink">Work email<input name="email" required type="email" value={form.email} onChange={(event) => update('email', event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-mk-line bg-white px-4" /></label>
    </div>
    <label className="block text-sm font-medium text-mk-ink">Organisation name<input name="organisationName" required value={form.organisationName} onChange={(event) => update('organisationName', event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-mk-line bg-white px-4" /></label>
    <label className="block text-sm font-medium text-mk-ink">Role (optional)<input name="roleTitle" value={form.roleTitle} onChange={(event) => update('roleTitle', event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-mk-line bg-white px-4" /></label>
    <label className="flex items-start gap-3 text-sm leading-6 text-mk-muted"><input name="consentPrivacy" required type="checkbox" checked={form.consentPrivacy} onChange={(event) => update('consentPrivacy', event.target.checked)} className="mt-1 h-4 w-4" />I agree to the privacy notice and understand this is a readiness self-assessment.</label>
    <label className="flex items-start gap-3 text-sm leading-6 text-mk-muted"><input name="consentResearch" type="checkbox" checked={form.consentResearch} onChange={(event) => update('consentResearch', event.target.checked)} className="mt-1 h-4 w-4" />I am happy for anonymised assessment information to support product improvement.</label>
    <Button type="submit" disabled={busy}>{busy ? 'Starting…' : 'Start assessment'}</Button>
  </form>;
}
