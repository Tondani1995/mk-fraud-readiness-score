import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionShell } from '@/components/ui/SectionShell';
import { validateSnapshotToken } from '@/lib/respondent/tokens';
import { getCustomerPaidOrderStatus } from '@/lib/commercial/customer-order-status';

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
      <Card>
        <CardHeader><CardTitle>Order {order.orderReference}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 text-sm leading-6 text-mk-muted sm:grid-cols-2">
          <p><strong className="text-mk-ink">Amount:</strong> {order.amountDisplay}</p>
          <p><strong className="text-mk-ink">Payment reference:</strong> {order.paymentReference}</p>
          <p><strong className="text-mk-ink">Payment:</strong> {order.paymentVerified ? 'Verified by MK' : 'Awaiting manual verification'}</p>
          <p><strong className="text-mk-ink">Order state:</strong> {order.orderStatus}</p>
          {order.engagement ? <>
            <p><strong className="text-mk-ink">Comprehensive stage:</strong> {order.engagement.state}</p>
            <p><strong className="text-mk-ink">Reviewer:</strong> {order.engagement.reviewerAssigned ? 'Named reviewer assigned' : 'Awaiting reviewer assignment'}</p>
            <p><strong className="text-mk-ink">Evidence:</strong> {order.engagement.reviewedEvidenceCount} of {order.engagement.evidenceCount} reviewed</p>
            <p><strong className="text-mk-ink">Sign-off:</strong> {order.engagement.signedOff ? 'Complete' : 'Pending'}</p>
          </> : null}
        </CardContent>
      </Card>
    </SectionShell>
  );
}
