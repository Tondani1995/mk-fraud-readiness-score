import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionShell } from '@/components/ui/SectionShell';

type ResultPageProps = {
  params: { assessmentRef: string };
  searchParams?: { token?: string; embed?: string };
};

export default async function ResultPage({ params, searchParams }: ResultPageProps) {
  if (searchParams?.token) {
    const snapshotPath = `/snapshot/${encodeURIComponent(params.assessmentRef)}?token=${encodeURIComponent(searchParams.token)}${searchParams.embed === '1' ? '&embed=1' : ''}`;
    redirect(snapshotPath);
  }

  return (
    <SectionShell className="py-12">
      <PageHeader
        eyebrow="Free readiness snapshot"
        title="Private snapshot link required"
        description="The free snapshot can only be opened from the private snapshot link issued after assessment submission."
      />
      <Card>
        <CardHeader><CardTitle>Assessment reference</CardTitle></CardHeader>
        <CardContent className="text-sm leading-6 text-mk-muted">
          <p>{params.assessmentRef}</p>
          <p className="mt-3">Use the private snapshot link created after the assessment was submitted.</p>
        </CardContent>
      </Card>
    </SectionShell>
  );
}
