import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { FreeSnapshot } from '@/lib/snapshot/free-snapshot';

function scoreLabel(score: number) {
  if (score < 40) return 'High attention required';
  if (score < 60) return 'Developing control environment';
  if (score < 80) return 'Structured but still improvable';
  return 'Strong readiness posture';
}

function formatScore(score: number) {
  return Math.round(score).toString();
}

export function FreeSnapshotCard({ snapshot, snapshotUrl }: { snapshot: FreeSnapshot; snapshotUrl?: string | null }) {
  const weakestDomains = [...snapshot.domains]
    .filter((domain) => domain.rawScore !== null)
    .sort((a, b) => Number(a.rawScore ?? 0) - Number(b.rawScore ?? 0))
    .slice(0, 3);

  const strongestDomains = [...snapshot.domains]
    .filter((domain) => domain.rawScore !== null)
    .sort((a, b) => Number(b.rawScore ?? 0) - Number(a.rawScore ?? 0))
    .slice(0, 3);

  return (
    <div className="space-y-6">
      <Card className="border-mk-charcoal/20">
        <CardHeader className="bg-mk-charcoal text-white">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/60">Free readiness snapshot</p>
              <CardTitle className="mt-2 text-2xl text-white">{snapshot.organisationName}</CardTitle>
              <p className="mt-2 text-sm text-white/70">Reference: {snapshot.assessmentReference}</p>
            </div>
            <Badge>{snapshot.finalMaturity}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <Metric label="Readiness score" value={`${formatScore(snapshot.overallScore)}/100`} supporting={scoreLabel(snapshot.overallScore)} />
            <Metric label="Exposure score" value={`${formatScore(snapshot.exposureScore)}/100`} supporting={snapshot.exposureBand} />
            <Metric label="Critical gaps" value={String(snapshot.criticalGapCount)} supporting={`${snapshot.majorGapCount} major gaps`} />
            <Metric label="Coverage" value={`${formatScore(snapshot.coveragePct)}%`} supporting={`${formatScore(snapshot.nARatePct)}% N/A rate`} />
          </div>

          {snapshot.capApplied ? (
            <div className="rounded-2xl border border-mk-line bg-mk-cream p-4 text-sm leading-6 text-mk-muted">
              <p className="font-semibold text-mk-ink">Maturity cap applied</p>
              <p className="mt-1">{snapshot.capReason ?? 'The final maturity level was capped because one or more critical control rules were triggered.'}</p>
            </div>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-2">
            <DomainList title="Strongest areas" domains={strongestDomains} empty="No domain strengths available yet." />
            <DomainList title="Priority areas" domains={weakestDomains} empty="No priority areas available yet." />
          </div>

          <div className="rounded-2xl border border-mk-line bg-white p-5 text-sm leading-6 text-mk-muted">
            <p className="font-semibold text-mk-ink">What this snapshot means</p>
            <p className="mt-2">
              This is a directional readiness view based on the self-assessment responses. It separates fraud readiness from inherent exposure and highlights where deeper MK review should focus first.
            </p>
            <p className="mt-2">
              The full report should only be released after MK has reviewed the profile, payment status and any context needed to avoid generic recommendations.
            </p>
          </div>

          {snapshotUrl ? (
            <div className="flex flex-col gap-3 border-t border-mk-line pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-mk-muted">Save this private link if you need to reopen the free snapshot later.</p>
              <Button asChild variant="secondary"><Link href={snapshotUrl}>Open snapshot link</Link></Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value, supporting }: { label: string; value: string; supporting: string }) {
  return (
    <div className="rounded-2xl border border-mk-line bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mk-muted">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-mk-ink">{value}</p>
      <p className="mt-2 text-sm text-mk-muted">{supporting}</p>
    </div>
  );
}

function DomainList({ title, domains, empty }: { title: string; domains: FreeSnapshot['domains']; empty: string }) {
  return (
    <div className="rounded-2xl border border-mk-line bg-white p-5">
      <p className="font-semibold text-mk-ink">{title}</p>
      <div className="mt-4 space-y-3">
        {domains.length ? domains.map((domain) => (
          <div key={domain.domainId}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-mk-ink">{domain.domainCode} · {domain.domainName}</span>
              <span className="text-mk-muted">{domain.rawScore === null ? 'N/A' : `${formatScore(domain.rawScore)}/100`}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-mk-line">
              <div className="h-full rounded-full bg-mk-charcoal" style={{ width: `${Math.max(0, Math.min(100, domain.rawScore ?? 0))}%` }} />
            </div>
          </div>
        )) : <p className="text-sm text-mk-muted">{empty}</p>}
      </div>
    </div>
  );
}
