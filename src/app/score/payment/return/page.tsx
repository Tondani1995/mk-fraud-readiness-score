import Link from 'next/link';
import { PaymentReturnStatus } from '@/components/payments/PaymentReturnStatus';
import { Button } from '@/components/ui/Button';
import { SectionShell } from '@/components/ui/SectionShell';

export default function PaymentReturnPage({ searchParams }: { searchParams?: { order_reference?: string } }) {
  const orderReference = String(searchParams?.order_reference ?? '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 100);
  return (
    <SectionShell className="py-12 md:py-16">
      {orderReference ? <PaymentReturnStatus orderReference={orderReference} /> : (
        <div className="rounded-3xl border border-mk-line bg-white p-6"><h1 className="text-2xl font-semibold">Payment reference required</h1><p className="mt-3 text-sm text-mk-muted">Return to your assessment and reopen the payment status from the order confirmation.</p></div>
      )}
      <Button asChild variant="secondary" className="mt-6"><Link href="/fraud-readiness-score">Back to MK Fraud Readiness</Link></Button>
    </SectionShell>
  );
}
