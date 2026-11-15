import { notFound } from 'next/navigation';
import { reviewCustomerExperience, reviewHarnessStatus } from '@/lib/readiness-review/harness';
import { headers } from 'next/headers';
import { HarnessUnavailable, TokenNotFound, linkSession, snapshotFor, snapshotForSession } from '@/lib/readiness-review/service';
import { buildSnapshotBrief } from '@/lib/readiness-review/snapshot-brief';
import { snapshotNarrative } from '@/lib/readiness-review/snapshot-narrative';
import { contactFor } from '@/lib/readiness-review/contacts';
import { SnapshotDocument } from '@/components/readiness-review/SnapshotDocument';
import { reviewProblem } from '@/components/readiness-review/ReviewProblem';
import { RevisedPaidReportPanel } from '@/components/readiness-review/RevisedPaidReportPanel';
import { revisedCommercialStatus, RESTRICTED_TEST_LABEL } from '@/lib/readiness-review/commercial-environment';
import { storefrontPriceLabel } from '@/lib/commercial/storefront-presentation';
import { COMMERCIAL_CATALOGUE } from '@/lib/commercial/product-catalogue';
import { RevisedSnapshot } from '@/components/readiness-review/RevisedSnapshot';

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
    // The customer Snapshot (production, and the local customer preview): result, exposure, a recommendation from the
    // answers, the three ways to act on it as cards, and straight into the existing order journey.
    if (reviewCustomerExperience()) {
      const cards = (['essential', 'comprehensive', 'advisory'] as const).map((tier) => {
        const product = COMMERCIAL_CATALOGUE[tier];
        return { tier, label: product.label, price: storefrontPriceLabel(tier), summary: product.summary, includes: product.includes };
      });
      const brief = buildSnapshotBrief(result.view);
      const { sessionId } = await linkSession(token);
      const complete = await snapshotForSession(sessionId).then((s) => s.interviewComplete).catch(() => false);
      // The narrative is usually written already (when the interview finished); otherwise it is written now, once, or
      // the page uses the narrative written from the data. A Snapshot opened mid-interview never makes a model call.
      const narrative = await snapshotNarrative(sessionId, brief, { requestOidcToken: (await headers()).get('x-vercel-oidc-token'), generate: complete });
      return <RevisedSnapshot view={result.view} token={token} cards={cards} ordering={commercial.enabled} brief={brief} narrative={narrative} />;
    }
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
