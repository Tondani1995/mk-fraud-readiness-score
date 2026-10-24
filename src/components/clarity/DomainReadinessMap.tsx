import type { FreeSnapshot } from "@/lib/snapshot/free-snapshot";
/** An unranked view of persisted domain results. No thresholds, scoring or findings are derived here. */
export function DomainReadinessMap({ snapshot }: { snapshot: FreeSnapshot }) {
  if (!snapshot.domains.length) return null;
  return (
    <section className="domain-map" aria-labelledby="domain-map-heading">
      <div>
        <div className="domain-map-heading">
          <div>
            <p className="clarity-eyebrow">THE CONNECTED VIEW</p>
            <h2 id="domain-map-heading">Readiness across your organisation.</h2>
          </div>
          <p>
            Read each area alongside its coverage and recorded gaps. A score
            alone does not describe the whole position.
          </p>
        </div>
        <div className="domain-map-grid">
          {snapshot.domains.map((d) => (
            <article key={d.domainId} className="domain-map-item">
              <h3>{d.domainName}</h3>
              <strong>
                {d.rawScore === null ? "Not scored" : d.rawScore}
                <small>{d.rawScore === null ? "" : "/100"}</small>
              </strong>
              {d.rawScore !== null && (
                <div className="domain-map-track" aria-hidden="true">
                  <span
                    style={{
                      width: `${Math.max(0, Math.min(100, d.rawScore))}%`,
                    }}
                  />
                </div>
              )}
              <p>
                {d.coveragePct}% coverage · {d.criticalGapCount}{" "}
                critical-control {d.criticalGapCount === 1 ? "gap" : "gaps"}
              </p>
            </article>
          ))}
        </div>
        <p className="domain-map-note">
          Recorded domain scores from your submitted assessment. Self-reported
          analysis, without independent evidence testing. Unscored areas remain
          visible.
        </p>
      </div>
    </section>
  );
}
