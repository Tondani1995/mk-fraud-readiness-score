import { after } from 'next/server';
import { linkSession, snapshotForSession, submit, viewFor } from '@/lib/readiness-review/service';
import { buildSnapshotBrief } from '@/lib/readiness-review/snapshot-brief';
import { snapshotNarrative } from '@/lib/readiness-review/snapshot-narrative';
import { reviewHarnessStatus } from '@/lib/readiness-review/harness';
import { notifyReviewCompleted } from '@/lib/readiness-review/review-notifications';
import { contactsAvailable, markCompleted } from '@/lib/readiness-review/contacts';
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
      // Completion is recorded first and independently of the email, so a failed notice can never leave a finished
      // review looking stalled; the stalled-lead monitor retries a completion notice that did not go out.
      if (contactsAvailable()) await markCompleted(sessionId).catch((error) => {
        console.warn('review_completion_mark_failed', { message: error instanceof Error ? error.message.slice(0, 160) : 'unknown' });
      });
      await notifyReviewCompleted(sessionId);
      // Write the Snapshot narrative now, after the response, so it is usually ready before the Snapshot is opened.
      const oidc = request.headers.get('x-vercel-oidc-token');
      after(async () => {
        try {
          const snap = await snapshotForSession(sessionId);
          await snapshotNarrative(sessionId, buildSnapshotBrief(snap.view), { requestOidcToken: oidc, generate: true });
        } catch { /* the Snapshot writes it on first view instead */ }
      });
    }
    return reviewJson({ ...result, current });
  } catch (error) {
    return reviewError(error);
  }
}
