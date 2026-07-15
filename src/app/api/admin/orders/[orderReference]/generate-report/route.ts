import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-route';
import { ReportAssemblyError } from '@/lib/reports/assemble-report-data';
import { ReportEntitlementError } from '@/lib/reports/report-entitlement';
import { generatePremiumReport } from '@/lib/reports/premium-report-service';
import { Phase14AuthorizationError } from '@/lib/reports/phase14-security';

const REPORT_GENERATION_ROLES = new Set(['platform_admin', 'reviewer', 'approver']);

type HandlerContext = { params: { orderReference: string } };

function wantsHtml(request: Request) {
  return request.headers.get('accept')?.includes('text/html') ?? false;
}

function jsonOrRedirect(
  request: Request,
  orderReference: string,
  payload: Record<string, unknown>,
  status = 200
) {
  if (wantsHtml(request)) {
    const url = new URL(`/score/admin/orders/${orderReference}`, request.url);
    url.searchParams.set(
      payload.ok ? 'report_generated' : 'report_error',
      String(payload.ok ? '1' : payload.reason ?? 'generation_failed')
    );
    return NextResponse.redirect(url, { status: 303 });
  }
  return NextResponse.json(payload, { status });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? 'Unknown error');
}

function failure(error: unknown) {
  if (error instanceof Phase14AuthorizationError) {
    return {
      reason: error.reason,
      message: error.message,
      status: error.reason === 'phase14_security_gate_unsatisfied' ? 503 : 403
    };
  }
  if (error instanceof ReportAssemblyError || error instanceof ReportEntitlementError) {
    return {
      reason: error.reason,
      message: error.message,
      status: error.reason === 'order_not_found' ? 404 : 409
    };
  }

  const message = errorMessage(error);
  if (message.includes('No active report template')) return { reason: 'template_missing', message, status: 409 };
  if (message.includes('Storage upload failed')) return { reason: 'storage_upload_failed', message, status: 500 };
  if (message.includes('Report persistence failed')) return { reason: 'reports_insert_failed', message, status: 500 };
  if (message.includes('deterministic report content failed')) return { reason: 'content_validation_failed', message, status: 500 };
  return { reason: 'generation_failed', message, status: 500 };
}

export async function POST(request: Request, context: HandlerContext) {
  const admin = await getAdminSession();
  const { orderReference } = context.params;

  if (!admin || !REPORT_GENERATION_ROLES.has(admin.role)) {
    return jsonOrRedirect(request, orderReference, { ok: false, reason: 'forbidden' }, 403);
  }

  try {
    const result = await generatePremiumReport({
      orderReference,
      actor: {
        actorType: 'admin',
        userId: admin.id,
        action: 'admin_generate'
      }
    });

    return jsonOrRedirect(request, orderReference, {
      ok: true,
      ...result
    });
  } catch (error) {
    const mapped = failure(error);
    console.error('Premium report generation failed', {
      orderReference,
      reason: mapped.reason,
      message: mapped.message
    });
    return jsonOrRedirect(request, orderReference, {
      ok: false,
      reason: mapped.reason,
      message: mapped.message
    }, mapped.status);
  }
}
