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
}: {
  domains: CompletionDomain[];
  currentDomain: string | undefined;
  resolved: boolean;
}) {
  return (
    <aside
      className="domain-completion max-md:!hidden"
      aria-label="Assessment areas"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-mk-muted">
        Assessment areas
      </p>
      <ul className="mt-5 space-y-4">
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
                  <span>{domain.name}</span>
                  <small>
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
