'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FreeSnapshot } from '@/lib/snapshot/free-snapshot';
import type { NextStepRecommendation } from '@/lib/snapshot/next-step-recommendation';
import { COMMERCIAL_CATALOGUE, type SelfServicePaidTier } from '@/lib/commercial/product-catalogue';
import { readProductIntent, type ProductIntent } from '@/lib/commercial/product-intent';
import { trackEvent } from '@/lib/website/gtag';
import { ProductTierCard } from '@/components/products/ProductTierCard';

/** The conversion moment: three equally visible choices with a deterministic recommendation. */

const SCORE_BASE_PATH = '/score';

function formatCataloguePrice(priceCents: number | null) {
  if (priceCents === null) return null;
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(priceCents / 100);
}

function snapshotTokenFromUrl(snapshotUrl?: string | null) {
  try {
    if (snapshotUrl) return new URL(snapshotUrl, window.location.origin).searchParams.get('token');
    return new URL(window.location.href).searchParams.get('token');
  } catch {
    return null;
  }
}

const CARDS: Record<SelfServicePaidTier, { answers: string; forWho: string; receive: string[]; leavesYouWith: string }> = {
  essential: {
    answers: 'Tell me what is wrong and what management should do first.',
    forWho: 'A management team that needs to act on this result now.',
    receive: [
      'Diagnosis across every applicable area',
      'Weaknesses and false-comfort risks',
      'Prioritised executive actions',
      '30/60/90-day direction with proof requirements',
      'Professionally prepared PDF'
    ],
    leavesYouWith: 'A management team that knows its priorities and can defend them.'
  },
  comprehensive: {
    answers: 'Tell me what is wrong, then design the fraud-control environment we should build.',
    forWho: 'An organisation that has decided to rebuild its fraud-control environment.',
    receive: [
      'Everything in Essential',
      'Finding and fraud-exposure registers',
      'Target-state design per priority control',
      '12-month implementation programme',
      'Governance model and management scorecard',
      'PDF and supporting XLSX'
    ],
    leavesYouWith: 'A designed fraud-control operating model with owners, measures and a build sequence.'
  }
};

