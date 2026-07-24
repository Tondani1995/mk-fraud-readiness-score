import { NextResponse } from 'next/server';
import { canManageFinance, getAdminSession } from '@/lib/auth/admin-route';
import {
  BACKLOG_CLASSIFICATIONS,
  classifyOrder,
  type BacklogClassification
} from '@/lib/backlog-reconciliation/reconciliation-service';

// Follows the same auth/validation pattern as
// src/app/score/admin/orders/[orderReference]/status/route.ts: an unauthorised or
// insufficiently-privileged admin session is rejected before any service call, and
// supports both a native form POST (redirect back to the queue page) and a JSON POST
// (matching the dual-mode style in
// src/app/score/api/admin/orders/[orderReference]/generate-report/route.ts).

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function wantsHtml(request: Request) {
  return request.headers.get('accept')?.includes('text/html') ?? false;
}

async function submittedValues(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (contentType.includes('form')) return Object.fromEntries(await request.formData());
  return {};
}

function respond(
  request: Request,
  payload: { ok: boolean; reason?: string; message?: string },
  status: number
) {
  if (wantsHtml(request)) {
    const url = new URL('/score/admin/backlog-reconciliation', request.url);
    url.searchParams.set(payload.ok ? 'classified' : 'error', String(payload.ok ? Date.now() : payload.reason ?? 'classification_failed'));
    if (payload.message) url.searchParams.set('message', payload.message.slice(0, 240));
    return NextResponse.redirect(url, { status: 303 });
  }
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } });
}

function optionalString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin || !canManageFinance(admin.role)) {
    return respond(request, {
      ok: false,
      reason: 'forbidden',
      message: 'You are not authorised to manage backlog reconciliation.'
    }, 403);
  }

  const submitted = await submittedValues(request);
  const orderId = optionalString(submitted.orderId ?? submitted.order_id);
  const classification = optionalString(submitted.classification) as BacklogClassification | null;
  const resolutionNote = String(submitted.resolutionNote ?? submitted.resolution_note ?? '');

  if (!orderId) {
    return respond(request, { ok: false, reason: 'order_required', message: 'An order id is required.' }, 400);
  }
  if (!classification || !BACKLOG_CLASSIFICATIONS.includes(classification)) {
    return respond(request, { ok: false, reason: 'classification_invalid', message: 'Select a valid classification.' }, 400);
  }

  const result = await classifyOrder({
    orderId,
    reportId: optionalString(submitted.reportId ?? submitted.report_id),
    classification,
    resolutionNote,
    assignedOwner: optionalString(submitted.assignedOwner ?? submitted.assigned_owner),
    nextAction: optionalString(submitted.nextAction ?? submitted.next_action),
    completionDate: optionalString(submitted.completionDate ?? submitted.completion_date),
    evidenceReference: optionalString(submitted.evidenceReference ?? submitted.evidence_reference)
  });

  if (!result.ok) {
    return respond(request, { ok: false, reason: result.reason, message: result.message }, 400);
  }

  return respond(request, { ok: true, message: 'Order classification recorded.' }, 200);
}
