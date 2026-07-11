'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { CommercialDomainInsight, CommercialOptionCode, CommercialSnapshotInsights } from '@/lib/snapshot/commercial-insights';
import { COMMERCIAL_OPTION_CODES } from '@/lib/snapshot/commercial-insights';
import type { FreeSnapshot } from '@/lib/snapshot/free-snapshot';

const SCORE_BASE_PATH = '/score';
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

function splitFocusAreas(value: string[]) {
  return value.length ? value : ['governance', 'process_controls', 'detection_and_monitoring'];
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
  const [reportConsent, setReportConsent] = useState(false);
  const [enquiryState, setEnquiryState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [enquiryMessage, setEnquiryMessage] = useState('');
  const [enquiryConfirmation, setEnquiryConfirmation] = useState<EnquiryConfirmation | null>(null);

  const defaultFocus = useMemo(() => splitFocusAreas(commercialInsights.priorityAreas.map((area) => focusKeyFromName(area.domainName)).filter(Boolean)), [commercialInsights.priorityAreas]);
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
    }).catch(() => undefined);
  }

  async function selectFullReport() {
    setSelectedOption(COMMERCIAL_OPTION_CODES.fullReport);
    await emitCommercialEvent('report_option_selected', COMMERCIAL_OPTION_CODES.fullReport, 'report_options');
    await emitCommercialEvent('full_report_5000_selected', COMMERCIAL_OPTION_CODES.fullReport, 'report_options');
  }

  function selectPersonalisedReport() {
    setSelectedOption(COMMERCIAL_OPTION_CODES.personalisedReport);
    setEnquiryMessage('');
    setEnquiryConfirmation(null);
  }

  async function requestDetailedReport() {
    if (!reportConsent) {
      setRequestState('error');
      setMessage('Please confirm consent before continuing to EFT instructions.');
      return;
    }

    setRequestState('sending');
    setMessage('');
    setOrderConfirmation(null);
    const response = await fetch(scorePath(`/api/assessments/${snapshot.assessmentReference}/report-request`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'free_snapshot', snapshotToken: snapshotTokenFromUrl(snapshotUrl), consentContact: true })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) {
      setRequestState('error');
      setMessage(body.errors?.[0] ?? 'The detailed report request could not be submitted. Please contact MK Fraud Insights.');
      return;
    }
    setRequestState('sent');
    setMessage(body.message ?? 'Your detailed report request has been received. MK Fraud Insights will confirm the next step before any detailed report is released.');
    setOrderConfirmation(body.order ?? null);
  }

  async function submitPersonalisedEnquiry(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const consentContact = formData.get('consentContact') === 'on';
    if (!consentContact) {
      setEnquiryState('error');
      setEnquiryMessage('Please confirm consent before submitting the personalised report enquiry.');
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
        primaryReason: String(formData.get('primaryReason') ?? 'fraud_risk_review'),
        areasOfFocus,
        preferredContactMethod: String(formData.get('preferredContactMethod') ?? 'email'),
        preferredConsultationTimeframe: String(formData.get('preferredConsultationTimeframe') ?? 'exploring'),
        notes: String(formData.get('notes') ?? ''),
        consentContact
      })
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok || !body.ok) {
      setEnquiryState('error');
      setEnquiryMessage(body.errors?.[0] ?? 'The personalised report enquiry could not be submitted. Please contact MK Fraud Insights.');
      return;
    }

    setEnquiryState('sent');
    setEnquiryMessage(body.message ?? 'Your personalised report enquiry has been received.');
    setEnquiryConfirmation({ requestReference: body.requestReference, status: body.status, message: body.message });
  }

  function toggleFocusArea(area: string) {
    setAreasOfFocus((current) => current.includes(area) ? current.filter((item) => item !== area) : [...current, area].slice(0, 5));
  }

  return (
    <div className="space-y-6">
      <Card className="border-mk-charcoal/20">
        <CardHeader className="bg-mk-charcoal text-white">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">Free readiness snapshot</p>
              <CardTitle className="mt-2 text-2xl text-white">{snapshot.organisationName}</CardTitle>
              <p className="mt-2 text-sm text-white/70">Reference: {snapshot.assessmentReference}</p>
            </div>
            <Badge>{snapshot.finalMaturity}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          <section className="grid gap-4 md:grid-cols-5" aria-label="Snapshot metrics">
            <Metric label="Readiness score" value={`${formatScore(snapshot.overallScore)}/100`} supporting="Persisted score result" />
            <Metric label="Readiness level" value={snapshot.finalMaturity} supporting="Based on submitted answers" />
            <Metric label="Exposure score" value={`${formatScore(snapshot.exposureScore)}/100`} supporting={snapshot.exposureBand} />
            <Metric label="Priority gaps" value={String(snapshot.criticalGapCount)} supporting={`${snapshot.majorGapCount} serious control gaps`} />
            <Metric label="Coverage" value={`${formatScore(snapshot.coveragePct)}%`} supporting={`${formatScore(snapshot.nARatePct)}% not applicable`} />
          </section>

          <section id="executive-summary" className="rounded-2xl border border-mk-line bg-white p-5">
            <SnapshotEventBeacon snapshot={snapshot} snapshotUrl={snapshotUrl} eventType="executive_summary_viewed" sourceSection="executive_summary" />
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
          </section>

          {commercialInsights.criticalGapIndicator ? (
            <div className="rounded-2xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-sm leading-6 text-mk-danger">
              <p className="font-semibold">Priority-gap alert</p>
              <p className="mt-1">
                The assessment found {snapshot.criticalGapCount} priority control gap{snapshot.criticalGapCount === 1 ? '' : 's'} and {snapshot.majorGapCount} serious gap{snapshot.majorGapCount === 1 ? '' : 's'} that should be interpreted before relying on the headline score.
              </p>
            </div>
          ) : null}

          <section className="grid gap-5 lg:grid-cols-2">
            <InsightList title="Priority areas" insights={commercialInsights.priorityAreas} empty="No priority areas are available in the free snapshot." />
            <InsightList title="Strengths in context" insights={commercialInsights.strengths} empty="No clear strengths are promoted in the free snapshot." footer={commercialInsights.strengthContext} />
          </section>

          <section className="rounded-2xl border border-mk-line bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mk-brassDark">Free vs paid value</p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <ValueList title="Included in this free snapshot" items={commercialInsights.freeSnapshotValue} />
              <ValueList title="Added by the paid MK report" items={commercialInsights.paidReportValue} />
            </div>
            <p className="mt-4 text-sm leading-6 text-mk-muted">
              This page is intentionally limited. It does not include the full paid-report narrative, implementation planning, public peer comparisons or generated advisory content.
            </p>
          </section>

          <section id="report-options" className="rounded-2xl border border-mk-charcoal/15 bg-mk-cream/60 p-5">
            <SnapshotEventBeacon snapshot={snapshot} snapshotUrl={snapshotUrl} eventType="report_options_opened" sourceSection="report_options" />
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mk-brassDark">Report options</p>
                <h3 className="mt-2 text-xl font-semibold text-mk-ink">Choose the next level of MK review</h3>
              </div>
              <Badge>Manual follow-up</Badge>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <OptionCard
                selected={selectedOption === COMMERCIAL_OPTION_CODES.fullReport}
                title="Full MK Fraud Readiness Report"
                price="R5,000"
                description="Structured PDF report based on the submitted assessment results. Manual EFT only in V1. The report is emailed within one business day after payment confirmation."
                bullets={['No instant download in V1', 'No automatic report release in V1', 'EFT order created only when you continue to instructions']}
                buttonLabel="Select R5,000 report"
                onSelect={() => void selectFullReport()}
              />
              <OptionCard
                selected={selectedOption === COMMERCIAL_OPTION_CODES.personalisedReport}
                title="Executive Fraud Readiness Advisory"
                price="From R50,000"
                description="Human-led advisory option prepared by MK Fraud Insights using the assessment output plus expert interpretation."
                bullets={['High-priority MK lead notification', 'No automatic report generation', 'No automatic payment obligation']}
                buttonLabel="Select advisory enquiry"
                onSelect={selectPersonalisedReport}
              />
            </div>

            {selectedOption === COMMERCIAL_OPTION_CODES.fullReport ? (
              <div className="mt-5 rounded-2xl border border-mk-line bg-white p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="font-semibold text-mk-ink">Continue to manual EFT instructions</p>
                    <p className="mt-1 text-sm leading-6 text-mk-muted">
                      This creates or reuses one manual EFT order for the paid report. The report is released only after MK manually confirms payment and completes the controlled report process.
                    </p>
                  </div>
                  <Button type="button" onClick={() => void requestDetailedReport()} disabled={requestState === 'sending'}>
                    {requestState === 'sending' ? 'Preparing instructions...' : 'Continue to EFT instructions'}
                  </Button>
                </div>
                <label className="mt-4 flex gap-3 rounded-xl border border-mk-line bg-mk-cream/50 p-4 text-sm leading-6 text-mk-muted">
                  <input checked={reportConsent} onChange={(event) => setReportConsent(event.currentTarget.checked)} type="checkbox" className="mt-1" />
                  <span>I consent to MK using my contact details, assessment responses and assessment results to deliver the report and follow up on this report request.</span>
                </label>
                {message ? (
                  <div className={`mt-4 rounded-xl border p-4 text-sm ${requestState === 'error' ? 'border-mk-danger/30 bg-mk-danger/10 text-mk-danger' : 'border-mk-success/30 bg-mk-success/10 text-mk-ink'}`}>
                    <p>{message}</p>
                    {orderConfirmation ? <OrderConfirmationPanel order={orderConfirmation} /> : null}
                  </div>
                ) : null}
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
          </section>

          <section className="rounded-2xl border border-mk-line bg-white p-5 text-sm leading-6 text-mk-muted">
            <p className="font-semibold text-mk-ink">Trust and privacy boundary</p>
            <p className="mt-2">
              The assessment is structured with predefined options. It does not ask for document uploads, incident narratives, employee names, supplier names, customer information, account numbers, passwords or confidential operational records.
            </p>
            <p className="mt-2">
              At this stage, MK uses your contact details, assessment responses and assessment results only to deliver the paid report or follow up on the advisory enquiry you select.
            </p>
          </section>

          {snapshotUrl ? (
            <div className="flex flex-col gap-3 border-t border-mk-line pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-mk-muted">Save this private link if you need to reopen the free snapshot later. Refreshing it reloads the submitted result without unlocking the assessment.</p>
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

function SnapshotEventBeacon({ snapshot, snapshotUrl, eventType, sourceSection }: { snapshot: FreeSnapshot; snapshotUrl?: string | null; eventType: string; sourceSection: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
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
      }).catch(() => undefined);
    }, { threshold: [0.5] });
    observer.observe(node);
    return () => observer.disconnect();
  }, [eventType, sent, snapshot.assessmentReference, snapshotUrl, sourceSection]);

  return <div ref={ref} aria-hidden="true" className="h-px w-full" />;
}

