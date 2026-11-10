import { notFound } from 'next/navigation';
import { reviewHarnessFaultsEnabled, reviewHarnessStatus } from '@/lib/readiness-review/harness';
import { HarnessUnavailable, TokenNotFound, viewFor } from '@/lib/readiness-review/service';
import { ReplayError } from '@/lib/readiness-review/session';
import { ReviewInterview } from '@/components/readiness-review/ReviewInterview';
import { OwnerPackage } from '@/components/readiness-review/OwnerPackage';
import { ReviewerWorkspace } from '@/components/readiness-review/ReviewerWorkspace';
import { ManagementDocument } from '@/components/readiness-review/ManagementDocument';
import { SessionLinks } from '@/components/readiness-review/SessionLinks';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Props = { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ReviewSessionPage({ params, searchParams }: Props) {
  if (!reviewHarnessStatus().enabled) notFound();
  const { token } = await params;
  const query = await searchParams;
  let result;
  try {
    result = await viewFor(token);
  } catch (error) {
    if (error instanceof TokenNotFound || error instanceof HarnessUnavailable) notFound();
    if (error instanceof ReplayError)
      return (
        <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <h1 className="text-2xl font-semibold text-mk-ink">This session was recorded with a different version of the method</h1>
          <p className="mt-4 text-base leading-7 text-mk-ink">It is not reinterpreted with the current rules. {error.message}</p>
        </article>
      );
    throw error;
  }
  switch (result.role) {
    case 'respondent':
      return <ReviewInterview token={token} initial={result.view} faultOnce={query.fault === 'save' && reviewHarnessFaultsEnabled()} />;
    case 'owner':
      return <OwnerPackage token={token} initial={result.view} />;
    case 'reviewer':
      return <ReviewerWorkspace token={token} initial={result.view} />;
    case 'management':
      return <ManagementDocument token={token} view={result.view} />;
    default:
      return <SessionLinks view={result.view} />;
  }
}
