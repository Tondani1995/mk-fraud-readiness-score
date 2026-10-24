export type CompletionDomain = {
  domainCode: string;
  name: string;
  activeCount: number;
  completedCount: number;
};
/** The only quantities shown here are from the authoritative path's completion accounting. */
export function DomainCompletionRail({
  domains,
  currentDomain,
  resolved
}: {
  domains: CompletionDomain[];
  currentDomain: string | undefined;
  resolved: boolean;
}) {
  const applicable = domains.filter((domain) => domain.activeCount > 0);
  return (
    <aside className="domain-completion" aria-label="Organisational assessment coverage">
      <div className="domain-completion-title">
        <span className="clarity-eyebrow">THE ORGANISATIONAL VIEW</span>
        <p>{resolved ? 'Building coverage, one area at a time.' : 'Setting your assessment scope.'}</p>
      </div>
      <ol>
        {domains.map((domain, index) => (
          <li
            key={domain.domainCode}
            data-current={domain.domainCode === currentDomain ? 'true' : undefined}
            data-out={resolved && domain.activeCount === 0 ? 'true' : undefined}
          >
            <span className="completion-node" aria-hidden="true">
              {domain.activeCount > 0 && domain.completedCount === domain.activeCount
                ? '✓'
                : String(index + 1).padStart(2, '0')}
            </span>
            <div>
              <span>{domain.name}</span>
              <div className="completion-domain-track" aria-hidden="true">
                <i
                  style={{
                    width: `${domain.activeCount > 0 ? (domain.completedCount / domain.activeCount) * 100 : 0}%`
                  }}
                />
              </div>
              <small>
                {!resolved
                  ? 'Scope pending'
                  : domain.activeCount === 0
                    ? 'Outside the current path'
                    : `${Math.round((domain.completedCount / domain.activeCount) * 100)}% answered`}
              </small>
            </div>
          </li>
        ))}
      </ol>
      <details className="completion-area-key">
        <summary>{applicable.length} areas · completion only</summary>
        <ul>
          {domains.map((domain) => (
            <li key={domain.domainCode}>
              {domain.name}:{' '}
              {!resolved
                ? 'scope pending'
                : domain.activeCount === 0
                  ? 'outside current path'
                  : `${Math.round((domain.completedCount / domain.activeCount) * 100)}% answered`}
            </li>
          ))}
        </ul>
        <p>Results are calculated after submission.</p>
      </details>
      <p className="domain-completion-boundary">
        {applicable.length} areas on the current path. Completion does not indicate control strength. Your
        result is calculated after submission.
      </p>
    </aside>
  );
}
