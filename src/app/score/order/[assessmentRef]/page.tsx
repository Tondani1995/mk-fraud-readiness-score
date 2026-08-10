import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionShell } from '@/components/ui/SectionShell';
import { validateSnapshotToken } from '@/lib/respondent/tokens';
import { getCustomerPaidOrderStatus } from '@/lib/commercial/customer-order-status';
import { CustomerOrderStatusWorkspace } from '@/components/comprehensive/CustomerOrderStatusWorkspace';

export const dynamic = 'force-dynamic';

export default async function CustomerOrderStatusPage(props: {
  params: Promise<{ assessmentRef: string }>;
  searchParams?: Promise<{ token?: string; orderReference?: string }>;
}) {
  const params = await props.params;
  const search = await props.searchParams;
  if (!search?.token || !search.orderReference) redirect(`/score/assessment/${encodeURIComponent(params.assessmentRef)}/result`);
  const validation = await validateSnapshotToken({ assessmentReference: params.assessmentRef, rawToken: search.token, consume: false });
  if (!validation.ok) {
    return <SectionShell className="py-12"><PageHeader eyebrow="Private order status" title="Private link required" description="Open this status page from the private snapshot link used to place the order." /></SectionShell>;
  }
  const order = await getCustomerPaidOrderStatus({ assessmentId: validation.assessment.id, orderReference: search.orderReference });
  if (!order) return <SectionShell className="py-12"><PageHeader eyebrow="Private order status" title="Order not found" description="Check the order reference and use the private assessment link that created it." /></SectionShell>;
  return (
    <SectionShell className="py-12">
      <PageHeader eyebrow="Private order status" title={`${order.productName} order`} description="A focused view of payment and, for Comprehensive, evidence-review progress. No customer portal is created here." />
      <div className="mb-5 rounded-xl border border-mk-line bg-white p-4 text-sm text-mk-muted"><strong className="text-mk-ink">Order {order.orderReference}</strong> · {order.amountDisplay} · {order.paymentVerified ? 'Payment verified by MK' : 'Awaiting manual payment verification'}</div>
      <CustomerOrderStatusWorkspace assessmentReference={params.assessmentRef} snapshotToken={search.token} initialOrder={order} />
    </SectionShell>
  );
}
