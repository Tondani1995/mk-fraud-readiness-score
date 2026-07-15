import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { requireAdmin } from '@/lib/auth/admin-route';
import { formatOrderAmount, getAdminOrderDetail } from '@/lib/orders/manual-eft-orders';
import { getPremiumReportAutomationFlags } from '@/lib/reports/automation/feature-flags';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const statusOptions = ['draft', 'awaiting_payment', 'payment_received', 'cancelled', 'expired'];

function cleanStatus(status: string | null | undefined) {
  return (status ?? 'awaiting_payment').replace(/_/g, ' ');
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
  const { data, error } = await db
    .from('reports')
    .select('id,report_reference,version_number,status,generated_at,storage_bucket,storage_path,checksum')
    .eq('order_id', orderId)
    .order('version_number', { ascending: false });
  if (error) {
    console.error('report version query failed', error);
    return [];
  }
  return data ?? [];
}

async function getLatestFulfilment(db: any, orderId: string) {
  const { data, error } = await db
    .from('report_fulfilments')
    .select('id,status,current_step,generation_mode,attempt_count,last_error_code,last_error_message,report_id,created_at,updated_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data ?? null;
}

export default async function AdminOrderDetailPage({ params }: { params: { orderReference: string } }) {
  const admin = await requireAdmin(['platform_admin', 'finance_admin', 'reviewer', 'approver', 'read_only_admin']);
  const db = createSupabaseServiceClient() as any;
  const detail = await getAdminOrderDetail(params.orderReference);
  if (!detail) notFound();

  const { order, events, auditEvents } = detail;
  const [reportVersions, fulfilment, automationFlags] = await Promise.all([
    getReportVersions(db, order.id),
    getLatestFulfilment(db, order.id),
    getPremiumReportAutomationFlags()
  ]);
  const eft = order.eft_instructions_snapshot ?? {};
  const assessment = order.assessments;
  const dataRequest = order.data_requests;
  const reportGenerationEligible = order.status === 'payment_received';
  const autoFulfilment = automationFlags.autoFulfilmentEnabled;

  return (
    <AdminShell admin={admin}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Premium report order"
          title={order.order_reference}
          description="Review payment, autonomous fulfilment, report versions, exceptions and the complete audit trail."
        />

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
            <SnapshotValue label="Created" value={new Date(order.created_at).toLocaleString('en-ZA')} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>EFT instruction snapshot</CardTitle></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <SnapshotValue label="Bank" value={eft.bankName ?? eft.bank_name} />
            <SnapshotValue label="Account holder" value={eft.accountHolder ?? eft.account_holder} />
            <SnapshotValue label="Account number" value={eft.accountNumber ?? eft.account_number} />
            <SnapshotValue label="Branch code" value={eft.branchCode ?? eft.branch_code} />
            <SnapshotValue label="Currency" value={eft.currency ?? order.currency} />
            <SnapshotValue label="Contact" value={eft.contactEmail ?? eft.contact_email} />
            <div className="md:col-span-3 rounded-xl border border-mk-line bg-mk-cream/50 p-4 text-sm leading-6 text-mk-muted">
              <p>{eft.paymentReferenceInstruction ?? eft.payment_reference_instruction ?? 'Use the order reference as the payment reference.'}</p>
              <p className="mt-2">{eft.customerInstruction ?? eft.customer_instruction ?? 'MK Fraud Insights confirms EFT payments before the detailed report is fulfilled.'}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Autonomous fulfilment</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-mk-line bg-white p-4 text-sm leading-6 text-mk-muted">
              {autoFulfilment
                ? 'Payment confirmation queues one idempotent report fulfilment. The platform assembles persisted evidence, validates the narrative, renders and stores the PDF. Automatic customer email delivery is enabled separately.'
                : 'Autonomous fulfilment is safely disabled. Payment confirmation does not yet start report generation, and the manual generation control remains available.'}
            </div>
            {fulfilment ? (
              <div className="grid gap-4 rounded-xl border border-mk-line bg-mk-cream/40 p-4 md:grid-cols-3">
                <SnapshotValue label="Fulfilment status" value={cleanStatus(fulfilment.status)} />
                <SnapshotValue label="Current step" value={cleanStatus(fulfilment.current_step)} />
                <SnapshotValue label="Generation mode" value={cleanStatus(fulfilment.generation_mode)} />
                <SnapshotValue label="Attempts" value={String(fulfilment.attempt_count ?? 0)} />
                <SnapshotValue label="Last error" value={fulfilment.last_error_code ? `${fulfilment.last_error_code}: ${fulfilment.last_error_message ?? ''}` : 'None'} />
                <SnapshotValue label="Updated" value={fulfilment.updated_at ? new Date(fulfilment.updated_at).toLocaleString('en-ZA') : null} />
              </div>
            ) : <p className="text-sm text-mk-muted">No fulfilment has been created for this order.</p>}

            {reportGenerationEligible ? (
              <form action={`/score/api/admin/orders/${order.order_reference}/generate-report`} method="post">
                <Button type="submit">{autoFulfilment ? 'Manual generate / regenerate fallback' : 'Generate report version'}</Button>
              </form>
            ) : (
              <div className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-sm leading-6 text-mk-danger">
                Report generation remains blocked until this order is marked as payment received.
              </div>
            )}

            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mk-muted">Report versions</p>
              {reportVersions.map((report: any) => (
                <div key={report.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-mk-line bg-white p-4 text-sm">
                  <div>
                    <p className="font-semibold text-mk-ink">{report.report_reference}</p>
                    <p className="mt-1 text-mk-muted">Version {report.version_number} · {cleanStatus(report.status)} · {report.generated_at ? new Date(report.generated_at).toLocaleString('en-ZA') : 'Not generated'}</p>
                  </div>
                  {report.storage_bucket && report.storage_path ? <Button asChild variant="secondary"><a href={`/score/api/admin/reports/${report.id}/download`}>Download</a></Button> : null}
                </div>
              ))}
              {!reportVersions.length ? <p className="text-sm text-mk-muted">No report versions generated yet.</p> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Status update</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-mk-line bg-mk-cream/50 p-4 text-sm leading-6 text-mk-muted">
              {autoFulfilment
                ? 'Marking an eligible R5,000 order as payment received queues autonomous fulfilment once. Repeated updates reuse the same active fulfilment.'
                : 'Payment confirmation is recorded, but autonomous fulfilment remains disabled until the Phase 14 migration and UAT gates pass.'}
            </div>
            <form action={`/score/admin/orders/${order.order_reference}/status`} method="post" className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
              <select name="status" defaultValue={order.status} className="rounded-xl border border-mk-line bg-white px-4 py-3 text-sm text-mk-ink">
                {statusOptions.map((option) => <option key={option} value={option}>{cleanStatus(option)}</option>)}
              </select>
              <input name="note" placeholder="Admin note for audit trail" className="rounded-xl border border-mk-line bg-white px-4 py-3 text-sm text-mk-ink" />
              <Button type="submit">Update status</Button>
            </form>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Order timeline</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {events.map((event: any) => (
                <div key={`${event.event_type}-${event.created_at}`} className="rounded-xl border border-mk-line bg-white p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><Badge>{event.event_type.replace(/_/g, ' ')}</Badge><span className="text-mk-muted">{new Date(event.created_at).toLocaleString('en-ZA')}</span></div>
                  <p className="mt-2 text-mk-muted">{cleanStatus(event.previous_status)} → {cleanStatus(event.new_status)}</p>
                  {event.note ? <p className="mt-2 text-mk-ink">{event.note}</p> : null}
                </div>
              ))}
              {!events.length ? <p className="text-sm text-mk-muted">No order events recorded yet.</p> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Audit trail</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {auditEvents.map((event: any) => (
                <div key={`${event.action}-${event.created_at}`} className="rounded-xl border border-mk-line bg-white p-4 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><Badge>{event.actor_type}</Badge><span className="font-semibold text-mk-ink">{event.action}</span></div>
                  <p className="mt-2 text-mk-muted">{new Date(event.created_at).toLocaleString('en-ZA')}</p>
                </div>
              ))}
              {!auditEvents.length ? <p className="text-sm text-mk-muted">No audit events recorded yet.</p> : null}
            </CardContent>
          </Card>
        </div>

        <Button asChild variant="secondary"><Link href="/score/admin/orders">Back to order queue</Link></Button>
      </div>
    </AdminShell>
  );
}
