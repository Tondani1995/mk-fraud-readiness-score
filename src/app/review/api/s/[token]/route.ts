import { linkSession, submit, viewFor } from '@/lib/readiness-review/service';
import { reviewHarnessStatus } from '@/lib/readiness-review/harness';
import { notifyReviewCompleted } from '@/lib/readiness-review/review-notifications';
import { readJson, reviewError, reviewJson } from '@/lib/readiness-review/http';
import { reviewHarnessFaultsEnabled } from '@/lib/readiness-review/harness';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ token: string }> };

/** The role view for this link: the same view model the page renders. */
export async function GET(_request: Request, { params }: Context) {
  try {
    const { token } = await params;
    return reviewJson(await viewFor(token));
  } catch (error) {
    return reviewError(error);
  }
}

/** Submits one action. The response carries the refreshed role view, so the page never interprets the change itself. */
export async function POST(request: Request, { params }: Context) {
  try {
    const { token } = await params;
    const body = await readJson(request);
    const result = await submit(token, {
      actionId: String(body?.actionId ?? ''),
      expectedSeq: Number(body?.expectedSeq),
      action: body?.action,
      // Fault injection exists only for the save-failure regression and only when both harness flags are set.
      simulateFailure: reviewHarnessFaultsEnabled() && body?.simulateFailure === true
    });
    const current = await viewFor(token);
    // The respondent has just finished: MK is told once (real sessions in production only; the notice is claimed in the
    // database, so a repeated finish never sends twice).
    if (current.role === 'respondent' && !current.view.step && !current.view.canResume && reviewHarnessStatus().reason === 'production') {
      const { sessionId } = await linkSession(token);
      await notifyReviewCompleted(sessionId);
    }
    return reviewJson({ ...result, current });
  } catch (error) {
    return reviewError(error);
  }
}
