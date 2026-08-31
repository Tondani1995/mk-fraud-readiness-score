'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { trackEvent } from '@/lib/website/gtag';

const REASONS = [
  ['understand_control_weaknesses', 'Understand current fraud-control weaknesses'],
  ['design_strengthen_programme', 'Design or strengthen a fraud-risk programme'],
  ['respond_incident_audit_control', 'Respond to an incident, audit finding or control concern'],
  ['prepare_governance_response', 'Prepare a management, board or governance response'],
  ['review_policies_controls', 'Review policies, procedures or operating controls'],
  ['other', 'Other']
] as const;

const FOCUS_AREAS = [
  ['fraud_governance_oversight', 'Fraud governance and oversight'],
  ['fraud_risk_identification_assessment', 'Fraud-risk identification and assessment'],
  ['operational_fraud_controls', 'Operational fraud controls'],
  ['third_party_supplier_procurement_risk', 'Third-party, supplier and procurement risk'],
  ['digital_identity_channel_fraud', 'Digital, identity and channel fraud'],
  ['fraud_monitoring_detection', 'Fraud monitoring and detection'],
  ['incident_response_investigations', 'Incident response and investigations'],
  ['fraud_culture_awareness', 'Fraud culture and awareness'],
  ['other', 'Other']
] as const;

const CONTACT_METHODS = [
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['video_meeting', 'Video meeting']
] as const;

const TIMEFRAMES = [
  ['within_one_week', 'Within one week'],
  ['within_two_weeks', 'Within two weeks'],
  ['within_one_month', 'Within one month'],
  ['exploring_options', 'Exploring options']
] as const;

type AdvisoryEnquiryFormProps = {
  assessmentReference: string;
  snapshotToken: string;
  snapshotPath: string;
  organisationName: string;
  maturity: string | null;
  score: number | null;
};

