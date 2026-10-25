import Link from 'next/link';
import { buildDeterministicSnapshotNarrative } from '@/lib/snapshot/narrative';
import { buildCalculatedSnapshotFixture, CALCULATED_VARIANTS, type CalculatedVariant } from '@/lib/visual-review/calculated-fixtures';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { AdaptiveAssessmentExperience } from '@/components/adaptive/AdaptiveAssessmentExperience';
import { OrderJourney } from '@/components/commercial/OrderJourney';
import { ResultChrome, ResultFooter } from '@/components/layout/ResultChrome';
import { SnapshotResult } from '@/components/assessment/SnapshotResult';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionShell } from '@/components/ui/SectionShell';
import { buildCommercialSnapshotInsights } from '@/lib/snapshot/commercial-insights';
import {
  buildAdaptiveVisualReviewState,
  buildVisualReviewInvoiceDetails,
  buildSnapshotVisualReviewFixture,
  buildVisualReviewOrder,
  snapshotVisualReviewTitle,
  VISUAL_REVIEW_ASSESSMENT_REFERENCE,
  type AdaptiveVisualReviewVariant,
  type SnapshotVisualReviewVariant
} from '@/lib/visual-review/fixtures';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type VisualReviewScenario =
  | { kind: 'index' }
  | { kind: 'calculated'; variant: CalculatedVariant }
  | { kind: 'adaptive'; variant: AdaptiveVisualReviewVariant }
  | { kind: 'snapshot'; variant: SnapshotVisualReviewVariant }
  | { kind: 'order'; tier: 'essential' | 'comprehensive'; step: 1 | 2 | 3; invoiceRequested: boolean | null };

type VisualReviewPageProps = {
  params: Promise<{ scenario?: string[] }>;
};

function visualReviewAllowed() {
  // Preview is the only deployed environment permitted to serve these fixtures. Local
  // development remains useful for component work; any production-shaped runtime is denied.
  return process.env.VERCEL_ENV === 'preview'
    || (process.env.VERCEL_ENV !== 'production' && process.env.NODE_ENV !== 'production');
}

function parseScenario(parts: string[] | undefined): VisualReviewScenario | null {
  if (!parts?.length) return { kind: 'index' };
  if (parts[0] === 'calculated' && parts.length === 2 && CALCULATED_VARIANTS.includes(parts[1] as CalculatedVariant)) return { kind: 'calculated', variant: parts[1] as CalculatedVariant };

  if (parts[0] === 'adaptive' && parts.length === 2 && ['early', 'mid', 'late', 'review', 'submitted'].includes(parts[1])) {
    return { kind: 'adaptive', variant: parts[1] as AdaptiveVisualReviewVariant };
  }

  if (parts[0] === 'snapshot' && parts.length === 2 && ['score-100', 'score-60', 'score-20', 'insufficient-visibility'].includes(parts[1])) {
    return { kind: 'snapshot', variant: parts[1] as SnapshotVisualReviewVariant };
  }

  if (parts[0] === 'order' && parts.length === 3
    && ['essential', 'comprehensive'].includes(parts[1])
    && ['confirm', 'billing', 'billing-invoice', 'payment'].includes(parts[2])) {
    const step = parts[2] === 'confirm' ? 1 : parts[2].startsWith('billing') ? 2 : 3;
    return {
      kind: 'order',
      tier: parts[1] as 'essential' | 'comprehensive',
      step,
      invoiceRequested: parts[2] === 'billing-invoice' ? true : parts[2] === 'billing' ? false : null
    };
  }

  return null;
}

function ReviewFrame({ kind, title, children }: { kind: string; title: string; children: ReactNode }) {
  return (
    <div data-visual-review="true" data-visual-review-kind={kind} data-visual-review-no-supabase="true">
      <aside aria-label="Private visual review fixture" className="border-b border-mk-accent/25 bg-mk-accent/[.07]">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-baseline justify-between gap-2 px-[18px] py-2.5 md:px-6">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-mk-accent">Private visual review fixture</p>
          <p className="text-[12px] text-mk-muted">{title} · Preview/local only · no customer data is read or written</p>
        </div>
      </aside>
      {children}
    </div>
  );
}

