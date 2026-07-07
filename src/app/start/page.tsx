import { StartAssessmentForm } from '@/components/assessment/StartAssessmentForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionShell } from '@/components/ui/SectionShell';

export default function StartAssessmentPage() {
  return (
    <SectionShell className="py-12 md:py-16">
      <div className="mb-10 rounded-[2rem] border border-mk-line bg-mk-paper px-6 py-10 md:px-10 md:py-14">
        <PageHeader
          eyebrow="Fraud Strategy • Threat Intelligence • Awareness"
          title="Fraud Readiness Score"
          description="A structured assessment for organisations that need clearer visibility of fraud exposure, control gaps and priority actions."
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
        <Card className="bg-mk-charcoal text-white">
          <CardHeader className="border-white/10">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-mk-brass">Assessment route</p>
            <CardTitle className="mt-2 text-white">Built for the same MK Fraud service journey.</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-white/80">
            <p>Capture the respondent and organisation details once.</p>
            <p>Create a secure assessment reference without asking the respondent to create an account.</p>
            <p>Use the output to support fraud health checks, programme design and practical remediation planning.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Respondent and organisation details</CardTitle>
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