function OrderConfirmationPanel({ order }: { order: OrderConfirmation }) {
  const eft = order.eftInstructions;
  return (
    <div className="mt-4 space-y-3 rounded-xl border border-mk-line bg-white p-4 text-mk-ink">
      <div className="grid gap-3 sm:grid-cols-2">
        <Detail label="Order reference" value={order.orderReference} copyable />
        <Detail label="Product" value={order.productName} />
        <Detail label="Amount" value={order.amountDisplay} />
        <Detail label="Payment reference" value={order.paymentReference} copyable />
      </div>
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
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-4 rounded-2xl border border-mk-line bg-white p-5">
      <div>
        <p className="font-semibold text-mk-ink">Personalised advisory enquiry</p>
        <p className="mt-1 text-sm leading-6 text-mk-muted">MK will use the submitted assessment, results and contact details to assess whether a tailored advisory engagement is appropriate.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <SelectField name="primaryReason" label="Primary reason" options={[
          ['board_or_executive_readout', 'Board or executive readout'],
          ['control_improvement_planning', 'Control improvement planning'],
          ['fraud_risk_review', 'Fraud risk review'],
          ['pre_audit_or_assurance', 'Pre-audit or assurance preparation'],
          ['other', 'Other']
        ]} />
        <SelectField name="preferredContactMethod" label="Preferred contact" options={[
          ['email', 'Email'],
          ['phone', 'Phone'],
          ['video_call', 'Video call']
        ]} />
        <SelectField name="preferredConsultationTimeframe" label="Preferred timeframe" options={[
          ['this_week', 'This week'],
          ['two_weeks', 'Within two weeks'],
          ['this_month', 'This month'],
          ['exploring', 'Exploring options']
        ]} />
        <div className="rounded-xl border border-mk-line bg-mk-cream/50 p-4 text-sm leading-6 text-mk-muted">
          <p className="font-semibold text-mk-ink">Contact on file</p>
          <p>{snapshot.respondentName ?? 'Respondent'}</p>
          <p>{snapshot.respondentEmail ?? 'Email captured at assessment start'}</p>
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold text-mk-ink">Areas of focus</p>
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
        <span>I consent to MK using my contact details, assessment responses and assessment results to follow up on this advisory enquiry.</span>
      </label>
      <Button type="submit" disabled={state === 'sending'}>{state === 'sending' ? 'Submitting enquiry...' : 'Send advisory enquiry'}</Button>
      {message ? (
        <div className={`rounded-xl border p-4 text-sm ${state === 'error' ? 'border-mk-danger/30 bg-mk-danger/10 text-mk-danger' : 'border-mk-success/30 bg-mk-success/10 text-mk-ink'}`}>
          <p>{message}</p>
          {confirmation ? <Detail label="Enquiry reference" value={confirmation.requestReference} copyable /> : null}
        </div>
      ) : null}
    </form>
  );
}

