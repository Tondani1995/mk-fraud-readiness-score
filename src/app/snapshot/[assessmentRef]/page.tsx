import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionShell } from '@/components/ui/SectionShell';

export default function SnapshotShellPage({ params }: { params: { assessmentRef: string } }) {
  return (
    <SectionShell className="py-12">
      <PageHeader
        eyebrow="Free Snapshot shell"
        title="Your Fraud Readiness Snapshot"
        description="Phase 7 will render the immediate results view after the deterministic scoring engine has passed scenario reconciliation."
      />
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <CardTitle>Snapshot placeholder</CardTitle>
            <Badge>{params.assessmentRef}</Badge>
          </div>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-mk-muted">
          No score is shown in Phase 3. Snapshot content must match the score trace exactly once Phase 6 is complete.
        </CardContent>
      </Card>
    </SectionShell>
  );
}
