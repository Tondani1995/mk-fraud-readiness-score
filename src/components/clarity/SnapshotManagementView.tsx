import type { FreeSnapshot } from '@/lib/snapshot/free-snapshot';
import type { CommercialSnapshotInsights } from '@/lib/snapshot/commercial-insights';
import { buildManagementView } from '@/lib/snapshot/management-view';

export function SnapshotManagementView({ snapshot, insights }: { snapshot: FreeSnapshot; insights: CommercialSnapshotInsights }) {
  const view = buildManagementView(snapshot, insights);
  return (
    <section id="attention" className="management-view scroll-mt-28" aria-labelledby="management-heading">
      <div className="management-inner">
        <p className="clarity-eyebrow">FROM RECORDED CONTROLS TO MANAGEMENT ATTENTION</p>
        <h2 id="management-heading">{view.insufficient ? 'Establish visibility before drawing conclusions.' : 'Where management attention should go first.'}</h2>
        <p className="management-intro">{view.insufficient ? 'The recorded visibility is insufficient to issue a readiness position. Unknown responses are uncertainty, not evidence that a control has failed.' : 'Existing domain rules connect your recorded position to a management implication. These are interpretations of self-reported responses, without independent control testing.'}</p>
        {snapshot.resultStatus === 'PROVISIONAL' && <p className="management-note"><strong>Provisional position.</strong> Use this as a directional result. {snapshot.adaptiveMetrics?.limitationReasons.join(' ')}</p>}
        {!view.insufficient && <>
          <p className="management-order">Order: critical-control gap count first, then lower domain score, then higher methodology weight. Up to three areas are shown; relative priority does not itself mean a control has failed.</p>
          <div className="management-column-labels" aria-hidden="true"><span>Recorded signal</span><span>Domain interpretation</span><span>Why management should care</span></div>
          <ol className="management-paths">
            {view.priorities.map((area, index) => <li key={area.domainCode} className="management-path">
              <div className="management-signal"><span className="management-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><div><h3>{area.domainName}</h3><p><strong>{area.domain.rawScore}/100</strong> · {area.criticalGapCount} critical-control {area.criticalGapCount === 1 ? 'gap' : 'gaps'}</p><span className="management-status">{area.readinessStatus}</span></div></div>
              <div className="management-interpretation"><p>{area.finding}</p>{area.controls.length > 0 && <details><summary>{area.controls.length} flagged control {area.controls.length === 1 ? 'statement' : 'statements'}</summary><ul>{area.controls.map((control) => <li key={control.questionCode}><p>{control.prompt}</p><small>Recorded response: {control.responseValue}/5 · {control.isCriticalGap ? 'Critical-control gap' : ''}{control.isCriticalGap && control.isMajorGap ? ' · ' : ''}{control.isMajorGap ? 'Major gap' : ''}</small></li>)}</ul><small>Engine classifications of recorded responses. The statements above are assessment questions, not independently confirmed facts.</small></details>}</div>
              <div className="management-implication"><span className="management-mobile-label">Management implication</span><p>{area.implication}</p></div>
            </li>)}
          </ol>
          {!view.reconciled && <p className="management-note">Control-level traces are unavailable or do not reconcile with the recorded totals in this view. Specific control findings and domain-level major-gap counts are therefore not attributed here.</p>}
          <div className="management-foundations"><div><p className="clarity-eyebrow">SUPPORTED FOUNDATIONS</p>{view.strengths.length ? view.strengths.map((area) => <p key={area.domainCode}><strong>{area.domainName}.</strong> {area.finding}</p>) : <p>{insights.strengthContext}</p>}<small>Existing strength rule: domain score at least 70, stored domain coverage at least 70%, and no recorded critical-control gap. Up to two areas; this does not establish operating effectiveness.</small></div><div><p className="clarity-eyebrow">MANAGEMENT FOCUS</p><p>{insights.leadershipPriority}</p></div></div>
        </>}
        {view.insufficient && <div className="management-visibility">{snapshot.adaptiveMetrics?.visibilityGaps.slice(0, 3).map((gap) => <article key={gap.id}><h3>{gap.prompt}</h3><p>{gap.statement}</p><p>{gap.whyVisibilityMatters}</p><p><strong>Verify:</strong> {gap.recommendedVerificationAction}</p></article>)}<p>Confirm uncertain responses with the relevant control owners and supporting evidence before using this result to set remediation priorities.</p></div>}
        <div className="management-boundary"><p className="clarity-eyebrow">WHAT THIS RESULT CANNOT ESTABLISH</p><p>Self-reported readiness does not establish actual fraud incidence, financial loss, independent assurance or whether controls operate effectively. {snapshot.exposureBand ? `The recorded exposure band is ${snapshot.exposureBand}; it is separate from readiness.` : 'No exposure score or band was assessed in this result. Readiness scores must not be treated as exposure measurements.'} Domain comparisons do not establish operational dependencies between controls.</p></div>
      </div>
    </section>
  );
}
