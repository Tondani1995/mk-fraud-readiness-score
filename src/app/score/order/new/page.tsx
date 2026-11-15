import { redirect } from 'next/navigation';
import { ResultChrome, ResultFooter } from '@/components/layout/ResultChrome';
import { OrderJourney } from '@/components/commercial/OrderJourney';
import { validateSnapshotToken } from '@/lib/respondent/tokens';
import { loadFreeSnapshotByReference } from '@/lib/snapshot/free-snapshot';
import { COMMERCIAL_CATALOGUE, isSelfServicePaidTier } from '@/lib/commercial/product-catalogue';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { assessmentModeOf, isPreviousMethodMode, revisedReleaseEffective, SCORED_ORDER_CLOSED_MESSAGE } from '@/lib/website/readiness-release';

export const dynamic = 'force-dynamic';

type OrderPageProps = {
  searchParams?: Promise<{ tier?: string; ref?: string; token?: string }>;
};

/**
 * The focused order step.
 *
 * A real route rather than an expansion inside the result page: R7,500 or R35,000 is not a
 * modal decision, a seven-field billing form cannot live inside a reading page without
 * permanently lengthening it, and a route gives working browser back, a recoverable state
 * after a cold reload, and room for a persistent order summary.
 *
 * Authorisation is the same private snapshot token the result page uses. An invalid tier or a
 * failed token returns the customer to the result rather than showing an error dead end.
 */
export default async function NewOrderPage(props: OrderPageProps) {
  const search = await props.searchParams;
  const tier = search?.tier;
  const assessmentRef = search?.ref;
  const token = search?.token;

  if (!assessmentRef || !token) redirect('/fraud-readiness-score');

  const snapshotPath = `/score/snapshot/${encodeURIComponent(assessmentRef)}?token=${encodeURIComponent(token)}`;
  if (!isSelfServicePaidTier(tier)) redirect(`${snapshotPath}#next-step`);

  const validation = await validateSnapshotToken({
    assessmentReference: assessmentRef,
    rawToken: token,
    consume: false
  });
  if (!validation.ok) redirect(snapshotPath);

  const snapshot = await loadFreeSnapshotByReference(
    validation.assessment.assessment_reference,
    validation.assessment.current_score_run_id
  );
  if (!snapshot) redirect(snapshotPath);

  // DR-01: after the switch-over a previous-method assessment takes no new order (the paid-order route refuses it too);
  // the customer is told why and where to start, rather than reaching a checkout that would be refused.
  if (revisedReleaseEffective()) {
    const previousMethod = await assessmentModeOf(createSupabaseServiceClient(), validation.assessment.id).then(isPreviousMethodMode, () => true);
    if (previousMethod) {
      return (
        <ResultChrome assessmentReference={snapshot.assessmentReference}>
          <section className="mx-auto max-w-[1120px] px-[18px] py-16 md:px-6" data-previous-method-order>
            <p className="text-[12px] uppercase tracking-[0.2em] text-mk-accent">Report orders</p>
            <h1 className="mt-2.5 max-w-[24ch] text-[26px] font-semibold tracking-normal text-mk-navy md:text-[36px]">Reports now use the current method</h1>
            <p className="mt-4 max-w-[60ch] text-base leading-7 text-mk-slate">{SCORED_ORDER_CLOSED_MESSAGE}</p>
            <div className="mt-6 flex flex-wrap gap-4 text-sm font-semibold">
              <a className="text-mk-navy underline" href="/score/start">Start a new assessment</a>
              <a className="text-mk-navy underline" href={snapshotPath}>Return to your Snapshot</a>
            </div>
          </section>
          <ResultFooter assessmentReference={snapshot.assessmentReference} />
        </ResultChrome>
      );
    }
  }

  const product = COMMERCIAL_CATALOGUE[tier];
  // Price is resolved once at route entry from the catalogue and never restated, so the amount
  // the customer sees cannot differ between steps.
  const amountDisplay = product.priceCents === null
    ? null
    : new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(product.priceCents / 100);

  return (
    <ResultChrome assessmentReference={snapshot.assessmentReference}>
      <OrderJourney
        tier={tier}
        productLabel={product.label}
        amountDisplay={amountDisplay ? `${amountDisplay} incl. VAT` : ''}
        assessmentReference={snapshot.assessmentReference}
        organisationName={snapshot.organisationName}
        respondentName={snapshot.respondentName}
        respondentEmail={snapshot.respondentEmail}
        snapshotToken={token}
        snapshotPath={snapshotPath}
      />
      <ResultFooter assessmentReference={snapshot.assessmentReference} />
    </ResultChrome>
  );
}
