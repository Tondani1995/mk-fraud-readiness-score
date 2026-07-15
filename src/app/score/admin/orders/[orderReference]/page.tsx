import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FulfilmentActions } from '@/components/admin/FulfilmentActions';
import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { requireAdmin } from '@/lib/auth/admin-route';
import { formatOrderAmount, getAdminOrderDetail } from '@/lib/orders/manual-eft-orders';
import { getPhase1OrderOperations } from '@/lib/reports/phase1-operations';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const statusOptions = ['draft', 'awaiting_payment', 'payment_received', 'cancelled', 'expired'];

function cleanStatus(status: string | null | undefined) {
  return (status ?? 'not requested').replace(/_/g, ' ');
}

function dateTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString('en-ZA') : 'Not recorded';
}

function SnapshotValue({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mk-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-mk-ink">{value || 'Not captured'}</p>
    </div>
  );
}

async function getReportVersions(db: any, orderId: string) {
  const detailed = await db.from('reports')
    .select('id,report_reference,version_number,status,generated_at,storage_bucket,storage_path,checksum,file_name,mime_type,file_size_bytes,storage_status,storage_verified_at')
    .eq('order_id', orderId).order('version_number', { ascending: false });
  if (!detailed.error) return detailed.data ?? [];
  const fallback = await db.from('reports')
    .select('id,report_reference,version_number,status,generated_at,storage_bucket,storage_path,checksum')
    .eq('order_id', orderId).order('version_number', { ascending: false });
  if (fallback.error) {
    console.error('phase1_order_reports_query', { orderId, reason: fallback.error.message });
    return [];
  }
  return (fallback.data ?? []).map((report: any) => ({
    ...report,
    storage_status: report.storage_bucket && report.storage_path && report.checksum ? 'VERIFIED' : 'NOT_STORED'
  }));
}

