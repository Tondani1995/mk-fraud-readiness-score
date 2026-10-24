import { buildManagementView } from '@/lib/snapshot/management-view';
import { buildCommercialSnapshotInsights } from '@/lib/snapshot/commercial-insights';
import type { FreeSnapshot } from "@/lib/snapshot/free-snapshot";
/** An unranked view of persisted domain results. No thresholds, scoring or findings are derived here. */
export function DomainReadinessMap({ snapshot }: { snapshot: FreeSnapshot }) {
  if (!snapshot.domains.length) return null;
  const view = buildManagementView(snapshot, buildCommercialSnapshotInsights(snapshot));
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
        {view.insufficient && <p className="management-note">These domain figures describe known responses only. Insufficient visibility prevents a reliable overall readiness position, prioritisation or strength conclusion.</p>}
        <div className="domain-map-grid">
          {view.domains.map((d) => (
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
                {d.coveragePct}% {snapshot.adaptiveMetrics ? 'scoring-base coverage' : 'coverage'} · {d.criticalGapCount}{" "}
                critical-control {d.criticalGapCount === 1 ? "gap" : "gaps"}
              </p>
              {d.responses && <p>{d.responses.known} known · {d.responses.unknown} unknown · {d.responses.unanswered} unanswered / {d.responses.applicable} applicable controls</p>}
            </article>
          ))}
        </div>
        {snapshot.adaptiveMetrics && <details id="coverage-definitions" className="coverage-definitions scroll-mt-28"><summary>How to read the different coverage measures</summary><p><strong>Assessment coverage ({snapshot.adaptiveMetrics.assessmentCoveragePct}%):</strong> answered applicable controls divided by all applicable controls, by count. “I do not know” counts as an answer.</p><p><strong>Control visibility ({snapshot.adaptiveMetrics.controlVisibilityPct}%):</strong> applicable control weight with a known numeric response divided by all applicable control weight. Unknown share ({snapshot.adaptiveMetrics.unknownSharePct}%) uses the same weight base; unanswered controls can also reduce visibility.</p><p><strong>Domain scoring-base coverage:</strong> the stored adaptive measure divides completed known-response weight by the known-response weight admitted to that domain’s score. It is usually 100% whenever that domain has a score. It excludes unknown and unanswered responses, so it does not mean all applicable controls were answered, implemented or verified. It is not averaged to calculate overall coverage.</p><p>{view.reconciled ? 'The counts below each domain include known, unknown and unanswered applicable controls from reconciled result traces.' : 'Reconciled control traces are not available in this view; per-domain completion counts cannot be established.'}</p></details>}
        <p className="domain-map-note">
          Recorded domain scores from your submitted assessment. Self-reported
          analysis, without independent evidence testing. Unscored areas remain
          visible.
        </p>
      </div>
    </section>
  );
}
