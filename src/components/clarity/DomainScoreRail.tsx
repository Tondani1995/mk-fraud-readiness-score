/** Shared 0–100 scale and a separate, exact critical-gap count. No new calculation or ordering. */
export function DomainScoreRail({
  name,
  score,
  criticalGaps,
  priority,
}: {
  name: string;
  score: number | null;
  criticalGaps: number;
  priority: number | null;
}) {
  return (
    <>
      <span className="grid min-w-0 gap-2" data-domain-score-rail>
        <span className="flex items-start justify-between gap-3 max-sm:flex-col max-sm:items-stretch max-sm:gap-1">
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm font-medium leading-relaxed">
            <span>{name}</span>
            {priority !== null && (
              <small className="text-xs font-medium text-mk-accent">
                Focus {priority}
              </small>
            )}
          </span>
          <span className="shrink-0 text-right text-sm tabular-nums">
            <strong className="font-semibold">
              {score === null ? "Not scored" : score}
              <small className="text-xs font-normal">
                {score === null ? "" : "/100"}
              </small>
            </strong>
          </span>
        </span>
        <span className="relative mx-2 block h-4" aria-hidden="true">
          <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-md bg-mk-line" />
          {[0, 50, 100].map((tick) => (
            <i
              key={tick}
              className="absolute top-1/2 h-2 w-px -translate-y-1/2 bg-mk-muted/50"
              style={{ left: `${tick}%` }}
            />
          ))}
          {score !== null && (
            <>
              <span
                className="absolute left-0 top-1/2 h-[3px] -translate-y-1/2 rounded-md bg-mk-accent"
                style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
              />
              <i
                data-readiness-marker
                className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-[5px] border-2 border-mk-accent bg-white"
                style={{ left: `${Math.max(0, Math.min(100, score))}%` }}
              />
            </>
          )}
        </span>
      </span>
      <span
        className={`flex h-12 items-center justify-center self-center rounded-[12px] border px-1 py-2 text-center ${criticalGaps > 0 ? "border-mk-danger/30 bg-white text-mk-danger" : "border-mk-line text-mk-muted"}`}
      >
        <b className="text-base font-semibold tabular-nums">{criticalGaps}</b>
      </span>
    </>
  );
}
