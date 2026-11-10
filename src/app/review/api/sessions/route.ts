import { createSession } from '@/lib/readiness-review/service';
import { readJson, reviewError, reviewJson } from '@/lib/readiness-review/http';
import { ActionRejected } from '@/lib/readiness-review/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Creates a fictional review session in the local harness. Returns role links; nothing is sent anywhere. */
export async function POST(request: Request) {
  try {
    const body = await readJson(request, 2_000);
    if (body?.fictionalConfirmed !== true) throw new ActionRejected('invalid_input', 'Confirm that the organisation is fictional and that no real information will be entered.');
    const created = await createSession(String(body?.organisationLabel ?? ''));
    return reviewJson({ sessionId: created.sessionId, links: created.tokens.links, respondent: created.tokens.respondent }, { status: 201 });
  } catch (error) {
    return reviewError(error);
  }
}
