import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-route';
import { deliverPhase1Report, Phase1DeliveryError } from '@/lib/reports/phase1-manual-delivery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { reportId: string } }) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ ok: false, reason: 'permission_denied', message: 'Authentication is required.' }, { status: 401 });
  if (!['platform_admin', 'approver'].includes(admin.role)) {
    return NextResponse.json({ ok: false, reason: 'permission_denied', message: 'Your role cannot initiate report delivery.' }, { status: 403 });
  }
  const contentType = request.headers.get('content-type') ?? '';
  const submitted = contentType.includes('application/json')
    ? await request.json().catch(() => ({})) as Record<string, unknown>
    : Object.fromEntries(await request.formData());
  const orderReference = String(submitted.orderReference ?? submitted.order_reference ?? '');
  const requestKey = String(request.headers.get('x-idempotency-key') ?? submitted.requestKey ?? crypto.randomUUID());
  try {
    const result = await deliverPhase1Report({
      reportId: params.reportId,
      orderReference,
      requestedBy: admin.id,
      requestKey
    });
    return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const mapped = error instanceof Phase1DeliveryError
      ? error
      : new Phase1DeliveryError('delivery_failed', 'The delivery request failed.', 500, 'unavailable');
    return NextResponse.json({
      ok: false,
      reason: mapped.reason,
      message: mapped.message,
      technicalReference: mapped.technicalReference
    }, { status: mapped.status, headers: { 'Cache-Control': 'no-store' } });
  }
}
