export type CompletionDomain = {
  domainCode: string;
  name: string;
  activeCount: number;
  completedCount: number;
};
export function DomainCompletionRail({
  domains,
  currentDomain,
  resolved,
  onNavigate,
  navigationDisabled = false,
}: {
  domains: CompletionDomain[];
  currentDomain: string | undefined;
  resolved: boolean;
  onNavigate?: (domainCode: string) => void;
  navigationDisabled?: boolean;
}) {
  return (
    <aside
      className="domain-completion max-md:!hidden"
      aria-label="Assessment areas"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-mk-muted">
        Assessment areas
      </p>
      <ul className="mt-4 space-y-2">
        {domains
          .filter((d) => !resolved || d.activeCount > 0)
          .map((domain) => {
            const complete =
              resolved &&
              domain.activeCount > 0 &&
              domain.completedCount === domain.activeCount;
            const current = domain.domainCode === currentDomain;
            return (
              <li
                key={domain.domainCode}
                data-current={current ? "true" : undefined}
                aria-current={current ? "step" : undefined}
              >
                <div>
                  {onNavigate && domain.completedCount > 0 ? (
                    <button type="button" className="min-h-11 text-left text-[13px] leading-relaxed text-mk-navy underline-offset-4 hover:underline disabled:cursor-wait disabled:opacity-60" disabled={navigationDisabled} aria-label={`Review saved responses in ${domain.name}`} onClick={() => onNavigate(domain.domainCode)}>{domain.name}</button>
                  ) : <span>{domain.name}</span>}
                  <small className={current ? "" : "sr-only"}>
                    {current
                      ? "Current area"
                      : complete
                        ? "Completed"
                        : "Upcoming"}
                  </small>
                </div>
              </li>
            );
          })}
      </ul>
    </aside>
  );
}