export default async function AdminOrderDetailPage({
  params,
  searchParams
}: {
  params: { orderReference: string };
  searchParams?: { report_error?: string; report_generated?: string; message?: string; error?: string };
}) {
  const admin = await requireAdmin(['platform_admin', 'finance_admin', 'reviewer', 'approver', 'read_only_admin']);
  const db = createSupabaseServiceClient() as any;
  const detail = await getAdminOrderDetail(params.orderReference);
  if (!detail) notFound();
  const { order, events, auditEvents } = detail;
  const [reportVersions, operations] = await Promise.all([
    getReportVersions(db, order.id),
    getPhase1OrderOperations(order.id)
  ]);
  const latestReport = reportVersions[0] ?? null;
  const storageCandidate = Boolean(latestReport?.storage_bucket && latestReport?.storage_path && latestReport?.checksum);
  const storageReady = Boolean(latestReport?.storage_status === 'VERIFIED' && latestReport.storage_bucket && latestReport.storage_path);
  const generationState = operations.latestGeneration?.status ?? (storageReady ? 'REPORT_READY' : 'NOT_REQUESTED');
  const generationStuck = ['REPORT_QUEUED', 'REPORT_GENERATING'].includes(generationState)
    && Date.now() - new Date(operations.latestGeneration?.updated_at ?? 0).getTime() > 15 * 60 * 1_000;
  const deliveryState = operations.latestDelivery?.status ?? 'NOT_READY';
  const canGenerate = ['platform_admin', 'reviewer', 'approver'].includes(admin.role);
  const canRegenerate = ['platform_admin', 'approver'].includes(admin.role);
  const canDeliver = ['platform_admin', 'approver'].includes(admin.role);
  const eft = order.eft_instructions_snapshot ?? {};
  const assessment = order.assessments;
  const dataRequest = order.data_requests;

  return (
    <AdminShell admin={admin}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Paid report fulfilment"
          title={order.order_reference}
          description="Manual, recoverable report generation and delivery control. Phase 14 automation remains disabled."
        />

        {(searchParams?.message || searchParams?.report_error || searchParams?.error) ? (
          <div role="status" className={`rounded-xl border p-4 text-sm ${searchParams?.report_error || searchParams?.error ? 'border-mk-danger/30 bg-mk-danger/10 text-mk-danger' : 'border-emerald-300 bg-emerald-50 text-emerald-800'}`}>
            {searchParams.message ?? cleanStatus(searchParams.report_error ?? searchParams.error)}
          </div>
        ) : null}

        {!operations.schemaAvailable ? (
          <div className="rounded-xl border border-mk-brass/40 bg-mk-cream p-4 text-sm text-mk-ink">
            Phase 1 operational persistence is not installed in this environment. Manual actions will remain blocked until migration 0018 is approved and applied here.
          </div>
        ) : null}

        <Card>
          <CardHeader><CardTitle>Fulfilment status</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
              <SnapshotValue label="Payment state" value={cleanStatus(order.status)} />
              <SnapshotValue label="Generation state" value={cleanStatus(generationState)} />
              <SnapshotValue label="Latest attempt" value={operations.latestGeneration?.id ?? 'No attempt'} />
              <SnapshotValue label="Report version" value={latestReport ? `Version ${latestReport.version_number}` : 'No report'} />
              <SnapshotValue label="Storage state" value={cleanStatus(latestReport?.storage_status ?? 'NOT_STORED')} />
              <SnapshotValue label="Delivery state" value={cleanStatus(deliveryState)} />
              <SnapshotValue label="Last delivery attempt" value={dateTime(operations.latestDelivery?.requested_at)} />
              <SnapshotValue label="Retry count" value={String(operations.latestGeneration?.retry_count ?? operations.latestDelivery?.retry_count ?? 0)} />
            </div>
            {operations.latestGeneration?.safe_operational_error || operations.latestDelivery?.safe_operational_error ? (
              <div className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-sm text-mk-danger">
                {operations.latestGeneration?.safe_operational_error ?? operations.latestDelivery?.safe_operational_error}
              </div>
            ) : null}
            <FulfilmentActions
              orderReference={order.order_reference}
              reportId={latestReport?.id}
              generationState={generationState}
              generationStuck={generationStuck}
              deliveryState={deliveryState}
              eligible={order.status === 'payment_received'}
              storageReady={storageReady}
              storageCandidate={storageCandidate}
              canGenerate={canGenerate}
              canRegenerate={canRegenerate}
              canDeliver={canDeliver}
            />
            <div className="flex flex-wrap gap-4 text-sm font-semibold text-mk-brassDark">
              {operations.generationHistory.length ? <a href="#generation-history">View Generation History</a> : null}
              {operations.deliveryHistory.length ? <a href="#delivery-history">View Delivery History</a> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Order summary</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <SnapshotValue label="Status" value={cleanStatus(order.status)} />
            <SnapshotValue label="Assessment" value={assessment?.assessment_reference} />
            <SnapshotValue label="Report request" value={dataRequest?.status ? cleanStatus(dataRequest.status) : 'No linked request'} />
            <SnapshotValue label="Organisation" value={order.organisation_name ?? assessment?.organisations?.legal_name ?? assessment?.organisations?.trading_name} />
            <SnapshotValue label="Customer" value={order.customer_name ?? order.customer_email ?? assessment?.respondents?.full_name} />
            <SnapshotValue label="Email" value={order.customer_email ?? assessment?.respondents?.email} />
            <SnapshotValue label="Product" value={order.product_name} />
            <SnapshotValue label="Amount" value={formatOrderAmount(order.amount_cents, order.currency)} />
            <SnapshotValue label="Created" value={dateTime(order.created_at)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Report versions</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {reportVersions.map((report: any) => (
              <div key={report.id} className="grid gap-3 rounded-xl border border-mk-line bg-white p-4 text-sm md:grid-cols-[1fr_auto]">
                <div>
                  <div className="flex flex-wrap items-center gap-2"><Badge>{cleanStatus(report.status)}</Badge><span className="font-semibold text-mk-ink">{report.report_reference}</span></div>
                  <p className="mt-2 text-mk-muted">Version {report.version_number} · Storage {cleanStatus(report.storage_status)} · {dateTime(report.generated_at)}</p>
                  <p className="mt-1 text-xs text-mk-muted">{report.file_name ?? 'PDF metadata pending'}{report.file_size_bytes ? ` · ${Number(report.file_size_bytes).toLocaleString()} bytes` : ''}</p>
                </div>
                <Badge>{report.storage_status === 'VERIFIED' ? 'Private · verified' : 'Unavailable'}</Badge>
              </div>
            ))}
            {!reportVersions.length ? <p className="text-sm text-mk-muted">No report versions generated yet.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Order notifications</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {operations.notifications.map((event: any) => (
              <div key={event.id} className="grid gap-2 rounded-xl border border-mk-line bg-white p-4 text-sm md:grid-cols-3">
                <SnapshotValue label="Notification" value={cleanStatus(event.notification_type)} />
                <SnapshotValue label="State" value={`${cleanStatus(event.status)} · ${cleanStatus(event.provider_mode)}`} />
                <SnapshotValue label="Recorded" value={dateTime(event.created_at)} />
                {event.error_message ? <p className="md:col-span-3 text-mk-danger">{event.error_message}</p> : null}
              </div>
            ))}
            {!operations.notifications.length ? <p className="text-sm text-mk-muted">No notification records found.</p> : null}
            <p className="text-xs text-mk-muted">Provider mode is disabled unless an approved local provider double is configured. This page does not send real email.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Payment status update</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-mk-line bg-mk-cream/50 p-4 text-sm leading-6 text-mk-muted">
              Payment confirmation is recorded only. It does not trigger automatic generation, a workflow, a provider, or a webhook.
            </div>
            <form action={`/score/admin/orders/${order.order_reference}/status`} method="post" className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
              <select name="status" defaultValue={order.status} className="rounded-xl border border-mk-line bg-white px-4 py-3 text-sm text-mk-ink">
                {statusOptions.map((option) => <option key={option} value={option}>{cleanStatus(option)}</option>)}
              </select>
              <input name="note" placeholder="Admin note for activity timeline" className="rounded-xl border border-mk-line bg-white px-4 py-3 text-sm text-mk-ink" />
              <Button type="submit">Update status</Button>
            </form>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <div id="generation-history"><Card>
            <CardHeader><CardTitle>Generation history</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {operations.generationHistory.map((attempt: any) => (
                <div key={attempt.id} className="rounded-xl border border-mk-line bg-white p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><Badge>{cleanStatus(attempt.status)}</Badge><span>Version {attempt.report_version}</span></div>
                  <p className="mt-2 text-mk-muted">Requested {dateTime(attempt.requested_at)} · Retry {attempt.retry_count}</p>
                  <p className="mt-1 text-xs text-mk-muted">Reference: {attempt.technical_reference}</p>
                  {attempt.safe_operational_error ? <p className="mt-2 text-mk-danger">{attempt.safe_operational_error}</p> : null}
                </div>
              ))}
              {!operations.generationHistory.length ? <p className="text-sm text-mk-muted">No generation attempts recorded.</p> : null}
            </CardContent>
          </Card></div>

          <div id="delivery-history"><Card>
            <CardHeader><CardTitle>Delivery history</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {operations.deliveryHistory.map((attempt: any) => (
                <div key={attempt.id} className="rounded-xl border border-mk-line bg-white p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><Badge>{cleanStatus(attempt.status)}</Badge><span>{cleanStatus(attempt.provider_mode)}</span></div>
                  <p className="mt-2 text-mk-muted">Requested {dateTime(attempt.requested_at)} · Retry {attempt.retry_count}</p>
                  <p className="mt-1 text-xs text-mk-muted">Reference: {attempt.technical_reference}</p>
                  {attempt.safe_operational_error ? <p className="mt-2 text-mk-danger">{attempt.safe_operational_error}</p> : null}
                </div>
              ))}
              {!operations.deliveryHistory.length ? <p className="text-sm text-mk-muted">No delivery attempts recorded.</p> : null}
            </CardContent>
          </Card></div>
        </div>

        <Card>
          <CardHeader><CardTitle>Order activity timeline</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {events.map((event: any) => (
              <div key={event.id} className="rounded-xl border border-mk-line bg-white p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2"><Badge>{cleanStatus(event.event_type)}</Badge><span className="text-mk-muted">{dateTime(event.created_at)}</span></div>
                {(event.previous_status || event.new_status) ? <p className="mt-2 text-mk-muted">{cleanStatus(event.previous_status)} → {cleanStatus(event.new_status)}</p> : null}
                <p className="mt-2 text-xs text-mk-muted">Actor: {event.actor_admin_user_id ? `admin ${event.actor_admin_user_id}` : cleanStatus(event.metadata_json?.actor_type ?? 'system')}</p>
                {event.note ? <p className="mt-2 text-mk-ink">{event.note}</p> : null}
                {event.metadata_json?.technical_reference ? <p className="mt-2 text-xs text-mk-muted">Reference: {event.metadata_json.technical_reference} · Retry {event.metadata_json.retry_count ?? 0}</p> : null}
              </div>
            ))}
            {!events.length ? <p className="text-sm text-mk-muted">No order events recorded yet.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Audit trail</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {auditEvents.map((event: any) => (
              <div key={event.id} className="rounded-xl border border-mk-line bg-white p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2"><Badge>{event.actor_type}</Badge><span className="font-semibold text-mk-ink">{cleanStatus(event.action)}</span></div>
                <p className="mt-2 text-mk-muted">{dateTime(event.created_at)}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>EFT instruction snapshot</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <SnapshotValue label="Bank" value={eft.bankName ?? eft.bank_name} />
            <SnapshotValue label="Account holder" value={eft.accountHolder ?? eft.account_holder} />
            <SnapshotValue label="Branch code" value={eft.branchCode ?? eft.branch_code} />
          </CardContent>
        </Card>

        <Button asChild variant="secondary"><Link href="/score/admin/orders">Back to fulfilment queue</Link></Button>
      </div>
    </AdminShell>
  );
}
