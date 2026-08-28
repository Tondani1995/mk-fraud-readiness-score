'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { TierComparison } from '@/components/products/TierComparison';
import type { CommercialOptionCode, CommercialSnapshotInsights } from '@/lib/snapshot/commercial-insights';
import { COMMERCIAL_OPTION_CODES } from '@/lib/snapshot/commercial-insights';
import type { FreeSnapshot } from '@/lib/snapshot/free-snapshot';
import type { SnapshotNarrative } from '@/lib/snapshot/narrative';
import { buildDeterministicSnapshotNarrativeContent } from '@/lib/snapshot/deterministic-narrative';
import type { InvoiceDetails } from '@/lib/commercial/invoice-details';
import {
  COMMERCIAL_CATALOGUE,
  type SelfServicePaidTier
} from '@/lib/commercial/product-catalogue';

const SCORE_BASE_PATH = '/score';
const MANUAL_EFT_CONFIRMATION = 'MK Fraud Insights confirms EFT payments manually before any detailed report is released.';

type OrderConfirmation = {
  assessmentReference?: string;
  orderReference: string;
  tier: SelfServicePaidTier;
  productName: string;
  amountDisplay: string;
  paymentReference: string;
  invoiceRequested: boolean;
  manualConfirmationNote: string;
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

const EMPTY_INVOICE_DETAILS: InvoiceDetails = {
  legalName: '',
  billingAddress: '',
  addressee: '',
  billingEmail: '',
  vatNumber: '',
  registrationNumber: '',
  purchaseOrderReference: ''
};

function invoiceDetailsReady(details: InvoiceDetails) {
  return Boolean(details.legalName.trim() && details.billingAddress.trim() && details.addressee.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.billingEmail.trim()));
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
  const effectiveSnapshotNarrative = snapshotNarrative ?? buildDeterministicSnapshotNarrativeContent({ snapshot, insights: commercialInsights });
  const [selectedOption, setSelectedOption] = useState<SelfServicePaidTier | null>(null);
  const [requestState, setRequestState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [orderConfirmation, setOrderConfirmation] = useState<OrderConfirmation | null>(null);
  const [invoiceRequested, setInvoiceRequested] = useState<boolean | null>(null);
  const [invoiceDetails, setInvoiceDetails] = useState<InvoiceDetails>(EMPTY_INVOICE_DETAILS);
  const reportRevealRef = useRef<HTMLDivElement>(null);
  const selectionEventsSentRef = useRef<Set<SelfServicePaidTier>>(new Set());

  useEffect(() => {
    if (!selectedOption) return;
    const frame = window.requestAnimationFrame(() => reportRevealRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [selectedOption]);

  async function emitCommercialEvent(eventType: string, optionCode?: CommercialOptionCode | null, sourceSection = 'free_snapshot') {
    const snapshotToken = snapshotTokenFromUrl(snapshotUrl);
    if (!snapshotToken) return false;

    try {
      const response = await fetch(scorePath(`/api/assessments/${snapshot.assessmentReference}/commercial-event`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshotToken,
          eventType,
          optionCode,
          sourceSection
        })
      });
      const body = await response.json().catch(() => ({}));
      return response.ok && body.ok !== false;
    } catch {
      return false;
    }
  }

  async function selectPaidTier(tier: SelfServicePaidTier) {
    setSelectedOption(tier);
    setRequestState('idle');
    setMessage('');
    setOrderConfirmation(null);
    setInvoiceRequested(null);
    setInvoiceDetails(EMPTY_INVOICE_DETAILS);
    if (!selectionEventsSentRef.current.has(tier)) {
      await emitCommercialEvent('report_option_selected', tier, 'report_options');
      const handoffRecorded = await emitCommercialEvent(`${tier}_selected`, tier, 'report_options');
      if (tier === 'comprehensive' && !handoffRecorded) {
        setRequestState('error');
        setMessage('We could not share this request yet. Please try again or contact MK Fraud Insights directly.');
        return;
      }
      selectionEventsSentRef.current.add(tier);
    }
  }

  async function requestPaidOrder(tier: SelfServicePaidTier) {
    if (invoiceRequested === null) {
      setRequestState('error');
      setMessage('Please choose whether you would like an invoice before continuing.');
      return;
    }
    if (invoiceRequested && !invoiceDetailsReady(invoiceDetails)) {
      setRequestState('error');
      setMessage('Please provide the required billing details for the invoice before continuing.');
      return;
    }
    setRequestState('sending');
    setMessage('');
    setOrderConfirmation(null);
    const response = await fetch(scorePath(`/api/assessments/${snapshot.assessmentReference}/paid-order`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tier,
        snapshotToken: snapshotTokenFromUrl(snapshotUrl),
        invoiceRequested,
        invoiceDetails: invoiceRequested ? invoiceDetails : {}
      })
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


  return (
    <div className="space-y-6">
      <Card className="border-mk-charcoal/20">
        <CardHeader className="bg-mk-charcoal text-white">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">Assessment complete</p>
              <CardTitle className="mt-2 text-2xl text-white">Your organisation&apos;s fraud readiness position</CardTitle>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/75">
                {snapshot.adaptiveMetrics ? 'Your assessment has been scored using the MK Fraud Readiness methodology across the applicable control domains, with visibility and verification priorities shown below.' : 'Your assessment has been scored using the MK Fraud Readiness methodology across ten control domains and your organisation\'s fraud-exposure profile.'}
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
            {commercialInsights.coverageMessage ? <Metric label="Information covered" value={`${formatScore(snapshot.coveragePct)}%`} supporting={snapshot.adaptiveMetrics ? `${formatScore(snapshot.adaptiveMetrics.unknownSharePct)}% needs confirmation` : `${formatScore(snapshot.nARatePct)}% not applicable`} /> : null}
            <Metric label="Priority gaps" value={String(snapshot.criticalGapCount + snapshot.majorGapCount)} supporting="Areas for management attention" />
          </section>

          {commercialInsights.coverageMessage ? (
            <section className="rounded-2xl border border-mk-brass/30 bg-mk-brass/10 p-5 text-sm leading-6 text-mk-ink" aria-labelledby="assessment-scope-heading">
              <h2 id="assessment-scope-heading" className="text-lg font-semibold text-mk-ink">Coverage and uncertainty</h2>
              <p className="mt-2">{commercialInsights.coverageMessage}</p>
            </section>
          ) : null}

          {commercialInsights.criticalGapIndicator ? (
            <div className="rounded-2xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-sm leading-6 text-mk-danger">
              <p className="font-semibold">Critical-control warning</p>
              <p className="mt-1">
                Priority-gap alert: the assessment found {snapshot.criticalGapCount} critical-control weakness{snapshot.criticalGapCount === 1 ? '' : 'es'} and {snapshot.majorGapCount} serious gap{snapshot.majorGapCount === 1 ? '' : 's'} that should be interpreted before relying on the headline score.
              </p>
            </div>
          ) : null}

          <TrackedSection snapshot={snapshot} snapshotUrl={snapshotUrl} eventType="executive_summary_viewed" sourceSection="executive_summary" id="executive-summary" className="rounded-2xl border border-mk-charcoal/15 bg-mk-charcoal p-6 text-white shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mk-brass">What this means for your organisation</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white">{effectiveSnapshotNarrative.headline}</h2>
            <p className="mt-4 max-w-4xl text-base leading-7 text-white/80">{effectiveSnapshotNarrative.executiveDiagnosis}</p>
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <NarrativeBlock title="Strength" body={effectiveSnapshotNarrative.strength} />
              <div className="rounded-xl border border-white/15 bg-white/10 p-4">
                <h3 className="font-semibold text-white">Priority signals</h3>
                <ul className="mt-3 space-y-3 text-sm leading-6 text-white/80">
                  {effectiveSnapshotNarrative.prioritySignals.map((signal) => <li key={signal} className="flex gap-3"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-mk-brass" /><span>{signal}</span></li>)}
                </ul>
              </div>
              <NarrativeBlock title="Management implication" body={effectiveSnapshotNarrative.managementImplication} />
            </div>
          </TrackedSection>

          <section className="rounded-2xl border border-mk-line bg-white p-5" aria-labelledby="limited-readiness-heading">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mk-brassDark">Limited readiness picture</p>
            <h2 id="limited-readiness-heading" className="mt-2 text-xl font-semibold text-mk-ink">A focused view of where attention is needed</h2>
            <p className="mt-2 text-sm leading-6 text-mk-muted">These signals are drawn from the recorded result. The detailed analytical work sits behind the paid product choices below.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {effectiveSnapshotNarrative.prioritySignals.map((signal) => <div key={signal} className="rounded-xl border border-mk-line bg-mk-cream/40 p-4 text-sm leading-6 text-mk-ink">{signal}</div>)}
            </div>
          </section>

          <section className="rounded-2xl border border-mk-line bg-white p-5" aria-labelledby="free-snapshot-heading">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mk-brassDark">Free readiness snapshot</p>
            <h2 id="free-snapshot-heading" className="mt-2 text-xl font-semibold text-mk-ink">Your Snapshot gives you a clear position. Choose how to act on it next.</h2>
            <p className="mt-2 text-sm leading-6 text-mk-muted">
              The free result gives you a high-level view of your organisation&apos;s readiness and the first signals for management attention.
            </p>
            <ValueList title="Included in this Snapshot" items={commercialInsights.freeSnapshotValue} />
          </section>

          <TrackedSection snapshot={snapshot} snapshotUrl={snapshotUrl} eventType="report_options_opened" sourceSection="report_options" id="report-options" className="rounded-2xl border border-mk-charcoal/15 bg-mk-cream/60 p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mk-brassDark">Report options</p>
                <h2 id="report-options-heading" className="mt-2 text-xl font-semibold text-mk-ink">Choose the level of support your organisation needs</h2>
              </div>
              <Badge>Choose your next step</Badge>
            </div>

            <div className="mt-5">
              <TierComparison
                essential={{
                  id: 'essential', label: COMMERCIAL_CATALOGUE.essential.label, tagline: 'Diagnosis + prioritised executive action',
                  priceLabel: `${formatCataloguePrice(COMMERCIAL_CATALOGUE.essential.priceCents)} incl. VAT`,
                  description: COMMERCIAL_CATALOGUE.essential.summary,
                  features: [...COMMERCIAL_CATALOGUE.essential.includes], action: <Button type="button" className="w-full" onClick={() => void selectPaidTier('essential')}>Choose Essential</Button>
                }}
                comprehensive={{
                  id: 'comprehensive', label: COMMERCIAL_CATALOGUE.comprehensive.label, tagline: 'Deeper diagnosis + complete target fraud-control operating model', featured: true,
                  priceLabel: `${formatCataloguePrice(COMMERCIAL_CATALOGUE.comprehensive.priceCents)} incl. VAT`,
                  description: COMMERCIAL_CATALOGUE.comprehensive.summary,
                  features: [...COMMERCIAL_CATALOGUE.comprehensive.includes], action: <Button type="button" className="w-full" variant="secondary" onClick={() => void selectPaidTier('comprehensive')}>Choose Comprehensive</Button>
                }}
                advisory={{
                  id: 'advisory', label: COMMERCIAL_CATALOGUE.advisory.label, tagline: 'Direct MK involvement',
                  priceLabel: 'Manually scoped',
                  description: 'Human-led advisory for organisations needing direct MK involvement beyond an analytical product. Scoped and contracted directly with MK.',
                  features: ['Human-led engagement', 'Scope, deliverables and commercials agreed directly', 'No automatic order, payment obligation or report'],
                  action: <Button asChild type="button" className="w-full" variant="secondary"><Link href="/contact">Discuss an Engagement with MK</Link></Button>
                }}
              />
            </div>

            {selectedOption ? <div ref={reportRevealRef} tabIndex={-1} role="region" aria-live="polite" aria-labelledby="report-options-heading" className="mt-5 rounded-2xl border border-mk-line bg-white p-5 focus:outline-none focus:ring-2 focus:ring-mk-brass focus:ring-offset-2">
            {orderConfirmation ? (
              <OrderConfirmationPanel order={orderConfirmation} />
            ) : (
              <ReportOrderSummary
                snapshot={snapshot}
                tier={selectedOption}
                requestState={requestState}
                message={message}
                invoiceRequested={invoiceRequested}
                invoiceDetails={invoiceDetails}
                onInvoiceRequestedChange={(value) => { setInvoiceRequested(value); setRequestState('idle'); setMessage(''); }}
                onInvoiceDetailsChange={(field, value) => setInvoiceDetails((current) => ({ ...current, [field]: value }))}
                canConfirm={invoiceRequested !== null && (!invoiceRequested || invoiceDetailsReady(invoiceDetails))}
                onConfirm={() => requestPaidOrder(selectedOption)}
              />
            )}
            </div> : null}
          </TrackedSection>

          <section className="rounded-2xl border border-mk-line bg-white p-5 text-sm leading-6 text-mk-muted" aria-labelledby="integrity-heading">
            <h2 id="integrity-heading" className="font-semibold text-mk-ink">How MK protects the integrity of your result</h2>
            <p className="mt-2">
              Your readiness score is calculated using a controlled, deterministic methodology. Paid reports are prepared from your persisted assessment result. They analyse what you reported; they do not independently validate evidence, test whether controls operate, or provide an assurance opinion. Independent review is available separately through MK Advisory.
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

function ReportOrderSummary({ snapshot, tier, requestState, message, invoiceRequested, invoiceDetails, onInvoiceRequestedChange, onInvoiceDetailsChange, canConfirm, onConfirm }: {
  snapshot: FreeSnapshot;
  tier: SelfServicePaidTier;
  requestState: 'idle' | 'sending' | 'sent' | 'error';
  message: string;
  invoiceRequested: boolean | null;
  invoiceDetails: InvoiceDetails;
  onInvoiceRequestedChange: (value: boolean) => void;
  onInvoiceDetailsChange: (field: keyof InvoiceDetails, value: string) => void;
  canConfirm: boolean;
  onConfirm: () => void;
}) {
  const product = COMMERCIAL_CATALOGUE[tier];
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-semibold text-mk-ink">Confirm your report order</p>
          <p className="mt-1 text-sm leading-6 text-mk-muted">Review the summary before continuing to EFT instructions.</p>
        </div>
        <Button type="button" onClick={() => void onConfirm()} disabled={requestState === 'sending' || !canConfirm}>
          {requestState === 'sending' ? 'Preparing instructions...' : 'Continue to EFT instructions'}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Detail label="Product name" value={product.label} />
        <Detail label="Organisation" value={snapshot.organisationName} />
        <Detail label="Assessment reference" value={snapshot.assessmentReference} copyable />
        <Detail label="Price" value={`${formatCataloguePrice(product.priceCents)} incl. VAT`} />
        <Detail label="Delivery" value="Payment → MK admin generation → secure private PDF access" />
        <Detail label="What this includes" value={product.summary} />
      </div>
      <InvoiceQuestion
        tier={tier}
        invoiceRequested={invoiceRequested}
        invoiceDetails={invoiceDetails}
        onInvoiceRequestedChange={onInvoiceRequestedChange}
        onInvoiceDetailsChange={onInvoiceDetailsChange}
      />
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
        <Detail label="Product" value={order.productName} />
        <Detail label="Amount" value={order.amountDisplay} />
        <Detail label="Payment reference" value={order.paymentReference} copyable />
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
        <li>3. MK prepares the report from the persisted assessment result.</li>
        <li>4. The secure report is released to you.</li>
      </ol>
      <p className="text-sm leading-6 text-mk-muted">{eft?.paymentReferenceInstruction ?? 'Please use your order reference as the payment reference.'}</p>
      <p className="text-sm leading-6 text-mk-muted">{eft?.customerInstruction ?? order.manualConfirmationNote ?? MANUAL_EFT_CONFIRMATION}</p>
      {order.assessmentReference ? <Link className="inline-flex rounded-full bg-mk-ink px-5 py-3 text-sm font-semibold text-mk-cream hover:bg-mk-slate" href={`/score/order/${encodeURIComponent(order.assessmentReference)}?token=${encodeURIComponent(snapshotTokenFromUrl() ?? '')}&orderReference=${encodeURIComponent(order.orderReference)}`}>View order status</Link> : null}
    </div>
  );
}

function InvoiceQuestion({ tier, invoiceRequested, invoiceDetails, onInvoiceRequestedChange, onInvoiceDetailsChange }: {
  tier: SelfServicePaidTier;
  invoiceRequested: boolean | null;
  invoiceDetails: InvoiceDetails;
  onInvoiceRequestedChange: (value: boolean) => void;
  onInvoiceDetailsChange: (field: keyof InvoiceDetails, value: string) => void;
}) {
  const field = (key: keyof InvoiceDetails, label: string, type = 'text', optional = false) => (
    <label className="block text-sm text-mk-ink">
      <span className="font-semibold">{label}{optional ? ' (optional)' : ''}</span>
      <input
        className="mt-1 w-full rounded-lg border border-mk-line bg-white px-3 py-2 text-sm text-mk-ink outline-none ring-mk-brass focus:ring-2"
        type={type}
        value={invoiceDetails[key]}
        onChange={(event) => onInvoiceDetailsChange(key, event.target.value)}
        maxLength={key === 'billingAddress' ? 500 : key === 'purchaseOrderReference' ? 120 : key === 'billingEmail' ? 320 : 200}
        autoComplete={key === 'billingEmail' ? 'email' : ''}
      />
    </label>
  );

  return (
    <fieldset className="rounded-xl border border-mk-line bg-mk-cream/40 p-4">
      <legend className="px-1 font-semibold text-mk-ink">Would you like an invoice for this order?</legend>
      <div className="mt-3 flex flex-wrap gap-4 text-sm text-mk-ink">
        <label className="flex items-center gap-2"><input type="radio" name={`invoice-${tier}`} checked={invoiceRequested === true} onChange={() => onInvoiceRequestedChange(true)} /> Yes</label>
        <label className="flex items-center gap-2"><input type="radio" name={`invoice-${tier}`} checked={invoiceRequested === false} onChange={() => onInvoiceRequestedChange(false)} /> No</label>
      </div>
      {invoiceRequested ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {field('legalName', 'Legal/company name')}
          {field('addressee', 'Addressee / person or department')}
          {field('billingEmail', 'Billing email', 'email')}
          {field('billingAddress', 'Billing address')}
          {field('vatNumber', 'VAT number', 'text', true)}
          {field('registrationNumber', 'Registration number', 'text', true)}
          {field('purchaseOrderReference', 'PO / billing reference', 'text', true)}
        </div>
      ) : null}
    </fieldset>
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

function NarrativeBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-mk-line bg-mk-cream/40 p-4">
      <h3 className="font-semibold text-mk-ink">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-mk-muted">{body}</p>
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
