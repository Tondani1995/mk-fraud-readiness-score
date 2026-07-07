import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionShell } from '@/components/ui/SectionShell';

export default function ReportRequestShellPage({ params }: { params: { assessmentRef: string } }) {
  return (
    <SectionShell className="py-12">
      <PageHeader
        eyebrow="Paid report request shell"
        title="Request a detailed report"
        description="Phase 9 will implement package selection, EFT order reference, proof upload and MK admin verification before report release."
      />
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>Report request placeholder</CardTitle>
            <Badge>{params.assessmentRef}</Badge>
          </div>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-mk-muted">
          A paid report must not be generated or released until MK verifies payment.
        </CardContent>
      </Card>
    </SectionShell>
  );
}
