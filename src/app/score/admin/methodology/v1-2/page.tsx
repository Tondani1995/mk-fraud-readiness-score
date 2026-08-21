import candidate from '@/lib/adaptive/candidates/adaptive-graph-v1-2-candidate.json';
import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { requireAdmin } from '@/lib/auth/admin-route';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type CandidateGateway = typeof candidate.gateways[number];
type CandidateControl = typeof candidate.questions[number];

function applicability(item: CandidateControl) {
  if (!item.applicabilityCondition) return 'Always applicable';
  return `Factual gateway: ${item.skipReasonCode ?? 'deterministic absence rule'}; unknown remains in scope.`;
}

export default async function AdaptiveV12CandidateReviewPage() {
  const admin = await requireAdmin(['platform_admin', 'read_only_admin', 'reviewer', 'approver']);

  return (
    <AdminShell admin={admin}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Owner review • Not customer active"
          title="Adaptive Assessment V1.2 candidate"
          description="Sequential review surface for proposed wording, factual routing, scoring constructs and retained oversight. This page does not start or activate an assessment."
        />

        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="space-y-2 p-5 text-sm leading-6 text-amber-950">
            <div className="flex flex-wrap items-center gap-3"><Badge className="bg-white text-amber-900">draft_candidate</Badge><span className="font-semibold">Owner approval is required before any staging activation.</span></div>
            <p>V1.1 remains the active customer graph. No customer-start route, database graph row, activation policy or existing assessment is changed by this review surface.</p>
            <p className="font-mono text-xs">{candidate.graphVersion} · {candidate.graphFingerprint}</p>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card><CardHeader><CardTitle className="text-base">Gateways</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold text-mk-ink">{candidate.gateways.length}</p><p className="mt-1 text-sm text-mk-muted">factual scope items</p></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Scored controls</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold text-mk-ink">{candidate.questions.length}</p><p className="mt-1 text-sm text-mk-muted">single-construct capabilities</p></CardContent></Card>
          <Card><CardHeader><CardTitle className="text-base">Oversight variants</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold text-mk-ink">{candidate.oversightVariants.length}</p><p className="mt-1 text-sm text-mk-muted">retained provider obligations</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Response scale</CardTitle><p className="text-sm leading-6 text-mk-muted">Unknown is separate from maturity and never becomes a factual “No”.</p></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {candidate.responseScale.map((option) => <div key={option.responseValue} className="rounded-xl border border-mk-line bg-mk-cream/40 p-4"><p className="font-semibold text-mk-ink">{option.responseValue} · {option.label}</p><p className="mt-1 text-sm leading-6 text-mk-muted">{option.operationalMeaning}</p></div>)}
            <div className="rounded-xl border border-dashed border-mk-line p-4"><p className="font-semibold text-mk-ink">{candidate.uncertaintyOption.label}</p><p className="mt-1 text-sm leading-6 text-mk-muted">Retained in scope; no readiness credit; reported as unconfirmed.</p></div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Sequential gateway review</CardTitle><p className="text-sm leading-6 text-mk-muted">Customer labels are shown below. Internal routing keys are deliberately omitted from the customer-facing copy.</p></CardHeader>
          <CardContent className="space-y-3">
            {candidate.gateways.map((gateway: CandidateGateway, index) => (
              <details key={gateway.questionId} className="group rounded-2xl border border-mk-line bg-white p-4">
                <summary className="cursor-pointer list-none font-semibold text-mk-ink"><span className="mr-3 text-sm text-mk-muted">{index + 1}</span>{gateway.prompt}<span className="float-right text-mk-muted group-open:rotate-180">⌄</span></summary>
                <div className="mt-4 grid gap-2 border-t border-mk-line pt-4 sm:grid-cols-2">
                  {gateway.responseOptions.map((option) => <div key={option.value} className="rounded-xl bg-mk-cream/40 px-3 py-2 text-sm text-mk-ink">{option.label}</div>)}
                </div>
                <p className="mt-3 text-xs text-mk-muted">Construct: {gateway.responseDimension}{gateway.conditionalWhen ? ' · asked after the external-party gateway confirms exposure or remains unknown' : ''}</p>
              </details>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Sequential scored-control review</CardTitle><p className="text-sm leading-6 text-mk-muted">Each control has one declared construct, one maturity response dimension and an explicit factual scope rule where needed.</p></CardHeader>
          <CardContent className="space-y-5">
            {candidate.domains.map((domain) => {
              const controls = candidate.questions.filter((question) => question.domainCode === domain.domainCode);
              return <section key={domain.domainCode} className="space-y-3"><div className="flex flex-wrap items-end justify-between gap-2 border-b border-mk-line pb-2"><div><h2 className="font-semibold text-mk-ink">{domain.domainCode} · {domain.name}</h2><p className="text-xs text-mk-muted">{controls.length} controls · domain weight {domain.weightPct}%</p></div><p className="text-xs text-mk-muted">Candidate weight {controls.reduce((sum, item) => sum + item.weight, 0).toFixed(4)}</p></div>{controls.map((control, index) => <details key={control.questionId} className="rounded-2xl border border-mk-line p-4"><summary className="cursor-pointer list-none font-semibold text-mk-ink"><span className="mr-3 text-sm text-mk-muted">{index + 1}</span>{control.prompt}<span className="float-right text-mk-muted">{control.isHardGate ? 'hard gate' : control.isCritical ? 'critical' : 'control'} · ⌄</span></summary><div className="mt-4 grid gap-3 border-t border-mk-line pt-4 text-sm leading-6 md:grid-cols-2"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-mk-muted">Construct</p><p>{control.construct}</p></div><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-mk-muted">Control objective</p><p>{control.controlObjective}</p></div><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-mk-muted">Applicability</p><p>{applicability(control)}</p></div><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-mk-muted">Candidate weight</p><p>{control.weight} · {control.evidenceReference}</p></div></div></details>)}</section>;
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Retained-oversight review</CardTitle><p className="text-sm leading-6 text-mk-muted">External delivery changes the assessed obligation; it does not remove accountability.</p></CardHeader>
          <CardContent className="space-y-3">
            {candidate.oversightVariants.map((variant) => <div key={variant.questionId} className="rounded-2xl border border-mk-line bg-mk-cream/40 p-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-semibold text-mk-ink">{variant.prompt}</p><Badge>{variant.baseControlId}</Badge></div><p className="mt-2 text-sm leading-6 text-mk-muted">Exposure gateway: {variant.exposureGateway}. {variant.displayGuidance}</p></div>)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Owner decision boundary</CardTitle></CardHeader>
          <CardContent className="text-sm leading-6 text-mk-muted"><p>Review the complete audit, crosswalk, questionnaire, routing truth table, weight reconciliation and critical/hard-gate reconciliation in the repository review pack before approving wording or mapping. This page is read-only and has no activation action.</p></CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
