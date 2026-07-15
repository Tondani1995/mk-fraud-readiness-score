import Link from 'next/link';
import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { requireAdmin } from '@/lib/auth/admin-route';
import { formatOrderAmount, getAdminOrderList } from '@/lib/orders/manual-eft-orders';
import {
  annotateOrdersWithPhase1State,
  PHASE1_QUEUE_LABELS,
  queueCounts,
  type Phase1QueueKey
} from '@/lib/reports/phase1-operations';
import { annotateOrdersWithPaymentState, PAYMENT_QUEUE_LABELS, paymentQueueCounts, type PaymentQueueKey } from '@/lib/payments/payment-operations';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const statusOptions = ['all', 'draft', 'awaiting_payment', 'payment_received', 'cancelled', 'expired'];
const priorityQueues: Phase1QueueKey[] = [
  'immediate_attention',
  'paid_no_report',
  'generation_failed',
  'ready_not_delivered',
  'delivery_failed'
];

function cleanStatus(status: string | null | undefined) {
  return (status ?? 'not requested').replace(/_/g, ' ');
}

export default async function AdminOrdersPage({
  searchParams
}: {
  searchParams?: { status?: string; search?: string; queue?: string };
}) {
  const admin = await requireAdmin(['platform_admin', 'finance_admin', 'reviewer', 'approver', 'read_only_admin']);
  const status = searchParams?.status ?? 'all';
  const search = searchParams?.search ?? '';
  const candidateQueue = searchParams?.queue as Phase1QueueKey | undefined;
  const selectedQueue = candidateQueue && candidateQueue in PHASE1_QUEUE_LABELS ? candidateQueue : undefined;
  const sourceOrders = await getAdminOrderList({ status, search });
  const phase1 = await annotateOrdersWithPhase1State(sourceOrders);
  const payment = await annotateOrdersWithPaymentState(phase1.orders);
  const annotated = payment.orders;
  const counts = queueCounts(annotated);
  const paymentQueue = searchParams?.queue as PaymentQueueKey | undefined;
  const selectedPaymentQueue = paymentQueue && paymentQueue in PAYMENT_QUEUE_LABELS ? paymentQueue : undefined;
  const paymentCounts = paymentQueueCounts(annotated);
  const orders = selectedPaymentQueue ? annotated.filter((order) => order.paymentQueues?.includes(selectedPaymentQueue)) : selectedQueue
    ? annotated.filter((order) => order.queues.includes(selectedQueue))
    : annotated;

  return (
    <AdminShell admin={admin}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Operational fulfilment"
          title="Orders and exception queues"
          description="Every order remains visible. Priority queues are derived from persisted payment, generation, storage and delivery state."
        />

        {phase1.capability.status !== 'available' ? (
          <div className="rounded-xl border border-mk-brass/40 bg-mk-cream p-4 text-sm text-mk-ink">
            {phase1.capability.message}
          </div>
        ) : null}
        {payment.capability.status !== 'available' ? <div className="rounded-xl border border-mk-line bg-white p-4 text-sm text-mk-muted">{payment.capability.message}</div> : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(Object.keys(PAYMENT_QUEUE_LABELS) as PaymentQueueKey[]).map((queue) => <Link key={queue} href={`/score/admin/orders?queue=${queue}`} className="rounded-2xl border border-mk-line bg-white p-5 shadow-sm transition hover:border-mk-brass"><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mk-muted">{PAYMENT_QUEUE_LABELS[queue]}</p><p className="mt-3 text-3xl font-semibold text-mk-ink">{paymentCounts[queue]}</p></Link>)}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {priorityQueues.map((queue) => (
            <Link key={queue} href={`/score/admin/orders?queue=${queue}`} className="rounded-2xl border border-mk-line bg-white p-5 shadow-sm transition hover:border-mk-brass">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-mk-muted">{PHASE1_QUEUE_LABELS[queue]}</p>
              <p className="mt-3 text-3xl font-semibold text-mk-ink">{counts[queue]}</p>
            </Link>
          ))}
        </div>

        <Card>
          <CardHeader><CardTitle>Order queue and filters</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(PHASE1_QUEUE_LABELS) as Phase1QueueKey[]).map((queue) => (
                <Link key={queue} href={`/score/admin/orders?queue=${queue}`} className={`rounded-full border px-3 py-2 text-xs font-semibold ${selectedQueue === queue ? 'border-mk-brass bg-mk-cream text-mk-ink' : 'border-mk-line bg-white text-mk-muted'}`}>
                  {PHASE1_QUEUE_LABELS[queue]} ({counts[queue]})
                </Link>
              ))}
              <Link href="/score/admin/orders" className="rounded-full border border-mk-line bg-white px-3 py-2 text-xs font-semibold text-mk-muted">All orders ({annotated.length})</Link>
            </div>
            <form action="/score/admin/orders" className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
              <select name="status" defaultValue={status} className="rounded-xl border border-mk-line bg-white px-4 py-3 text-sm text-mk-ink">
                {statusOptions.map((option) => <option key={option} value={option}>{cleanStatus(option)}</option>)}
              </select>
              <input name="search" defaultValue={search} placeholder="Search order or organisation" className="rounded-xl border border-mk-line bg-white px-4 py-3 text-sm text-mk-ink" />
              <Button type="submit">Filter</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{selectedPaymentQueue ? PAYMENT_QUEUE_LABELS[selectedPaymentQueue] : selectedQueue ? PHASE1_QUEUE_LABELS[selectedQueue] : 'All relevant orders'}</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.14em] text-mk-muted">
                  <tr><th className="py-2">Order</th><th>Organisation</th><th>Product</th><th>Amount</th><th>Payment</th><th>Generation</th><th>Delivery</th><th>Updated</th><th></th></tr>
                </thead>
                <tbody className="divide-y divide-mk-line">
                  {orders.map((order: any) => (
                    <tr key={order.order_reference}>
                      <td className="py-3"><p className="font-semibold text-mk-ink">{order.order_reference}</p><p className="text-xs text-mk-muted">{order.assessments?.assessment_reference ?? 'Unlinked'}</p>{order.stuckReason ? <p className="mt-1 max-w-52 text-xs font-semibold text-mk-danger">{order.stuckReason}</p> : null}</td>
                      <td className="py-3 text-mk-muted">{order.organisation_name ?? 'Organisation'}</td>
                      <td className="py-3 text-mk-muted">{order.product_name}</td>
                      <td className="py-3 text-mk-muted">{formatOrderAmount(order.amount_cents, order.currency)}</td>
                      <td className="py-3"><Badge>{cleanStatus(order.paymentState ?? order.status)}</Badge>{order.paymentReviewReason ? <p className="mt-1 max-w-48 text-xs text-mk-danger">{order.paymentReviewReason}</p> : null}</td>
                      <td className="py-3"><Badge>{cleanStatus(order.generationState)}</Badge>{order.generation?.safe_operational_error ? <p className="mt-1 max-w-48 text-xs text-mk-danger">{order.generation.safe_operational_error}</p> : null}</td>
                      <td className="py-3"><Badge>{cleanStatus(order.deliveryState)}</Badge>{order.delivery?.safe_operational_error ? <p className="mt-1 max-w-48 text-xs text-mk-danger">{order.delivery.safe_operational_error}</p> : null}</td>
                      <td className="py-3 text-mk-muted">{new Date(order.updated_at ?? order.created_at).toLocaleDateString('en-ZA')}</td>
                      <td className="py-3 text-right"><Link className="font-semibold text-mk-brassDark" href={`/score/admin/orders/${order.order_reference}`}>Open</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!orders.length ? <p className="text-sm leading-6 text-mk-muted">No orders match this queue. Paid unresolved orders remain in the applicable exception queues.</p> : null}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
