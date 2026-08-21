'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { TierComparison } from '@/components/products/TierComparison';
import type { CommercialDomainInsight, CommercialOptionCode, CommercialSnapshotInsights } from '@/lib/snapshot/commercial-insights';
import { COMMERCIAL_OPTION_CODES } from '@/lib/snapshot/commercial-insights';
import type { FreeSnapshot } from '@/lib/snapshot/free-snapshot';
import type { SnapshotNarrative } from '@/lib/snapshot/narrative';
import { unavailableSnapshotNarrative } from '@/lib/snapshot/narrative';
import { COMMERCIAL_CATALOGUE, type SelfServicePaidTier } from '@/lib/commercial/product-catalogue';

const SCORE_BASE_PATH = '/score';
const MANUAL_EFT_CONFIRMATION = 'MK Fraud Insights confirms EFT payments manually before an MK operator prepares and checks the purchased report.';

type InvoiceDetails = {
  organisationLegalName: string;
  attention: string;
  billingEmail: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  vatNumber: string;
  companyRegistrationNumber: string;
  purchaseOrderReference: string;
};

type OrderConfirmation = {
  assessmentReference?: string;
  orderReference: string;
  tier: SelfServicePaidTier;
  productName: string;
  amountDisplay: string;
  paymentReference: string;
  manualConfirmationNote: string;
  deliveryEmail?: string | null;
  invoiceRequested?: boolean;
  invoiceDetails?: InvoiceDetails | null;
  eftInstructions?: {
    active: true;
    bankName: string;
    accountHolder: string;
    accountNumber: string;
    branchCode: string;
    accountType: string | null;
    currency: string;
    paymentReferenceInstruction: string;
    customerInstruction: string;
    contactEmail: string | null;
  };
};

function scorePath(path: string) {
  return `${SCORE_BASE_PATH}${path.startsWith('/') ? path : `/${path}`}`;
}

function formatScore(score: number) {
  return Math.round(score).toString();
}

function formatCataloguePrice(priceCents: number | null) {
  if (priceCents === null) return 'Manual scope';
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(priceCents / 100);
}

