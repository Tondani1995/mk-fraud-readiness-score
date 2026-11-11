import type { RespondentView, StageProgressView } from '@/lib/readiness-review/view-model';

type Area = RespondentView['areas'][number];

function areaNote(area: Area) {
  if (area.current) return 'Current area';
  if (area.sentTo) return `Sent to ${area.sentTo}`;
  if (area.answered > 0) return `${area.answered} answered`;
  return 'Not reached yet';
}

/**
 * Left rail in the approved instrument layout. It orients the respondent across the review areas without implying
 * completeness: an area shows how many answers the respondent gave, or where it was sent, never a tick or a share.
 */
export function ReviewAreaRail({ areas }: { areas: Area[] }) {
  return (
    <aside className="domain-completion max-md:!hidden" aria-label="Review areas" data-review-areas>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-mk-muted">Review areas</p>
      <ul className="mt-4 space-y-3">
        {areas.map((area) => (
          <li key={area.id} data-current={area.current ? 'true' : undefined} aria-current={area.current ? 'step' : undefined}>
            <div>
              <span className="text-[13px] leading-relaxed">{area.name}</span>
              {/* Areas not reached yet carry their note for screen readers only, so the rail stays quiet. */}
              <small className={area.current || area.sentTo || area.answered > 0 ? 'mt-0.5 block text-xs font-normal text-mk-muted' : 'sr-only'}>{areaNote(area)}</small>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

/** Right panel at wide widths: the current area, the respondent's use of the 95-screen limit and what "I don't know" does. */
export function ReviewAreaContext({ areas, screensUsed, limit, stages }: { areas: Area[]; screensUsed: number; limit: number | null; stages?: StageProgressView | null }) {
  const current = areas.find((area) => area.current);
  if (stages) {
    const row = (label: string, x: { answered: number; withFunctions: number; applicableSoFar: number; complete: boolean }) => (
      <div className="flex items-baseline justify-between gap-3 py-2">
        <dt className="text-sm text-mk-ink">{label}</dt>
        <dd className="text-sm tabular-nums text-mk-navy">{x.complete ? 'Complete' : `${x.answered + x.withFunctions} of ${x.applicableSoFar}`}</dd>
      </div>
    );
    return (
      <aside className="assessment-contextual hidden xl:block self-start rounded-panel border border-mk-line bg-mk-surface p-5" aria-label="Assessment progress" data-review-context data-review-stages>
        <p className="text-xs font-semibold uppercase tracking-[.12em] text-mk-muted">{current ? 'Current area' : 'About the organisation'}</p>
        <h2 className="mt-3 text-lg font-semibold leading-snug text-mk-navy">{current ? current.name : 'Profile questions'}</h2>
        <dl className="mt-5 divide-y divide-mk-line border-y border-mk-line">
          {row('Core stage', stages.core)}
          {row('All confirmations', stages.breadth)}
          {stages.outstanding.withFunctions > 0 && (
            <div className="flex items-baseline justify-between gap-3 py-2">
              <dt className="text-sm text-mk-ink">With other functions</dt>
              <dd className="text-sm tabular-nums text-mk-navy">{stages.outstanding.withFunctions}</dd>
            </div>
          )}
          {stages.outstanding.declined > 0 && (
            <div className="flex items-baseline justify-between gap-3 py-2">
              <dt className="text-sm text-mk-ink">Declined by a function</dt>
              <dd className="text-sm tabular-nums text-mk-navy">{stages.outstanding.declined}</dd>
            </div>
          )}
          {stages.outstanding.unknownToFunction > 0 && (
            <div className="flex items-baseline justify-between gap-3 py-2">
              <dt className="text-sm text-mk-ink">Not known by the function</dt>
              <dd className="text-sm tabular-nums text-mk-navy">{stages.outstanding.unknownToFunction}</dd>
            </div>
          )}
        </dl>
        <p className="mt-4 text-sm leading-relaxed text-mk-muted">Counts are so far: a later answer can bring questions into scope or take them out. Nothing is scored.</p>
      </aside>
    );
  }
  return (
    <aside className="assessment-contextual hidden xl:block self-start rounded-panel border border-mk-line bg-mk-surface p-5" aria-label="Interview context" data-review-context>
      <p className="text-xs font-semibold uppercase tracking-[.12em] text-mk-muted">{current ? 'Current area' : 'About the organisation'}</p>
      <h2 className="mt-3 text-lg font-semibold leading-snug text-mk-navy">{current ? current.name : 'Profile questions'}</h2>
      <div className="mt-5 border-y border-mk-line py-4">
        <p className="text-[28px] font-semibold tabular-nums text-mk-navy">
          {screensUsed}
          <small className="text-sm font-normal text-mk-muted"> / {limit ?? ''}</small>
        </p>
        <p className="mt-1 text-sm leading-relaxed text-mk-muted">interview screens used</p>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-mk-muted">
        This shows how much of the interview limit is used. It is not a measure of readiness, and nothing is scored.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-mk-muted">
        If you do not know an answer, choose &ldquo;I don&rsquo;t know&rdquo;. The question then waits for the function that would know.
      </p>
    </aside>
  );
}
