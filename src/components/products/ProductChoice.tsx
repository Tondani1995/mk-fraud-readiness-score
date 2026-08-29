'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FreeSnapshot } from '@/lib/snapshot/free-snapshot';
import type { NextStepRecommendation } from '@/lib/snapshot/next-step-recommendation';
import { ASSURANCE_BOUNDARY, PRICE_DIFFERENCE_LEAD, PRICE_DIFFERENCE_NOTE } from '@/lib/snapshot/result-copy';
import { COMMERCIAL_CATALOGUE, type SelfServicePaidTier } from '@/lib/commercial/product-catalogue';

/**
 * The conversion moment.
 *
 * Three commercial paths presented as a decision before any card, then two product cards, then
 * Advisory as a full-bleed band rather than a third column -- it is a different kind of object
 * (a conversation you start), and forcing it into the same shape is what made it read as an
 * escape hatch.
 *
 * The recommendation is deterministic and always carries its reason and its rule id. There is
 * no unconditional "Recommended" state, and the non-recommended card is never dimmed, shrunk
 * or reordered: only the border weight and the presence of the chip differ.
 *
 * Advisory carries NO price, floor or range. ADVISORY_PRICE_FROM_CENTS is deliberately not
 * imported here.
 */

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

const DECISION = [
  { tier: 'Essential', answer: 'Tell me what is wrong and what management should do first.' },
  { tier: 'Comprehensive', answer: 'Tell me what is wrong, then design the fraud-control environment we should build.' },
  { tier: 'Advisory', answer: 'Work with MK directly to investigate, design or implement it with us.' }
] as const;

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

  async function chooseTier(tier: SelfServicePaidTier) {
    const snapshotToken = snapshotTokenFromUrl(snapshotUrl);
    if (snapshotToken && !selectionSent.current.has(tier)) {
      selectionSent.current.add(tier);
      const post = (eventType: string) =>
        fetch(`${SCORE_BASE_PATH}/api/assessments/${snapshot.assessmentReference}/commercial-event`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ snapshotToken, eventType, optionCode: tier, sourceSection: 'next_step' })
        }).catch(() => null);
      await post('report_option_selected');
      await post(`${tier}_selected`);
    }
    const params = new URLSearchParams({ tier, ref: snapshot.assessmentReference });
    if (snapshotToken) params.set('token', snapshotToken);
    router.push(`${SCORE_BASE_PATH}/order/new?${params.toString()}`);
  }

  return (
    <>
      <section id="next-step" className="scroll-mt-28 border-b border-mk-line bg-mk-paper">
        <div className="mx-auto max-w-[1120px] px-[18px] py-12 md:px-6 md:py-16">
          <p className="text-[9.5px] uppercase tracking-[0.2em] text-mk-accent">Your next step</p>
          <h2 className="mt-2.5 text-[22px] font-semibold tracking-tight text-mk-navy md:text-[28px]">How far do you want to take this?</h2>

          <ul className="mt-6 grid border border-mk-line md:grid-cols-3">
            {DECISION.map((item, index) => (
              <li
                key={item.tier}
                className={`px-4 py-3.5 ${index < DECISION.length - 1 ? 'border-b border-mk-line md:border-b-0 md:border-r' : ''} border-mk-line`}
              >
                <p className="text-[9.5px] uppercase tracking-[0.14em] text-mk-accent">{item.tier}</p>
                <p className="mt-1.5 text-sm font-semibold leading-snug text-mk-navy">{item.answer}</p>
              </li>
            ))}
          </ul>

          <div className="mt-5 border border-mk-accent/25 bg-mk-accent/[.06] px-4 py-3.5">
            <p className="text-[9.5px] uppercase tracking-[0.14em] text-mk-accent">
              {recommendation.speakToMkFirst ? `Best next step for your result — rule ${recommendation.ruleId}` : `Best fit for your result — rule ${recommendation.ruleId}`}
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

          <div className="mt-4 grid gap-3.5 md:grid-cols-2">
            {(['essential', 'comprehensive'] as SelfServicePaidTier[]).map((tier) => (
              <ProductCard
                key={tier}
                tier={tier}
                isBestFit={recommendation.recommendedTier === tier}
                onChoose={() => void chooseTier(tier)}
              />
            ))}
          </div>

          <p className="mt-4 max-w-[68ch] text-[13px] leading-6 text-mk-slate">
            <strong className="font-semibold text-mk-navy">{PRICE_DIFFERENCE_LEAD}</strong> {PRICE_DIFFERENCE_NOTE}
          </p>
        </div>
      </section>

      <section id="advisory" className="scroll-mt-28 bg-mk-navy text-white">
        <div className="mx-auto max-w-[1120px] px-[18px] py-12 md:px-6 md:py-14">
          <p className="text-[9.5px] uppercase tracking-[0.2em] text-white/[.72]">MK Advisory · custom engagement</p>
          <h2 className="mt-2.5 text-[19px] font-semibold tracking-tight text-white md:text-[22px]">Work with MK directly.</h2>
          <p className="mt-3 max-w-[64ch] text-[13px] leading-[1.62] text-white/[.82] md:text-sm">{ASSURANCE_BOUNDARY}</p>
          <p className="mt-3 max-w-[64ch] text-[13px] leading-[1.62] text-white/[.82] md:text-sm">
            Scope, deliverables and fees are agreed with you before anything begins. There is no automatic order and no payment obligation.
          </p>
          <Link
            href="/contact"
            className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-white px-5 py-3 text-[13px] font-semibold text-mk-navy transition hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-mk-navy sm:w-auto"
          >
            Talk to MK about an engagement
          </Link>
        </div>
      </section>
    </>
  );
}

function ProductCard({ tier, isBestFit, onChoose }: { tier: SelfServicePaidTier; isBestFit: boolean; onChoose: () => void }) {
  const product = COMMERCIAL_CATALOGUE[tier];
  const card = CARDS[tier];
  // Price is read from the catalogue at render time. No price literal exists in this component.
  const price = formatCataloguePrice(product.priceCents);

  return (
    <article
      aria-labelledby={`${tier}-name`}
      className={`rounded-2xl bg-mk-paper p-5 ${isBestFit ? 'border-2 border-mk-accent' : 'border border-mk-line'}`}
    >
      {isBestFit ? (
        <p className="mb-2.5 inline-block rounded-[3px] bg-mk-accent px-1.5 py-[3px] text-[9px] font-semibold uppercase tracking-[0.13em] text-white">
          Best fit for your result
        </p>
      ) : null}
      <h3 id={`${tier}-name`} className="text-[19px] font-semibold text-mk-navy md:text-xl">{product.label}</h3>
      {price ? <p className="mt-1 text-[12.5px] tabular-nums text-mk-slate">{price} incl. VAT</p> : null}
      <p className="mt-3 border-t border-mk-line pt-3 text-[13px] font-semibold leading-snug text-mk-accent md:text-[13.5px]">{card.answers}</p>
      <dl className="mt-3.5 flex flex-col gap-2.5">
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
        className={`mt-4 flex min-h-12 w-full items-center justify-center rounded-xl px-5 py-3 text-[13px] font-semibold transition focus:outline-none focus:ring-2 focus:ring-mk-accent focus:ring-offset-2 ${
          isBestFit ? 'bg-mk-navy text-white hover:bg-mk-slate' : 'border-2 border-mk-accent/25 text-mk-navy hover:border-mk-accent/50'
        }`}
      >
        Choose {product.label}
      </button>
    </article>
  );
}
