import Link from 'next/link';
import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { requireAdmin } from '@/lib/auth/admin-route';
import { formatOrderAmount, getAdminOrderList } from '@/lib/orders/manual-eft-orders';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const statusOptions = ['all', 'draft', 'awaiting_payment', 'payment_received', 'cancelled', 'expired'];

function cleanStatus(status: string) {
  return status.replace(/_/g, ' ');
}

export default async function AdminOrdersPage({ searchParams }: { searchParams?: { status?: string; search?: string } }) {
  const admin = await requireAdmin(['platform_admin', 'finance_admin', 'read_only_admin']);
  const status = searchParams?.status ?? 'all';
  const search = searchParams?.search ?? '';
  const orders = await getAdminOrderList({ status, search });

  return (
    <AdminShell admin={admin}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Commercial workflow"
          title="Order controls"
          description="Manage manual EFT orders raised from detailed-report requests. Payment confirmation is manual and does not generate or release reports."
        />

        <Card>
          <CardHeader><CardTitle>Order queue</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <form action="/score/admin/orders" className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
              <select name="status" defaultValue={status} className="rounded-xl border border-mk-line bg-white px-4 py-3 text-sm text-mk-ink">
                {statusOptions.map((option) => <option key={option} value={option}>{cleanStatus(option)}</option>)}
              </select>
              <input name="search" defaultValue={search} placeholder="Search order or assessment reference" className="rounded-xl border border-mk-line bg-white px-4 py-3 text-sm text-mk-ink" />
              <Button type="submit">Filter</Button>
            </form>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.18em] text-mk-muted">
                  <tr><th className="py-2">Order</th><th>Assessment</th><th>Organisation</th><th>Customer</th><th>Product</th><th>Amount</th><th>Status</th><th>Updated</th><th></th></tr>
                </thead>
                <tbody className="divide-y divide-mk-line">
                  {orders.map((order: any) => (
                    <tr key={order.order_reference}>
                      <td className="py-3 font-semibold text-mk-ink">{order.order_reference}</td>
                      <td className="py-3 text-mk-muted">{order.assessments?.assessment_reference ?? 'Unlinked'}</td>
                      <td className="py-3 text-mk-muted">{order.organisation_name ?? 'Organisation'}</td>
                      <td className="py-3 text-mk-muted">{order.customer_name ?? order.customer_email ?? 'Respondent'}</td>
                      <td className="py-3 text-mk-muted">{order.product_name}</td>
                      <td className="py-3 text-mk-muted">{formatOrderAmount(order.amount_cents, order.currency)}</td>
                      <td className="py-3"><Badge>{cleanStatus(order.status)}</Badge></td>
                      <td className="py-3 text-mk-muted">{new Date(order.updated_at ?? order.created_at).toLocaleDateString('en-ZA')}</td>
                      <td className="py-3 text-right"><Link className="font-semibold text-mk-brassDark" href={`/score/admin/orders/${order.order_reference}`}>Open</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!orders.length ? <p className="text-sm leading-6 text-mk-muted">No orders match the current filter.</p> : null}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