const FOCUS_OPTIONS: Array<[string, string]> = [
  ['governance', 'Governance'],
  ['people_and_culture', 'People and culture'],
  ['process_controls', 'Process controls'],
  ['technology_and_data', 'Technology and data'],
  ['detection_and_monitoring', 'Detection and monitoring'],
  ['response_readiness', 'Response readiness'],
  ['third_party_risk', 'Third-party risk']
];

function focusKeyFromName(name: string) {
  const lowered = name.toLowerCase();
  if (lowered.includes('governance')) return 'governance';
  if (lowered.includes('people') || lowered.includes('culture')) return 'people_and_culture';
  if (lowered.includes('process') || lowered.includes('control')) return 'process_controls';
  if (lowered.includes('technology') || lowered.includes('data')) return 'technology_and_data';
  if (lowered.includes('detection') || lowered.includes('monitor')) return 'detection_and_monitoring';
  if (lowered.includes('response')) return 'response_readiness';
  if (lowered.includes('third') || lowered.includes('supplier')) return 'third_party_risk';
  return '';
}

function SelectField({ name, label, options }: { name: string; label: string; options: Array<[string, string]> }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-mk-ink">{label}</span>
      <select name={name} className="mt-2 w-full rounded-xl border border-mk-line bg-mk-paper px-4 py-3 text-sm text-mk-ink outline-none focus:border-mk-brass">
        {options.map((option) => <option key={option[0]} value={option[0]}>{option[1]}</option>)}
      </select>
    </label>
  );
}

