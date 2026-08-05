import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { canManageFinance, requireAdmin } from '@/lib/auth/admin-route';
import {
  BACKLOG_CLASSIFICATIONS,
  listBacklogQueue,
  type BacklogClassification
} from '@/lib/backlog-reconciliation/reconciliation-service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const CLASSIFICATION_LABELS: Record<BacklogClassification, string> = {
  genuine_customer_order: 'Genuine customer order',
  internal_test_order: 'Internal test order',
  legacy_superseded: 'Legacy / superseded',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
  delivered_outside_platform: 'Delivered outside platform',
  report_still_owed: 'Report still owed',
  payment_requires_review: 'Payment requires review',
  unresolved_exception: 'Unresolved exception'
};

function cleanLabel(value: string | null | undefined) {
  return value ? value.replace(/_/g, ' ') : 'Not recorded';
}

function dateText(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString('en-ZA') : 'Not recorded';
}

export default async function BacklogReconciliationPage(
  props: {
    searchParams?: Promise<{ classified?: string; error?: string; message?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const admin = await requireAdmin(['platform_admin', 'finance_admin', 'reviewer', 'approver']);
  const canClassify = canManageFinance(admin.role);
  const result = await listBacklogQueue();
  const items = result.ok ? result.data : [];
  const unresolvedCount = items.filter((item) => !item.classification || item.classification === 'unresolved_exception').length;

  return (
    <AdminShell admin={admin}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Launch readiness"
          title="Paid-order backlog reconciliation"
          description="Every payment_received order, in one place. Classify each into a fixed disposition so nothing is resolved by direct SQL edits. No assessment answers, customer names or email addresses are shown here."
        />

        {!result.ok ? (
          <div className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-sm text-mk-danger">
            {result.message}
          </div>
        ) : null}
        {searchParams?.error ? (
          <div className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-sm text-mk-danger">
            {searchParams.message ?? 'The classification could not be recorded.'}
          </div>
        ) : null}
        {searchParams?.classified ? (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800">
            {searchParams.message ?? 'Classification recorded.'}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-mk-line bg-white p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mk-muted">Paid orders in scope</p>
            <p className="mt-3 text-3xl font-semibold text-mk-ink">{items.length}</p>
          </div>
          <div className="rounded-2xl border border-mk-line bg-white p-5 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mk-muted">Unresolved / unclassified</p>
            <p className="mt-3 text-3xl font-semibold text-mk-ink">{unresolvedCount}</p>
          </div>
          <a
            href="/score/api/admin/backlog-reconciliation/export"
            className="flex flex-col justify-center rounded-2xl border border-mk-line bg-white p-5 shadow-sm transition hover:border-mk-brass"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mk-muted">Export</p>
            <p className="mt-2 text-sm font-semibold text-mk-brassDark">Download non-PII CSV</p>
          </a>
        </div>

        <Card>
          <CardHeader><CardTitle>Backlog queue</CardTitle></CardHeader>
          <CardContent className="space-y-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.14em] text-mk-muted">
                  <tr>
                    <th className="py-2">Order</th>
                    <th>Product</th>
                    <th>Payment confirmed</th>
                    <th>Report state</th>
                    <th>Storage</th>
                    <th>Delivery</th>
                    <th>Exception age</th>
                    <th>Owner</th>
                    <th>Classification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mk-line">
                  {items.map((item) => (
                    <tr key={item.orderId} className="align-top">
                      <td className="py-3 pr-3">
                        <p className="font-semibold text-mk-ink">{item.orderReference}</p>
                        <p className="text-xs text-mk-muted">{item.orderId}</p>
                      </td>
                      <td className="py-3 pr-3 text-mk-muted">{item.productName}</td>
                      <td className="py-3 pr-3 text-mk-muted">{dateText(item.paymentConfirmedAt)}</td>
                      <td className="py-3 pr-3">
                        <Badge>{cleanLabel(item.reportStatus)}{item.reportVersion ? ` v${item.reportVersion}` : ''}</Badge>
                      </td>
                      <td className="py-3 pr-3"><Badge>{cleanLabel(item.storageStatus)}</Badge></td>
                      <td className="py-3 pr-3"><Badge>{cleanLabel(item.deliveryState)}</Badge></td>
                      <td className="py-3 pr-3 text-mk-muted">{item.exceptionAgeDays} day{item.exceptionAgeDays === 1 ? '' : 's'}</td>
                      <td className="py-3 pr-3 text-mk-muted">{item.assignedOwnerName ?? 'Unassigned'}</td>
                      <td className="py-3 pr-3">
                        <Badge className={item.classification ? undefined : 'border-mk-danger/40 text-mk-danger'}>
                          {item.classification ? CLASSIFICATION_LABELS[item.classification] : 'Not classified'}
                        </Badge>
                        {item.resolutionNote ? <p className="mt-1 max-w-64 text-xs text-mk-muted">{item.resolutionNote}</p> : null}
                        {item.nextAction ? <p className="mt-1 max-w-64 text-xs text-mk-muted">Next: {item.nextAction}</p> : null}
                        {item.completionDate ? <p className="mt-1 text-xs text-mk-muted">Target: {dateText(item.completionDate)}</p> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!items.length ? <p className="text-sm leading-6 text-mk-muted">No payment_received orders are currently in scope.</p> : null}

            {canClassify ? (
              <div className="space-y-4 border-t border-mk-line pt-6">
                <p className="text-sm font-semibold text-mk-ink">Classify an order</p>
                {items.map((item) => (
                  <details key={`classify-${item.orderId}`} className="rounded-2xl border border-mk-line bg-white p-4">
                    <summary className="cursor-pointer text-sm font-semibold text-mk-ink">
                      {item.orderReference} — {item.classification ? CLASSIFICATION_LABELS[item.classification] : 'Not classified'}
                    </summary>
                    <form
                      action="/score/api/admin/backlog-reconciliation"
                      method="post"
                      className="mt-4 grid gap-3 md:grid-cols-2"
                    >
                      <input type="hidden" name="orderId" value={item.orderId} />
                      {item.reportId ? <input type="hidden" name="reportId" value={item.reportId} /> : null}
                      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-mk-muted md:col-span-2">
                        Classification
                        <select
                          name="classification"
                          defaultValue={item.classification ?? ''}
                          required
                          className="mt-1 w-full rounded-xl border border-mk-line bg-white px-4 py-3 text-sm text-mk-ink"
                        >
                          <option value="" disabled>Select a classification</option>
                          {BACKLOG_CLASSIFICATIONS.map((option) => (
                            <option key={option} value={option}>{CLASSIFICATION_LABELS[option]}</option>
                          ))}
                        </select>
                      </label>
                      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-mk-muted md:col-span-2">
                        Resolution note (minimum 5 characters)
                        <textarea
                          name="resolutionNote"
                          defaultValue={item.resolutionNote ?? ''}
                          required
                          minLength={5}
                          rows={2}
                          className="mt-1 w-full rounded-xl border border-mk-line bg-white px-4 py-3 text-sm text-mk-ink"
                        />
                      </label>
                      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-mk-muted">
                        Assigned owner (admin user id)
                        <input
                          name="assignedOwner"
                          defaultValue={item.assignedOwner ?? ''}
                          placeholder="Optional"
                          className="mt-1 w-full rounded-xl border border-mk-line bg-white px-4 py-3 text-sm text-mk-ink"
                        />
                      </label>
                      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-mk-muted">
                        Completion date
                        <input
                          type="date"
                          name="completionDate"
                          defaultValue={item.completionDate ?? ''}
                          className="mt-1 w-full rounded-xl border border-mk-line bg-white px-4 py-3 text-sm text-mk-ink"
                        />
                      </label>
                      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-mk-muted md:col-span-2">
                        Next action
                        <input
                          name="nextAction"
                          defaultValue={item.nextAction ?? ''}
                          placeholder="Optional"
                          className="mt-1 w-full rounded-xl border border-mk-line bg-white px-4 py-3 text-sm text-mk-ink"
                        />
                      </label>
                      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-mk-muted md:col-span-2">
                        Evidence reference
                        <input
                          name="evidenceReference"
                          placeholder="Optional — ticket id, internal note reference, etc."
                          className="mt-1 w-full rounded-xl border border-mk-line bg-white px-4 py-3 text-sm text-mk-ink"
                        />
                      </label>
                      <div className="md:col-span-2">
                        <Button type="submit">Save classification</Button>
                      </div>
                    </form>
                  </details>
                ))}
              </div>
            ) : (
              <p className="text-sm leading-6 text-mk-muted">Your role can view the backlog queue but cannot record classifications.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
