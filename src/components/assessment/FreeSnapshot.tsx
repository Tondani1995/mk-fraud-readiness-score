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
const MANUAL_EFT_CONFIRMATION = 'MK Fraud Insights confirms EFT payments manually before any detailed report is released.';

type OrderConfirmation = {
  assessmentReference?: string;
  orderReference: string;
  tier: SelfServicePaidTier;
  productName: string;
  amountDisplay: string;
  paymentReference: string;
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
  const [selectedOption, setSelectedOption] = useState<CommercialOptionCode | null>(null);
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

  async function requestPaidOrder(tier: SelfServicePaidTier) {
    setRequestState('sending');
    setMessage('');
    setOrderConfirmation(null);
    const response = await fetch(scorePath(`/api/assessments/${snapshot.assessmentReference}/paid-order`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier, snapshotToken: snapshotTokenFromUrl(snapshotUrl) })
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
          <section className="grid gap-4 md:grid-cols-5" aria-labelledby="snapshot-metrics-heading">
            <h2 id="snapshot-metrics-heading" className="sr-only">Readiness metrics</h2>
            <Metric label="Overall readiness score" value={snapshot.overallScore === null ? 'Not issued' : `${formatScore(snapshot.overallScore)}/100`} supporting={snapshot.overallScore === null ? 'More visibility is needed' : 'Persisted score result'} />
            <Metric label="Final maturity level" value={snapshot.finalMaturity ?? 'Not issued'} supporting={snapshot.finalMaturity === null ? 'No band is issued' : 'Based on submitted answers'} />
            <Metric label="Coverage status" value={`${formatScore(snapshot.coveragePct)}%`} supporting={snapshot.adaptiveMetrics ? `${formatScore(snapshot.adaptiveMetrics.unknownSharePct)}% uncertainty` : `${formatScore(snapshot.nARatePct)}% not applicable`} />
            {showExposure ? <Metric label="Exposure band" value={snapshot.exposureBand ?? 'Not assessed'} supporting="Exposure profile included" /> : null}
            <Metric label="Critical controls" value={String(snapshot.criticalGapCount)} supporting={`${snapshot.majorGapCount} serious control gaps`} />
          </section>

          {snapshot.adaptiveMetrics ? (
            <section className="rounded-2xl border border-mk-brass/30 bg-mk-brass/10 p-5 text-sm leading-6 text-mk-ink" aria-labelledby="assessment-scope-heading">
              <h2 id="assessment-scope-heading" className="text-lg font-semibold text-mk-ink">Assessment scope and visibility</h2>
              <p className="mt-2">{snapshot.resultStatus === 'INSUFFICIENT_VISIBILITY' ? 'Your assessment did not provide enough visibility to issue a reliable Fraud Readiness Score. The result below explains the areas that could be assessed, the information gaps identified and the evidence needed to complete a reliable view.' : 'This result reflects the control areas that were applicable to your organisation, including any areas assessed through oversight responses.'}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <ScopeMetric label="Applicable controls" value={`${snapshot.adaptiveMetrics.applicableCount} (${snapshot.adaptiveMetrics.applicableWeight} weight)`} />
                <ScopeMetric label="Control visibility" value={`${snapshot.adaptiveMetrics.controlVisibilityPct}%`} />
                <ScopeMetric label="Excluded areas" value={`${snapshot.adaptiveMetrics.excludedCount}`} />
                <ScopeMetric label="Uncertainty" value={`${snapshot.adaptiveMetrics.unknownCount}`} />
              </div>
              {snapshot.adaptiveMetrics.redirectedCount > 0 ? <p className="mt-3">{snapshot.adaptiveMetrics.redirectedCount} area{snapshot.adaptiveMetrics.redirectedCount === 1 ? '' : 's'} were assessed through an oversight response. Excluded areas are outside this result and are not treated as weaknesses.</p> : null}
              {snapshot.adaptiveMetrics.limitationReasons.length ? <p className="mt-3 font-semibold">{snapshot.adaptiveMetrics.limitationReasons.join(' ')}</p> : null}
              <p className="mt-3 text-mk-muted">{snapshot.adaptiveMetrics.scoreComparabilityStatement}</p>
            </section>
          ) : null}

          <section className="grid gap-3 md:grid-cols-4" aria-labelledby="assessment-trust-heading">
            <h2 id="assessment-trust-heading" className="sr-only">Assessment trust facts</h2>
            {['68 controlled questions', '10 fraud-readiness domains', ...(showExposure ? ['Exposure profile included'] : []), 'Deterministic scoring'].map((item) => (
              <div key={item} className="rounded-xl border border-mk-line bg-mk-cream/50 p-3 text-sm font-semibold text-mk-ink">{item}</div>
            ))}
          </section>

          <section className="rounded-2xl border border-mk-line bg-white p-5 text-sm leading-6 text-mk-muted" aria-labelledby="concise-interpretation-heading">
            <h2 id="concise-interpretation-heading" className="font-semibold text-mk-ink">Concise readiness interpretation</h2>
            {effectiveSnapshotNarrative.mode === 'unavailable' ? (
              <p className="mt-2">The personalised interpretation is temporarily unavailable. Please refresh later or contact MK Fraud Insights if the problem continues.</p>
            ) : (
              <>
                <p className="mt-2">{effectiveSnapshotNarrative.interpretation}</p>
                <p className="mt-3 font-medium text-mk-ink">{effectiveSnapshotNarrative.nextStep}</p>
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
              <Badge>Automated analysis</Badge>
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
              />
              <p className="mt-4 text-sm leading-6 text-mk-muted">Advisory work is scoped manually with MK and is not an online order.</p>
            </div>

            {selectedOption ? <div ref={reportRevealRef} tabIndex={-1} role="region" aria-live="polite" aria-labelledby="report-options-heading" className="mt-5 rounded-2xl border border-mk-line bg-white p-5 focus:outline-none focus:ring-2 focus:ring-mk-brass focus:ring-offset-2">
            {selectedOption === COMMERCIAL_OPTION_CODES.essential || selectedOption === COMMERCIAL_OPTION_CODES.comprehensive ? (
              <div>
                {orderConfirmation ? (
                  <OrderConfirmationPanel order={orderConfirmation} />
                ) : (
                  <ReportOrderSummary snapshot={snapshot} tier={selectedOption} requestState={requestState} message={message} onConfirm={() => requestPaidOrder(selectedOption)} />
                )}
              </div>
            ) : null}
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

function ReportOrderSummary({ snapshot, tier, requestState, message, onConfirm }: { snapshot: FreeSnapshot; tier: SelfServicePaidTier; requestState: 'idle' | 'sending' | 'sent' | 'error'; message: string; onConfirm: () => void }) {
  const product = COMMERCIAL_CATALOGUE[tier];
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
        <Detail label="Product name" value={product.label} />
        <Detail label="Organisation" value={snapshot.organisationName} />
        <Detail label="Assessment reference" value={snapshot.assessmentReference} copyable />
        <Detail label="Price" value={`${formatCataloguePrice(product.priceCents)} incl. VAT`} />
        <Detail label="Delivery" value="Payment → MK admin generation → secure private PDF access" />
        <Detail label="What this includes" value={product.summary} />
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
        <Detail label="Product" value={order.productName} />
        <Detail label="Amount" value={order.amountDisplay} />
        <Detail label="Payment reference" value={order.paymentReference} copyable />
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

function ScopeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-mk-line bg-white/70 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-mk-muted">{label}</p>
      <p className="mt-1 font-semibold text-mk-ink">{value}</p>
    </div>
  );
}
