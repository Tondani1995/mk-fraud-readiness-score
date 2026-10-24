'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { buildManagementView } from '@/lib/snapshot/management-view';
import {
  buildCommercialSnapshotInsights,
  buildDomainSnapshotInsight,
  type CommercialSnapshotInsights
} from '@/lib/snapshot/commercial-insights';
import type { FreeSnapshot } from '@/lib/snapshot/free-snapshot';

/** Comparative recorded scores + separate gap signals. Selection reveals the existing interpretation. */
export function DomainReadinessMap({
  snapshot,
  insights: provided,
  selectedCode,
  onSelect,
  exploreRequest = 0
}: {
  snapshot: FreeSnapshot;
  insights?: CommercialSnapshotInsights;
  selectedCode?: string;
  onSelect?: (code: string) => void;
  exploreRequest?: number;
}) {
  const insights = provided ?? buildCommercialSnapshotInsights(snapshot);
  const view = buildManagementView(snapshot, insights);
  const [explored, setExplored] = useState(false);
  const [localRequest, setLocalRequest] = useState(0);
  const initial = useRef(true);
  const lastTrigger = useRef<HTMLButtonElement | null>(null);
  const [localCode, setLocalCode] = useState(
    view.priorities[0]?.domainCode ?? snapshot.domains[0]?.domainCode
  );
  const selected = selectedCode ?? localCode;
  const detailId = useId();
  useEffect(() => {
    if (initial.current) {
      initial.current = false;
      return;
    }
    if (!window.matchMedia('(max-width: 767px)').matches) return;
    setExplored(true);
  }, [selected, exploreRequest, localRequest]);
  useEffect(() => {
    if (!explored || !window.matchMedia('(max-width: 767px)').matches) return;
    const frame = requestAnimationFrame(() => document.getElementById(`${detailId}-title`)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [explored, selected, exploreRequest, localRequest, detailId]);
  if (!snapshot.domains.length) return null;
  function select(code: string, trigger: HTMLButtonElement) {
    lastTrigger.current = trigger;
    setLocalCode(code);
    onSelect?.(code);
    setLocalRequest((value) => value + 1);
  }
  return (
    <div className="domain-explorer" role="group" aria-labelledby="domain-map-heading">
      <div className="domain-explorer-header">
        <div>
          <p className="clarity-eyebrow">THE CONNECTED VIEW</p>
          <h2 id="domain-map-heading">Readiness, gaps and visibility.</h2>
        </div>
        <p>
          Select an area to inspect the recorded signals and their existing management interpretation. Scores
          compare readiness; gap counts are shown separately.
        </p>
      </div>
      {view.insufficient && (
        <p className="intelligence-limit">
          Domain calculations below describe known responses only. Insufficient visibility prevents a reliable
          readiness position, prioritisation or strength conclusion.
        </p>
      )}
      <div className="domain-explorer-body">
        <div className="domain-axis" aria-hidden="true">
          <span>APPLICABLE AREA</span>
          <span>READINESS / 100</span>
          <span>CRITICAL GAPS</span>
        </div>
        <ul
          className="domain-score-list"
          data-explored={explored ? 'true' : 'false'}
          aria-label="Recorded domain results"
        >
          {view.domains.map((domain, index) => {
            const active = domain.domainCode === selected;
            const insight = buildDomainSnapshotInsight(domain);
            const controls =
              view.reconciled && !view.insufficient
                ? snapshot.adaptiveMetrics!.questionTraces.filter(
                    (trace) =>
                      trace.applicable &&
                      trace.domainCode === domain.domainCode &&
                      (trace.isCriticalGap || trace.isMajorGap)
                  )
                : [];
            const priorityIndex = view.priorities.findIndex((area) => area.domainCode === domain.domainCode);
            const foundation = view.strengths.some((area) => area.domainCode === domain.domainCode);
            const gaps =
              snapshot.adaptiveMetrics?.visibilityGaps.filter(
                (gap) => gap.domainCode === domain.domainCode
              ) ?? [];
            return (
              <li key={domain.domainId} data-active={active ? 'true' : undefined}>
                <button
                  type="button"
                  className="domain-score-button"
                  aria-pressed={active}
                  aria-controls={active ? detailId : undefined}
                  onClick={(event) => select(domain.domainCode, event.currentTarget)}
                  aria-label={`${domain.domainName}: ${domain.rawScore === null ? 'not scored' : `${domain.rawScore} out of 100`}, ${domain.criticalGapCount} critical-control gaps. Explore area.`}
                >
                  <span className="domain-row-name">
                    <i aria-hidden="true">{String(index + 1).padStart(2, '0')}</i>
                    {domain.domainName}
                  </span>
                  <span className="domain-row-score">
                    <span className="domain-comparison-track" aria-hidden="true">
                      {domain.rawScore !== null && (
                        <i style={{ width: `${Math.max(0, Math.min(100, domain.rawScore))}%` }} />
                      )}
                    </span>
                    <strong>
                      {domain.rawScore === null ? 'Not scored' : domain.rawScore}
                      <small>{domain.rawScore === null ? '' : '/100'}</small>
                    </strong>
                  </span>
                  <span className="domain-gap-count">
                    <b>{domain.criticalGapCount}</b>
                    <small>critical {domain.criticalGapCount === 1 ? 'gap' : 'gaps'}</small>
                  </span>
                </button>
                {active && (
                  <section id={detailId} tabIndex={0} className="domain-detail" aria-labelledby={`${detailId}-title`}>
                    <button
                      className="domain-back"
                      onClick={() => {
                        setExplored(false);
                        (
                          lastTrigger.current ??
                          document.querySelector<HTMLButtonElement>(`button[aria-controls="${detailId}"]`)
                        )?.focus();
                      }}
                    >
                      ← Back to the areas
                    </button>
                    <div className="domain-detail-heading">
                      <p className="clarity-eyebrow">AREA INTELLIGENCE</p>
                      <h3 id={`${detailId}-title`} tabIndex={-1}>
                        {domain.domainName}
                      </h3>
                      <div className="domain-detail-tags">
                        {priorityIndex >= 0 && <span>Management focus {priorityIndex + 1}</span>}
                        {foundation && <span>Supported foundation</span>}
                        {domain.responses && domain.responses.unknown > 0 && (
                          <span>{domain.responses.unknown} unconfirmed</span>
                        )}
                      </div>
                    </div>
                    <div className="domain-detail-metrics">
                      <div>
                        <strong>
                          {domain.rawScore ?? '—'}
                          <small>{domain.rawScore === null ? '' : '/100'}</small>
                        </strong>
                        <span>recorded domain score</span>
                      </div>
                      <div>
                        <strong>{domain.criticalGapCount}</strong>
                        <span>critical-control gaps</span>
                      </div>
                    </div>
                    <p className="domain-stored-coverage">
                      {domain.coveragePct}% {snapshot.adaptiveMetrics ? 'scoring-base coverage' : 'coverage'}
                    </p>
                    {domain.responses ? (
                      <div className="domain-visibility">
                        <div className="visibility-track" aria-hidden="true">
                          <i className="visibility-known" style={{ flex: domain.responses.known }} />
                          <i className="visibility-unknown" style={{ flex: domain.responses.unknown }} />
                          <i
                            className="visibility-unanswered"
                            style={{ flex: domain.responses.unanswered }}
                          />
                        </div>
                        <p>
                          <span>{domain.responses.known} known</span>
                          <span>{domain.responses.unknown} unknown</span>
                          <span>{domain.responses.unanswered} unanswered</span>
                        </p>
                        <small>
                          {domain.responses.applicable} applicable controls · counts from reconciled traces
                        </small>
                      </div>
                    ) : (
                      <p className="domain-detail-note">
                        Reconciled response counts are unavailable in this view. No specific control finding
                        is attributed.
                      </p>
                    )}
                    {!view.insufficient && domain.rawScore !== null ? (
                      <>
                        <div className="domain-finding">
                          <span>RECORDED RESPONSE INTERPRETATION</span>
                          <p>{insight.finding}</p>
                        </div>
                        <div className="domain-implication">
                          <span>WHY MANAGEMENT SHOULD CARE</span>
                          <p>{insight.implication}</p>
                        </div>
                        {controls.length > 0 && (
                          <details className="domain-control-findings">
                            <summary>
                              {controls.length} flagged control{' '}
                              {controls.length === 1 ? 'statement' : 'statements'}
                            </summary>
                            <ul>
                              {controls.map((control) => (
                                <li key={control.questionCode}>
                                  <p>{control.prompt}</p>
                                  <small>
                                    Recorded response {control.responseValue}/5 ·{' '}
                                    {[
                                      control.isCriticalGap ? 'critical-control gap' : null,
                                      control.isMajorGap ? 'major gap' : null
                                    ]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </small>
                                </li>
                              ))}
                            </ul>
                            <p>
                              Engine classifications of self-reported responses. Statements are assessment
                              questions, without independent confirmation.
                            </p>
                          </details>
                        )}
                      </>
                    ) : (
                      <p className="domain-detail-note">
                        A readiness interpretation is withheld for this view. Confirm uncertain or incomplete
                        responses with the relevant owners before drawing conclusions.
                      </p>
                    )}
                    {gaps.length > 0 && (
                      <details className="domain-visibility-gaps">
                        <summary>
                          {gaps.length} {gaps.length === 1 ? 'response requires' : 'responses require'}{' '}
                          verification
                        </summary>
                        {gaps.map((gap) => (
                          <div key={gap.id}>
                            <p>{gap.prompt}</p>
                            <small>{gap.whyVisibilityMatters}</small>
                            <p>{gap.recommendedVerificationAction}</p>
                          </div>
                        ))}
                      </details>
                    )}
                    <p className="domain-detail-boundary">
                      Self-reported. No independently tested operating effectiveness, fraud incidence or loss
                      conclusion.
                    </p>
                  </section>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      <p className="sr-only" role="status">
        Showing {snapshot.domains.find((domain) => domain.domainCode === selected)?.domainName}
      </p>
      {snapshot.adaptiveMetrics && (
        <details id="coverage-definitions" className="coverage-definitions scroll-mt-28">
          <summary>Why overall coverage and domain coverage differ</summary>
          <p>
            <strong>Assessment coverage ({snapshot.adaptiveMetrics.assessmentCoveragePct}%):</strong> answered
            applicable controls / all applicable controls, by count. “I do not know” counts as an answer.
          </p>
          <p>
            <strong>Control visibility ({snapshot.adaptiveMetrics.controlVisibilityPct}%):</strong> applicable
            control weight with a known numeric response / all applicable control weight. Unknown share (
            {snapshot.adaptiveMetrics.unknownSharePct}%) uses the same weight base; unanswered controls also
            reduce visibility.
          </p>
          <p>
            <strong>Domain scoring-base coverage:</strong> completed known-response weight / known-response
            weight admitted to that domain’s score. The stored adaptive measure is usually 100% whenever a
            domain has a score. Unknown and unanswered responses are outside this denominator. It does not
            establish complete answers, implemented controls or independent verification. Domain percentages
            are not averaged to produce overall coverage.
          </p>
        </details>
      )}
    </div>
  );
}
