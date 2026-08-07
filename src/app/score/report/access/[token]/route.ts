import { NextResponse } from 'next/server';
import { getRc1OperationFreezeResponse } from '@/lib/rc1/operation-freeze';
import { grantCustomerReportAccess, CustomerReportAccessError } from '@/lib/reports/customer-report-access';

// Release C secure customer report access -- no admin session, no customer auth (none exists in
// this codebase, per docs/safe-launch/14-release-c-existing-delivery-audit.md Q24). Possession
// of the URL (the token) is the access control. Never returns the raw storage path; issues a
// fresh short-lived signed URL per successful validated access and redirects to it -- the durable
// token and the temporary storage URL are never the same object.

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
  signed_link_creation_failed: 'We could not prepare your report right now. Try again shortly or contact support.'
};

function errorPage(message: string, technicalReference: string, status: number) {
  return new NextResponse(
    `<!doctype html><html><body style="font-family:sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;">` +
    `<h1>Report access</h1><p>${message}</p>` +
    `<p style="color:#666;font-size:0.85rem;">Reference: ${technicalReference}</p>` +
    `</body></html>`,
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
  const artefact = requested === 'register' ? 'register' as const : 'pdf' as const;

  try {
    const result = await grantCustomerReportAccess({ rawToken, artefact });
    return NextResponse.redirect(result.url, { status: 307, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof CustomerReportAccessError) {
      const message = CUSTOMER_SAFE_MESSAGES[error.reason] ?? 'This report could not be accessed. Contact support.';
      return errorPage(message, error.technicalReference, error.status);
    }
    console.error('customer_report_access_route', { outcome: 'unexpected_error' });
    return errorPage('This report could not be accessed. Contact support.', 'unexpected', 500);
  }
}
