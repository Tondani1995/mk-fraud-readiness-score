import { redirect } from 'next/navigation';
import { ResultChrome, ResultFooter } from '@/components/layout/ResultChrome';
import { OrderJourney } from '@/components/commercial/OrderJourney';
import { validateSnapshotToken } from '@/lib/respondent/tokens';
import { loadFreeSnapshotByReference } from '@/lib/snapshot/free-snapshot';
import { COMMERCIAL_CATALOGUE, isSelfServicePaidTier } from '@/lib/commercial/product-catalogue';

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
