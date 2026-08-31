import Link from 'next/link';
import { storefrontCards } from '@/lib/commercial/storefront-presentation';

/**
 * The three commercial options, presented as equals.
 *
 * Deliberately not a pricing table: no "most popular" flag, no crossed-out anchor price, no
 * feature-tick matrix. Which tier is right depends on the organisation's result, and the platform
 * makes that recommendation later from the Snapshot — asserting it here, before anything is known,
 * would be selling rather than advising.
 *
 * Every price and deliverable is read from the catalogue through storefront-presentation.ts. No
 * price literal exists in this file.
 */
export function FraudReadinessOptions() {
  const cards = storefrontCards();

  return (
    <section aria-labelledby="fraud-readiness-options-heading" className="mx-auto max-w-7xl px-6 lg:px-8">
      <h2 id="fraud-readiness-options-heading" className="sr-only">
        Fraud Readiness options
      </h2>

      <ul className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {cards.map((card) => (
          <li key={card.tier} className="flex">
            <article
              aria-labelledby={`${card.tier}-heading`}
              className="flex w-full flex-col border border-slate-200 bg-white p-7 lg:p-8"
            >
              <h3 id={`${card.tier}-heading`} className="text-xl font-semibold tracking-tight text-[#001030]">
                {card.label}
              </h3>
              <p className="mt-2 text-sm font-medium tabular-nums text-[#1D3658]">{card.priceLabel}</p>

              <dl className="mt-6 space-y-4 border-t border-slate-200 pt-6">
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">For</dt>
                  <dd className="mt-1.5 text-sm leading-6 text-slate-700">{card.forWho}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Outcome</dt>
                  <dd className="mt-1.5 text-sm leading-6 text-slate-700">{card.outcome}</dd>
                </div>
              </dl>

              <div className="mt-6 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Included</p>
                <ul className="mt-2.5 space-y-2">
                  {card.includes.map((item) => (
                    <li key={item} className="flex gap-3 text-sm leading-6 text-slate-700">
                      <span aria-hidden="true" className="mt-[0.7rem] h-px w-2.5 shrink-0 bg-[#1D3658]" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Link
                href={card.ctaHref}
                className="mt-8 inline-flex min-h-12 w-full items-center justify-center bg-[#001030] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#1D3658] focus:outline-none focus:ring-2 focus:ring-[#1D3658] focus:ring-offset-2"
              >
                {card.ctaLabel}
              </Link>
            </article>
          </li>
        ))}
      </ul>

      {/* The quieter route. A prospect who is not ready to commit should not have to guess that a
          free option exists, but it must not compete visually with the three paid options. */}
      <p className="mt-8 text-sm leading-6 text-slate-600">
        Not ready to choose?{' '}
        <Link
          href="/score/start"
          className="font-semibold text-[#001030] underline decoration-[#1D3658] underline-offset-4 transition hover:text-[#1D3658] focus:outline-none focus:ring-2 focus:ring-[#1D3658] focus:ring-offset-2"
        >
          Start with the free Snapshot
        </Link>{' '}
        — complete the assessment, see where your organisation stands, and decide afterwards.
      </p>
    </section>
  );
}