function OptionCard({ selected, title, price, description, bullets, buttonLabel, onSelect }: { selected: boolean; title: string; price: string; description: string; bullets: string[]; buttonLabel: string; onSelect: () => void }) {
  return (
    <div className={`rounded-2xl border bg-white p-5 ${selected ? 'border-mk-brass shadow-soft' : 'border-mk-line'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-semibold text-mk-ink">{title}</p>
          <p className="mt-1 text-2xl font-semibold text-mk-brassDark">{price}</p>
        </div>
        {selected ? <Badge>Selected</Badge> : null}
      </div>
      <p className="mt-3 text-sm leading-6 text-mk-muted">{description}</p>
      <ul className="mt-4 space-y-2 text-sm leading-6 text-mk-muted">
        {bullets.map((item) => <li key={item}>- {item}</li>)}
      </ul>
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
          <div key={insight.domainName} className="rounded-xl border border-mk-line bg-mk-cream/40 p-4 text-sm leading-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-mk-ink">{insight.domainName}</p>
              <Badge>{insight.readinessStatus}</Badge>
            </div>
            <p className="mt-3 text-mk-muted">{insight.finding}</p>
            <p className="mt-2 text-mk-muted">{insight.implication}</p>
            <p className="mt-2 text-xs text-mk-muted">Coverage {insight.coveragePct}% · Priority gaps {insight.criticalGapCount}</p>
          </div>
        )) : <p className="text-sm text-mk-muted">{empty}</p>}
      </div>
      {footer ? <p className="mt-4 text-sm leading-6 text-mk-muted">{footer}</p> : null}
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
