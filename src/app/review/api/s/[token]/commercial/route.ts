import { bindSessionForPaidReport, BindingRefused, parseBindingRequest } from '@/lib/readiness-review/commercial-bridge';
import { RevisedCommercialDisabled } from '@/lib/readiness-review/commercial-environment';
import { readJson, reviewError, reviewJson } from '@/lib/readiness-review/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * B5: submit a completed revised assessment for a paid report. Binds the stored answer log to an assessment record
 * once and returns the private snapshot token the existing paid-order route and order status page accept.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const result = await bindSessionForPaidReport(token, parseBindingRequest(await readJson(request), ip));
    return reviewJson({ ok: true, ...result });
  } catch (error) {
    if (error instanceof RevisedCommercialDisabled) return reviewJson({ code: 'unavailable', message: 'Paid reports from this assessment are not available in this environment.' }, { status: 404 });
    if (error instanceof BindingRefused) return reviewJson({ code: error.code, message: error.message }, { status: error.status });
    return reviewError(error);
  }
}