function resultStatusLabel(status?: FreeSnapshot['resultStatus']) {
  if (status === 'INSUFFICIENT_VISIBILITY') return 'Visibility limited';
  if (status === 'PROVISIONAL') return 'Provisional result';
  return 'Normal result';
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
  commercialInsights,
  snapshotNarrative
}: {
  snapshot: FreeSnapshot;
  snapshotUrl?: string | null;
  commercialInsights: CommercialSnapshotInsights;
  snapshotNarrative?: SnapshotNarrative;
}) {
  const effectiveSnapshotNarrative = snapshotNarrative ?? unavailableSnapshotNarrative();
  const showExposure = !snapshot.adaptiveMetrics || snapshot.adaptiveMetrics.exposureAssessed !== false;
  const [selectedOption, setSelectedOption] = useState<SelfServicePaidTier | 'advisory' | null>(null);
  const [requestState, setRequestState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [orderConfirmation, setOrderConfirmation] = useState<OrderConfirmation | null>(null);
  const reportRevealRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!selectedOption) return;
    const frame = window.requestAnimationFrame(() => reportRevealRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [selectedOption]);

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

  async function selectPaidTier(tier: SelfServicePaidTier) {
    setSelectedOption(tier);
    setRequestState('idle');
    setMessage('');
    setOrderConfirmation(null);
    await emitCommercialEvent('report_option_selected', tier, 'report_options');
    await emitCommercialEvent(`${tier}_selected`, tier, 'report_options');
  }

  async function selectAdvisory() {
    setSelectedOption('advisory');
    setRequestState('idle');
    setMessage('');
    setOrderConfirmation(null);
  }

  async function requestPaidOrder(tier: SelfServicePaidTier, invoiceRequested: boolean, invoiceDetails: InvoiceDetails) {
    setRequestState('sending');
    setMessage('');
    setOrderConfirmation(null);
    const response = await fetch(scorePath(`/api/assessments/${snapshot.assessmentReference}/paid-order`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier, snapshotToken: snapshotTokenFromUrl(snapshotUrl), invoiceRequested, invoiceDetails: invoiceRequested ? invoiceDetails : null })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) {
      setRequestState('error');
      setMessage(body.errors?.[0] ?? 'The order could not be created at this stage. Please try again or contact MK Fraud Insights.');
      return;
    }
    setRequestState('sent');
    setMessage(body.message ?? 'Your order has been recorded. MK will confirm payment manually before preparing the report.');
    setOrderConfirmation(body.order ?? null);
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
                Your assessment has been scored using the MK Fraud Readiness methodology. The result below reflects the information you provided.
              </p>
              <p className="mt-2 text-sm text-white/70">Reference: {snapshot.assessmentReference}</p>
            </div>
            <Badge>{snapshot.resultStatus ? resultStatusLabel(snapshot.resultStatus) : snapshot.finalMaturity}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          <section className="grid gap-4 md:grid-cols-4" aria-labelledby="snapshot-metrics-heading">
            <h2 id="snapshot-metrics-heading" className="sr-only">Readiness metrics</h2>
            <Metric label="Overall readiness score" value={snapshot.overallScore === null ? 'Not issued' : `${formatScore(snapshot.overallScore)}/100`} supporting={snapshot.overallScore === null ? 'More visibility is needed' : 'Persisted score result'} />
            <Metric label="Final maturity level" value={snapshot.finalMaturity ?? 'Not issued'} supporting={snapshot.finalMaturity === null ? 'No band is issued' : 'Based on submitted answers'} />
            {showExposure ? <Metric label="Exposure band" value={snapshot.exposureBand ?? 'Not assessed'} supporting="Exposure profile included" /> : null}
            <Metric label="Critical controls" value={String(snapshot.criticalGapCount)} supporting={`${snapshot.majorGapCount} serious control gaps`} />
          </section>

          <section className="grid gap-3 md:grid-cols-4" aria-labelledby="assessment-trust-heading">
            <h2 id="assessment-trust-heading" className="sr-only">Assessment trust facts</h2>
            {['Self-assessment result', ...(showExposure ? ['Exposure profile included'] : []), 'Deterministic scoring', 'No independent validation'].map((item) => (
              <div key={item} className="rounded-xl border border-mk-line bg-mk-cream/50 p-3 text-sm font-semibold text-mk-ink">{item}</div>
            ))}
          </section>

          <section className="rounded-2xl border border-mk-line bg-white p-5 text-sm leading-6 text-mk-muted" aria-labelledby="concise-interpretation-heading">
            <h2 id="concise-interpretation-heading" className="font-semibold text-mk-ink">Concise readiness interpretation</h2>
            {effectiveSnapshotNarrative.mode === 'unavailable' ? (
              <p className="mt-2">The personalised interpretation is temporarily unavailable. The deterministic readiness facts above remain available for management review.</p>
            ) : (
              <>
                <p className="mt-3 font-semibold text-mk-ink">{effectiveSnapshotNarrative.headline}</p>
                <p className="mt-2">{effectiveSnapshotNarrative.diagnosis || effectiveSnapshotNarrative.interpretation}</p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-mk-line bg-mk-cream/40 p-4"><p className="font-semibold text-mk-ink">Strongest area</p><p className="mt-1 font-medium text-mk-ink">{effectiveSnapshotNarrative.strongestArea.label}</p><p className="mt-1">{effectiveSnapshotNarrative.strongestArea.interpretation}</p></div>
                  <div className="rounded-xl border border-mk-line bg-mk-cream/40 p-4"><p className="font-semibold text-mk-ink">Priority signals</p><ul className="mt-1 space-y-2">{effectiveSnapshotNarrative.prioritySignals.map((signal) => <li key={signal.label}><span className="font-medium text-mk-ink">{signal.label}:</span> {signal.interpretation}</li>)}</ul></div>
                </div>
                <p className="mt-4 font-medium text-mk-ink">{effectiveSnapshotNarrative.managementImplication || effectiveSnapshotNarrative.nextStep}</p>
              </>
            )}
          </section>

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
            <h2 className="sr-only">Executive interpretation</h2>
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <InterpretationBlock title="Current position" body={commercialInsights.currentPosition} />
              <InterpretationBlock title="Risk implication" body={commercialInsights.riskImplication} />
              <InterpretationBlock title="Leadership priority" body={commercialInsights.leadershipPriority} />
            </div>
          </TrackedSection>

          <section className="grid gap-5 lg:grid-cols-2">
            <InsightList title="Priority areas for management focus" insights={commercialInsights.priorityAreas} empty="No priority areas are available in the free snapshot." />
            <InsightList title="Foundations you can build on" insights={commercialInsights.strengths} empty="Important context" footer={commercialInsights.strengthContext} />
          </section>

          <section className="rounded-2xl border border-mk-line bg-white p-5" aria-labelledby="free-snapshot-heading">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mk-brassDark">Free readiness snapshot</p>
            <h2 id="free-snapshot-heading" className="mt-2 text-xl font-semibold text-mk-ink">Your snapshot identifies the position. The detailed report explains what to do next.</h2>
            <p className="mt-2 text-sm leading-6 text-mk-muted">
              The free result gives you a high-level view of your organisation&apos;s readiness. The detailed report converts that result into a structured management response.
            </p>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <ValueList title="Free readiness snapshot" items={commercialInsights.freeSnapshotValue} />
              <ValueList title="Full MK Fraud Readiness Report" items={commercialInsights.paidReportValue} />
            </div>
            <p className="mt-4 text-sm leading-6 text-mk-muted">The paid report includes a 30/60/90-day roadmap so management can turn the findings into owned next steps.</p>
          </section>

          <TrackedSection snapshot={snapshot} snapshotUrl={snapshotUrl} eventType="report_options_opened" sourceSection="report_options" id="report-options" className="rounded-2xl border border-mk-charcoal/15 bg-mk-cream/60 p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mk-brassDark">Report options</p>
                <h2 id="report-options-heading" className="mt-2 text-xl font-semibold text-mk-ink">Choose the level of support your organisation needs</h2>
              </div>
              <Badge>Self-service report paths</Badge>
            </div>

            <div className="mt-5">
              <TierComparison
                essential={{
                  id: 'essential', label: COMMERCIAL_CATALOGUE.essential.label, tagline: 'Diagnose the position',
                  priceLabel: `${formatCataloguePrice(COMMERCIAL_CATALOGUE.essential.priceCents)} incl. VAT`,
                  description: COMMERCIAL_CATALOGUE.essential.summary,
                  features: [...COMMERCIAL_CATALOGUE.essential.includes], action: <Button type="button" className="w-full" onClick={() => void selectPaidTier('essential')}>Choose Essential</Button>
                }}
                comprehensive={{
                  id: 'comprehensive', label: COMMERCIAL_CATALOGUE.comprehensive.label, tagline: 'Design and mobilise', featured: true,
                  priceLabel: `${formatCataloguePrice(COMMERCIAL_CATALOGUE.comprehensive.priceCents)} incl. VAT`,
                  description: COMMERCIAL_CATALOGUE.comprehensive.summary,
                  features: [...COMMERCIAL_CATALOGUE.comprehensive.includes], action: <Button type="button" className="w-full" variant="secondary" onClick={() => void selectPaidTier('comprehensive')}>Choose Comprehensive</Button>
                }}
                advisory={{
                  id: 'advisory', label: COMMERCIAL_CATALOGUE.advisory.label, tagline: 'Work with MK directly',
                  priceLabel: 'Manually scoped engagement',
                  description: 'A tailored, human-led engagement for deeper evidence review, stakeholder engagement, scoped control validation or testing, remediation and management support.',
                  features: ['Tailored scope and deliverables', 'Stakeholder and evidence review where scoped', 'Management support and remediation guidance'],
                  action: <Button type="button" className="w-full" variant="secondary" onClick={() => void selectAdvisory()}>Discuss an Advisory engagement</Button>
                }}
              />
            </div>

            {selectedOption ? <div ref={reportRevealRef} tabIndex={-1} role="region" aria-live="polite" aria-labelledby="report-options-heading" className="mt-5 rounded-2xl border border-mk-line bg-white p-5 focus:outline-none focus:ring-2 focus:ring-mk-brass focus:ring-offset-2">
            {selectedOption === COMMERCIAL_OPTION_CODES.essential || selectedOption === COMMERCIAL_OPTION_CODES.comprehensive ? (
              <div>
                {orderConfirmation ? (
                  <OrderConfirmationPanel order={orderConfirmation} />
                ) : (
                  <ReportOrderSummary snapshot={snapshot} tier={selectedOption} requestState={requestState} message={message} onConfirm={(invoiceRequested, invoiceDetails) => requestPaidOrder(selectedOption, invoiceRequested, invoiceDetails)} />
                )}
              </div>
            ) : selectedOption === 'advisory' ? <AdvisoryEnquiryForm snapshot={snapshot} snapshotUrl={snapshotUrl} requestState={requestState} message={message} onStateChange={setRequestState} onMessage={setMessage} /> : null}
            </div> : null}
          </TrackedSection>

          <section className="rounded-2xl border border-mk-line bg-white p-5 text-sm leading-6 text-mk-muted" aria-labelledby="integrity-heading">
            <h2 id="integrity-heading" className="font-semibold text-mk-ink">How MK protects the integrity of your result</h2>
            <p className="mt-2">
              Your readiness score is calculated using a controlled, deterministic methodology. For a paid order, MK confirms payment and an MK operator prepares and checks the report from your persisted assessment result before emailing it manually. The report analyses what you reported; it does not independently validate evidence, test whether controls operate, or provide an assurance opinion. Independent review is available separately through MK Advisory.
            </p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {[
                'Selecting a paid service does not change the assessment score',
                'Paid reports do not alter the underlying assessment result',
                'Customer information is used only for the stated assessment and service purpose',
                'Reports are generated from the persisted result, not re-scored'
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
      const visible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio > 0);
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

function emptyInvoiceDetails(snapshot: FreeSnapshot): InvoiceDetails {
  return {
    organisationLegalName: snapshot.organisationName,
    attention: snapshot.respondentName ?? '',
    billingEmail: snapshot.respondentEmail ?? '',
    addressLine1: '', addressLine2: '', city: '', province: '', postalCode: '', country: 'South Africa',
    vatNumber: '', companyRegistrationNumber: '', purchaseOrderReference: ''
  };
}

function ReportOrderSummary({ snapshot, tier, requestState, message, onConfirm }: { snapshot: FreeSnapshot; tier: SelfServicePaidTier; requestState: 'idle' | 'sending' | 'sent' | 'error'; message: string; onConfirm: (invoiceRequested: boolean, invoiceDetails: InvoiceDetails) => void }) {
  const product = COMMERCIAL_CATALOGUE[tier];
  const [invoiceRequested, setInvoiceRequested] = useState(false);
  const [invoiceDetails, setInvoiceDetails] = useState<InvoiceDetails>(() => emptyInvoiceDetails(snapshot));
  const requiredInvoiceFields = ['organisationLegalName', 'attention', 'billingEmail', 'addressLine1', 'city', 'province', 'postalCode', 'country'] as const;
  const invoiceValid = !invoiceRequested || requiredInvoiceFields.every((key) => invoiceDetails[key].trim().length > 0);
  const updateInvoice = (key: keyof InvoiceDetails, value: string) => setInvoiceDetails((current) => ({ ...current, [key]: value }));
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-semibold text-mk-ink">Confirm your report order</p>
          <p className="mt-1 text-sm leading-6 text-mk-muted">Review the summary before continuing to EFT instructions.</p>
        </div>
        <Button type="button" onClick={() => onConfirm(invoiceRequested, invoiceDetails)} disabled={requestState === 'sending' || !invoiceValid}>
          {requestState === 'sending' ? 'Preparing instructions...' : 'Continue to EFT instructions'}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Detail label="Product name" value={product.label} />
        <Detail label="Organisation" value={snapshot.organisationName} />
        <Detail label="Assessment reference" value={snapshot.assessmentReference} copyable />
        <Detail label="Price" value={`${formatCataloguePrice(product.priceCents)} incl. VAT`} />
        <Detail label="Delivery" value="EFT payment → MK confirms payment → MK prepares and quality-checks your report → report sent to your nominated delivery email." />
        <Detail label="What this includes" value={product.summary} />
      </div>
      <p className="rounded-xl border border-mk-line bg-mk-cream/50 p-4 text-sm leading-6 text-mk-muted">Payment is made by EFT. MK confirms payment manually, an MK operator prepares and checks the report, and MK emails it manually to your nominated delivery email.</p>
      <fieldset className="rounded-xl border border-mk-line bg-white p-4">
        <legend className="font-semibold text-mk-ink">Would you like an invoice for this order?</legend>
        <div className="mt-3 flex flex-wrap gap-5 text-sm text-mk-ink">
          <label className="flex items-center gap-2"><input type="radio" name={`invoice-${tier}`} checked={invoiceRequested} onChange={() => setInvoiceRequested(true)} /> Yes</label>
          <label className="flex items-center gap-2"><input type="radio" name={`invoice-${tier}`} checked={!invoiceRequested} onChange={() => setInvoiceRequested(false)} /> No</label>
        </div>
        {invoiceRequested ? <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <InvoiceField label="Organisation / legal name" value={invoiceDetails.organisationLegalName} onChange={(value) => updateInvoice('organisationLegalName', value)} required />
          <InvoiceField label="Invoice addressed to / attention" value={invoiceDetails.attention} onChange={(value) => updateInvoice('attention', value)} required />
          <InvoiceField label="Billing email" type="email" value={invoiceDetails.billingEmail} onChange={(value) => updateInvoice('billingEmail', value)} required />
          <InvoiceField label="Address line 1" value={invoiceDetails.addressLine1} onChange={(value) => updateInvoice('addressLine1', value)} required />
          <InvoiceField label="Address line 2" value={invoiceDetails.addressLine2} onChange={(value) => updateInvoice('addressLine2', value)} />
          <InvoiceField label="City / town" value={invoiceDetails.city} onChange={(value) => updateInvoice('city', value)} required />
          <InvoiceField label="Province / state" value={invoiceDetails.province} onChange={(value) => updateInvoice('province', value)} required />
          <InvoiceField label="Postal code" value={invoiceDetails.postalCode} onChange={(value) => updateInvoice('postalCode', value)} required />
          <InvoiceField label="Country" value={invoiceDetails.country} onChange={(value) => updateInvoice('country', value)} required />
          <InvoiceField label="VAT number (optional)" value={invoiceDetails.vatNumber} onChange={(value) => updateInvoice('vatNumber', value)} />
          <InvoiceField label="Company registration number (optional)" value={invoiceDetails.companyRegistrationNumber} onChange={(value) => updateInvoice('companyRegistrationNumber', value)} />
          <InvoiceField label="Purchase order / billing reference (optional)" value={invoiceDetails.purchaseOrderReference} onChange={(value) => updateInvoice('purchaseOrderReference', value)} />
        </div> : <p className="mt-4 text-sm leading-6 text-mk-muted">No billing details are required. MK will use the order details for manual payment confirmation and delivery.</p>}
      </fieldset>
      {!invoiceValid ? <p className="text-sm text-mk-danger">Complete the required invoice fields before continuing.</p> : null}
      {message ? <p className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-sm text-mk-danger">{message}</p> : null}
    </div>
  );
}

function AdvisoryEnquiryForm({ snapshot, snapshotUrl, requestState, message, onStateChange, onMessage }: { snapshot: FreeSnapshot; snapshotUrl?: string | null; requestState: 'idle' | 'sending' | 'sent' | 'error'; message: string; onStateChange: (state: 'idle' | 'sending' | 'sent' | 'error') => void; onMessage: (message: string) => void }) {
  const [primaryReason, setPrimaryReason] = useState('understand_control_weaknesses');
  const [focusArea, setFocusArea] = useState('fraud_governance_oversight');
  const [contactMethod, setContactMethod] = useState('email');
  const [timeframe, setTimeframe] = useState('within_two_weeks');
  const [notes, setNotes] = useState('');
  const [consentContact, setConsentContact] = useState(false);

  async function submitEnquiry() {
    const snapshotToken = snapshotTokenFromUrl(snapshotUrl);
    if (!snapshotToken) { onStateChange('error'); onMessage('Open the private snapshot link again before sending an Advisory enquiry.'); return; }
    if (!consentContact) { onStateChange('error'); onMessage('Please consent to MK contacting you about the Advisory engagement.'); return; }
    onStateChange('sending'); onMessage('');
    const response = await fetch(scorePath(`/api/assessments/${snapshot.assessmentReference}/personalised-report-request`), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshotToken, primaryReason, areasOfFocus: [focusArea], preferredContactMethod: contactMethod, preferredConsultationTimeframe: timeframe, notes, consentContact })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) { onStateChange('error'); onMessage(body.errors?.[0] ?? 'The Advisory enquiry could not be recorded. Please try again or contact MK Fraud Insights.'); return; }
    onStateChange('sent'); onMessage(`Your Advisory enquiry has been recorded. Reference: ${body.requestReference}. MK will contact you to discuss scope and next steps.`);
  }

  return <div className="space-y-4">
    <div><p className="font-semibold text-mk-ink">Discuss an Advisory engagement</p><p className="mt-2 text-sm leading-6 text-mk-muted">Advisory is a tailored, human-led engagement. MK can scope deeper evidence review, stakeholder engagement, control validation or testing where agreed, tailored remediation and management support. This enquiry does not create a paid order.</p></div>
    <div className="grid gap-3 sm:grid-cols-2"><Detail label="Organisation" value={snapshot.organisationName} /><Detail label="Respondent" value={snapshot.respondentName ?? 'Not captured'} /><Detail label="Email" value={snapshot.respondentEmail ?? 'Not captured'} /></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-semibold text-mk-ink">Primary reason<select value={primaryReason} onChange={(event) => setPrimaryReason(event.target.value)} className="mt-1 w-full rounded-xl border border-mk-line bg-white px-3 py-3 text-sm font-normal"><option value="understand_control_weaknesses">Understand control weaknesses</option><option value="design_strengthen_programme">Design or strengthen the programme</option><option value="respond_incident_audit_control">Respond to an incident, audit or control issue</option><option value="prepare_governance_response">Prepare a governance response</option><option value="review_policies_controls">Review policies and controls</option><option value="other">Other</option></select></label>
      <label className="text-sm font-semibold text-mk-ink">Main focus<select value={focusArea} onChange={(event) => setFocusArea(event.target.value)} className="mt-1 w-full rounded-xl border border-mk-line bg-white px-3 py-3 text-sm font-normal"><option value="fraud_governance_oversight">Governance and oversight</option><option value="fraud_risk_identification_assessment">Risk identification</option><option value="operational_fraud_controls">Operational controls</option><option value="third_party_supplier_procurement_risk">Third parties and suppliers</option><option value="digital_identity_channel_fraud">Digital and identity risk</option><option value="fraud_monitoring_detection">Monitoring and detection</option><option value="incident_response_investigations">Incident response</option><option value="fraud_culture_awareness">Culture and awareness</option><option value="other">Other</option></select></label>
      <label className="text-sm font-semibold text-mk-ink">Preferred contact<select value={contactMethod} onChange={(event) => setContactMethod(event.target.value)} className="mt-1 w-full rounded-xl border border-mk-line bg-white px-3 py-3 text-sm font-normal"><option value="email">Email</option><option value="phone">Phone</option><option value="video_meeting">Video meeting</option></select></label>
      <label className="text-sm font-semibold text-mk-ink">Timing<select value={timeframe} onChange={(event) => setTimeframe(event.target.value)} className="mt-1 w-full rounded-xl border border-mk-line bg-white px-3 py-3 text-sm font-normal"><option value="within_one_week">Within one week</option><option value="within_two_weeks">Within two weeks</option><option value="within_one_month">Within one month</option><option value="exploring_options">Exploring options</option></select></label>
    </div>
    <label className="block text-sm font-semibold text-mk-ink">Additional context (optional)<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={800} rows={4} className="mt-1 w-full rounded-xl border border-mk-line bg-white px-3 py-3 text-sm font-normal" /></label>
    <label className="flex items-start gap-3 text-sm leading-6 text-mk-muted"><input type="checkbox" checked={consentContact} onChange={(event) => setConsentContact(event.target.checked)} className="mt-1" /> I consent to MK Fraud Insights contacting me about this Advisory enquiry.</label>
    <Button type="button" onClick={() => void submitEnquiry()} disabled={requestState === 'sending'}>{requestState === 'sending' ? 'Sending enquiry…' : 'Discuss an Advisory engagement'}</Button>
    {message ? <p className={`rounded-xl border p-4 text-sm ${requestState === 'sent' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-mk-danger/30 bg-mk-danger/10 text-mk-danger'}`}>{message}</p> : null}
  </div>;
}

