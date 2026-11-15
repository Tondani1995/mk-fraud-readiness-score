import { bindSessionForPaidReport, BindingRefused, parseBindingRequest } from '@/lib/readiness-review/commercial-bridge';
import { RevisedCommercialDisabled } from '@/lib/readiness-review/commercial-environment';
import { readJson, reviewError, reviewJson } from '@/lib/readiness-review/http';
import { reviewHarnessStatus } from '@/lib/readiness-review/harness';
import { linkSession } from '@/lib/readiness-review/service';
import { contactFor } from '@/lib/readiness-review/contacts';

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
    const body = await readJson(request);
    // Production: the respondent's name, email and role were given at the start and the terms accepted there, so the
    // Snapshot's report cards bind with the stored contact and nothing is typed twice (owner direction, 15 November 2026).
    let fields: Record<string, unknown> = body;
    if (body?.useStoredContact === true && reviewHarnessStatus().reason === 'production') {
      const contact = await linkSession(token).then((l) => contactFor(l.sessionId));
      if (!contact) return reviewJson({ code: 'contact_missing', message: 'Your contact details were not found. Please contact MK to order your report.' }, { status: 409 });
      fields = { organisationLegalName: contact.organisationLabel, contactName: contact.fullName, contactEmail: contact.email, contactRole: contact.roleTitle ?? '', acceptTerms: true };
    }
    const result = await bindSessionForPaidReport(token, parseBindingRequest(fields, ip));
    return reviewJson({ ok: true, ...result });
  } catch (error) {
    if (error instanceof RevisedCommercialDisabled) return reviewJson({ code: 'unavailable', message: 'Paid reports from this assessment are not available in this environment.' }, { status: 404 });
    if (error instanceof BindingRefused) return reviewJson({ code: error.code, message: error.message }, { status: error.status });
    return reviewError(error);
  }
}
