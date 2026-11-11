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
    const reached = (x: StageProgressView['core']) => x.answered + x.withFunctions + x.declined + x.unknownToFunction;
    const row = (label: string, x: StageProgressView['core']) => (
      <div className="py-3">
        <dt className="text-sm text-mk-muted">{label}</dt>
        <dd className="mt-1">
          <span className="block text-lg font-semibold tabular-nums text-mk-navy">{x.complete ? 'Complete' : `${reached(x)} of ${x.applicableSoFar}`}</span>
          <span aria-hidden="true" className="mt-2 block h-1 rounded-full bg-mk-line">
            <span className="block h-1 rounded-full bg-mk-navy" style={{ width: `${x.complete ? 100 : x.pct}%` }} />
          </span>
        </dd>
      </div>
    );
    const o = stages.outstanding;
    return (
      <aside className="assessment-contextual hidden xl:block self-start rounded-panel border border-mk-line bg-mk-surface p-5" aria-label="Assessment progress" data-review-context data-review-stages>
        <p className="text-xs font-semibold uppercase tracking-[.12em] text-mk-muted">{current ? 'Current area' : 'About the organisation'}</p>
        <h2 className="mt-3 text-lg font-semibold leading-snug text-mk-navy">{current ? current.name : 'Profile questions'}</h2>
        <dl className="mt-5 divide-y divide-mk-line border-y border-mk-line">
          {row('Core confirmations', stages.core)}
          {row('All confirmations that apply', stages.breadth)}
          {o.withFunctions + o.declined + o.unknownToFunction > 0 && (
            <div className="py-3">
              <dt className="text-sm text-mk-muted">With accountable functions</dt>
              <dd className="mt-1 text-sm leading-6 text-mk-ink">
                {o.withFunctions} waiting{o.declined ? `, ${o.declined} declined` : ''}{o.unknownToFunction ? `, ${o.unknownToFunction} not known by the function` : ''}
              </dd>
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
