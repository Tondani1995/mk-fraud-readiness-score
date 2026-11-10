import Link from 'next/link';
import type { managementView } from '@/lib/readiness-review/view-model';
import { ControlList, CountCards, OwnerPackagesNote, StatusPanel, WorkingWithMk } from './SnapshotDocument';
import { SendToOwners } from './SendToOwners';

type Management = ReturnType<typeof managementView>;

/**
 * The management view: what needs an answer, what needs evidence, what needs remediation and who acts next. Unknown
 * answers are shown as waiting, never as failed controls; self-reported controls are never shown as verified.
 */
export function ManagementDocument({ view, token }: { view: Management; token: string }) {
  const answerTotal = view.needsAnswer.reduce((n, g) => n + g.items.length, 0);
  return (
    <article className="mx-auto max-w-6xl px-4 py-8 sm:px-6" data-review-management>
      <header>
        <p className="clarity-eyebrow">Management view · fictional session</p>
        <h1 className="mt-3 text-3xl font-semibold text-mk-ink">{view.organisationLabel}</h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-mk-ink">
          This view groups the open work by what it needs next. Questions waiting for an answer are not failed controls, and controls the organisation reported in place have not been
          verified unless an MK reviewer record says so.
        </p>
      </header>
      <div className="mt-6"><StatusPanel status={view.status} /></div>
      <div className="mt-6"><CountCards counts={view.counts} /></div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="m-answer" className="rounded-md border border-mk-line bg-white p-5" data-m="answer">
          <h2 id="m-answer" className="text-lg font-semibold text-mk-ink">Needs an answer ({answerTotal})</h2>
          <p className="mt-1 text-sm leading-6 text-mk-muted">Questions and scenarios waiting for the function that would know.</p>
          {view.status.interview === 'ended' && !view.status.followUpSent && answerTotal > 0 && <div className="mt-3"><SendToOwners token={token} seq={view.seq} /></div>}
          {/* Once sent, the result of the action stays visible where it was taken. */}
          {view.ownerPackages.length > 0 && <div className="mt-3 text-sm leading-6 text-mk-ink"><OwnerPackagesNote packages={view.ownerPackages} columns={1} /></div>}
          <ul className="mt-4 space-y-3">
            {view.needsAnswer.map((g) => (
              <li key={g.slug}>
                <details>
                  <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-mk-ink">{g.fn} ({g.items.length})</summary>
                  <ul className="mt-1 space-y-2 border-l border-mk-line pl-3 text-sm leading-6">
                    {g.items.map((i) => <li key={i.id}><span className="text-mk-ink">{i.title}</span><span className="block text-mk-muted">{i.why}</span></li>)}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="m-evidence" className="rounded-md border border-mk-line bg-white p-5" data-m="evidence">
          <h2 id="m-evidence" className="text-lg font-semibold text-mk-ink">Needs evidence ({view.needsEvidence.length})</h2>
          <p className="mt-1 text-sm leading-6 text-mk-muted">Reported in place or partly in place, and not yet examined by an MK reviewer.</p>
          <details className="mt-3">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-mk-ink">Show the controls</summary>
            <ul className="mt-1 space-y-2 border-l border-mk-line pl-3 text-sm leading-6">
              {view.needsEvidence.map((c) => <li key={c.id}><span className="text-mk-ink">{c.title}</span><span className="block text-mk-muted">{c.area} · {c.stateLabel}</span></li>)}
            </ul>
          </details>
        </section>
        <section aria-labelledby="m-remediation" className="rounded-md border border-mk-line bg-white p-5" data-m="remediation">
          <h2 id="m-remediation" className="text-lg font-semibold text-mk-ink">Needs remediation ({view.needsRemediation.reportedGaps.length + view.needsRemediation.reviewerFindings.length})</h2>
          <p className="mt-1 text-sm leading-6 text-mk-muted">
            {view.needsRemediation.reportedGaps.length} gaps the organisation reported itself, and {view.needsRemediation.reviewerFindings.length} findings recorded by an MK reviewer.
          </p>
          {view.needsRemediation.reviewerFindings.length > 0 && (
            <ul className="mt-3 space-y-2 text-sm leading-6" data-m="findings">
              {view.needsRemediation.reviewerFindings.map((f) => (
                <li key={f.id} className="border-l-2 border-mk-navy pl-3">
                  <span className="font-medium text-mk-ink">Reviewer finding: {f.title}</span>
                  <span className="block text-mk-muted">{[f.evidence, f.conclusion].filter(Boolean).join('; ')}{f.followUp ? `. Follow-up: ${f.followUp}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
          <details className="mt-3">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-mk-ink">Show the reported gaps</summary>
            <ControlList items={view.needsRemediation.reportedGaps} empty="No gaps were reported." />
          </details>
        </section>
      </div>

      <section aria-labelledby="m-next" className="mt-10" data-m="next">
        <h2 id="m-next" className="text-xl font-semibold text-mk-ink">Who acts next</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-mk-muted">Every open action, grouped by who takes it. The rule that assigns each one is stated in the data contract.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {view.whoActsNext.map((g) => (
            <details key={g.actor} className="rounded-md border border-mk-line bg-white p-4">
              <summary className="min-h-11 cursor-pointer py-1 font-medium text-mk-ink">{g.actor} ({g.actions.length})</summary>
              <ul className="mt-2 space-y-2 text-sm leading-6 text-mk-ink">{g.actions.map((a, i) => <li key={`${a.id}-${i}`}>{a.text}</li>)}</ul>
            </details>
          ))}
        </div>
      </section>

      <section aria-labelledby="m-complete" className="mt-10" data-m="completion">
        <h2 id="m-complete" className="text-xl font-semibold text-mk-ink">What a completed review would need</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-mk-muted">Proposed conditions, awaiting MK approval. The review is never marked complete by this candidate.</p>
        <ul className="mt-4 space-y-2 text-sm leading-6">
          {view.completion.map((c) => (
            <li key={c.label} className="flex gap-3">
              <span aria-hidden="true" className="w-5 shrink-0 text-center font-semibold text-mk-ink">{c.met ? '✓' : '○'}</span>
              <span className="text-mk-ink"><span className="sr-only">{c.met ? 'Met: ' : 'Not met: '}</span>{c.label}<span className="text-mk-muted">{c.met ? ' (met)' : ' (not met)'}</span></span>
            </li>
          ))}
        </ul>
      </section>
      <div className="mt-8 flex flex-wrap gap-4 text-sm">
        <Link className="min-h-11 py-2 font-medium text-mk-navy underline underline-offset-4" href={`/review/s/${token}/snapshot`}>Open the Snapshot</Link>
        <a className="min-h-11 py-2 font-medium text-mk-navy underline underline-offset-4" href={`/review/api/s/${token}/export`}>Download the full record (JSON)</a>
      </div>
      <WorkingWithMk />
    </article>
  );
}
