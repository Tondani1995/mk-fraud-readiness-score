import type { CompletionDomain } from "./DomainCompletionRail";

/** Authoritative completion only. No readiness, score, strength or finding is projected mid-assessment. */
export function AssessmentContext({
  domains,
  currentDomain,
  resolved,
}: {
  domains: CompletionDomain[];
  currentDomain?: string;
  resolved: boolean;
}) {
  const current = domains.find((domain) => domain.domainCode === currentDomain);
  if (!current || !resolved || current.activeCount <= 0) return null;
  return (
    <aside
      className="assessment-contextual hidden xl:block self-start rounded-panel border border-mk-line bg-mk-surface p-5"
      aria-label="Current area context"
    >
      <p className="text-xs font-semibold uppercase tracking-[.12em] text-mk-muted">
        Current area
      </p>
      <h2 className="mt-3 text-lg font-semibold leading-snug text-mk-navy">
        {current.name}
      </h2>
      <div className="mt-5 border-y border-mk-line py-4">
        <p className="text-[28px] font-semibold tabular-nums text-mk-navy">
          {current.completedCount}
          <small className="text-sm font-normal text-mk-muted">
            {" "}
            / {current.activeCount}
          </small>
        </p>
        <p className="mt-1 text-sm leading-relaxed text-mk-muted">
          responses recorded in this area
        </p>
      </div>
      <ul
        className="mt-4 grid grid-cols-5 gap-2"
        aria-label="Recorded area completion"
      >
        {domains
          .filter((domain) => domain.activeCount > 0)
          .map((domain) => (
            <li
              key={domain.domainCode}
              aria-label={`${domain.name}: ${domain.completedCount} of ${domain.activeCount} responses recorded`}
            >
              <span
                aria-hidden="true"
                className={`flex h-8 items-center justify-center rounded-[9px] border text-xs ${domain.domainCode === currentDomain ? "border-mk-accent bg-mk-accent text-white" : "border-mk-line bg-white text-mk-muted"}`}
              >
                {domain.completedCount === domain.activeCount
                  ? "✓"
                  : domain.domainCode.replace("D", "")}
              </span>
            </li>
          ))}
      </ul>
      <p className="mt-5 text-sm leading-relaxed text-mk-muted">
        This shows completion, not readiness. Your result follows submission.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-mk-muted">
        If you cannot confirm a capability, use “I do not know”.
      </p>
    </aside>
  );
}
