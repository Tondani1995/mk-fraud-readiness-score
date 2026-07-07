import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { SectionShell } from '@/components/ui/SectionShell';

const pillars = [
  {
    title: 'Fraud Readiness',
    text: 'Measures how prepared the organisation is to prevent, detect, respond to and improve fraud-risk management.'
  },
  {
    title: 'Fraud Exposure',
    text: 'Separates inherent exposure from capability so high-risk operating models are not confused with weak controls.'
  },
  {
    title: 'Controlled Reporting',
    text: 'Produces a rules-driven snapshot and paid report under MK control, with no public benchmarking in V1.'
  }
];

export default function HomePage() {
  return (
    <SectionShell className="py-16 md:py-24">
      <div className="grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
        <div>
          <Badge>MK Fraud Insights · V1 Scaffold</Badge>
          <h1 className="mt-6 max-w-4xl text-4xl font-semibold tracking-tight text-mk-ink md:text-6xl">
            Understand how exposed your organisation is to fraud and what to fix first.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-mk-muted">
            The MK Fraud Readiness Score is a structured diagnostic for organisations that need a clear view of fraud readiness, inherent exposure and priority remediation actions.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild>
              <Link href="/start">Start assessment</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/admin">MK admin shell</Link>
            </Button>
          </div>
          <p className="mt-4 text-sm text-mk-muted">
            Phase 3 shell only. Assessment, scoring, payment and report generation are intentionally not active yet.
          </p>
        </div>

        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle>V1 boundary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm leading-6 text-mk-muted">
            <p>Accountless respondent flow. Admin login only. Manual EFT. Free Snapshot. Paid reports under MK control.</p>
            <p>No PayFast, no respondent dashboard, no peer benchmarking and no live AI-generated scoring or recommendations.</p>
          </CardContent>
        </Card>
      </div>

      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {pillars.map((pillar) => (
          <Card key={pillar.title}>
            <CardHeader>
              <CardTitle>{pillar.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-6 text-mk-muted">{pillar.text}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </SectionShell>
  );
}
