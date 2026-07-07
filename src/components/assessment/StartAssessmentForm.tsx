'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';

const employeeBands = ['', '1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'];
const revenueBands = ['', '<R10m', 'R10m-R50m', 'R50m-R250m', 'R250m-R1bn', 'R1bn+'];

function keepEmbedded(url: string) {
  if (typeof window === 'undefined') return url;
  const embedded = new URLSearchParams(window.location.search).get('embed') === '1';
  const nextUrl = new URL(url, window.location.origin);
  if (embedded) nextUrl.searchParams.set('embed', '1');
  return nextUrl.toString();
}

export function StartAssessmentForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [result, setResult] = useState<null | {
    assessmentReference: string;
    resumeUrl: string;
    resumeTokenExpiresAt: string;
    respondentEmail: string;
  }>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrors([]);
    setResult(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      fullName: String(formData.get('fullName') ?? ''),
      email: String(formData.get('email') ?? ''),
      roleTitle: String(formData.get('roleTitle') ?? ''),
      phone: String(formData.get('phone') ?? ''),
      organisationName: String(formData.get('organisationName') ?? ''),
      tradingName: String(formData.get('tradingName') ?? ''),
      industry: String(formData.get('industry') ?? ''),
      sector: String(formData.get('sector') ?? ''),
      province: String(formData.get('province') ?? ''),
      employeeBand: String(formData.get('employeeBand') ?? ''),
      annualRevenueBand: String(formData.get('annualRevenueBand') ?? ''),
      consentPrivacy: formData.get('consentPrivacy') === 'on',
      consentResearch: formData.get('consentResearch') === 'on'
    };

    const response = await fetch('/api/assessments/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const body = await response.json().catch(() => ({}));
    setIsSubmitting(false);

    if (!response.ok || !body.ok) {
      setErrors(body.errors ?? ['We could not start the assessment. Please check the details and try again.']);
      return;
    }

    setResult({ ...body.data, resumeUrl: keepEmbedded(body.data.resumeUrl) });
  }

  if (result) {
    return (
      <div className="space-y-5 rounded-2xl border border-mk-line bg-mk-paper p-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mk-brassDark">Assessment ready</p>
          <h2 className="mt-2 text-2xl font-semibold text-mk-ink">Reference {result.assessmentReference}</h2>
          <p className="mt-3 text-sm leading-6 text-mk-muted">
            We have saved the organisation details. Continue to the questions to assess the organisation&apos;s fraud readiness and generate the free snapshot.
          </p>
        </div>
        <div className="rounded-xl border border-mk-line bg-mk-cream/50 p-4 text-sm text-mk-muted">
          Keep this reference for follow-up: <span className="font-semibold text-mk-ink">{result.assessmentReference}</span>
        </div>
        <p className="text-xs text-mk-muted">Secure continuation link expires: {new Date(result.resumeTokenExpiresAt).toLocaleString('en-ZA')} · Intended recipient: {result.respondentEmail}</p>
        <Button asChild><Link href={result.resumeUrl}>Continue to the questions</Link></Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {errors.length ? (
        <div className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 px-4 py-3 text-sm text-mk-danger">
          {errors.map((error) => <p key={error}>{error}</p>)}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Field name="fullName" label="Full name" required />
        <Field name="email" label="Work email" type="email" required />
        <Field name="roleTitle" label="Role / title" />
        <Field name="phone" label="Phone" />
        <Field name="organisationName" label="Organisation legal name" required />
        <Field name="tradingName" label="Trading name" />
        <Field name="industry" label="Industry" />
        <Field name="sector" label="Sector" />
        <Field name="province" label="Province" />
        <Select name="employeeBand" label="Employee band" options={employeeBands} />
        <Select name="annualRevenueBand" label="Annual revenue band" options={revenueBands} />
      </div>

      <label className="flex gap-3 rounded-xl border border-mk-line bg-mk-cream/40 p-4 text-sm leading-6 text-mk-muted">
        <input name="consentPrivacy" type="checkbox" className="mt-1" required />
        <span>I confirm that I am authorised to submit this information for the organisation and consent to MK processing it for the assessment and follow-up.</span>
      </label>
      <label className="flex gap-3 rounded-xl border border-mk-line bg-mk-cream/40 p-4 text-sm leading-6 text-mk-muted">
        <input name="consentResearch" type="checkbox" className="mt-1" />
        <span>I consent to MK using anonymised and aggregated assessment data for future research and benchmarking once sufficient data exists.</span>
      </label>

      <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Starting assessment…' : 'Start the assessment'}</Button>
    </form>
  );
}

function Field({ name, label, type = 'text', required = false }: { name: string; label: string; type?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-mk-charcoal">{label}</span>
      <input name={name} type={type} required={required} className="mt-2 w-full rounded-xl border border-mk-line bg-mk-paper px-4 py-3 text-sm text-mk-ink outline-none focus:border-mk-brass" />
    </label>
  );
}

function Select({ name, label, options }: { name: string; label: string; options: string[] }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-mk-charcoal">{label}</span>
      <select name={name} className="mt-2 w-full rounded-xl border border-mk-line bg-mk-paper px-4 py-3 text-sm text-mk-ink outline-none focus:border-mk-brass">
        {options.map((option) => <option key={option || 'empty'} value={option}>{option || 'Select'}</option>)}
      </select>
    </label>
  );
}
