import { submit, viewFor } from '@/lib/readiness-review/service';
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
    return reviewJson({ ...result, current: await viewFor(token) });
  } catch (error) {
    return reviewError(error);
  }
}
