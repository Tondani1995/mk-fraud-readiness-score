import { NextResponse } from 'next/server';
import { getRc1OperationFreezeResponse } from '@/lib/rc1/operation-freeze';
import { grantCustomerReportAccess, CustomerReportAccessError } from '@/lib/reports/customer-report-access';

// Release C secure customer report access -- no admin session, no customer auth (none exists in
// this codebase, per docs/safe-launch/14-release-c-existing-delivery-audit.md Q24). Possession
// of the URL (the token) is the access control. Never returns the raw storage path.
//
// The route returns the verified bytes directly. It used to redirect to a short-lived signed
// Storage URL, but that made the customer perform a SECOND Storage read, and the instance that
// read returned need not be the instance MK validated: on Staging the verification read served the
// genuine object from cache while the signed URL served a freshly tampered one, so 94,062 tampered
// bytes reached the customer behind a passing checksum. The byte instance that passes validation is
// now the byte instance delivered, which is the only form the guarantee can actually take.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CUSTOMER_SAFE_MESSAGES: Record<string, string> = {
  invalid_token: 'This link is not valid.',
  expired_token: 'This link has expired. Contact support for a new one.',
  revoked_token: 'This link is no longer active. Contact support for a new one.',
  rate_limited: 'Too many attempts. Try again later or contact support.',
  report_record_missing: 'Your report could not be found. Contact support.',
  report_order_mismatch: 'This link is not valid. Contact support.',
  report_status_ineligible: 'Your report is not yet available. Contact support if you believe this is an error.',
  report_not_current_version: 'A newer version of your report is available. Contact support for the current link.',
  storage_path_mismatch: 'Your report could not be found. Contact support.',
  stored_file_missing: 'Your report file could not be found. Contact support.',
  integrity_failed: 'Your report failed a verification check. Contact support.',
  signed_link_creation_failed: 'We could not prepare your report right now. Try again shortly or contact support.',
  access_unavailable: 'Secure report access is temporarily unavailable. Please try again later or contact support.'
};

// RFC 6266: quoted-string with the risky characters removed, so a stored file name can never break
// out of the header or inject another directive.
function safeContentDisposition(fileName: string): string {
  const fallback = 'report';
  const cleaned = String(fileName ?? '')
    .replace(/[\r\n"\\;]/g, '')
    .replace(/[^\x20-\x7e]/g, '')
    .trim()
    .slice(0, 120);
  return `attachment; filename="${cleaned || fallback}"`;
}

function errorPage(message: string, technicalReference: string, status: number) {
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character] ?? character);
  return new NextResponse(
    `<!doctype html><html lang="en-ZA"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>Report access | MK Fraud Insights</title></head>` +
    `<body style="font-family:sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;">` +
    `<main id="report-access-error" tabindex="-1" aria-labelledby="report-access-title">` +
    `<h1 id="report-access-title">Report access</h1><p>${escapeHtml(message)}</p>` +
    `<p style="color:#666;font-size:0.85rem;">Reference: ${escapeHtml(technicalReference)}</p>` +
    `</main></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
  );
}

export async function GET(request: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const frozen = await getRc1OperationFreezeResponse('customer_token');
  if (frozen) return frozen;

  const rawToken = params.token;
  if (!rawToken || rawToken.length < 16) {
    return errorPage(CUSTOMER_SAFE_MESSAGES.invalid_token, 'no-token', 404);
  }

  // Selector only -- report-level token authority is evaluated first inside
  // grantCustomerReportAccess(). Unknown values fall back to the PDF; they never widen access.
  const requested = new URL(request.url).searchParams.get('artefact');
  const artefact = requested === 'register' ? 'register' as const
    : requested === 'board' ? 'board' as const
      : requested === 'presentation' ? 'presentation' as const
        : requested === 'workshop' ? 'workshop' as const : 'pdf' as const;

  try {
    const result = await grantCustomerReportAccess({ rawToken, artefact });
    // Stream the already-verified in-memory buffer. This is a stream purely so a large artefact is
    // not held as a single response body by the runtime -- it reads from the verified bytes, never
    // from Storage, so no second read can be introduced here.
    const verified = result.bytes;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(verified));
        controller.close();
      }
    });
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': result.mimeType,
        'Content-Length': String(result.fileSizeBytes),
        'Content-Disposition': safeContentDisposition(result.fileName),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer'
      }
    });
  } catch (error) {
    if (error instanceof CustomerReportAccessError) {
      const message = CUSTOMER_SAFE_MESSAGES[error.reason] ?? 'This report could not be accessed. Contact support.';
      return errorPage(message, error.technicalReference, error.status);
    }
    console.error('customer_report_access_route', { outcome: 'unexpected_error' });
    return errorPage('This report could not be accessed. Contact support.', 'unexpected', 500);
  }
}
