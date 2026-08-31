import { NextResponse } from 'next/server';
import { getRc1OperationFreezeResponse } from '@/lib/rc1/operation-freeze';
import { checkRateLimits, getClientIpHashKey, RATE_LIMITS } from '@/lib/security/rate-limit';
import { ADVISORY_REQUEST_TYPE } from '@/lib/enquiries/taxonomy';
import { honeypotTripped, parsePublicAdvisoryEnquiry } from '@/lib/enquiries/validation';
import {
  makeEnquiryReference,
  persistPublicAdvisoryEnquiry,
  queuePublicEnquiryNotification,
  recordPublicEnquiryAudit
} from '@/lib/enquiries/public-enquiry-service';

/**
 * Public, pre-assessment MK Advisory enquiry.
 *
 * The Snapshot Advisory route authenticates with a private snapshot token. A prospect who has not
 * completed an assessment has no such token and no assessment reference, so this route is
 * deliberately unauthenticated — and therefore carries its own controls: an allow-listed payload,
 * length-bounded free text, a honeypot, per-IP and per-email rate limits, service-role-only
 * persistence, and an audit row.
 *
 * It produces exactly one thing: a `data_requests` row of `request_type = 'mk_advisory'` with a
 * MKENQ reference, plus one internal MK notification. No order, no payment obligation, no report,
 * no customer email, and no assessment.
 */

const GENERIC_FAILURE = 'Your enquiry could not be submitted right now. Please try again, or email hello@mkfraud.co.za.';

export async function POST(request: Request) {
  const frozen = await getRc1OperationFreezeResponse('order_create');
  if (frozen) return frozen;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 });
  }

  // An automated submitter is told the same thing a person is told, and nothing is stored. Any
  // other response teaches a bot which field is the trap.
  if (honeypotTripped(body)) {
    return NextResponse.json({ ok: true, requestReference: makeEnquiryReference(), status: 'received' });
  }

  const parsed = parsePublicAdvisoryEnquiry(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, errors: parsed.errors }, { status: 400 });

  const rateLimit = await checkRateLimits([
    { key: getClientIpHashKey(request, 'public_advisory_enquiry'), ...RATE_LIMITS.publicEnquiryPerIp() },
    { key: `public_advisory_enquiry:email:${parsed.data.email}`, ...RATE_LIMITS.publicEnquiryPerEmail() }
  ]);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, errors: ['Too many enquiries have been submitted recently. Please try again later.'] },
      { status: 429 }
    );
  }

  try {
    // Persist first. A prospect is only told their enquiry was received once it exists.
    const enquiry = await persistPublicAdvisoryEnquiry(parsed.data);

    const notification = await queuePublicEnquiryNotification({
      notificationType: 'public_advisory_enquiry_submitted',
      enquiry,
      metadata: {
        enquiry_source: 'public_advisory',
        contact_name: parsed.data.contactName,
        contact_email: parsed.data.email,
        company_name: parsed.data.companyName,
        contact_phone: parsed.data.contactPhone,
        primary_reason: parsed.data.primaryReason,
        areas_of_focus: parsed.data.areasOfFocus.join(', '),
        preferred_contact_method: parsed.data.preferredContactMethod,
        preferred_consultation_timeframe: parsed.data.preferredConsultationTimeframe,
        note: parsed.data.notes,
        assessment_linked: false,
        admin_url: new URL(`/score/admin/enquiries/${encodeURIComponent(enquiry.requestReference)}`, request.url).toString()
      }
    });

    await recordPublicEnquiryAudit({
      enquiry,
      requestType: ADVISORY_REQUEST_TYPE,
      enquirySource: 'public_advisory',
      ipHash: getClientIpHashKey(request, 'public_advisory_enquiry'),
      notificationStatus: notification.status
    });

    return NextResponse.json({
      ok: true,
      requestReference: enquiry.requestReference,
      status: enquiry.status,
      message:
        'Thank you. MK Fraud Insights will review your enquiry and contact you to arrange a scoping conversation.'
    });
  } catch (error) {
    console.error('public advisory enquiry failed', {
      message: error instanceof Error ? error.message : 'unknown_error'
    });
    return NextResponse.json({ ok: false, errors: [GENERIC_FAILURE] }, { status: 500 });
  }
}
