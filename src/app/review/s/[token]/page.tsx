import { notFound } from 'next/navigation';
import { reviewHarnessFaultsEnabled, reviewHarnessStatus } from '@/lib/readiness-review/harness';
import { HarnessUnavailable, TokenNotFound, viewFor } from '@/lib/readiness-review/service';
import { reviewProblem } from '@/components/readiness-review/ReviewProblem';
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
    const problem = reviewProblem(error);
    if (problem) return problem;
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
