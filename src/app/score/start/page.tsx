import { StartAssessmentForm } from '@/components/assessment/StartAssessmentForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionShell } from '@/components/ui/SectionShell';
import { redirect } from 'next/navigation';

export default function StartAssessmentPage({ searchParams }: { searchParams?: { embed?: string } }) {
  if (searchParams?.embed === '1') redirect('/score/start');
  return (
    <SectionShell className="py-12 md:py-16">
      <div className="mb-10 rounded-[2rem] border border-mk-line bg-mk-paper px-6 py-10 md:px-10 md:py-14">
        <PageHeader
          eyebrow="Fraud Strategy • Threat Intelligence • Readiness Score"
          title="Assess your organisation's fraud readiness"
          description="A structured self-assessment for organisations that need clearer visibility of fraud exposure, control maturity and the areas that deserve deeper MK review."
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
        <Card className="bg-mk-charcoal text-white">
          <CardHeader className="border-white/10">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">Assessment journey</p>
            <CardTitle className="mt-2 text-white">Start with the fraud readiness health check.</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-white/80">
            <p>Capture the respondent and organisation details once.</p>
            <p>Move directly into the fraud readiness questions without asking the respondent to create an account.</p>
            <p>Use the free snapshot to decide whether to request the detailed MK report or a fuller Fraud Health Check.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Assess your organisation</CardTitle>
            <p className="mt-2 text-sm leading-6 text-mk-muted">Use a work email and the organisation’s registered or trading name.</p>
          </CardHeader>
          <CardContent>
            <StartAssessmentForm />
          </CardContent>
        </Card>
      </div>
    </SectionShell>
  );
}
