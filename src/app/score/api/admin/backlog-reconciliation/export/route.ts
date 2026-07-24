import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-route';
import {
  BACKLOG_QUEUE_VIEW_ROLES,
  listBacklogQueue,
  type BacklogQueueItem
} from '@/lib/backlog-reconciliation/reconciliation-service';

// Admin-only CSV export of the backlog reconciliation queue. Streams exactly the same
// non-PII field set as the admin queue page: order reference, product, payment state,
// payment confirmation date, report state/version, storage state, delivery state,
// exception age, assigned owner, classification, resolution note, next action,
// completion date and technical references (order id, report id). It never includes
// orders.customer_name, orders.customer_email, orders.organisation_name, or any
// assessment/response content.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CSV_COLUMNS: Array<{ header: string; value: (item: BacklogQueueItem) => unknown }> = [
  { header: 'order_reference', value: (item) => item.orderReference },
  { header: 'product_name', value: (item) => item.productName },
  { header: 'payment_state', value: (item) => item.paymentState },
  { header: 'payment_confirmed_at', value: (item) => item.paymentConfirmedAt },
  { header: 'report_status', value: (item) => item.reportStatus },
  { header: 'report_version', value: (item) => item.reportVersion },
  { header: 'storage_status', value: (item) => item.storageStatus },
  { header: 'delivery_state', value: (item) => item.deliveryState },
  { header: 'exception_age_days', value: (item) => item.exceptionAgeDays },
  { header: 'assigned_owner_name', value: (item) => item.assignedOwnerName },
  { header: 'classification', value: (item) => item.classification },
  { header: 'resolution_note', value: (item) => item.resolutionNote },
  { header: 'next_action', value: (item) => item.nextAction },
  { header: 'completion_date', value: (item) => item.completionDate },
  { header: 'order_id', value: (item) => item.orderId },
  { header: 'report_id', value: (item) => item.reportId }
];

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export async function GET() {
  const admin = await getAdminSession();
  if (!admin || !BACKLOG_QUEUE_VIEW_ROLES.includes(admin.role)) {
    return NextResponse.json({
      ok: false,
      reason: 'forbidden',
      message: 'You are not authorised to export backlog reconciliation data.'
    }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }

  const result = await listBacklogQueue();
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason, message: result.message }, {
      status: 502,
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  const lines = [
    CSV_COLUMNS.map((column) => csvEscape(column.header)).join(','),
    ...result.data.map((item) => CSV_COLUMNS.map((column) => csvEscape(column.value(item))).join(','))
  ];

  return new NextResponse(lines.join('\r\n') + '\r\n', {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="backlog-reconciliation-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store'
    }
  });
}
