import { createSession } from '@/lib/readiness-review/service';
import { readJson, reviewError, reviewJson } from '@/lib/readiness-review/http';
import { ActionRejected } from '@/lib/readiness-review/session';
import { reviewCustomerExperience, reviewHarnessStatus } from '@/lib/readiness-review/harness';
import { isAuthorisedSyntheticMonitorRequest } from '@/lib/monitoring/signatures';
import { recordProductionMonitorEvent } from '@/lib/monitoring/production-monitor';
import { safeErrorCategory } from '@/lib/monitoring/privacy';
import { contactsAvailable, recordContact, validateContact } from '@/lib/readiness-review/contacts';
import { sendReviewNotice } from '@/lib/readiness-review/review-notifications';

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
    // The customer experience: production mode, or the local customer preview (whose sessions stay fictional).
    const production = reviewCustomerExperience();
    if (production && body?.termsAccepted !== true) throw new ActionRejected('invalid_input', 'Accept the assessment terms and privacy notice to start.');
    if (!production && body?.fictionalConfirmed !== true) throw new ActionRejected('invalid_input', 'Confirm that the organisation is fictional and that no real information will be entered.');
    // A real organisation gives the respondent's name, work email and role (owner decision, 15 November 2026), validated
    // before anything is stored. They are kept apart from the answer log; MK is told the review has started.
    const contact = production ? validateContact(body?.contact) : null;
    const created = await createSession(String(body?.organisationLabel ?? ''), { fictional: reviewHarnessStatus().reason !== 'production' });
    if (contact && contactsAvailable()) {
      try {
        await recordContact(created.sessionId, contact);
        await sendReviewNotice(created.sessionId, { kind: 'started', organisationLabel: String(body?.organisationLabel ?? '').replace(/\s+/g, ' ').trim().slice(0, 80), contact, actionCount: 0 });
      } catch (error) {
        // The review itself is stored; a contact or notification failure must not stop the respondent from starting.
        console.warn('review_contact_record_failed', { message: error instanceof Error ? error.message.slice(0, 160) : 'unknown' });
      }
    }
    return reviewJson({ sessionId: created.sessionId, links: created.tokens.links, respondent: created.tokens.respondent }, { status: 201 });
  } catch (error) {
    return reviewError(error);
  }
}
