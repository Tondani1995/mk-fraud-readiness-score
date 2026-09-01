import { AdminShell } from '@/components/admin/AdminShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { requireAdmin } from '@/lib/auth/admin-route';
import { getProductionMonitoringSnapshot } from '@/lib/admin/monitoring';

function statusClass(status: string) {
  if (status === 'PASS' || status === 'HEALTHY' || status === 'resolved') return 'bg-emerald-100 text-emerald-800';
  if (status === 'WARN' || status === 'DEGRADED' || status === 'acknowledged') return 'bg-amber-100 text-amber-900';
  return 'bg-red-100 text-red-800';
}

function StatusPill({ status }: { status: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusClass(status)}`}>{status}</span>;
}

function timestamp(value: string | null | undefined) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Johannesburg' }).format(new Date(value));
}

function valueOrDash(value: unknown) {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

export default async function MonitoringAdminPage() {
  const admin = await requireAdmin(['platform_admin', 'reviewer', 'approver', 'finance_admin', 'read_only_admin']);
  const snapshot = await getProductionMonitoringSnapshot();
  const funnelCards = [
    ['Starts', snapshot.funnel.starts],
    ['First answers', snapshot.funnel.firstAnswers],
    ['Submissions', snapshot.funnel.submissions],
    ['Snapshot success', snapshot.funnel.snapshotGenerationSucceeded],
    ['Snapshot views', snapshot.funnel.snapshotViews],
    ['Orders recorded', snapshot.funnel.orders]
  ];

  return (
    <AdminShell admin={admin}>
      <div className="space-y-8">
        <PageHeader
          eyebrow="Production monitoring"
          title="Production health"
          description="Read-only operational visibility for release identity, adaptive binding, customer journey signals, external monitoring handoff and bounded incident state."
        />

        <Card className="bg-white/95 shadow-[0_18px_55px_rgba(0,16,48,0.08)]">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>Overall Production status</CardTitle>
              <p className="mt-2 text-sm text-mk-muted">Last evaluated {timestamp(snapshot.checkedAt)}.</p>
            </div>
            <StatusPill status={snapshot.overallStatus} />
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {snapshot.readiness.checks.map((check) => (
                <div key={check.key} className="flex items-center justify-between gap-3 rounded-2xl border border-mk-line bg-mk-cream px-4 py-3">
                  <span className="text-xs font-semibold text-mk-ink">{check.key.replace(/_/g, ' ')}</span>
                  <StatusPill status={check.status} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-5 md:grid-cols-2">
          <Card className="bg-white/95">
            <CardHeader><CardTitle>Release and dependencies</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {[
                ['Expected Production SHA', snapshot.contract.expectedProductionSha],
                ['Observed deployment SHA', snapshot.readiness.currentDeploymentSha],
                ['Expected Supabase project', snapshot.contract.expectedSupabaseProjectRef],
                ['Observed Supabase project', snapshot.readiness.configuredSupabaseProjectRef],
                ['GA4 measurement', snapshot.contract.gaMeasurementId],
                ['Checkly plan guard', snapshot.contract.checklyPlan],
                ['Sentry plan guard', snapshot.contract.sentryPlan]
              ].map(([label, value]) => <div key={label} className="flex flex-col gap-1 border-b border-mk-line/70 pb-3 last:border-0 last:pb-0"><span className="text-xs uppercase tracking-[0.12em] text-mk-muted">{label}</span><span className="break-all font-mono text-xs text-mk-ink">{valueOrDash(value)}</span></div>)}
            </CardContent>
          </Card>

          <Card className="bg-white/95">
            <CardHeader><CardTitle>Internal monitor heartbeat</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="flex items-center justify-between"><span className="text-mk-muted">Status</span>{snapshot.heartbeat ? <StatusPill status={snapshot.heartbeat.status === 'healthy' ? 'HEALTHY' : snapshot.heartbeat.status === 'degraded' ? 'DEGRADED' : 'INCIDENT'} /> : <StatusPill status="INCIDENT" />}</div>
              <div className="flex justify-between gap-4"><span className="text-mk-muted">Last started</span><span className="text-right text-mk-ink">{timestamp(snapshot.heartbeat?.lastStartedAt)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-mk-muted">Last completed</span><span className="text-right text-mk-ink">{timestamp(snapshot.heartbeat?.lastCompletedAt)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-mk-muted">Runs / consecutive failures</span><span className="text-right text-mk-ink">{snapshot.heartbeat ? `${snapshot.heartbeat.runCount} / ${snapshot.heartbeat.consecutiveFailures}` : '—'}</span></div>
              <p className="rounded-2xl border border-mk-line bg-mk-cream px-4 py-3 text-xs leading-5 text-mk-muted">The external readiness check treats a missing or stale Production heartbeat as a failure.</p>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-white/95">
          <CardHeader><CardTitle>Customer journey, last 24 hours</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
              {funnelCards.map(([label, value]) => <div key={label} className="rounded-2xl border border-mk-line bg-mk-cream p-4"><p className="text-xs uppercase tracking-[0.12em] text-mk-muted">{label}</p><p className="mt-2 text-3xl font-semibold text-mk-ink">{value}</p></div>)}
            </div>
            <div className="mt-5 grid gap-3 text-sm md:grid-cols-3">
              <div><span className="text-mk-muted">Technical failures</span><p className="mt-1 font-semibold text-mk-ink">{snapshot.funnel.apiFailures}</p></div>
              <div><span className="text-mk-muted">Submitted without Snapshot</span><p className="mt-1 font-semibold text-mk-ink">{snapshot.funnel.submittedWithoutSnapshot}</p></div>
              <div><span className="text-mk-muted">Notification failures</span><p className="mt-1 font-semibold text-mk-ink">{snapshot.funnel.notificationFailures}</p></div>
            </div>
            <p className="mt-5 text-xs leading-5 text-mk-muted">Synthetic monitoring assessments are permanently marked and excluded from these customer funnel counts. Ordinary abandonment is recorded as a funnel signal, not an outage.</p>
          </CardContent>
        </Card>

        <div className="grid gap-5 md:grid-cols-2">
          <Card className="bg-white/95">
            <CardHeader><CardTitle>External and browser synthetics</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {[
                { label: 'Core', run: snapshot.synthetic.core },
                { label: 'Full desktop', run: snapshot.synthetic.fullDesktop },
                { label: 'Full mobile', run: snapshot.synthetic.fullMobile }
              ].map(({ label, run: item }) => {
                return <div key={label} className="rounded-2xl border border-mk-line bg-mk-cream p-4"><div className="flex items-center justify-between"><span className="font-semibold text-mk-ink">{label}</span><span className="text-xs text-mk-muted">{item ? item.status : 'Awaiting signed run'}</span></div><p className="mt-2 text-xs text-mk-muted">{item ? `${timestamp(item.createdAt)} · ${item.assessmentReference}` : 'No run recorded under the reserved monitor namespace.'}</p></div>;
              })}
              <p className="text-xs leading-5 text-mk-muted">Checkly execution state remains in Checkly. This view shows only the safe, first-party synthetic records that are written by authorised signed journeys.</p>
            </CardContent>
          </Card>

          <Card className="bg-white/95">
            <CardHeader><CardTitle>Budget and AI guard</CardTitle></CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div className="flex items-center justify-between"><span className="text-mk-muted">Budget status</span><StatusPill status={snapshot.budget.status} /></div>
              <div className="flex justify-between gap-4"><span className="text-mk-muted">Projected monthly monitoring</span><span className="font-semibold text-mk-ink">{snapshot.budget.projectedMonthlyMonitoringCostZar == null ? 'Pending actual synthetic cost' : `R${snapshot.budget.projectedMonthlyMonitoringCostZar.toFixed(2)}`}</span></div>
              <div className="flex justify-between gap-4"><span className="text-mk-muted">Actual provider cost metadata</span><span className="text-right text-mk-ink">{snapshot.ai.actualProviderCostMicros == null ? 'Not available' : `${snapshot.ai.actualProviderCostMicros.toFixed(0)} USD micros`}</span></div>
              <div className="flex justify-between gap-4"><span className="text-mk-muted">Projected AI monitoring</span><span className="font-semibold text-mk-ink">{snapshot.ai.projectedMonthlyAiCostZar == null ? 'Pending actual synthetic cost' : `R${snapshot.ai.projectedMonthlyAiCostZar.toFixed(2)}`}</span></div>
              <p className="rounded-2xl border border-mk-line bg-mk-cream px-4 py-3 text-xs leading-5 text-mk-muted">Checkly and Sentry are guarded at free tiers; no paid overage or additional provider is enabled. AI projection uses actual provider metadata where available and the brief’s conservative R20/USD planning guard.</p>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-white/95">
          <CardHeader><CardTitle>Unresolved monitoring incidents</CardTitle></CardHeader>
          <CardContent>
            {snapshot.alerts.length ? <div className="grid gap-3">{snapshot.alerts.map((alert) => <div key={alert.alertKey} className="grid gap-2 rounded-2xl border border-mk-line bg-mk-cream p-4 md:grid-cols-[auto_1fr_auto]"><div><StatusPill status={alert.priority ?? 'P2'} /></div><div><p className="font-semibold text-mk-ink">{alert.category.replace(/_/g, ' ')}</p><p className="mt-1 text-xs text-mk-muted">{alert.stage ?? 'monitoring'} · {alert.route ?? 'not route-specific'} · {alert.errorCategory ?? 'unclassified'}</p></div><p className="text-xs text-mk-muted">{alert.occurrenceCount} occurrence(s)<br />last seen {timestamp(alert.lastSeenAt)}</p></div>)}</div> : <p className="rounded-2xl border border-mk-line bg-mk-cream px-4 py-4 text-sm text-mk-muted">No unresolved first-party monitoring incidents are recorded.</p>}
          </CardContent>
        </Card>

        <Card className="bg-white/95">
          <CardHeader><CardTitle>Latest drift check</CardTitle></CardHeader>
          <CardContent>{snapshot.latestDrift.length ? <div className="grid gap-2 md:grid-cols-2">{snapshot.latestDrift.map((drift) => <div key={drift.checkKey} className="flex items-center justify-between gap-3 rounded-2xl border border-mk-line bg-mk-cream px-4 py-3"><span className="text-xs font-semibold text-mk-ink">{drift.checkKey.replace(/_/g, ' ')}</span><StatusPill status={drift.status} /></div>)}</div> : <p className="text-sm text-mk-muted">No daily drift run has been recorded yet.</p>}</CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
