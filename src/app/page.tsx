import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { SectionShell } from '@/components/ui/SectionShell';

const pillars = [
  {
    title: 'Fraud Readiness',
    text: 'Understand whether the organisation has the governance, controls, detection, escalation and learning discipline needed to manage fraud risk properly.'
  },
  {
    title: 'Fraud Exposure',
    text: 'Separate inherent exposure from control weakness so high-risk operating models are not unfairly treated as weak — and weak controls are not hidden by low activity.'
  },
  {
    title: 'Controlled Reporting',
    text: 'Give leadership a clear snapshot first, then route deeper reports through MK review so recommendations remain practical, contextual and defensible.'
  }
];

const signals = ['People gaps', 'Control blind spots', 'Digital and identity exposure', 'Third-party risk'];

export default function HomePage() {
  return (
    <>
      <SectionShell className="py-16 md:py-24">
        <div className="grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <Badge>Fraud Strategy • Readiness Score • Practical Controls</Badge>
            <h1 className="mt-6 max-w-4xl text-4xl font-semibold tracking-[-0.045em] text-mk-ink md:text-6xl lg:text-7xl">
              See where fraud risk already lives in your operating model.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-mk-muted">
              The MK Fraud Readiness Score gives organisations a structured view of fraud readiness, inherent exposure and the control gaps that need attention first.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild>
                <Link href="/start">Start readiness assessment</Link>
              </Button>
              <Button asChild variant="secondary">
                <a href="https://www.mkfraud.co.za">Back to MK Fraud</a>
              </Button>
            </div>
            <div className="mt-8 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-mk-muted">
              {signals.map((signal) => (
                <span key={signal} className="rounded-full border border-mk-line bg-mk-paper px-3 py-2">
                  {signal}
                </span>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-4 rounded-[2rem] bg-mk-brass/10 blur-2xl" />
            <Card className="relative border-mk-brass/30">
              <CardHeader className="bg-mk-ink text-mk-cream">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-mk-brass">Readiness Snapshot</p>
                <CardTitle className="mt-2 text-2xl text-mk-cream">What leadership should see clearly</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm leading-6 text-mk-muted">
                <div className="rounded-2xl border border-mk-line bg-mk-cream/55 p-4">
                  <p className="font-semibold text-mk-ink">Capability vs exposure</p>
                  <p className="mt-1">A readiness score means very little unless it is read against the organisation’s actual fraud exposure.</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-mk-line bg-mk-paper p-4">
                    <p className="text-3xl font-semibold text-mk-ink">10</p>
                    <p className="mt-1">readiness domains</p>
                  </div>
                  <div className="rounded-2xl border border-mk-line bg-mk-paper p-4">
                    <p className="text-3xl font-semibold text-mk-ink">68</p>
                    <p className="mt-1">structured controls</p>
                  </div>
                </div>
                <p className="text-xs uppercase tracking-[0.18em] text-mk-brassDark">No public benchmarking · no AI scoring · MK-controlled reporting</p>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="mt-16 grid gap-5 md:grid-cols-3">
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

      <section className="border-y border-mk-line bg-mk-ink py-14 text-mk-cream">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 md:grid-cols-[0.8fr_1.2fr] md:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-mk-brass">Why this exists</p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">Fraud is already embedded in everyday operations.</h2>
          </div>
          <p className="text-base leading-8 text-mk-line/80">
            The score is not a tick-box compliance exercise. It is built to help organisations see where controls are weak, where people are exposed, where digital and third-party risks enter, and where action should start before losses become visible.
          </p>
        </div>
      </section>
    </>
  );
}
