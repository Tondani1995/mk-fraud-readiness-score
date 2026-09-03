import { NextResponse } from 'next/server';
import { checkRateLimits, getClientIpHashKey, RATE_LIMITS } from '@/lib/security/rate-limit';
import { WEBSITE_CONTACT_REQUEST_TYPE } from '@/lib/enquiries/taxonomy';
import { honeypotTripped, parseWebsiteContactEnquiry } from '@/lib/enquiries/validation';
import {
  makeEnquiryReference,
  persistWebsiteContactEnquiry,
  queuePublicEnquiryNotification,
  recordPublicEnquiryAudit
} from '@/lib/enquiries/public-enquiry-service';

/**
 * General website contact enquiry.
 *
 * This replaces a browser-side POST to api.web3forms.com. The difference that matters is not the
 * transport: it is that a customer enquiry now exists in MK's own database before the customer is
 * told it was received, and is answerable from the admin queue rather than living only in an
 * inbox belonging to a third party.
 *
 * A general enquiry is stored as `request_type = 'website_contact'`. It is deliberately NOT
 * recorded as an Advisory enquiry even when the visitor selects the Advisory service interest:
 * Advisory has a specific commercial meaning and its own intake, and conflating the two would put
 * unqualified leads into the Advisory workflow.
 */

const GENERIC_FAILURE = 'Your message could not be sent right now. Please try again, or email hello@mkfraud.co.za.';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, errors: ['Invalid request body.'] }, { status: 400 });
  }

  if (honeypotTripped(body)) {
    return NextResponse.json({ ok: true, requestReference: makeEnquiryReference(), status: 'received' });
  }

  const parsed = parseWebsiteContactEnquiry(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, errors: parsed.errors }, { status: 400 });

  const rateLimit = await checkRateLimits([
    { key: getClientIpHashKey(request, 'website_contact_enquiry'), ...RATE_LIMITS.publicEnquiryPerIp() },
    { key: `website_contact_enquiry:email:${parsed.data.email}`, ...RATE_LIMITS.publicEnquiryPerEmail() }
  ]);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, errors: ['Too many messages have been sent recently. Please try again later.'] },
      { status: 429 }
    );
  }

  try {
    const enquiry = await persistWebsiteContactEnquiry(parsed.data);

    const notification = await queuePublicEnquiryNotification({
      notificationType: 'website_contact_enquiry_submitted',
      enquiry,
      metadata: {
        enquiry_source: 'website_contact',
        contact_name: parsed.data.contactName,
        contact_email: parsed.data.email,
        company_name: parsed.data.companyName,
        contact_phone: parsed.data.contactPhone,
        service_interest: parsed.data.serviceInterest,
        message: parsed.data.message,
        assessment_linked: false,
        admin_url: new URL(`/score/admin/enquiries/${encodeURIComponent(enquiry.requestReference)}`, request.url).toString()
      }
    });

    await recordPublicEnquiryAudit({
      enquiry,
      requestType: WEBSITE_CONTACT_REQUEST_TYPE,
      enquirySource: 'website_contact',
      ipHash: getClientIpHashKey(request, 'website_contact_enquiry'),
      notificationStatus: notification.status
    });

    return NextResponse.json({
      ok: true,
      requestReference: enquiry.requestReference,
      status: enquiry.status,
      message: 'Thank you. Your message has been received and MK Fraud Insights will be in touch.'
    });
  } catch (error) {
    console.error('website contact enquiry failed', {
      message: error instanceof Error ? error.message : 'unknown_error'
    });
    return NextResponse.json({ ok: false, errors: [GENERIC_FAILURE] }, { status: 500 });
  }
}
