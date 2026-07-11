'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { CommercialDomainInsight, CommercialOptionCode, CommercialSnapshotInsights } from '@/lib/snapshot/commercial-insights';
import { COMMERCIAL_OPTION_CODES, defaultFocusAreasForInsights } from '@/lib/snapshot/commercial-insights';
import type { FreeSnapshot } from '@/lib/snapshot/free-snapshot';

const SCORE_BASE_PATH = '/score';
const FULL_REPORT_PRICE = 'R5,000 including VAT';
const PERSONALISED_REPORT_PRICE = 'From R50,000 including VAT';
const MANUAL_EFT_CONFIRMATION = 'MK Fraud Insights confirms EFT payments manually before any detailed report is released.';

type OrderConfirmation = {
  orderReference: string;
  productName: string;
  amountDisplay: string;
  paymentReference: string;
  manualConfirmationNote: string;
  eftInstructions: {
    active: boolean;
    bankName?: string;
    accountHolder?: string;
    accountNumber?: string;
    branchCode?: string;
    accountType?: string | null;
    currency?: string;
    paymentReferenceInstruction?: string;
    customerInstruction?: string;
    contactEmail?: string;
    message?: string;
  };
};

type EnquiryConfirmation = {
  requestReference: string;
  status: string;
  message: string;
};

function scorePath(path: string) {
  return `${SCORE_BASE_PATH}${path.startsWith('/') ? path : `/${path}`}`;
}

function formatScore(score: number) {
  return Math.round(score).toString();
}

function snapshotTokenFromUrl(snapshotUrl?: string | null) {
  try {
    if (snapshotUrl) return new URL(snapshotUrl, window.location.origin).searchParams.get('token');
    return new URL(window.location.href).searchParams.get('token');
  } catch {
    return null;
  }
}

