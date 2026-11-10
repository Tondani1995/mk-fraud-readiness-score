import { notFound } from 'next/navigation';
import { reviewHarnessStatus } from '@/lib/readiness-review/harness';
import { HarnessUnavailable, TokenNotFound, snapshotFor } from '@/lib/readiness-review/service';
import { SnapshotDocument } from '@/components/readiness-review/SnapshotDocument';
import { reviewProblem } from '@/components/readiness-review/ReviewProblem';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const metadata = { title: 'Fraud Readiness Snapshot' };

export default async function ReviewSnapshotPage({ params }: { params: Promise<{ token: string }> }) {
  if (!reviewHarnessStatus().enabled) notFound();
  const { token } = await params;
  try {
    const result = await snapshotFor(token);
    return <SnapshotDocument view={result.view} token={token} role={result.role} managementToken={result.tokens?.management ?? null} />;
  } catch (error) {
    if (error instanceof TokenNotFound || error instanceof HarnessUnavailable) notFound();
    const problem = reviewProblem(error);
    if (problem) return problem;
    throw error;
  }
}