function InvoiceField({ label, value, onChange, required = false, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) {
  return <label className="text-sm font-semibold text-mk-ink">{label}{required ? <span className="text-mk-danger"> *</span> : null}<input type={type} required={required} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-xl border border-mk-line bg-white px-3 py-3 text-sm font-normal" /></label>;
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
        <Detail label="Product" value={order.productName} />
        <Detail label="Amount" value={order.amountDisplay} />
        <Detail label="Payment reference" value={order.paymentReference} copyable />
        <Detail label="Nominated delivery email" value={order.deliveryEmail ?? 'The email captured for this assessment'} />
        <Detail label="Invoice requested" value={order.invoiceRequested ? 'Yes' : 'No'} />
      </div>
      <div className="rounded-xl border border-mk-brass/40 bg-mk-brass/10 p-4 text-sm font-semibold text-mk-ink">Use the order reference exactly as shown when making payment.</div>
      {eft?.active ? (
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
        <p className="rounded-lg bg-mk-cream p-4 text-sm leading-6 text-mk-muted">EFT instructions are issued against the order reference. MK confirms payment manually before any deliverable is released.</p>
      )}
      <ol className="space-y-2 rounded-xl border border-mk-line bg-white p-4 text-sm leading-6 text-mk-muted">
        <li>1. Make the EFT using the displayed order reference.</li>
        <li>2. MK confirms payment manually.</li>
        <li>3. An MK operator prepares and quality-checks the purchased report from the persisted assessment result.</li>
        <li>4. MK emails the checked report manually to your nominated delivery email and marks the order delivered.</li>
      </ol>
      <p className="text-sm leading-6 text-mk-muted">{eft?.paymentReferenceInstruction ?? 'Please use your order reference as the payment reference.'}</p>
      <p className="text-sm leading-6 text-mk-muted">{eft?.customerInstruction ?? order.manualConfirmationNote ?? MANUAL_EFT_CONFIRMATION}</p>
      {order.assessmentReference ? <Link className="inline-flex rounded-full bg-mk-ink px-5 py-3 text-sm font-semibold text-mk-cream hover:bg-mk-slate" href={`/score/order/${encodeURIComponent(order.assessmentReference)}?token=${encodeURIComponent(snapshotTokenFromUrl() ?? '')}&orderReference=${encodeURIComponent(order.orderReference)}`}>View order status</Link> : null}
    </div>
  );
}