export function FreeSnapshotCard({
  snapshot,
  snapshotUrl,
  commercialInsights
}: {
  snapshot: FreeSnapshot;
  snapshotUrl?: string | null;
  commercialInsights: CommercialSnapshotInsights;
}) {
  const [selectedOption, setSelectedOption] = useState<CommercialOptionCode | null>(null);
  const [requestState, setRequestState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [orderConfirmation, setOrderConfirmation] = useState<OrderConfirmation | null>(null);
  const [enquiryState, setEnquiryState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [enquiryMessage, setEnquiryMessage] = useState('');
  const [enquiryConfirmation, setEnquiryConfirmation] = useState<EnquiryConfirmation | null>(null);

  const defaultFocus = useMemo(() => defaultFocusAreasForInsights(commercialInsights), [commercialInsights]);
  const [areasOfFocus, setAreasOfFocus] = useState<string[]>(defaultFocus);

  async function emitCommercialEvent(eventType: string, optionCode?: CommercialOptionCode | null, sourceSection = 'free_snapshot') {
    const snapshotToken = snapshotTokenFromUrl(snapshotUrl);
    if (!snapshotToken) return;

    await fetch(scorePath(`/api/assessments/${snapshot.assessmentReference}/commercial-event`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        snapshotToken,
        eventType,
        optionCode,
        sourceSection
      })
    }).catch(() => null);
  }

  async function selectFullReport() {
    setSelectedOption(COMMERCIAL_OPTION_CODES.fullReport);
    setRequestState('idle');
    setMessage('');
    setOrderConfirmation(null);
    await emitCommercialEvent('report_option_selected', COMMERCIAL_OPTION_CODES.fullReport, 'report_options');
    await emitCommercialEvent('full_report_5000_selected', COMMERCIAL_OPTION_CODES.fullReport, 'report_options');
  }

  async function selectPersonalisedReport() {
    setSelectedOption(COMMERCIAL_OPTION_CODES.personalisedReport);
    setEnquiryMessage('');
    setEnquiryConfirmation(null);
    await emitCommercialEvent('report_option_selected', COMMERCIAL_OPTION_CODES.personalisedReport, 'report_options');
  }

  async function requestDetailedReport() {
    setRequestState('sending');
    setMessage('');
    setOrderConfirmation(null);
    const response = await fetch(scorePath(`/api/assessments/${snapshot.assessmentReference}/report-request`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'free_snapshot', snapshotToken: snapshotTokenFromUrl(snapshotUrl) })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) {
      setRequestState('error');
      setMessage(body.errors?.[0] ?? 'The detailed report request could not be submitted. Please contact MK Fraud Insights.');
      return;
    }
    setRequestState('sent');
    setMessage(body.message ?? 'Your report order has been recorded.');
    setOrderConfirmation(body.order ?? null);
  }

  async function submitPersonalisedEnquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const consentContact = formData.get('consentContact') === 'on';
    if (!consentContact) {
      setEnquiryState('error');
      setEnquiryMessage('Please confirm consent before submitting the personalised report request.');
      return;
    }

    setEnquiryState('sending');
    setEnquiryMessage('');
    setEnquiryConfirmation(null);

    const response = await fetch(scorePath(`/api/assessments/${snapshot.assessmentReference}/personalised-report-request`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        snapshotToken: snapshotTokenFromUrl(snapshotUrl),
        primaryReason: String(formData.get('primaryReason') ?? ''),
        areasOfFocus,
        preferredContactMethod: String(formData.get('preferredContactMethod') ?? ''),
        preferredConsultationTimeframe: String(formData.get('preferredConsultationTimeframe') ?? ''),
        notes: String(formData.get('notes') ?? ''),
        consentContact
      })
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok || !body.ok) {
      setEnquiryState('error');
      setEnquiryMessage(body.errors?.[0] ?? 'The personalised report request could not be submitted. Please contact MK Fraud Insights.');
      return;
    }

    setEnquiryState('sent');
    setEnquiryMessage(body.message ?? 'Your request has been received.');
    setEnquiryConfirmation({ requestReference: body.requestReference, status: body.status, message: body.message });
  }

  function toggleFocusArea(area: string) {
    setAreasOfFocus((current) => current.includes(area) ? current.filter((item) => item !== area) : [...current, area].slice(0, 6));
  }

  return (
    <div className="space-y-6">
      <Card className="border-mk-charcoal/20">
        <CardHeader className="bg-mk-charcoal text-white">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">Assessment complete</p>
              <CardTitle className="mt-2 text-2xl text-white">Your organisation&apos;s fraud readiness position</CardTitle>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/75">
                Your assessment has been scored using the MK Fraud Readiness methodology across ten control domains and your organisation&apos;s fraud-exposure profile.
              </p>
              <p className="mt-2 text-sm text-white/70">Reference: {snapshot.assessmentReference}</p>
            </div>
            <Badge>{snapshot.finalMaturity}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          <section className="grid gap-4 md:grid-cols-5" aria-label="Snapshot metrics">
            <Metric label="Overall readiness score" value={`${formatScore(snapshot.overallScore)}/100`} supporting="Persisted score result" />
            <Metric label="Final maturity level" value={snapshot.finalMaturity} supporting="Based on submitted answers" />
            <Metric label="Coverage status" value={`${formatScore(snapshot.coveragePct)}%`} supporting={`${formatScore(snapshot.nARatePct)}% not applicable`} />
            <Metric label="Exposure band" value={snapshot.exposureBand} supporting="Exposure profile included" />
            <Metric label="Critical controls" value={String(snapshot.criticalGapCount)} supporting={`${snapshot.majorGapCount} serious control gaps`} />
          </section>

          <section className="grid gap-3 md:grid-cols-4" aria-label="Assessment trust facts">
            {['68 controlled questions', '10 fraud-readiness domains', 'Exposure profile included', 'Deterministic scoring'].map((item) => (
              <div key={item} className="rounded-xl border border-mk-line bg-mk-cream/50 p-3 text-sm font-semibold text-mk-ink">{item}</div>
            ))}
          </section>

          <div className="rounded-2xl border border-mk-line bg-white p-5 text-sm leading-6 text-mk-muted">
            <p className="font-semibold text-mk-ink">Concise readiness interpretation</p>
            <p className="mt-2">{commercialInsights.conciseInterpretation}</p>
          </div>

          {commercialInsights.criticalGapIndicator ? (
            <div className="rounded-2xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-sm leading-6 text-mk-danger">
              <p className="font-semibold">Critical-control warning</p>
              <p className="mt-1">
                Priority-gap alert: the assessment found {snapshot.criticalGapCount} critical-control weakness{snapshot.criticalGapCount === 1 ? '' : 'es'} and {snapshot.majorGapCount} serious gap{snapshot.majorGapCount === 1 ? '' : 's'} that should be interpreted before relying on the headline score.
              </p>
            </div>
          ) : null}

          <TrackedSection snapshot={snapshot} snapshotUrl={snapshotUrl} eventType="executive_summary_viewed" sourceSection="executive_summary" id="executive-summary" className="rounded-2xl border border-mk-line bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mk-brassDark">Executive interpretation</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <InterpretationBlock title="Current position" body={commercialInsights.currentPosition} />
              <InterpretationBlock title="Risk implication" body={commercialInsights.riskImplication} />
              <InterpretationBlock title="Leadership priority" body={commercialInsights.leadershipPriority} />
            </div>
            {commercialInsights.coverageMessage ? (
              <div className="mt-4 rounded-xl border border-mk-line bg-mk-cream/60 p-4 text-sm leading-6 text-mk-muted">
                <p className="font-semibold text-mk-ink">Coverage and applicability</p>
                <p className="mt-1">{commercialInsights.coverageMessage}</p>
              </div>
            ) : null}
          </TrackedSection>

          <section className="grid gap-5 lg:grid-cols-2">
            <InsightList title="Priority areas for management focus" insights={commercialInsights.priorityAreas} empty="No priority areas are available in the free snapshot." />
            <InsightList title="Foundations you can build on" insights={commercialInsights.strengths} empty="Important context" footer={commercialInsights.strengthContext} />
          </section>

          <section className="rounded-2xl border border-mk-line bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mk-brassDark">Free readiness snapshot</p>
            <h3 className="mt-2 text-xl font-semibold text-mk-ink">Your snapshot identifies the position. The detailed report explains what to do next.</h3>
            <p className="mt-2 text-sm leading-6 text-mk-muted">
              The free result gives you a high-level view of your organisation&apos;s readiness. The detailed report converts that result into a structured management response.
            </p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <ValueList title="Free readiness snapshot" items={commercialInsights.freeSnapshotValue} />
              <ValueList title="Full MK Fraud Readiness Report" items={commercialInsights.paidReportValue} />
            </div>
          </section>

          <TrackedSection snapshot={snapshot} snapshotUrl={snapshotUrl} eventType="report_options_opened" sourceSection="report_options" id="report-options" className="rounded-2xl border border-mk-charcoal/15 bg-mk-cream/60 p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mk-brassDark">Report options</p>
                <h3 className="mt-2 text-xl font-semibold text-mk-ink">Choose the level of support your organisation needs</h3>
              </div>
              <Badge>MK quality review</Badge>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <OptionCard
                selected={selectedOption === COMMERCIAL_OPTION_CODES.fullReport}
                badge="Most direct next step"
                title="Full MK Fraud Readiness Report"
                price={FULL_REPORT_PRICE}
                description="A detailed, expert-reviewed report based on the completed assessment."
                bullets={[
                  'Full fraud-readiness diagnosis',
                  'Findings across all applicable domains',
                  'Critical-control and exposure analysis',
                  'Prioritised action register',
                  '30/60/90-day roadmap',
                  'Leadership agenda',
                  'Professionally prepared PDF report'
                ]}
                delivery="Delivered within one business day after payment confirmation"
                supportingNote="Payment is made by EFT. MK confirms payment manually before the completed report is released."
                buttonLabel="Order the full report"
                onSelect={() => void selectFullReport()}
              />
              <OptionCard
                selected={selectedOption === COMMERCIAL_OPTION_CODES.personalisedReport}
                badge="For complex or higher-exposure organisations"
                title="Advanced Personalised Fraud Readiness Report"
                price={PERSONALISED_REPORT_PRICE}
                description="A bespoke, expert-led fraud-readiness review incorporating the organisation&apos;s operating context and selected supporting evidence."
                bullets={[
                  'Everything contained in the Full MK Fraud Readiness Report',
                  'Review of selected policies, procedures and control documents',
                  'Deeper analysis of material fraud exposures',
                  'Organisation-specific recommendations',
                  'Management or stakeholder consultations, where agreed',
                  'Tailored implementation roadmap',
                  'Executive presentation or working session, where included in the agreed scope'
                ]}
                supportingNote="The final scope, information requirements, delivery period and price are agreed with MK before the engagement begins."
                buttonLabel="Request a personalised proposal"
                onSelect={() => void selectPersonalisedReport()}
              />
            </div>

            {selectedOption === COMMERCIAL_OPTION_CODES.fullReport ? (
              <div className="mt-5 rounded-2xl border border-mk-line bg-white p-5">
                {orderConfirmation ? (
                  <OrderConfirmationPanel order={orderConfirmation} />
                ) : (
                  <ReportOrderSummary snapshot={snapshot} requestState={requestState} message={message} onConfirm={requestDetailedReport} />
                )}
              </div>
            ) : null}

            {selectedOption === COMMERCIAL_OPTION_CODES.personalisedReport ? (
              <PersonalisedReportForm
                snapshot={snapshot}
                areasOfFocus={areasOfFocus}
                toggleFocusArea={toggleFocusArea}
                state={enquiryState}
                message={enquiryMessage}
                confirmation={enquiryConfirmation}
                onSubmit={submitPersonalisedEnquiry}
              />
            ) : null}
          </TrackedSection>

          <section className="rounded-2xl border border-mk-line bg-white p-5 text-sm leading-6 text-mk-muted">
            <p className="font-semibold text-mk-ink">How MK protects the integrity of your result</p>
            <p className="mt-2">
              Your readiness score is calculated using a controlled, deterministic methodology. Paid reports are prepared from persisted assessment results and are subject to MK quality review before release.
            </p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {[
                'Selecting a paid service does not change the assessment score',
                'Paid reports do not alter the underlying assessment result',
                'Customer information is used only for the stated assessment and service purpose',
                'Reports are reviewed before release'
              ].map((item) => <li key={item} className="rounded-xl border border-mk-line bg-mk-cream/40 p-3">{item}</li>)}
            </ul>
          </section>

          {snapshotUrl ? (
            <div className="flex flex-col gap-3 border-t border-mk-line pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-mk-muted">Save this private link if you need to reopen the free readiness snapshot later. Refreshing it reloads the submitted result without unlocking the assessment.</p>
              <div className="flex flex-wrap gap-2">
                <CopyButton value={snapshotUrl} label="Copy private link" />
                <Button asChild variant="secondary"><Link href={snapshotUrl}>Open snapshot link</Link></Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function TrackedSection({ snapshot, snapshotUrl, eventType, sourceSection, id, className, children }: { snapshot: FreeSnapshot; snapshotUrl?: string | null; eventType: string; sourceSection: string; id: string; className: string; children: ReactNode }) {
  const ref = useRef<HTMLElement | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (sent || !ref.current || !('IntersectionObserver' in window)) return;
    const node = ref.current;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5);
      if (!visible) return;
      setSent(true);
      const snapshotToken = snapshotTokenFromUrl(snapshotUrl);
      if (!snapshotToken) return;
      void fetch(scorePath(`/api/assessments/${snapshot.assessmentReference}/commercial-event`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotToken, eventType, sourceSection })
      }).catch(() => null);
    }, { threshold: [0.5] });
    observer.observe(node);
    return () => observer.disconnect();
  }, [eventType, sent, snapshot.assessmentReference, snapshotUrl, sourceSection]);

  return <section ref={ref} id={id} className={className}>{children}</section>;
}

