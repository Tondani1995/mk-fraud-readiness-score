import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { requireAdmin } from '@/lib/auth/admin-route';
import { formatOrderAmount, getAdminOrderDetail } from '@/lib/orders/manual-eft-orders';
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

async function getReportVersions(orderId: string) {
  const db = createSupabaseServiceClient();
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

export default async function AdminOrderDetailPage({ params }: { params: { orderReference: string } }) {
  const admin = await requireAdmin(['platform_admin', 'finance_admin', 'reviewer', 'approver', 'read_only_admin']);
  const detail = await getAdminOrderDetail(params.orderReference);
  if (!detail) notFound();

  const { order, events, auditEvents } = detail;
  const reportVersions = await getReportVersions(order.id);
  const eft = order.eft_instructions_snapshot ?? {};
  const assessment = order.assessments;
  const dataRequest = order.data_requests;
  const reportGenerationEligible = order.status === 'payment_received';

  return (
    <AdminShell admin={admin}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Manual EFT order"
          title={order.order_reference}
          description="Review the linked assessment, request, product, EFT snapshot, manual status timeline and controlled report versions."
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
              <p className="mt-2">{eft.customerInstruction ?? eft.customer_instruction ?? 'MK Fraud Insights confirms EFT payments manually before any detailed report is released.'}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Report generation control</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border border-mk-line bg-white p-4 text-sm leading-6 text-mk-muted">
              Detailed reports are generated only after manual EFT confirmation. Payment received does not automatically generate, release, download or email a report.
            </div>
            {reportGenerationEligible ? (
              <form action={`/score/api/admin/orders/${order.order_reference}/generate-report`} method="post">
                <Button type="submit">Generate report version</Button>
              </form>
            ) : (
              <div className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-sm leading-6 text-mk-danger">
                Report generation is blocked until this order is marked as payment received.
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
            <div className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-sm leading-6 text-mk-danger">
              Payment received does not generate or release the detailed report in V1. Report generation remains a separate controlled step.
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

        <Button asChild variant="secondary"><Link href="/admin/orders">Back to order queue</Link></Button>
      </div>
    </AdminShell>
  );
}