export function AdvisoryEnquiryForm({
  assessmentReference,
  snapshotToken,
  snapshotPath,
  organisationName,
  maturity,
  score
}: AdvisoryEnquiryFormProps) {
  const [primaryReason, setPrimaryReason] = useState('');
  const [areasOfFocus, setAreasOfFocus] = useState<string[]>([]);
  const [preferredContactMethod, setPreferredContactMethod] = useState('');
  const [preferredConsultationTimeframe, setPreferredConsultationTimeframe] = useState('');
  const [notes, setNotes] = useState('');
  const [consentContact, setConsentContact] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ requestReference: string; message: string } | null>(null);

  function toggleFocusArea(value: string) {
    setAreasOfFocus((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/score/api/assessments/${encodeURIComponent(assessmentReference)}/personalised-report-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshotToken,
          primaryReason,
          areasOfFocus,
          preferredContactMethod,
          preferredConsultationTimeframe,
          notes,
          consentContact
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) {
        const message = Array.isArray(payload?.errors) && payload.errors.length
          ? payload.errors.join(' ')
          : 'The Advisory request could not be submitted. Please try again.';
        setError(message);
        return;
      }

      setSuccess({ requestReference: String(payload.requestReference), message: String(payload.message) });
      trackEvent('advisory_enquiry_submitted', { source: 'snapshot' });
    } catch {
      setError('The Advisory request could not be submitted. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <section className="mx-auto max-w-[760px] px-[18px] py-12 md:px-6 md:py-16">
        <p className="text-[9.5px] uppercase tracking-[0.2em] text-mk-accent">MK Advisory</p>
        <h1 className="mt-2.5 max-w-[18ch] text-[28px] font-semibold leading-tight tracking-tight text-mk-navy md:text-[40px]">
          Thanks. MK has your request.
        </h1>
        <p className="mt-4 max-w-[62ch] text-[15px] leading-7 text-mk-slate">{success.message}</p>
        <div className="mt-7 rounded-2xl border border-mk-line bg-mk-surface p-5">
          <p className="text-[10px] uppercase tracking-[0.16em] text-mk-muted">Your enquiry reference</p>
          <p className="mt-1.5 text-lg font-semibold tracking-wide text-mk-navy">{success.requestReference}</p>
        </div>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href={snapshotPath} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-mk-navy px-5 py-3 text-[13px] font-semibold text-white transition hover:bg-mk-slate focus:outline-none focus:ring-2 focus:ring-mk-accent focus:ring-offset-2">
            Back to your Snapshot
          </Link>
          <Link href="/contact" className="inline-flex min-h-12 items-center justify-center rounded-xl border-2 border-mk-accent/25 px-5 py-3 text-[13px] font-semibold text-mk-navy transition hover:border-mk-accent/50 focus:outline-none focus:ring-2 focus:ring-mk-accent focus:ring-offset-2">
            Book a 30-minute conversation
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[920px] px-[18px] py-10 md:px-6 md:py-16">
      <div className="max-w-[68ch]">
        <p className="text-[9.5px] uppercase tracking-[0.2em] text-mk-accent">MK Advisory</p>
        <h1 className="mt-2.5 max-w-[18ch] text-[28px] font-semibold leading-tight tracking-tight text-mk-navy md:text-[40px]">
          Talk to MK about your result
        </h1>
        <p className="mt-4 text-[15px] leading-7 text-mk-slate">
          We already have your Fraud Readiness assessment. Tell us briefly where you need help and we’ll use your result to prepare for the conversation.
        </p>
      </div>

      <div className="mt-8 grid gap-4 rounded-2xl border border-mk-line bg-mk-surface p-5 sm:grid-cols-3">
        <ContextItem label="Organisation" value={organisationName} />
        <ContextItem label="Assessment" value={assessmentReference} />
        <ContextItem label="Maturity" value={maturity ?? 'Not recorded'} />
        {score !== null ? <ContextItem label="Score" value={score.toFixed(2)} /> : null}
      </div>

      <form onSubmit={submit} className="mt-8 space-y-8">
        <fieldset>
          <legend className="text-sm font-semibold text-mk-navy">What would you like help with?</legend>
          <select
            id="primary-reason"
            name="primaryReason"
            value={primaryReason}
            onChange={(event) => setPrimaryReason(event.target.value)}
            required
            className="mt-3 min-h-12 w-full rounded-xl border border-mk-line bg-white px-4 py-3 text-sm text-mk-navy focus:border-mk-accent focus:outline-none focus:ring-2 focus:ring-mk-accent/30"
          >
            <option value="">Choose one</option>
            {REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold text-mk-navy">Which areas would you like to discuss?</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {FOCUS_AREAS.map(([value, label]) => (
              <label key={value} className="flex min-h-12 items-start gap-3 rounded-xl border border-mk-line bg-white px-3.5 py-3 text-sm leading-6 text-mk-slate">
                <input
                  type="checkbox"
                  name="areasOfFocus"
                  value={value}
                  checked={areasOfFocus.includes(value)}
                  onChange={() => toggleFocusArea(value)}
                  className="mt-1 h-4 w-4 accent-mk-accent"
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
          {!areasOfFocus.length ? <p className="mt-2 text-xs text-mk-muted">Choose at least one area.</p> : null}
        </fieldset>

        <div className="grid gap-6 md:grid-cols-2">
          <fieldset>
            <legend className="text-sm font-semibold text-mk-navy">Preferred contact</legend>
            <div className="mt-3 grid gap-2">
              {CONTACT_METHODS.map(([value, label]) => (
                <label key={value} className="flex min-h-12 items-center gap-3 rounded-xl border border-mk-line bg-white px-3.5 py-3 text-sm text-mk-slate">
                  <input type="radio" name="preferredContactMethod" value={value} checked={preferredContactMethod === value} onChange={(event) => setPreferredContactMethod(event.target.value)} required className="h-4 w-4 accent-mk-accent" />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold text-mk-navy">When would you like to talk?</legend>
            <div className="mt-3 grid gap-2">
              {TIMEFRAMES.map(([value, label]) => (
                <label key={value} className="flex min-h-12 items-center gap-3 rounded-xl border border-mk-line bg-white px-3.5 py-3 text-sm text-mk-slate">
                  <input type="radio" name="preferredConsultationTimeframe" value={value} checked={preferredConsultationTimeframe === value} onChange={(event) => setPreferredConsultationTimeframe(event.target.value)} required className="h-4 w-4 accent-mk-accent" />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <label htmlFor="advisory-notes" className="block">
          <span className="text-sm font-semibold text-mk-navy">Anything else you would like us to know? <span className="font-normal text-mk-muted">Optional</span></span>
          <textarea id="advisory-notes" name="notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={800} rows={5} className="mt-3 w-full rounded-xl border border-mk-line bg-white px-4 py-3 text-sm leading-6 text-mk-navy focus:border-mk-accent focus:outline-none focus:ring-2 focus:ring-mk-accent/30" />
        </label>

        <label className="flex items-start gap-3 rounded-xl border border-mk-line bg-mk-surface px-4 py-3.5 text-sm leading-6 text-mk-slate">
          <input type="checkbox" name="consentContact" checked={consentContact} onChange={(event) => setConsentContact(event.target.checked)} required className="mt-1 h-4 w-4 accent-mk-accent" />
          <span>I agree that MK may use these details to contact me about this Advisory request.</span>
        </label>

        {error ? <p role="alert" className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 px-4 py-3 text-sm leading-6 text-mk-danger">{error}</p> : null}

        <div className="flex flex-wrap items-center gap-4">
          <button type="submit" disabled={submitting} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-mk-navy px-5 py-3 text-[13px] font-semibold text-white transition hover:bg-mk-slate disabled:cursor-wait disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-mk-accent focus:ring-offset-2">
            {submitting ? 'Sending request…' : 'Send request to MK'}
          </button>
          <Link href={snapshotPath} className="text-sm font-semibold text-mk-accent hover:underline">Back to your Snapshot</Link>
        </div>
      </form>
    </section>
  );
}

function ContextItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-[0.14em] text-mk-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-mk-navy">{value}</p>
    </div>
  );
}