function IndexPage() {
  const links = [
    ...CALCULATED_VARIANTS.map((variant) => [`Engine calculated · ${variant}`, `/score/visual-review/calculated/${variant}`]),
    ['Adaptive · early', '/score/visual-review/adaptive/early'],
    ['Adaptive · mid', '/score/visual-review/adaptive/mid'],
    ['Adaptive · late', '/score/visual-review/adaptive/late'],
    ['Adaptive · ready to submit', '/score/visual-review/adaptive/review'],
    ['Adaptive · submitted', '/score/visual-review/adaptive/submitted'],
    ['Snapshot · score 100', '/score/visual-review/snapshot/score-100'],
    ['Snapshot · score 60', '/score/visual-review/snapshot/score-60'],
    ['Snapshot · score 20', '/score/visual-review/snapshot/score-20'],
    ['Snapshot · Not issued', '/score/visual-review/snapshot/insufficient-visibility'],
    ['Essential · Confirm', '/score/visual-review/order/essential/confirm'],
    ['Essential · Billing', '/score/visual-review/order/essential/billing'],
    ['Essential · Billing · invoice requested', '/score/visual-review/order/essential/billing-invoice'],
    ['Essential · Payment', '/score/visual-review/order/essential/payment'],
    ['Comprehensive · Confirm', '/score/visual-review/order/comprehensive/confirm'],
    ['Comprehensive · Billing', '/score/visual-review/order/comprehensive/billing'],
    ['Comprehensive · Billing · invoice requested', '/score/visual-review/order/comprehensive/billing-invoice'],
    ['Comprehensive · Payment', '/score/visual-review/order/comprehensive/payment']
  ];

  return (
    <ReviewFrame kind="index" title="Deterministic state index">
      <SectionShell className="w-full py-10 md:py-14">
        <PageHeader
          eyebrow="OWNER VISUAL REVIEW"
          title="Private fixture states"
          description="Every link below renders the real customer-facing component with immutable representative state. The route is available only in local development and Vercel Preview."
        />
        <nav aria-label="Visual review states" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {links.map(([label, href]) => (
            <a key={href} href={href} className="flex min-h-14 items-center rounded-brand border border-mk-line bg-white px-4 py-3 text-sm font-semibold text-mk-navy transition hover:border-mk-accent/50 focus:outline-none focus:ring-2 focus:ring-mk-accent focus:ring-offset-2">
              {label}
            </a>
          ))}
        </nav>
      </SectionShell>
    </ReviewFrame>
  );
}

function AdaptiveReview({ variant }: { variant: AdaptiveVisualReviewVariant }) {
  const state = buildAdaptiveVisualReviewState(variant);
  const title = `Adaptive · ${variant === 'review' ? 'ready to submit' : variant === 'submitted' ? 'submitted / completion' : variant}`;
  return (
    <ReviewFrame kind={`adaptive-${variant}`} title={title}>
      <SectionShell className="w-full py-8 md:py-12">
        <div className="assessment-context"><p className="clarity-eyebrow">FRAUD READINESS / QUESTIONNAIRE</p><p>Synthetic review state. No assessment data is saved or submitted.</p></div>
        <AdaptiveAssessmentExperience
          assessmentReference={VISUAL_REVIEW_ASSESSMENT_REFERENCE}
          token="visual-review-token"
          initialState={state}
          visualReview
        />
      </SectionShell>
    </ReviewFrame>
  );
}

