'use client';

import { useState } from 'react';
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
  const [requestState, setRequestState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const weakestDomains = [...snapshot.domains]
    .filter((domain) => domain.rawScore !== null)
    .sort((a, b) => Number(a.rawScore ?? 0) - Number(b.rawScore ?? 0))
    .slice(0, 3);

  const strongestDomains = [...snapshot.domains]
    .filter((domain) => domain.rawScore !== null)
    .sort((a, b) => Number(b.rawScore ?? 0) - Number(a.rawScore ?? 0))
    .slice(0, 3);

  async function requestDetailedReport() {
    setRequestState('sending');
    setMessage('');
    const response = await fetch(`/api/assessments/${snapshot.assessmentReference}/report-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'free_snapshot' })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) {
      setRequestState('error');
      setMessage(body.errors?.[0] ?? 'The detailed report request could not be submitted. Please contact MK Fraud Insights.');
      return;
    }
    setRequestState('sent');
    setMessage('Thank you. MK Fraud Insights will email the detailed report process and banking details to you.');
  }

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
          <div className="grid gap-4 md:grid-cols-5">
            <Metric label="Readiness score" value={`${formatScore(snapshot.overallScore)}/100`} supporting={scoreLabel(snapshot.overallScore)} />
            <Metric label="Maturity" value={snapshot.finalMaturity} supporting={`Calculated: ${snapshot.calculatedMaturity}`} />
            <Metric label="Exposure score" value={`${formatScore(snapshot.exposureScore)}/100`} supporting={snapshot.exposureBand} />
            <Metric label="Critical gaps" value={String(snapshot.criticalGapCount)} supporting={`${snapshot.majorGapCount} hard-gate gaps`} />
            <Metric label="Coverage" value={`${formatScore(snapshot.coveragePct)}%`} supporting={`${formatScore(snapshot.nARatePct)}% N/A rate`} />
          </div>

          {snapshot.criticalGapCount > 0 || snapshot.majorGapCount > 0 ? (
            <div className="rounded-2xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-sm leading-6 text-mk-danger">
              <p className="font-semibold">Critical-gap alert</p>
              <p className="mt-1">
                The persisted score trace found {snapshot.criticalGapCount} critical-control gap{snapshot.criticalGapCount === 1 ? '' : 's'} and {snapshot.majorGapCount} hard-gate gap{snapshot.majorGapCount === 1 ? '' : 's'}. These counts come from hard-gate and critical-control scoring rules.
              </p>
            </div>
          ) : null}

          {snapshot.capApplied ? (
            <div className="rounded-2xl border border-mk-line bg-mk-cream p-4 text-sm leading-6 text-mk-muted">
              <p className="font-semibold text-mk-ink">Maturity cap applied</p>
              <p className="mt-1">{snapshot.capReason ?? 'The final maturity level was capped because one or more critical control rules were triggered.'}</p>
            </div>
          ) : null}

          {snapshot.nARatePct > 0 || snapshot.coveragePct < 100 ? (
            <div className="rounded-2xl border border-mk-line bg-white p-4 text-sm leading-6 text-mk-muted">
              <p className="font-semibold text-mk-ink">Coverage and applicability</p>
              <p className="mt-1">
                Coverage is {formatScore(snapshot.coveragePct)}%. N/A responses are excluded from both numerator and denominator in the persisted score trace and appear here as a {formatScore(snapshot.nARatePct)}% N/A rate.
              </p>
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
              The full report is a paid option and should only be released after MK has reviewed the profile and confirmed the report process.
            </p>
            <p className="mt-2">
              This free snapshot does not include benchmarks, full report narrative, remediation plans or generated advisory content.
            </p>
          </div>

          <div className="rounded-2xl border border-mk-charcoal/15 bg-mk-cream/60 p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold text-mk-ink">Need the detailed report?</p>
                <p className="mt-1 text-sm leading-6 text-mk-muted">
                  Request the paid MK report for a deeper breakdown of the score and control gaps.
                </p>
              </div>
              <Button type="button" onClick={() => void requestDetailedReport()} disabled={requestState === 'sending' || requestState === 'sent'}>
                {requestState === 'sending' ? 'Submitting request…' : requestState === 'sent' ? 'Request received' : 'Request detailed report'}
              </Button>
            </div>
            {message ? (
              <div className={`mt-4 rounded-xl border p-4 text-sm ${requestState === 'error' ? 'border-mk-danger/30 bg-mk-danger/10 text-mk-danger' : 'border-mk-success/30 bg-mk-success/10 text-mk-ink'}`}>
                {message}
              </div>
            ) : null}
          </div>

          {snapshotUrl ? (
            <div className="flex flex-col gap-3 border-t border-mk-line pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-mk-muted">Save this private link if you need to reopen the free snapshot later. Refreshing it reloads the persisted score run without unlocking the assessment.</p>
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
            <p className="mt-1 text-xs text-mk-muted">
              Coverage {formatScore(domain.coveragePct)}% · {domain.criticalGapCount} critical gap{domain.criticalGapCount === 1 ? '' : 's'}
            </p>
          </div>
        )) : <p className="text-sm text-mk-muted">{empty}</p>}
      </div>
    </div>
  );
}