export function ProductChoice({
  snapshot,
  snapshotUrl,
  recommendation,
  visualReview = false
}: {
  snapshot: FreeSnapshot;
  snapshotUrl?: string | null;
  recommendation: NextStepRecommendation;
  /** Preview-only fixture mode. It never changes the normal customer conversion path. */
  visualReview?: boolean;
}) {
  const router = useRouter();
  const selectionSent = useRef<Set<SelfServicePaidTier>>(new Set());
  const advisorySelectionSent = useRef(false);
  const reportOptionsViewedRef = useRef(false);
  const optionSectionRef = useRef<HTMLElement | null>(null);
  const navigatingTierRef = useRef<SelfServicePaidTier | 'advisory' | null>(null);
  const [navigatingOption, setNavigatingOption] = useState<SelfServicePaidTier | 'advisory' | null>(null);
  const [earlierIntent, setEarlierIntent] = useState<ProductIntent | null>(null);
  // The recommendation is the first mobile card in the DOM and therefore the first card a
  // stacked layout and keyboard traversal encounter. Desktop keeps the established three-column
  // composition through explicit responsive order classes.
  const paidTiers: SelfServicePaidTier[] = recommendation.recommendedTier === 'comprehensive'
    ? ['comprehensive', 'essential']
    : ['essential', 'comprehensive'];
  const desktopOrderClass: Record<SelfServicePaidTier | 'advisory', string> = {
    essential: 'md:order-1',
    comprehensive: 'md:order-2',
    advisory: 'md:order-3'
  };

  /**
   * A tier the customer chose on the storefront before starting the assessment. It is read after
   * mount because it lives in browser storage, and it only ever marks a card; the deterministic
   * best-fit recommendation is unaffected, and every option stays freely choosable.
   */
  useEffect(() => {
    if (visualReview) return;
    setEarlierIntent(readProductIntent(snapshot.assessmentReference));
  }, [snapshot.assessmentReference, visualReview]);

  useEffect(() => {
    const snapshotToken = snapshotTokenFromUrl(snapshotUrl);
    const section = optionSectionRef.current;
    if (!snapshotToken || !section || reportOptionsViewedRef.current) return;

    const recordOptionsViewed = () => {
      if (reportOptionsViewedRef.current) return;
      reportOptionsViewedRef.current = true;
      void fetch(`${SCORE_BASE_PATH}/api/assessments/${snapshot.assessmentReference}/commercial-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotToken, eventType: 'report_options_opened', sourceSection: 'next_step' }),
        keepalive: true
      }).catch(() => null);
    };

    if (!('IntersectionObserver' in window)) {
      recordOptionsViewed();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio > 0)) recordOptionsViewed();
      },
      { threshold: [0.5] }
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [snapshot.assessmentReference, snapshotUrl]);

  useEffect(() => {
    if (visualReview) return;
    for (const tier of ['essential', 'comprehensive'] as SelfServicePaidTier[]) {
      const snapshotToken = snapshotTokenFromUrl(snapshotUrl);
      const params = new URLSearchParams({ tier, ref: snapshot.assessmentReference });
      if (snapshotToken) params.set('token', snapshotToken);
      router.prefetch(`${SCORE_BASE_PATH}/order/new?${params.toString()}`);
    }
    const snapshotToken = snapshotTokenFromUrl(snapshotUrl);
    const advisoryParams = new URLSearchParams();
    if (snapshotToken) advisoryParams.set('token', snapshotToken);
    router.prefetch(`${SCORE_BASE_PATH}/advisory/${encodeURIComponent(snapshot.assessmentReference)}?${advisoryParams.toString()}`);
  }, [router, snapshot.assessmentReference, snapshotUrl, visualReview]);

  function chooseTier(tier: SelfServicePaidTier) {
    if (navigatingTierRef.current) return;
    if (visualReview) {
      navigatingTierRef.current = tier;
      setNavigatingOption(tier);
      return;
    }
    const snapshotToken = snapshotTokenFromUrl(snapshotUrl);
    const params = new URLSearchParams({ tier, ref: snapshot.assessmentReference });
    if (snapshotToken) params.set('token', snapshotToken);
    const destination = `${SCORE_BASE_PATH}/order/new?${params.toString()}`;

    navigatingTierRef.current = tier;
    setNavigatingOption(tier);
    trackEvent('product_selected', { tier });
    router.push(destination);

    if (snapshotToken && !selectionSent.current.has(tier)) {
      selectionSent.current.add(tier);
      const post = (eventType: string) =>
        fetch(`${SCORE_BASE_PATH}/api/assessments/${snapshot.assessmentReference}/commercial-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ snapshotToken, eventType, optionCode: tier, sourceSection: 'next_step' }),
          keepalive: true
        }).catch(() => null);
      void post('report_option_selected');
      void post(`${tier}_selected`);
    }
  }

  function chooseAdvisory() {
    if (navigatingTierRef.current) return;
    if (visualReview) {
      navigatingTierRef.current = 'advisory';
      setNavigatingOption('advisory');
      return;
    }
    const snapshotToken = snapshotTokenFromUrl(snapshotUrl);
    const params = new URLSearchParams();
    if (snapshotToken) params.set('token', snapshotToken);
    const query = params.toString();
    const destination = `${SCORE_BASE_PATH}/advisory/${encodeURIComponent(snapshot.assessmentReference)}${query ? `?${query}` : ''}`;

    navigatingTierRef.current = 'advisory';
    setNavigatingOption('advisory');
    trackEvent('product_selected', { tier: 'advisory' });
    router.push(destination);

    if (snapshotToken && !advisorySelectionSent.current) {
      advisorySelectionSent.current = true;
      const post = (eventType: string) =>
        fetch(`${SCORE_BASE_PATH}/api/assessments/${snapshot.assessmentReference}/commercial-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ snapshotToken, eventType, optionCode: 'advisory', sourceSection: 'next_step' }),
          keepalive: true
        }).catch(() => null);
      void post('report_option_selected');
      void post('advisory_selected');
    }
  }

  return (
    <>
      <section ref={optionSectionRef} id="next-step" className="scroll-mt-28 border-b border-mk-line bg-mk-paper">
        <div className="mx-auto max-w-[1120px] px-[18px] py-12 md:px-6 md:py-16">
          <p className="text-[9.5px] uppercase tracking-[0.2em] text-mk-accent">Your next step</p>
          <h2 className="mt-2.5 text-[22px] font-semibold tracking-tight text-mk-navy md:text-[28px]">How far do you want to take this?</h2>

          <div className="mt-5 border border-mk-accent/25 bg-mk-accent/[.06] px-4 py-3.5">
            <p className="text-[9.5px] uppercase tracking-[0.14em] text-mk-accent">
              {recommendation.speakToMkFirst ? 'Best next step for your result' : 'Best fit for your result'}
            </p>
            <p className="mt-1.5 max-w-[72ch] text-[13.5px] leading-6 text-mk-navy">
              {recommendation.reason}{' '}
              <span className="font-semibold">{recommendation.freedomClause}</span>
            </p>
            {/* The certified MK Advisory route, not the generic contact form. This customer has a
                Snapshot and a private token, so their assessment context travels with the enquiry
                sending them to a general "send us a message" form would discard exactly the
                context that makes the conversation useful, and drop them out of the Advisory
                workflow and its admin queue. */}
            {recommendation.speakToMkFirst ? (
              <button
                type="button"
                onClick={chooseAdvisory}
                disabled={Boolean(navigatingOption)}
                className="mt-3.5 inline-flex min-h-12 items-center justify-center rounded-xl bg-mk-navy px-5 py-3 text-[13px] font-semibold text-white transition hover:bg-mk-slate focus:outline-none focus:ring-2 focus:ring-mk-accent focus:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
              >
                {navigatingOption === 'advisory' ? 'Opening…' : 'Talk to MK first'}
              </button>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3.5 md:grid-cols-3">
            {paidTiers.map((tier) => (
              <div key={tier} className={`min-w-0 ${desktopOrderClass[tier]}`}>
                <ProductCard
                  tier={tier}
                  isBestFit={recommendation.recommendedTier === tier}
                  isEarlierSelection={earlierIntent === tier}
                  isNavigating={Boolean(navigatingOption)}
                  onChoose={() => chooseTier(tier)}
                />
              </div>
            ))}
            <div className={`min-w-0 ${desktopOrderClass.advisory}`}>
              <AdvisoryCard isNavigating={navigatingOption === 'advisory'} onChoose={chooseAdvisory} />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function ProductCard({ tier, isBestFit, isEarlierSelection, isNavigating, onChoose }: { tier: SelfServicePaidTier; isBestFit: boolean; isEarlierSelection: boolean; isNavigating: boolean; onChoose: () => void }) {
  const product = COMMERCIAL_CATALOGUE[tier];
  const card = CARDS[tier];
  const price = formatCataloguePrice(product.priceCents);
  const featuredLabel = isBestFit ? 'Best fit for your result' : isEarlierSelection ? 'You selected this earlier' : undefined;
  const actionClass = tier === 'comprehensive'
    ? 'bg-white text-mk-navy hover:bg-white/90'
    : 'bg-mk-navy text-white hover:bg-mk-slate';

  return (
    <ProductTierCard
      tier={tier}
      label={product.label}
      phase={tier === 'essential' ? 'Diagnose' : 'Design'}
      tagline={tier === 'essential' ? 'Clarify the position' : 'Build the response'}
      priceLabel={price ? `${price} incl. VAT` : undefined}
      description={card.answers}
      features={[
        `For: ${card.forWho}`,
        `You receive: ${card.receive.join(' · ')}`,
        `Leaves you with: ${card.leavesYouWith}`
      ]}
      featuredLabel={featuredLabel}
      compact
      earlierSelected={isEarlierSelection}
      action={(
        <button
          type="button"
          onClick={onChoose}
          disabled={isNavigating}
          className={`flex min-h-12 w-full items-center justify-center rounded-xl px-5 py-3 text-[13px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-mk-accent focus:ring-offset-2 ${actionClass} disabled:cursor-wait disabled:opacity-70`}
        >
          {isNavigating ? 'Opening…' : `Choose ${product.label}`}
        </button>
      )}
    />
  );
}

function AdvisoryCard({ isNavigating, onChoose }: { isNavigating: boolean; onChoose: () => void }) {
  return (
    <ProductTierCard
      id="advisory"
      tier="advisory"
      label="MK Advisory"
      phase="Implement"
      tagline="Move with a partner"
      description="Work with MK directly to investigate, design or implement it with us."
      features={[
        'For: An organisation that needs a partner for a more involved fraud-readiness question.',
        'You receive: A conversation to define the work, scope, deliverables and fees with MK.'
      ]}
      action={(
        <button
          type="button"
          onClick={onChoose}
          disabled={isNavigating}
          className="flex min-h-12 w-full items-center justify-center rounded-xl bg-mk-navy px-5 py-3 text-[13px] font-semibold text-white transition hover:bg-mk-slate focus:outline-none focus:ring-2 focus:ring-mk-navy focus:ring-offset-2 disabled:cursor-wait disabled:opacity-70"
        >
          {isNavigating ? 'Opening…' : 'Talk to MK'}
        </button>
      )}
    />
  );
}
