'use client';
import { useState } from 'react';
import type { FreeSnapshot } from '@/lib/snapshot/free-snapshot';
import type { CommercialSnapshotInsights } from '@/lib/snapshot/commercial-insights';
import { buildManagementView } from '@/lib/snapshot/management-view';
import { DomainReadinessMap } from '@/components/clarity/DomainReadinessMap';

export function SnapshotManagementView({
  snapshot,
  insights
}: {
  snapshot: FreeSnapshot;
  insights: CommercialSnapshotInsights;
}) {
  const [exploreRequest, setExploreRequest] = useState(0);
  const view = buildManagementView(snapshot, insights);
  const [selected, setSelected] = useState(
    view.priorities[0]?.domainCode ??
      view.domains.find((domain) => (domain.responses?.unknown ?? 0) > 0)?.domainCode ??
      view.domains[0]?.domainCode
  );
  return (
    <section
      id="attention"
      className="snapshot-intelligence scroll-mt-28"
      aria-labelledby="management-heading"
    >
      <div className="intelligence-inner">
        <div className="intelligence-heading">
          <div>
            <p className="clarity-eyebrow">FROM RESPONSES TO MANAGEMENT ATTENTION</p>
            <h2 id="management-heading">
              {view.insufficient
                ? 'Establish visibility before drawing conclusions.'
                : 'Your management priorities, in view.'}
            </h2>
          </div>
          <p>
            {view.insufficient
              ? 'Unknown responses are uncertainty, not evidence that a control failed. Readiness conclusions are withheld.'
              : 'Recorded results, existing domain interpretations and their management implications. Select any area to examine what supports the view.'}
          </p>
        </div>
        {snapshot.resultStatus === 'PROVISIONAL' && (
          <p className="intelligence-limit">
            <strong>Provisional position.</strong> {snapshot.adaptiveMetrics?.limitationReasons.join(' ')} Use
            as a directional result.
          </p>
        )}
        {!view.insufficient && (
          <>
            <ol className="priority-map" aria-label="Existing management priority order">
              {view.priorities.map((area, index) => (
                <li key={area.domainCode}>
                  <button
                    onClick={() => {
                      setSelected(area.domainCode);
                      setExploreRequest((value) => value + 1);
                    }}
                    aria-pressed={selected === area.domainCode}
                  >
                    <span className="priority-number">{String(index + 1).padStart(2, '0')}</span>
                    <div>
                      <h3>{area.domainName}</h3>
                      <p>
                        <strong>{area.domain.rawScore}/100</strong>
                        <span>
                          {area.criticalGapCount} critical-control{' '}
                          {area.criticalGapCount === 1 ? 'gap' : 'gaps'}
                        </span>
                      </p>
                    </div>
                    <span className="priority-explore" aria-hidden="true">
                      ↘
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <p className="priority-rule">
              Existing order: critical-control gap count first, lower domain score next, then methodology
              weight and original order. Relative focus does not itself establish a control failure.
            </p>
          </>
        )}
        <DomainReadinessMap
          snapshot={snapshot}
          insights={insights}
          selectedCode={selected}
          onSelect={setSelected}
          exploreRequest={exploreRequest}
        />
        <div className="intelligence-foundations">
          <div>
            <p className="clarity-eyebrow">
              {view.insufficient ? 'VISIBILITY FIRST' : 'SUPPORTED FOUNDATIONS'}
            </p>
            <p>
              {view.insufficient
                ? 'Confirm uncertain responses and supporting evidence before setting remediation priorities.'
                : view.strengths.length
                  ? view.strengths.map((area) => area.domainName).join(' · ')
                  : insights.strengthContext}
            </p>
          </div>
          <details>
            <summary>Interpretation, strength rules and assessment limits</summary>
            {!view.insufficient && (
              <>
                <p>{insights.leadershipPriority}</p>
                {view.strengths.map((area) => (
                  <p key={area.domainCode}>
                    <strong>{area.domainName}:</strong> {area.finding}
                  </p>
                ))}
                <p>
                  Existing strength rule: score at least 70, stored domain coverage at least 70%, no
                  critical-control gap. Up to two areas; this does not verify operating effectiveness.
                </p>
              </>
            )}
            <p>
              Self-report does not establish actual fraud incidence, financial loss or independent assurance.{' '}
              {snapshot.exposureBand
                ? `Exposure band ${snapshot.exposureBand} was recorded separately.`
                : 'No exposure score or band was assessed.'}{' '}
              Domain comparisons do not establish operational dependencies.
            </p>
            {!view.reconciled && (
              <p>
                Control-level traces are unavailable or do not reconcile. Specific control findings and
                domain-level major-gap counts are not attributed.
              </p>
            )}
          </details>
        </div>
      </div>
    </section>
  );
}
