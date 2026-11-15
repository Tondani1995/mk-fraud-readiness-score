import { createSession } from '@/lib/readiness-review/service';
import { readJson, reviewError, reviewJson } from '@/lib/readiness-review/http';
import { ActionRejected } from '@/lib/readiness-review/session';
import { reviewHarnessStatus } from '@/lib/readiness-review/harness';
import { isAuthorisedSyntheticMonitorRequest } from '@/lib/monitoring/signatures';
import { recordProductionMonitorEvent } from '@/lib/monitoring/production-monitor';
import { safeErrorCategory } from '@/lib/monitoring/privacy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Creates a review session and returns its role links; nothing is sent anywhere. In production mode the session is a
 * real organisation's and the assessment terms must be accepted; everywhere else it is fictional and confirmed as such.
 */
export async function POST(request: Request) {
  // The production monitor's signed synthetic start (x-mk-synthetic-monitor-run, as on the scored start): it proves a
  // session can be created and stored, as a fictional session clearly labelled as the monitor's, never a real one. No
  // links are returned. Unsigned requests are unaffected.
  const monitoringRunId = isAuthorisedSyntheticMonitorRequest(request);
  if (monitoringRunId) {
    try {
      const created = await createSession(`MK synthetic monitor ${monitoringRunId}`.slice(0, 80));
      return reviewJson({ ok: true, synthetic: true, sessionId: created.sessionId }, { status: 201 });
    } catch (error) {
      try {
        await recordProductionMonitorEvent({ stage: 'review_start', outcome: 'fail', route: '/review/api/sessions', httpStatus: 500, errorCategory: safeErrorCategory(error), deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA, synthetic: true });
      } catch {
        // Monitor persistence never changes the response.
      }
      return reviewError(error);
    }
  }
  try {
    const body = await readJson(request, 2_000);
    const production = reviewHarnessStatus().reason === 'production';
    if (production && body?.termsAccepted !== true) throw new ActionRejected('invalid_input', 'Accept the assessment terms and privacy notice to start.');
    if (!production && body?.fictionalConfirmed !== true) throw new ActionRejected('invalid_input', 'Confirm that the organisation is fictional and that no real information will be entered.');
    const created = await createSession(String(body?.organisationLabel ?? ''), { fictional: !production });
    return reviewJson({ sessionId: created.sessionId, links: created.tokens.links, respondent: created.tokens.respondent }, { status: 201 });
  } catch (error) {
    return reviewError(error);
  }
}
