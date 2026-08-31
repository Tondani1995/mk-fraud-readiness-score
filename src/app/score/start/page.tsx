import { AdaptiveStartForm } from '@/components/adaptive/AdaptiveStartForm';
import { FraudReadinessTermsGate } from '@/components/adaptive/FraudReadinessTermsGate';
import { SectionShell } from '@/components/ui/SectionShell';
import { COMMERCIAL_CATALOGUE } from '@/lib/commercial/product-catalogue';
import { parseProductIntent } from '@/lib/commercial/product-intent';
import { redirect } from 'next/navigation';

/**
 * The assessment entry point.
 *
 * The page states what the customer gets and what they need to hand — nothing about how the
 * platform is built. Account architecture, capture-once behaviour, adaptive-engine mechanics,
 * routing and report automation are implementation, and describing them here asked a prospective
 * customer to care about MK's internals before they had a reason to care about the product.
 */

/** Read time, not build time: the price shown must be the catalogue's, never a copied literal. */
function selectedProductContext(tier: 'essential' | 'comprehensive') {
  const product = COMMERCIAL_CATALOGUE[tier];
  return {
    label: product.label,
    price:
      product.priceCents === null
        ? null
        : `${new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(product.priceCents / 100)} incl. VAT`
  };
}

export default async function StartAssessmentPage(props: {
  searchParams?: Promise<{ embed?: string; product?: string }>;
}) {
  const searchParams = await props.searchParams;
  if (searchParams?.embed === '1') redirect('/score/start');

  // Anything other than a known self-service paid tier resolves to null and the page renders the
  // ordinary no-intent journey. A manipulated value can never select or price a product.
  const productIntent = parseProductIntent(searchParams?.product);
  const selected = productIntent ? selectedProductContext(productIntent) : null;

  return (
    <FraudReadinessTermsGate>
      <SectionShell className="py-14 md:py-20">
        <div className="max-w-3xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-mk-accent">
            Fraud Readiness Assessment
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-mk-navy md:text-[2.6rem] md:leading-[1.15]">
            Assess your organisation&rsquo;s fraud readiness
          </h1>
          <p className="mt-5 text-base leading-7 text-mk-slate">
            The assessment gives you a structured view of your organisation&rsquo;s current
            fraud-readiness position — where control maturity is strong, where it is thin, and which
            areas deserve management attention. When you submit it, a private Snapshot of your
            result is prepared for you.
          </p>
        </div>

        {selected ? (
          <div className="mt-8 max-w-3xl border-l-2 border-mk-accent bg-mk-surface px-5 py-4">
            <p className="text-sm font-semibold text-mk-navy">You selected {selected.label}</p>
            <p className="mt-1.5 text-sm leading-6 text-mk-slate">
              {selected.price ? `${selected.price}. ` : ''}Completing the Fraud Readiness Assessment
              is required before your {selected.label} report can be prepared. Nothing is charged
              now — you confirm and pay after you have seen your Snapshot.
            </p>
          </div>
        ) : null}

        <div className="mt-10 grid gap-10 lg:grid-cols-[1.35fr_0.65fr] lg:gap-14">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-mk-navy">Your details</h2>
            <p className="mt-2 text-sm leading-6 text-mk-slate">
              Use a work email and the organisation&rsquo;s registered or trading name.
            </p>
            <div className="mt-6">
              <AdaptiveStartForm productIntent={productIntent} />
            </div>
          </div>

          <aside className="lg:border-l lg:border-mk-line lg:pl-10">
            <h2 className="text-lg font-semibold tracking-tight text-mk-navy">What to expect</h2>
            <dl className="mt-5 space-y-5">
              <div>
                <dt className="text-sm font-semibold text-mk-navy">About 20 to 30 minutes</dt>
                <dd className="mt-1 text-sm leading-6 text-mk-slate">
                  You can stop and return later using the private link we give you.
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-mk-navy">Questions matched to you</dt>
                <dd className="mt-1 text-sm leading-6 text-mk-slate">
                  You are only asked about the fraud-risk areas that apply to your organisation.
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-mk-navy">A private Snapshot</dt>
                <dd className="mt-1 text-sm leading-6 text-mk-slate">
                  Your readiness position and priority areas, available to you as soon as you
                  submit.
                </dd>
              </div>
              <div>
                <dt className="text-sm font-semibold text-mk-navy">Your choice afterwards</dt>
                <dd className="mt-1 text-sm leading-6 text-mk-slate">
                  Keep the free Snapshot, or choose the depth of report you want from your result.
                </dd>
              </div>
            </dl>
          </aside>
        </div>
      </SectionShell>
    </FraudReadinessTermsGate>
  );
}
