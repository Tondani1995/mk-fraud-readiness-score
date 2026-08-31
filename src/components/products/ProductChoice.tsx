'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FreeSnapshot } from '@/lib/snapshot/free-snapshot';
import type { NextStepRecommendation } from '@/lib/snapshot/next-step-recommendation';
import { COMMERCIAL_CATALOGUE, type SelfServicePaidTier } from '@/lib/commercial/product-catalogue';
import { readProductIntent, type ProductIntent } from '@/lib/commercial/product-intent';

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
  recommendation
}: {
  snapshot: FreeSnapshot;
  snapshotUrl?: string | null;
  recommendation: NextStepRecommendation;
}) {
  const router = useRouter();
  const selectionSent = useRef<Set<SelfServicePaidTier>>(new Set());
  const advisorySelectionSent = useRef(false);
  const navigatingOptionRef = useRef<SelfServicePaidTier | 'advisory' | null>(null);
  const [navigatingOption, setNavigatingOption] = useState<SelfServicePaidTier | 'advisory' | null>(null);
  const [earlierIntent, setEarlierIntent] = useState<ProductIntent | null>(null);

  /**
   * A tier the customer chose on the storefront before starting the assessment. It is read after
   * mount because it lives in browser storage, and it only ever marks a card — the deterministic
   * best-fit recommendation is unaffected, and every option stays freely choosable.
   */
  useEffect(() => {
    setEarlierIntent(readProductIntent(snapshot.assessmentReference));
  }, [snapshot.assessmentReference]);

  useEffect(() => {
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
  }, [router, snapshot.assessmentReference, snapshotUrl]);

  function chooseTier(tier: SelfServicePaidTier) {
    if (navigatingOptionRef.current) return;
    const snapshotToken = snapshotTokenFromUrl(snapshotUrl);
    const params = new URLSearchParams({ tier, ref: snapshot.assessmentReference });
    if (snapshotToken) params.set('token', snapshotToken);
    const destination = `${SCORE_BASE_PATH}/order/new?${params.toString()}`;

    navigatingOptionRef.current = tier;
    setNavigatingOption(tier);
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
    if (navigatingOptionRef.current) return;
    const snapshotToken = snapshotTokenFromUrl(snapshotUrl);
    const params = new URLSearchParams();
    if (snapshotToken) params.set('token', snapshotToken);
    const query = params.toString();
    const destination = `${SCORE_BASE_PATH}/advisory/${encodeURIComponent(snapshot.assessmentReference)}${query ? `?${query}` : ''}`;

    navigatingOptionRef.current = 'advisory';
    setNavigatingOption('advisory');
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
      <section id="next-step" className="scroll-mt-28 border-b border-mk-line bg-mk-paper">
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
            {recommendation.speakToMkFirst ? (
              <Link
                href="/contact"
                className="mt-3.5 inline-flex min-h-12 items-center justify-center rounded-xl bg-mk-navy px-5 py-3 text-[13px] font-semibold text-white transition hover:bg-mk-slate focus:outline-none focus:ring-2 focus:ring-mk-accent focus:ring-offset-2"
              >
                Talk to MK first
              </Link>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3.5 md:grid-cols-3">
            {(['essential', 'comprehensive'] as SelfServicePaidTier[]).map((tier) => (
              <ProductCard
                key={tier}
                tier={tier}
                isBestFit={recommendation.recommendedTier === tier}
                isEarlierSelection={earlierIntent === tier}
                isNavigating={Boolean(navigatingOption)}
                onChoose={() => chooseTier(tier)}
              />
            ))}
            <AdvisoryCard isNavigating={navigatingOption === 'advisory'} onChoose={chooseAdvisory} />
          </div>
        </div>
      </section>
    </>
  );
}

function ProductCard({ tier, isBestFit, isEarlierSelection, isNavigating, onChoose }: { tier: SelfServicePaidTier; isBestFit: boolean; isEarlierSelection: boolean; isNavigating: boolean; onChoose: () => void }) {
  const product = COMMERCIAL_CATALOGUE[tier];
  const card = CARDS[tier];
  // Price is read from the catalogue at render time. No price literal exists in this component.
  const price = formatCataloguePrice(product.priceCents);

  return (
    <article
      aria-labelledby={`${tier}-name`}
      data-earlier-selection={isEarlierSelection ? 'true' : undefined}
      className={`flex h-full flex-col rounded-2xl bg-mk-paper p-5 ${isBestFit || isEarlierSelection ? 'border-2 border-mk-accent' : 'border border-mk-line'}`}
    >
      {isBestFit ? (
        <p className="mb-2.5 inline-block rounded-[3px] bg-mk-accent px-1.5 py-[3px] text-[9px] font-semibold uppercase tracking-[0.13em] text-white">
          Best fit for your result
        </p>
      ) : null}
      {isEarlierSelection ? (
        <p className="mb-2.5 inline-block rounded-[3px] border border-mk-accent/40 px-1.5 py-[3px] text-[9px] font-semibold uppercase tracking-[0.13em] text-mk-accent">
          You selected this earlier
        </p>
      ) : null}
      <h3 id={`${tier}-name`} className="text-[19px] font-semibold text-mk-navy md:text-xl">{product.label}</h3>
      {price ? <p className="mt-1 text-[12.5px] tabular-nums text-mk-slate">{price} incl. VAT</p> : null}
      <p className="mt-3 border-t border-mk-line pt-3 text-[13px] font-semibold leading-snug text-mk-accent md:text-[13.5px]">{card.answers}</p>
      <dl className="mt-3.5 flex flex-1 flex-col gap-2.5">
        <div>
          <dt className="text-[9px] uppercase tracking-[0.14em] text-mk-muted">For</dt>
          <dd className="mt-0.5 text-[12.5px] leading-6 text-mk-slate">{card.forWho}</dd>
        </div>
        <div>
          <dt className="text-[9px] uppercase tracking-[0.14em] text-mk-muted">You receive</dt>
          <dd className="mt-0.5 text-[12.5px] leading-6 text-mk-slate">{card.receive.join(' · ')}</dd>
        </div>
        <div>
          <dt className="text-[9px] uppercase tracking-[0.14em] text-mk-muted">Leaves you with</dt>
          <dd className="mt-0.5 text-[12.5px] font-semibold leading-6 text-mk-navy">{card.leavesYouWith}</dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={onChoose}
        disabled={isNavigating}
        className={`mt-4 flex min-h-12 w-full items-center justify-center rounded-xl px-5 py-3 text-[13px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-mk-accent focus:ring-offset-2 ${
          isBestFit ? 'bg-mk-navy text-white hover:bg-mk-slate disabled:cursor-wait disabled:opacity-70' : 'border-2 border-mk-accent/25 text-mk-navy hover:border-mk-accent/50 disabled:cursor-wait disabled:opacity-70'
        }`}
      >
        {isNavigating ? 'Opening…' : `Choose ${product.label}`}
      </button>
    </article>
  );
}

function AdvisoryCard({ isNavigating, onChoose }: { isNavigating: boolean; onChoose: () => void }) {
  return (
    <article id="advisory" aria-labelledby="advisory-name" className="flex h-full flex-col rounded-2xl bg-mk-navy p-5 text-white">
      <h3 id="advisory-name" className="text-[19px] font-semibold text-white md:text-xl">MK Advisory</h3>
      <p className="mt-3 border-t border-white/20 pt-3 text-[13px] font-semibold leading-snug text-mk-accent md:text-[13.5px]">Work with MK directly to investigate, design or implement it with us.</p>
      <dl className="mt-3.5 flex flex-1 flex-col gap-2.5">
        <div>
          <dt className="text-[9px] uppercase tracking-[0.14em] text-white/[.62]">For</dt>
          <dd className="mt-0.5 text-[12.5px] leading-6 text-white/[.82]">An organisation that needs a partner for a more involved fraud-readiness question.</dd>
        </div>
        <div>
          <dt className="text-[9px] uppercase tracking-[0.14em] text-white/[.62]">You receive</dt>
          <dd className="mt-0.5 text-[12.5px] leading-6 text-white/[.82]">A conversation to define the work, scope, deliverables and fees with MK.</dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={onChoose}
        disabled={isNavigating}
        className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl bg-white px-5 py-3 text-[13px] font-semibold text-mk-navy transition hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-mk-navy"
      >
        {isNavigating ? 'Opening…' : 'Talk to MK'}
      </button>
    </article>
  );
}