function SnapshotReview({ variant, calculated = false }: { variant: SnapshotVisualReviewVariant | CalculatedVariant; calculated?: boolean }) {
  const snapshot = calculated ? buildCalculatedSnapshotFixture(variant as CalculatedVariant) : buildSnapshotVisualReviewFixture(variant as SnapshotVisualReviewVariant);
  const title = calculated ? `Engine calculated · ${variant} · existing V1.2 candidate graph / G27 test adapter` : `${snapshotVisualReviewTitle(variant as SnapshotVisualReviewVariant)} · hand-composed layout sample, not engine reconciled`;
  const insights = buildCommercialSnapshotInsights(snapshot);
  return (
    <ReviewFrame kind={`snapshot-${variant}`} title={title}>
      {!calculated && <p className="mx-auto max-w-[1120px] px-[18px] py-4 text-sm leading-6 text-mk-slate">Layout sample only: totals, bands and percentages were composed independently and must not be used as scoring evidence. <Link className="underline" href="/score/visual-review/calculated/partial-coverage">Compare an engine-calculated coverage example</Link>.</p>}
      <ResultChrome assessmentReference={snapshot.assessmentReference} resultUrl={null}>
        <SnapshotResult
          snapshot={snapshot}
          snapshotUrl={null}
          commercialInsights={insights}
          snapshotNarrative={buildDeterministicSnapshotNarrative({ snapshot, insights })}
          methodologyLabel="MK Fraud Readiness Methodology"
          visualReview
        />
        <ResultFooter assessmentReference={snapshot.assessmentReference} methodologyLabel="MK Fraud Readiness Methodology" />
      </ResultChrome>
    </ReviewFrame>
  );
}

function OrderReview({ tier, step, invoiceRequested }: { tier: 'essential' | 'comprehensive'; step: 1 | 2 | 3; invoiceRequested: boolean | null }) {
  const order = buildVisualReviewOrder(tier, invoiceRequested === true);
  const label = tier === 'essential' ? 'Essential' : 'Comprehensive';
  const stepLabel = step === 1 ? 'Confirm' : step === 2 ? invoiceRequested ? 'Billing · invoice requested' : 'Billing' : 'Payment';
  return (
    <ReviewFrame kind={`order-${tier}-${stepLabel.toLowerCase()}`} title={`${label} · ${stepLabel}`}>
      <ResultChrome
        assessmentReference={VISUAL_REVIEW_ASSESSMENT_REFERENCE}
        orderStep={{ current: step, total: 3 }}
      >
        <OrderJourney
          tier={tier}
          productLabel={label}
          amountDisplay={order.amountDisplay}
          assessmentReference={VISUAL_REVIEW_ASSESSMENT_REFERENCE}
          organisationName="Siyakhula Holdings (Pty) Ltd"
          respondentName="Nomsa Dlamini"
          respondentEmail="nomsa@siyakhula.example"
          snapshotToken="visual-review-token"
          snapshotPath="/score/visual-review/snapshot/score-60"
          initialStep={step}
          initialInvoiceRequested={step === 2 ? invoiceRequested : null}
          initialInvoiceDetails={invoiceRequested ? buildVisualReviewInvoiceDetails(tier) : null}
          initialOrder={step === 3 ? order : null}
          visualReview
        />
        <ResultFooter assessmentReference={VISUAL_REVIEW_ASSESSMENT_REFERENCE} />
      </ResultChrome>
    </ReviewFrame>
  );
}

export default async function VisualReviewPage({ params }: VisualReviewPageProps) {
  if (!visualReviewAllowed()) notFound();

  const scenario = parseScenario((await params).scenario);
  if (!scenario) notFound();
  if (scenario.kind === 'index') return <IndexPage />;
  if (scenario.kind === 'adaptive') return <AdaptiveReview variant={scenario.variant} />;
  if (scenario.kind === 'calculated') return <SnapshotReview variant={scenario.variant} calculated />;
  if (scenario.kind === 'snapshot') return <SnapshotReview variant={scenario.variant} />;
  return <OrderReview tier={scenario.tier} step={scenario.step} invoiceRequested={scenario.invoiceRequested} />;
}
