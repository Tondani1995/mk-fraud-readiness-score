'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ADVISORY_CONTACT_METHODS,
  ADVISORY_FOCUS_AREAS,
  ADVISORY_REASONS,
  ADVISORY_TIMEFRAMES
} from '@/lib/enquiries/taxonomy';

/**
 * Pre-assessment MK Advisory intake.
 *
 * The same enquiry taxonomy as the Snapshot Advisory form, because a prospect who arrives before
 * assessing is answering the same commercial questions. What it adds is the contact identity that
 * the Snapshot journey already has: without an assessment there is no organisation or respondent
 * row to draw a name and address from.
 *
 * This form creates an enquiry. It does not create an order, a payment obligation or a report,
 * and it says so where a prospect can see it before submitting.
 */

const FIELD =
  'mt-2 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-[#001030] transition focus:border-[#1D3658] focus:outline-none focus:ring-2 focus:ring-[#1D3658]/25';
const LABEL = 'block text-sm font-semibold text-[#001030]';
const CHOICE =
  'flex min-h-12 items-start gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm leading-6 text-slate-700 transition hover:border-[#1D3658]/40';

export function PublicAdvisoryEnquiryForm() {
  const [form, setForm] = useState({
    contactName: '',
    email: '',
    companyName: '',
    contactPhone: '',
    primaryReason: '',
    preferredContactMethod: '',
    preferredConsultationTimeframe: '',
    notes: ''
  });
  const [areasOfFocus, setAreasOfFocus] = useState<string[]>([]);
  const [consentContact, setConsentContact] = useState(false);
  const [botcheck, setBotcheck] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState<{ requestReference: string; message: string } | null>(null);

  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  function toggleFocus(value: string) {
    setAreasOfFocus((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrors([]);

    try {
      const response = await fetch('/score/api/enquiries/advisory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, areasOfFocus, consentContact, botcheck })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) {
        setErrors(body.errors ?? ['Your enquiry could not be submitted right now. Please try again.']);
        setSubmitting(false);
        return;
      }
      // Only a persisted enquiry produces a success state, and the reference proves it exists.
      setSuccess({ requestReference: body.requestReference, message: body.message });
    } catch {
      setErrors(['Your enquiry could not be submitted right now. Please try again.']);
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <section aria-labelledby="advisory-success" className="border border-slate-200 bg-white p-8 lg:p-10">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#1D3658]">Enquiry received</p>
        <h2 id="advisory-success" className="mt-3 text-2xl font-semibold tracking-tight text-[#001030]">
          Thank you — we have your enquiry.
        </h2>
        <p className="mt-4 text-base leading-7 text-slate-700">{success.message}</p>
        <dl className="mt-6 border-t border-slate-200 pt-6">
          <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Your enquiry reference
          </dt>
          <dd className="mt-1.5 text-lg font-semibold tabular-nums tracking-tight text-[#001030]">
            {success.requestReference}
          </dd>
        </dl>
        <p className="mt-6 text-sm leading-6 text-slate-600">
          Quote this reference if you contact us about the enquiry. Nothing has been ordered and no
          payment is due.
        </p>
        <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 text-sm">
          <Link href="/fraud-readiness" className="font-semibold text-[#001030] underline decoration-[#1D3658] underline-offset-4 hover:text-[#1D3658]">
            Back to Fraud Readiness options
          </Link>
          <Link href="/score/start" className="font-semibold text-[#001030] underline decoration-[#1D3658] underline-offset-4 hover:text-[#1D3658]">
            Start the Fraud Readiness Assessment
          </Link>
        </div>
      </section>
    );
  }

  return (
    <form onSubmit={submit} data-public-advisory-enquiry="true" className="border border-slate-200 bg-white p-7 lg:p-9">
      {errors.length ? (
        <div role="alert" className="mb-7 rounded-xl border border-[#9B2C2C]/30 bg-[#9B2C2C]/[0.06] p-4 text-sm leading-6 text-[#9B2C2C]">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}

      <fieldset className="border-0 p-0">
        <legend className="text-lg font-semibold tracking-tight text-[#001030]">Your details</legend>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <label className={LABEL}>
            Full name
            <input required autoComplete="name" value={form.contactName} onChange={(event) => update('contactName', event.target.value)} maxLength={120} className={FIELD} />
          </label>
          <label className={LABEL}>
            Work email
            <input required type="email" autoComplete="email" value={form.email} onChange={(event) => update('email', event.target.value)} maxLength={254} className={FIELD} />
          </label>
          <label className={LABEL}>
            Organisation
            <input required autoComplete="organization" value={form.companyName} onChange={(event) => update('companyName', event.target.value)} maxLength={160} className={FIELD} />
          </label>
          <label className={LABEL}>
            Phone (optional)
            <input type="tel" autoComplete="tel" value={form.contactPhone} onChange={(event) => update('contactPhone', event.target.value)} maxLength={40} className={FIELD} />
          </label>
        </div>
      </fieldset>

      <fieldset className="mt-9 border-0 p-0">
        <legend className="text-lg font-semibold tracking-tight text-[#001030]">What you need</legend>

        <label className={`${LABEL} mt-5`}>
          Primary reason for the conversation
          <select required value={form.primaryReason} onChange={(event) => update('primaryReason', event.target.value)} className={FIELD}>
            <option value="">Select a reason</option>
            {ADVISORY_REASONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>

        <div className="mt-6">
          <p className={LABEL}>Areas of focus</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">Select every area you want MK to consider.</p>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {ADVISORY_FOCUS_AREAS.map(([value, label]) => (
              <label key={value} className={CHOICE}>
                <input type="checkbox" checked={areasOfFocus.includes(value)} onChange={() => toggleFocus(value)} className="mt-1 h-4 w-4 shrink-0 accent-[#1D3658]" />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <p className={LABEL}>Preferred contact method</p>
            <div className="mt-3 space-y-2.5">
              {ADVISORY_CONTACT_METHODS.map(([value, label]) => (
                <label key={value} className={CHOICE}>
                  <input type="radio" required name="preferredContactMethod" value={value} checked={form.preferredContactMethod === value} onChange={(event) => update('preferredContactMethod', event.target.value)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#1D3658]" />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className={LABEL}>Preferred timeframe</p>
            <div className="mt-3 space-y-2.5">
              {ADVISORY_TIMEFRAMES.map(([value, label]) => (
                <label key={value} className={CHOICE}>
                  <input type="radio" required name="preferredConsultationTimeframe" value={value} checked={form.preferredConsultationTimeframe === value} onChange={(event) => update('preferredConsultationTimeframe', event.target.value)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#1D3658]" />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <label className={`${LABEL} mt-6`}>
          Anything else MK should know (optional)
          <textarea value={form.notes} onChange={(event) => update('notes', event.target.value)} maxLength={800} rows={5} className={`${FIELD} min-h-0 leading-6`} />
        </label>
      </fieldset>

      {/* Honeypot. Hidden from people and from assistive technology; a value here means a bot. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label>
          Company website
          <input type="text" tabIndex={-1} autoComplete="off" value={botcheck} onChange={(event) => setBotcheck(event.target.value)} />
        </label>
      </div>

      <label className="mt-8 flex items-start gap-3 border-t border-slate-200 pt-6 text-sm leading-6 text-slate-700">
        <input type="checkbox" required checked={consentContact} onChange={(event) => setConsentContact(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#1D3658]" />
        <span>
          I agree that MK Fraud Insights may contact me about this enquiry, and I have read the{' '}
          <Link href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#001030] underline decoration-[#1D3658] underline-offset-4 hover:text-[#1D3658]">
            Privacy Notice
          </Link>
          .
        </span>
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="mt-7 inline-flex min-h-12 w-full items-center justify-center bg-[#001030] px-7 py-3 text-sm font-semibold text-white transition hover:bg-[#1D3658] focus:outline-none focus:ring-2 focus:ring-[#1D3658] focus:ring-offset-2 disabled:cursor-wait disabled:opacity-70 sm:w-auto"
      >
        {submitting ? 'Sending…' : 'Send Advisory enquiry'}
      </button>

      <p className="mt-4 text-sm leading-6 text-slate-600">
        This is an enquiry, not an order. Nothing is charged and no engagement begins until scope
        and fees are agreed with you in writing.
      </p>
    </form>
  );
}
