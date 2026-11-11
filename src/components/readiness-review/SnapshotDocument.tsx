import Link from 'next/link';
import type { snapshotView, ControlItem, CountView, WaitingProvenance } from '@/lib/readiness-review/view-model';
import { storefrontPriceLabel } from '@/lib/commercial/storefront-presentation';
import { SendToOwners } from './SendToOwners';

type Snapshot = ReturnType<typeof snapshotView>;
type Scenario = Snapshot['openScenarios'][number];

function date(at: string) {
  return new Date(at).toLocaleString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' });
}

export function tierLabel(tier: number) {
  return tier === 1 ? 'Tier 1: asked first' : tier === 2 ? 'Tier 2: asked while room remains' : 'Tier 3: contributory';
}

export function CountCards({ counts }: { counts: CountView[] }) {
  return (
    <dl className="grid gap-px overflow-hidden rounded-md border border-mk-line bg-mk-line sm:grid-cols-2 xl:grid-cols-4" data-review-counts>
      {counts.map((c) => (
        <div key={c.key} className="bg-white p-4" data-count={c.key}>
          <dt className="text-sm font-medium text-mk-ink">{c.label}</dt>
          <dd className="mt-1">
            <span className="text-3xl font-semibold tabular-nums text-mk-ink">{c.value}</span>
            {c.denominator && <span className="ml-2 text-sm text-mk-muted">{c.denominator}</span>}
            <span className="mt-2 block text-sm leading-6 text-mk-muted">{c.definition}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function groupByArea<T extends { area: string }>(items: T[]) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    if (!map.has(item.area)) map.set(item.area, []);
    map.get(item.area)!.push(item);
  }
  return [...map.entries()];
}

export function ControlList({ items, empty, showOwner = false }: { items: (ControlItem & { provenance?: WaitingProvenance })[]; empty: string; showOwner?: boolean }) {
  if (!items.length) return <p className="mt-3 text-sm text-mk-muted">{empty}</p>;
  return (
    <div className="mt-4 space-y-5">
      {groupByArea(items).map(([area, group]) => (
        <div key={area}>
          <h3 className="text-sm font-semibold uppercase tracking-[.12em] text-mk-muted">{area} ({group.length})</h3>
          <ul className="mt-2 divide-y divide-mk-line rounded-md border border-mk-line bg-white">
            {group.map((c) => (
              <li key={c.id} className="p-4 text-sm leading-6" data-control={c.id} data-waiting-kind={c.provenance?.kind}>
                <p className="font-medium text-mk-ink">{c.title}</p>
                <p className="text-mk-ink">
                  <span className="font-medium">{c.stateLabel}.</span> {c.answer && c.answer !== c.stateLabel ? <span className="text-mk-muted">Answer: {c.answer}</span> : null}
                </p>
                {c.detail.map((d) => <p key={d} className="text-mk-muted">{d}</p>)}
                {c.provenance && <p className="text-mk-muted">Why it is waiting: {c.provenance.label}.</p>}
                {showOwner && c.ownerFunction && c.provenance?.kind !== 'declined' && <p className="text-mk-muted">With: {c.ownerFunction}</p>}
                {c.scenario && <p className="text-mk-muted">Scenario: {c.scenario.name} ({tierLabel(c.scenario.tier)})</p>}
                {c.evidence && <p className="text-mk-muted">{c.evidence.label}{c.evidence.current ? '' : ` (earlier answer, version ${c.evidence.forVer}; not current)`}</p>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function ScenarioList({ items }: { items: Scenario[] }) {
  if (!items.length) return <p className="mt-3 text-sm text-mk-muted">No material scenario is open.</p>;
  return (
    <ul className="mt-4 divide-y divide-mk-line rounded-md border border-mk-line bg-white">
      {items.map((s) => (
        <li key={s.id} className="p-4 text-sm leading-6" data-scenario={s.id} data-scenario-status={s.status}>
          <p className="font-medium text-mk-ink">{s.name}</p>
          <p className="text-mk-muted">{tierLabel(s.tier)} · {s.id}</p>
          <p className="text-mk-ink">{s.whyOpen}.</p>
          {s.established && <p className="text-mk-muted">So far: {s.established.toLowerCase()}.</p>}
          {s.decidingFacts.length > 0 && <p className="text-mk-muted">Still to establish: {s.decidingFacts.map((f: { title: string }) => f.title).join('; ')}.</p>}
          {s.accountableFunction && <p className="text-mk-muted">Accountable function: {s.accountableFunction} (suggested person: {s.suggestedRole}).</p>}
        </li>
      ))}
    </ul>
  );
}

function Section({ id, title, intro, children }: { id: string; title: string; intro?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="mt-10 scroll-mt-24">
      <h2 id={`${id}-title`} className="text-xl font-semibold text-mk-ink">{title}</h2>
      {intro && <p className="mt-2 max-w-3xl text-sm leading-6 text-mk-muted">{intro}</p>}
      {children}
    </section>
  );
}

/** What MK offers, stated from the catalogue. The Snapshot never recommends a paid engagement. */
export function WorkingWithMk() {
  return (
    <section aria-labelledby="working-with-mk" className="mt-12 rounded-md border border-mk-line bg-white p-5" data-review-commercial>
      <h2 id="working-with-mk" className="text-xl font-semibold text-mk-ink">Working with MK</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-mk-ink">
        This Snapshot does not recommend a paid engagement, and nothing in it depends on whether you buy one. The services below are listed so that you can see what each would add to
        what you already have.
      </p>
      <dl className="mt-4 grid gap-4 text-sm leading-6 md:grid-cols-3">
        <div className="border-t border-mk-line pt-3">
          <dt className="font-medium text-mk-ink">Owner follow-up</dt>
          <dd className="text-mk-muted">No charge. Your own accountable functions answer the open questions through their packages. MK does not take part in this step.</dd>
        </div>
        <div className="border-t border-mk-line pt-3">
          <dt className="font-medium text-mk-ink">Evidence review and reviewer conclusions</dt>
          <dd className="text-mk-muted">
            Professional judgement by an MK reviewer on evidence your organisation supplies. In the current catalogue this is Advisory work, scoped and contracted directly with MK:
            {' '}{storefrontPriceLabel('advisory')} per engagement.
          </dd>
        </div>
        <div className="border-t border-mk-line pt-3">
          <dt className="font-medium text-mk-ink">Essential and Comprehensive reports</dt>
          <dd className="text-mk-muted">
            Essential ({storefrontPriceLabel('essential')}) and Comprehensive ({storefrontPriceLabel('comprehensive')}) are currently produced from MK&rsquo;s scored assessment. They are not
            produced from this Snapshot and cannot be ordered from it while that decision is open.
          </dd>
        </div>
      </dl>
    </section>
  );
}

/** Which accountable functions hold questions once the open questions have been sent. Shown wherever sending is offered. */
export function OwnerPackagesNote({ packages, columns = 2 }: { packages: Snapshot['ownerPackages']; columns?: 1 | 2 }) {
  if (packages.length === 0) return null;
  return (
    <div className="rounded-md border border-mk-line bg-white p-4" data-review-packages>
      <p className="font-medium">Questions with accountable functions</p>
      <ul className={`mt-2 grid gap-1 ${columns === 2 ? 'sm:grid-cols-2' : ''}`}>{packages.map((p) => <li key={p.slug}>{p.fn}: {p.count} waiting</li>)}</ul>
      <p className="mt-2 text-mk-muted">In this fictional harness each function opens its package from the session links page, which stands in for an invitation and sign-in.</p>
    </div>
  );
}

export function StatusPanel({ status }: { status: Snapshot['status'] }) {
  return (
    <dl className="grid gap-4 rounded-md border border-mk-line bg-white p-5 text-sm leading-6 md:grid-cols-3" data-review-status>
      <div>
        <dt className="font-medium text-mk-ink">Interview</dt>
        <dd className="text-mk-muted">
          {status.stages
            ? `${status.stages.currentLabel}. Core stage ${status.stages.core.complete ? 'complete' : `${status.stages.core.pct}% reached so far`}; all confirmations ${status.stages.breadth.complete ? 'reached' : `${status.stages.breadth.pct}% reached so far`}. The respondent answered ${status.screensUsed} questions.`
            : `${status.interview === 'ended' ? `${status.stopLabel ?? 'Ended'}.` : 'In progress.'} ${status.screensUsed} of 95 respondent screens used.`}
          {status.ownerAnswers ? ` ${status.ownerAnswers} further answers came from accountable functions${status.stages ? '' : ', outside that limit'}.` : ''}
          {status.corrections ? ` ${status.corrections} answers were changed afterwards.` : ''}
        </dd>
      </div>
      <div>
        <dt className="font-medium text-mk-ink">MK review</dt>
        <dd className="text-mk-muted">{status.reviewStatus}. Answers are the organisation&rsquo;s own statements unless a reviewer record says otherwise.</dd>
      </div>
      <div>
        <dt className="font-medium text-mk-ink">Is the review complete?</dt>
        <dd className="text-mk-muted">No. {status.completeWhy}</dd>
      </div>
      {status.stages && <StageOutstanding stages={status.stages} />}
    </dl>
  );
}

/** Build 1.6: what is still outstanding and how far each accountable function has got. Counts only; nothing is scored. */
function StageOutstanding({ stages }: { stages: NonNullable<Snapshot['status']['stages']> }) {
  const o = stages.outstanding;
  return (
    <div className="md:col-span-3 border-t border-mk-line pt-4" data-review-stage-outstanding>
      <dt className="font-medium text-mk-ink">Outstanding information and function progress</dt>
      <dd className="mt-1">
        <p className="text-mk-muted">
        {o.withFunctions + o.declined + o.unknownToFunction + o.packagesOpen === 0
          ? 'Nothing is outstanding: every applicable confirmation has an answer and every package question sent has been answered.'
          : `${o.withFunctions} ${o.withFunctions === 1 ? 'confirmation is' : 'confirmations are'} with a function; ${o.packagesOpen} package ${o.packagesOpen === 1 ? 'question is' : 'questions are'} open; ${o.declined} declined by a function; ${o.unknownToFunction} answered “I don’t know” by the function.`}
        {' '}Counts are so far: a later answer can bring questions into scope or take them out.
        </p>
      {stages.functions.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <caption className="sr-only">Progress by accountable function</caption>
            <thead>
              <tr className="border-b border-mk-line text-mk-muted">
                <th scope="col" className="py-2 pr-3 font-medium">Function</th>
                <th scope="col" className="py-2 pr-3 font-medium tabular-nums">Open</th>
                <th scope="col" className="py-2 pr-3 font-medium tabular-nums">Answered</th>
                <th scope="col" className="py-2 pr-3 font-medium tabular-nums">Declined</th>
                <th scope="col" className="py-2 pr-3 font-medium tabular-nums">&ldquo;I don&rsquo;t know&rdquo;</th>
                <th scope="col" className="py-2 font-medium">Areas delegated</th>
              </tr>
            </thead>
            <tbody>
              {stages.functions.map((f) => (
                <tr key={f.fn} className="border-b border-mk-line last:border-0">
                  <th scope="row" className="py-2 pr-3 font-normal text-mk-ink">{f.fn}</th>
                  <td className="py-2 pr-3 tabular-nums text-mk-ink">{f.open}</td>
                  <td className="py-2 pr-3 tabular-nums text-mk-ink">{f.answered}</td>
                  <td className="py-2 pr-3 tabular-nums text-mk-ink">{f.declined}</td>
                  <td className="py-2 pr-3 tabular-nums text-mk-ink">{f.unknownToFunction}</td>
                  <td className="py-2 text-mk-ink">{f.areas.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {o.declinedItems.length > 0 && (
        <ul className="mt-3 space-y-2">
          {o.declinedItems.map((d) => (
            <li key={d.q} className="text-mk-ink">
              <span className="font-medium">{d.title}</span> was declined by {d.fn}. <span className="text-mk-muted">Reason: {d.reason}</span>
            </li>
          ))}
        </ul>
      )}
      </dd>
    </div>
  );
}

export function SnapshotDocument({ view, token, role, managementToken }: { view: Snapshot; token: string; role: string; managementToken?: string | null }) {
  const nav = [
    ['gaps', 'Reported gaps'],
    ['waiting', 'Waiting for an owner'],
    ['open', 'Still open'],
    ['evidence', 'Evidence to review'],
    ['in-place', 'Reported in place'],
    ['scope', 'Scope and assumptions'],
    ['next', 'Next steps']
  ];
  return (
    <article className="mx-auto max-w-6xl px-4 py-8 sm:px-6" data-review-snapshot>
      <header>
        <p className="clarity-eyebrow">Fraud Readiness Snapshot · fictional session</p>
        <h1 className="mt-3 text-3xl font-semibold text-mk-ink">Fraud Readiness Snapshot</h1>
        <p className="mt-2 text-base text-mk-ink">Prepared for {view.organisationLabel} · as at {date(view.asOf)}</p>
        <p className="mt-4 max-w-3xl text-base leading-7 text-mk-ink">
          Nothing in this Snapshot is a score, a rating or a prediction. It records what the organisation reported, which questions are waiting for the people who would know, which
          material scenarios are still open and what evidence an MK reviewer would need to see. A control that was not asked is shown as not yet established, never as in place or missing.
        </p>
      </header>
      <div className="mt-6"><StatusPanel status={view.status} /></div>
      <div className="mt-6"><CountCards counts={view.counts} /></div>
      <nav aria-label="Snapshot sections" className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {nav.map(([id, label]) => <a key={id} href={`#${id}`} className="min-h-11 py-2 text-mk-navy underline underline-offset-4">{label}</a>)}
      </nav>
      <Section id="gaps" title={`Reported gaps (${view.reportedGaps.length})`} intro="Every control the respondent or an accountable function reported as not in place, partly in place, or set out but not yet working. These are their own statements; none has been verified.">
        <ControlList items={view.reportedGaps} empty="No gaps were reported among the controls that were asked. This does not mean controls that were not asked are in place." />
      </Section>
      <Section id="waiting" title={`Waiting for an owner (${view.waiting.length})`} intro="Questions that now sit with the accountable function that would know. Nothing is assumed about them in the meantime.">
        {view.waitingBySource.length > 0 && (
          <ul className="mt-3 max-w-3xl space-y-1 text-sm leading-6 text-mk-ink" aria-label="Why questions are waiting" data-waiting-sources>
            {view.waitingBySource.map((x) => (
              <li key={x.kind} data-waiting-source={x.kind}>
                <span className="font-medium tabular-nums">{x.count}</span> <span className="text-mk-muted">{x.label}</span>
              </li>
            ))}
          </ul>
        )}
        <ControlList items={view.waiting} empty="No question is waiting for an owner." showOwner />
      </Section>
      <Section id="open" title={`Material scenarios still open (${view.openScenarios.length})`} intro="Failure scenarios that apply or may apply where the deciding fact or control is not yet established. Tiers set the order in which the interview asks; they are a proposal awaiting MK approval and are not a risk rating.">
        <ScenarioList items={view.openScenarios} />
      </Section>
      <Section id="evidence" title={`Evidence still to review (${view.evidenceToReview.length})`} intro="Controls reported in place or partly in place that are essential confirmations, or where the respondent said a record could be shown. An MK reviewer has not yet examined evidence for them.">
        <ControlList items={view.evidenceToReview} empty="Nothing is waiting for evidence review." />
      </Section>
      <Section id="in-place" title={`Reported in place (${view.reportedInPlace.length})`} intro="Controls the organisation reported as in place across everything they should cover. Self-reported; listed so that nothing reported is hidden.">
        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-mk-navy underline underline-offset-4">Show the {view.reportedInPlace.length} controls reported in place</summary>
          <ControlList items={view.reportedInPlace} empty="None reported in place." />
        </details>
      </Section>
      <Section id="scope" title="Scope and assumptions" intro="What decided which questions applied, and what was assumed or ruled out.">
        <div className="mt-4 grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-mk-ink">Industry-based assumptions ({view.assumptions.length})</h3>
            {view.assumptions.length ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-mk-ink">{view.assumptions.map((a: { id: string; text: string }) => <li key={a.id}>{a.text}</li>)}</ul>
            ) : (
              <p className="mt-2 text-sm leading-6 text-mk-muted">No industry-based assumption is pending. Other scope that is not yet known is listed under material scenarios still open.</p>
            )}
            <h3 className="mt-5 text-sm font-semibold text-mk-ink">Purposes that cannot apply because a related practice was reported absent</h3>
            {view.precluded.length ? (
              <ul className="mt-2 space-y-2 text-sm leading-6 text-mk-ink">{view.precluded.map((p) => <li key={p.by}><span className="font-medium">{p.byTitle}:</span> {p.items.map((i) => i.title).join('; ')}</li>)}</ul>
            ) : (
              <p className="mt-2 text-sm text-mk-muted">None.</p>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-mk-ink">About the organisation</h3>
            <dl className="mt-2 space-y-2 text-sm leading-6">
              {view.profile.map((p: { id: string; text: string; label: string }) => (
                <div key={p.id}><dt className="text-mk-muted">{p.text}</dt><dd className="text-mk-ink">{p.label}</dd></div>
              ))}
            </dl>
          </div>
        </div>
      </Section>
      <Section id="next" title="Next steps">
        <div className="mt-4 space-y-4 text-sm leading-6 text-mk-ink">
          {view.staged && view.staged.canSend && view.staged.candidates.length > 0 && (role === 'respondent' || role === 'management') && (
            <div className="rounded-md border border-mk-line bg-white p-4" data-review-staged-send>
              <p>
                The core stage is complete. Questions that would add most to what is known can now go to the accountable functions that own them. Each function receives only its own
                questions. You can send again later as answers come in; a question already with a function is never sent twice.
                {view.staged.sends > 0 ? ` Packages have been sent ${view.staged.sends} ${view.staged.sends === 1 ? 'time' : 'times'} so far.` : ''}
              </p>
              <div className="mt-3"><SendToOwners token={token} seq={view.seq} staged={view.staged} /></div>
            </div>
          )}
          {!view.staged && view.status.interview === 'ended' && !view.status.followUpSent && (role === 'respondent' || role === 'management') && (
            <div className="rounded-md border border-mk-line bg-white p-4">
              <p>
                The open material scenarios can now be sent to the accountable functions that would know. Each function receives only its own questions, and their answers do not use the
                respondent&rsquo;s 95 screens.
              </p>
              <div className="mt-3"><SendToOwners token={token} seq={view.seq} /></div>
            </div>
          )}
          <OwnerPackagesNote packages={view.ownerPackages} />
          <div className="flex flex-wrap gap-4">
            {managementToken && <Link className="min-h-11 py-2 font-medium text-mk-navy underline underline-offset-4" href={`/review/s/${managementToken}`}>Open the management view</Link>}
            <a className="min-h-11 py-2 font-medium text-mk-navy underline underline-offset-4" href={`/review/api/s/${token}/export`}>Download the full record (JSON)</a>
          </div>
        </div>
      </Section>
      <WorkingWithMk />
    </article>
  );
}