function ValueList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-mk-line bg-mk-cream/40 p-4">
      <h3 className="font-semibold text-mk-ink">{title}</h3>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-mk-muted">
        {items.map((item) => <li key={item}>- {item}</li>)}
      </ul>
    </div>
  );
}

function InterpretationBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-mk-line bg-mk-cream/40 p-4">
      <h3 className="font-semibold text-mk-ink">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-mk-muted">{body}</p>
    </div>
  );
}

function InsightList({ title, insights, empty, footer }: { title: string; insights: CommercialDomainInsight[]; empty: string; footer?: string }) {
  const headingId = `snapshot-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <section className="rounded-2xl border border-mk-line bg-white p-5" aria-labelledby={headingId}>
      <h2 id={headingId} className="font-semibold text-mk-ink">{title}</h2>
      <div className="mt-4 space-y-3">
        {insights.length ? insights.map((insight) => (
          <div key={insight.domainCode || insight.domainName} className="rounded-xl border border-mk-line bg-mk-cream/40 p-4 text-sm leading-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-mk-ink">{insight.domainName}</p>
              <Badge>{insight.readinessStatus}</Badge>
            </div>
            <p className="mt-3 text-mk-muted">{insight.finding}</p>
            <p className="mt-2 text-mk-muted">{insight.implication}</p>
          </div>
        )) : (
          <div className="rounded-xl border border-mk-line bg-mk-cream/40 p-4 text-sm leading-6 text-mk-muted">
            <p className="font-semibold text-mk-ink">{empty}</p>
            {footer ? <p className="mt-2">{footer}</p> : null}
          </div>
        )}
      </div>
      {footer && insights.length ? <p className="mt-4 text-sm leading-6 text-mk-muted">{footer}</p> : null}
    </section>
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
