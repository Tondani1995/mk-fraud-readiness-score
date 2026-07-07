import { FreeSnapshotCard } from '@/components/assessment/FreeSnapshot';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionShell } from '@/components/ui/SectionShell';
import { loadFreeSnapshotByReference } from '@/lib/snapshot/free-snapshot';

export default async function ResultPage({ params }: { params: { assessmentRef: string } }) {
  const snapshot = await loadFreeSnapshotByReference(params.assessmentRef);

  if (!snapshot) {
    return (
      <SectionShell className="py-12">
        <PageHeader eyebrow="Free readiness snapshot" title="Snapshot not available yet" description="The free snapshot becomes available once the assessment has been submitted and scored." />
        <Card>
          <CardHeader><CardTitle>Assessment reference</CardTitle></CardHeader>
          <CardContent className="text-sm leading-6 text-mk-muted"><p>{params.assessmentRef}</p></CardContent>
        </Card>
      </SectionShell>
    );
  }

  return (
    <SectionShell className="py-12">
      <PageHeader eyebrow="Free readiness snapshot" title="Fraud readiness snapshot" description="A directional view of readiness, exposure and priority attention areas based on the submitted self-assessment." />
      <FreeSnapshotCard snapshot={snapshot} />
    </SectionShell>
  );
}
