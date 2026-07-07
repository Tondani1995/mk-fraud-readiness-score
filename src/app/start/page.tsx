import { StartAssessmentForm } from '@/components/assessment/StartAssessmentForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionShell } from '@/components/ui/SectionShell';

export default function StartAssessmentPage() {
  return (
    <SectionShell className="py-12 md:py-16">
      <PageHeader
        eyebrow="Fraud Readiness Score"
        title="Start your organisation’s readiness assessment"
        description="Enter the respondent and organisation details once. We will create a secure assessment reference and resume link without asking the respondent to create an account."
      />

      <div className="grid gap-6 lg:grid-cols-[0.75fr_1.25fr]">
        <Card className="bg-mk-ink text-mk-cream">
          <CardHeader className="border-mk-cream/10">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-mk-brass">What happens next</p>
            <CardTitle className="mt-2 text-mk-cream">A clean assessment flow, without client accounts.</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-mk-line/80">
            <p>The respondent receives an assessment reference and secure resume link for completion.</p>
            <p>The questionnaire captures fraud readiness, exposure and selected control indicators across the approved MK methodology.</p>
            <p>Results remain controlled by MK. The free snapshot is intentionally limited; deeper reporting is released only through MK review.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Respondent and organisation details</CardTitle>
            <p className="mt-2 text-sm leading-6 text-mk-muted">Use a work email and the organisation’s registered or trading name. Required fields are marked automatically by the form.</p>
          </CardHeader>
          <CardContent>
            <StartAssessmentForm />
          </CardContent>
        </Card>
      </div>
    </SectionShell>
  );
}
