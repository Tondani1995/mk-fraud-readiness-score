import { notFound } from 'next/navigation';
import { reviewHarnessStatus } from '@/lib/readiness-review/harness';
import { HarnessUnavailable, TokenNotFound, snapshotFor } from '@/lib/readiness-review/service';
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
    return (
      <>
        <SnapshotDocument view={result.view} token={token} role={result.role} managementToken={result.tokens?.management ?? null} />
        {revisedCommercialStatus().enabled && (
          <div className="mx-auto max-w-5xl px-4 pb-16">
            <RevisedPaidReportPanel token={token} organisationLabel={result.view.organisationLabel}
              prices={{ essential: storefrontPriceLabel('essential'), comprehensive: storefrontPriceLabel('comprehensive') }} notice={RESTRICTED_TEST_LABEL} />
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