function ReportOrderSummary({ snapshot, requestState, message, onConfirm }: { snapshot: FreeSnapshot; requestState: 'idle' | 'sending' | 'sent' | 'error'; message: string; onConfirm: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-semibold text-mk-ink">Confirm your report order</p>
          <p className="mt-1 text-sm leading-6 text-mk-muted">Review the summary before continuing to EFT instructions.</p>
        </div>
        <Button type="button" onClick={() => void onConfirm()} disabled={requestState === 'sending'}>
          {requestState === 'sending' ? 'Preparing instructions...' : 'Continue to EFT instructions'}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Detail label="Product name" value="Full MK Fraud Readiness Report" />
        <Detail label="Organisation" value={snapshot.organisationName} />
        <Detail label="Assessment reference" value={snapshot.assessmentReference} copyable />
        <Detail label="Price" value={FULL_REPORT_PRICE} />
        <Detail label="Delivery" value="One business day after payment confirmation" />
        <Detail label="Quality review" value="Prepared from persisted results and reviewed by MK before release" />
      </div>
      <p className="rounded-xl border border-mk-line bg-mk-cream/50 p-4 text-sm leading-6 text-mk-muted">Payment is made by EFT. MK confirms payment manually before the completed report is released.</p>
      {message ? <p className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-sm text-mk-danger">{message}</p> : null}
    </div>
  );
}

function OrderConfirmationPanel({ order }: { order: OrderConfirmation }) {
  const eft = order.eftInstructions;
  return (
    <div className="space-y-4 text-mk-ink">
      <div>
        <p className="font-semibold">Your report order has been recorded</p>
        <p className="mt-2 text-sm leading-6 text-mk-muted">Your order reference is {order.orderReference}. Keep this reference for payment and any communication with MK Fraud Insights.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Detail label="Order reference" value={order.orderReference} copyable />
        <Detail label="Product" value="Full MK Fraud Readiness Report" />
        <Detail label="Amount" value={order.amountDisplay || FULL_REPORT_PRICE} />
        <Detail label="Payment reference" value={order.paymentReference} copyable />
      </div>
      <div className="rounded-xl border border-mk-brass/40 bg-mk-brass/10 p-4 text-sm font-semibold text-mk-ink">Use the order reference exactly as shown when making payment.</div>
      {eft.active ? (
        <div className="rounded-lg bg-mk-cream p-4 text-sm leading-6">
          <p className="font-semibold">Manual EFT details</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Detail label="Bank" value={eft.bankName ?? 'To be confirmed'} />
            <Detail label="Account holder" value={eft.accountHolder ?? 'To be confirmed'} />
            <Detail label="Account number" value={eft.accountNumber ?? 'To be confirmed'} copyable />
            <Detail label="Branch code" value={eft.branchCode ?? 'To be confirmed'} copyable />
            <Detail label="Currency" value={eft.currency ?? 'ZAR'} />
            {eft.accountType ? <Detail label="Account type" value={eft.accountType} /> : null}
            {eft.contactEmail ? <Detail label="Contact" value={eft.contactEmail} /> : null}
          </div>
        </div>
      ) : (
        <p className="rounded-lg bg-mk-cream p-4 text-sm leading-6 text-mk-muted">{eft.message ?? 'MK Fraud Insights will send EFT instructions directly after reviewing the report request.'}</p>
      )}
      <ol className="space-y-2 rounded-xl border border-mk-line bg-white p-4 text-sm leading-6 text-mk-muted">
        <li>1. Make the EFT using the displayed order reference.</li>
        <li>2. MK confirms payment manually.</li>
        <li>3. The report is prepared and quality-reviewed.</li>
        <li>4. The completed report is sent to the confirmed customer email address.</li>
      </ol>
      <p className="text-sm leading-6 text-mk-muted">{eft.paymentReferenceInstruction ?? 'Please use your order reference as the payment reference.'}</p>
      <p className="text-sm leading-6 text-mk-muted">{eft.customerInstruction ?? order.manualConfirmationNote ?? MANUAL_EFT_CONFIRMATION}</p>
    </div>
  );
}

function PersonalisedReportForm({
  snapshot,
  areasOfFocus,
  toggleFocusArea,
  state,
  message,
  confirmation,
  onSubmit
}: {
  snapshot: FreeSnapshot;
  areasOfFocus: string[];
  toggleFocusArea: (area: string) => void;
  state: 'idle' | 'sending' | 'sent' | 'error';
  message: string;
  confirmation: EnquiryConfirmation | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-4 rounded-2xl border border-mk-line bg-white p-5">
      <div>
        <p className="font-semibold text-mk-ink">Tell us what your organisation needs</p>
        <p className="mt-1 text-sm leading-6 text-mk-muted">MK will review the assessment context before discussing scope, information requirements, delivery approach and commercial proposal.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Detail label="Organisation" value={snapshot.organisationName} />
        <Detail label="Assessment reference" value={snapshot.assessmentReference} />
        <Detail label="Respondent" value={snapshot.respondentName ?? 'Respondent'} />
        <Detail label="Respondent email" value={snapshot.respondentEmail ?? 'Email captured at assessment start'} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField name="primaryReason" label="Primary reason" options={PRIMARY_REASON_OPTIONS} />
        <SelectField name="preferredContactMethod" label="Preferred contact method" options={CONTACT_METHOD_OPTIONS} />
        <SelectField name="preferredConsultationTimeframe" label="Preferred consultation timeframe" options={TIMEFRAME_OPTIONS} />
      </div>
      <div>
        <p className="text-sm font-semibold text-mk-ink">Areas requiring deeper review</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {FOCUS_OPTIONS.map((option) => (
            <label key={option[0]} className="flex gap-2 rounded-xl border border-mk-line bg-mk-cream/40 p-3 text-sm text-mk-muted">
              <input type="checkbox" checked={areasOfFocus.includes(option[0])} onChange={() => toggleFocusArea(option[0])} />
              <span>{option[1]}</span>
            </label>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="text-sm font-semibold text-mk-ink">Short context for MK</span>
        <textarea name="notes" rows={3} maxLength={800} className="mt-2 w-full rounded-xl border border-mk-line bg-mk-paper px-4 py-3 text-sm text-mk-ink outline-none focus:border-mk-brass" placeholder="Optional context. Please do not include confidential records, incident details, names, account numbers or passwords." />
      </label>
      <label className="flex gap-3 rounded-xl border border-mk-line bg-mk-cream/50 p-4 text-sm leading-6 text-mk-muted">
        <input name="consentContact" type="checkbox" className="mt-1" required />
        <span>By submitting this request, you consent to MK Fraud Insights contacting you about the personalised fraud-readiness review. Submission does not create a payment obligation or confirm a final scope.</span>
      </label>
      <Button type="submit" disabled={state === 'sending'}>{state === 'sending' ? 'Submitting request...' : 'Request a consultation'}</Button>
      {message ? (
        <div className={`rounded-xl border p-4 text-sm ${state === 'error' ? 'border-mk-danger/30 bg-mk-danger/10 text-mk-danger' : 'border-mk-success/30 bg-mk-success/10 text-mk-ink'}`}>
          {confirmation ? (
            <div className="space-y-2">
              <p className="font-semibold">Your request has been received</p>
              <p>MK Fraud Insights will review your assessment context and contact you to discuss the appropriate scope, information requirements, delivery approach and commercial proposal.</p>
              <Detail label="Enquiry reference" value={confirmation.requestReference} copyable />
            </div>
          ) : <p>{message}</p>}
        </div>
      ) : null}
    </form>
  );
}

const PRIMARY_REASON_OPTIONS: Array<[string, string]> = [
  ['understand_control_weaknesses', 'Understand current fraud-control weaknesses'],
  ['design_strengthen_programme', 'Design or strengthen a fraud-risk programme'],
  ['respond_incident_audit_control', 'Respond to an incident, audit finding or control concern'],
  ['prepare_governance_response', 'Prepare a management, board or governance response'],
  ['review_policies_controls', 'Review policies, procedures or operating controls'],
  ['other', 'Other']
];

const FOCUS_OPTIONS: Array<[string, string]> = [
  ['fraud_governance_oversight', 'Fraud governance and oversight'],
  ['fraud_risk_identification_assessment', 'Fraud-risk identification and assessment'],
  ['operational_fraud_controls', 'Operational fraud controls'],
  ['third_party_supplier_procurement_risk', 'Third-party, supplier and procurement risk'],
  ['digital_identity_channel_fraud', 'Digital, identity and channel fraud'],
  ['fraud_monitoring_detection', 'Fraud monitoring and detection'],
  ['incident_response_investigations', 'Incident response and investigations'],
  ['fraud_culture_awareness', 'Fraud culture and awareness'],
  ['other', 'Other']
];

const CONTACT_METHOD_OPTIONS: Array<[string, string]> = [
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['video_meeting', 'Video meeting']
];

const TIMEFRAME_OPTIONS: Array<[string, string]> = [
  ['within_one_week', 'Within one week'],
  ['within_two_weeks', 'Within two weeks'],
  ['within_one_month', 'Within one month'],
  ['exploring_options', 'Exploring options']
];

function SelectField({ name, label, options }: { name: string; label: string; options: Array<[string, string]> }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-mk-ink">{label}</span>
      <select name={name} className="mt-2 w-full rounded-xl border border-mk-line bg-mk-paper px-4 py-3 text-sm text-mk-ink outline-none focus:border-mk-brass">
        <option value="">Select</option>
        {options.map((option) => <option key={option[0]} value={option[0]}>{option[1]}</option>)}
      </select>
    </label>
  );
}

function OptionCard({ selected, badge, title, price, description, bullets, delivery, supportingNote, buttonLabel, onSelect }: { selected: boolean; badge: string; title: string; price: string; description: string; bullets: string[]; delivery?: string; supportingNote: string; buttonLabel: string; onSelect: () => void }) {
  return (
    <div className={`rounded-2xl border bg-white p-5 ${selected ? 'border-mk-brass shadow-soft' : 'border-mk-line'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Badge>{badge}</Badge>
          <p className="mt-3 text-lg font-semibold text-mk-ink">{title}</p>
          <p className="mt-1 text-2xl font-semibold text-mk-brassDark">{price}</p>
        </div>
        {selected ? <Badge>Selected</Badge> : null}
      </div>
      <p className="mt-3 text-sm leading-6 text-mk-muted">{description}</p>
      <ul className="mt-4 space-y-2 text-sm leading-6 text-mk-muted">
        {bullets.map((item) => <li key={item}>- {item}</li>)}
      </ul>
      {delivery ? <p className="mt-4 text-sm font-semibold text-mk-ink">{delivery}</p> : null}
      <p className="mt-3 text-sm leading-6 text-mk-muted">{supportingNote}</p>
      <Button type="button" className="mt-4 w-full" variant={selected ? 'secondary' : 'primary'} onClick={onSelect}>{buttonLabel}</Button>
    </div>
  );
}

function ValueList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-mk-line bg-mk-cream/40 p-4">
      <p className="font-semibold text-mk-ink">{title}</p>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-mk-muted">
        {items.map((item) => <li key={item}>- {item}</li>)}
      </ul>
    </div>
  );
}

function InterpretationBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-mk-line bg-mk-cream/40 p-4">
      <p className="font-semibold text-mk-ink">{title}</p>
      <p className="mt-2 text-sm leading-6 text-mk-muted">{body}</p>
    </div>
  );
}

function InsightList({ title, insights, empty, footer }: { title: string; insights: CommercialDomainInsight[]; empty: string; footer?: string }) {
  return (
    <div className="rounded-2xl border border-mk-line bg-white p-5">
      <p className="font-semibold text-mk-ink">{title}</p>
      <div className="mt-4 space-y-3">
        {insights.length ? insights.map((insight) => (
          <div key={insight.domainCode || insight.domainName} className="rounded-xl border border-mk-line bg-mk-cream/40 p-4 text-sm leading-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-mk-ink">{insight.domainName}</p>
              <Badge>{insight.readinessStatus}</Badge>
            </div>
            <p className="mt-3 text-mk-muted">{insight.finding}</p>
            <p className="mt-2 text-mk-muted">{insight.implication}</p>
            <p className="mt-2 text-xs text-mk-muted">Coverage {insight.coveragePct}% · Critical controls {insight.criticalGapCount}</p>
          </div>
        )) : (
          <div className="rounded-xl border border-mk-line bg-mk-cream/40 p-4 text-sm leading-6 text-mk-muted">
            <p className="font-semibold text-mk-ink">{empty}</p>
            {footer ? <p className="mt-2">{footer}</p> : null}
          </div>
        )}
      </div>
      {footer && insights.length ? <p className="mt-4 text-sm leading-6 text-mk-muted">{footer}</p> : null}
    </div>
  );
}

function Detail({ label, value, copyable = false }: { label: string; value: string; copyable?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mk-muted">{label}</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-mk-ink">{value}</p>
        {copyable ? <CopyButton value={value} label="Copy" /> : null}
      </div>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }
  return <Button type="button" variant="ghost" className="px-3 py-1 text-xs" onClick={() => void copy()}>{copied ? 'Copied' : label}</Button>;
}

function Metric({ label, value, supporting }: { label: string; value: string; supporting: string }) {
  return (
    <div className="rounded-2xl border border-mk-line bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mk-muted">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-mk-ink">{value}</p>
      <p className="mt-2 text-sm text-mk-muted">{supporting}</p>
    </div>
  );
}
