import { notFound } from 'next/navigation';
import { reviewCustomerExperience, reviewHarnessStatus } from '@/lib/readiness-review/harness';
import { HarnessUnavailable, TokenNotFound, linkSession, snapshotFor } from '@/lib/readiness-review/service';
import { contactFor } from '@/lib/readiness-review/contacts';
import { SnapshotDocument } from '@/components/readiness-review/SnapshotDocument';
import { reviewProblem } from '@/components/readiness-review/ReviewProblem';
import { RevisedPaidReportPanel } from '@/components/readiness-review/RevisedPaidReportPanel';
import { revisedCommercialStatus, RESTRICTED_TEST_LABEL } from '@/lib/readiness-review/commercial-environment';
import { storefrontPriceLabel } from '@/lib/commercial/storefront-presentation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const metadata = { title: 'Fraud Readiness Snapshot' };

export default async function ReviewSnapshotPage({ params }: { params: Promise<{ token: string }> }) {
  if (!reviewHarnessStatus().enabled) notFound();
  const { token } = await params;
  try {
    const result = await snapshotFor(token);
    // Ordering is live in production mode, a restricted test elsewhere, and absent where the commercial path is off.
    const commercial = revisedCommercialStatus();
    const ordering = !commercial.enabled ? 'none' : commercial.mode === 'production' ? 'live' : 'restricted-test';
    // The respondent's own details pre-fill the report order form (they were given at the start).
    const contact = ordering === 'live' ? await linkSession(token).then((l) => contactFor(l.sessionId)).catch(() => null) : null;
    return (
      <>
        <SnapshotDocument view={result.view} token={token} role={result.role} managementToken={result.tokens?.management ?? null} ordering={ordering} customer={reviewCustomerExperience()} />
        {commercial.enabled && (
          <div className="mx-auto max-w-5xl px-4 pb-16">
            <RevisedPaidReportPanel token={token} organisationLabel={result.view.organisationLabel}
              contact={contact ? { fullName: contact.fullName, email: contact.email, roleTitle: contact.roleTitle } : null}
              prices={{ essential: storefrontPriceLabel('essential'), comprehensive: storefrontPriceLabel('comprehensive') }} notice={ordering === 'restricted-test' ? RESTRICTED_TEST_LABEL : undefined} />
          </div>
        )}
      </>
    );
  } catch (error) {
    if (error instanceof TokenNotFound || error instanceof HarnessUnavailable) notFound();
    const problem = reviewProblem(error);
    if (problem) return problem;
    throw error;
  }
}
