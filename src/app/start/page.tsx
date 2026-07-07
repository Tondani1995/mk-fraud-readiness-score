import { StartAssessmentForm } from '@/components/assessment/StartAssessmentForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionShell } from '@/components/ui/SectionShell';

export default function StartAssessmentPage() {
  return (
    <SectionShell className="py-12">
      <PageHeader
        eyebrow="Accountless respondent flow"
        title="Start assessment"
        description="Enter respondent and organisation details. The system will create a secure assessment reference and resume link without asking the respondent to create a password."
      />

      <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
        <Card>
          <CardHeader>
            <CardTitle>Phase 4 control boundary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm leading-6 text-mk-muted">
            <p>Respondents do not create accounts in V1.</p>
            <p>Only the organisation profile and assessment reference are created here.</p>
            <p>The full questionnaire is built in Phase 5. Scoring, snapshot, paid reports and PDFs remain blocked until later phases.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Respondent and organisation details</CardTitle>
          </CardHeader>
          <CardContent>
            <StartAssessmentForm />
          </CardContent>
        </Card>
      </div>
    </SectionShell>
  );
}
