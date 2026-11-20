import type { FreeSnapshot } from '@/lib/snapshot/free-snapshot';
import type { CommercialSnapshotInsights } from '@/lib/snapshot/commercial-insights';
import { MATURITY_BAND_THRESHOLDS } from '@/lib/scoring/maturity-band';

/** A static executive instrument. All values are recorded; no score reveal/count-up animation. */
export function SnapshotExecutive({
  snapshot,
  narrative,
  insights,
  methodologyLabel,
  scoredAt
}: {
  snapshot: FreeSnapshot;
  narrative: { headline: string; executiveDiagnosis: string };
  insights: CommercialSnapshotInsights;
  methodologyLabel?: string | null;
  scoredAt: string | null;
}) {
  const insufficient = snapshot.resultStatus === 'INSUFFICIENT_VISIBILITY';
  return (
    <section id="position" className="snapshot-executive scroll-mt-28">
      <div className="snapshot-executive-inner">
        <div className="executive-topline">
          <p className="clarity-eyebrow">Fraud Readiness Snapshot</p>
          <span>
            {insufficient
              ? 'Insufficient visibility'
              : snapshot.resultStatus === 'PROVISIONAL'
                ? 'Provisional · self-reported'
                : 'Recorded · self-reported'}
          </span>
        </div>
        <div className="executive-composition">
          <div
            className="executive-position"
            data-unissued={snapshot.overallScore === null ? 'true' : undefined}
          >
            <p>RECORDED READINESS SCORE</p>
            <div
              className="executive-number"
              role="group"
              aria-label={
                snapshot.overallScore === null
                  ? 'Readiness score not issued'
                  : `Readiness score ${snapshot.overallScore} out of 100`
              }
            >
              <strong>{snapshot.overallScore === null ? 'Not issued' : snapshot.overallScore}</strong>
              {snapshot.overallScore !== null && <span>/100</span>}
            </div>
            <p className="executive-band">{snapshot.finalMaturity ?? 'Visibility required'}</p>
            {snapshot.capApplied && (
              <p className="executive-cap">
                Calculated {snapshot.calculatedMaturity}; maturity rules lowered the recorded band to{' '}
                {snapshot.finalMaturity}. The numeric score is unchanged.
              </p>
            )}
            <div className="readiness-scale" aria-hidden="true">
              {MATURITY_BAND_THRESHOLDS.map((band) => (
                <span key={band.label} style={{ width: `${Math.min(band.max, 100) - band.min}%` }}>
                  <i />
                  {band.min}
                </span>
              ))}
              <small>100</small>
              {snapshot.overallScore !== null && (
                <b style={{ left: `${Math.max(0, Math.min(100, snapshot.overallScore))}%` }} />
              )}
            </div>
            <p className="executive-scale-note">
              Readiness is classified using the recorded methodology.
            </p>
          </div>
          <div className="executive-diagnosis">
            <div className="executive-gap-signals">
              <div>
                <strong>{snapshot.criticalGapCount}</strong>
                <span>{snapshot.criticalGapCount === 1 ? 'critical-control gap' : 'critical-control gaps'}</span>
              </div>
              <div>
                <strong>{snapshot.majorGapCount}</strong>
                <span>{snapshot.majorGapCount === 1 ? 'major gap' : 'major gaps'}</span>
              </div>
              <p>A control can appear in both classifications. Counts are not additive.</p>
            </div>
            {!insufficient && insights.priorityAreas.length > 0 && (
              <p className="executive-focus">
                <span>FIRST MANAGEMENT FOCUS</span>
                <a className="inline-flex min-h-11 items-center gap-2 underline underline-offset-4" href="#attention">{insights.priorityAreas
                  .slice(0, 1)
                  .map((area) => area.domainName)
                  .join(' · ')} <span aria-hidden="true">↘</span></a>
              </p>
            )}
            <h1>{narrative.headline}</h1>
            <details className="mt-3 text-sm leading-relaxed text-mk-line">
              <summary className="min-h-11 cursor-pointer py-2">Read the recorded interpretation</summary>
              <p className="mt-2">{narrative.executiveDiagnosis}</p>
            </details>
            <div className="executive-actions">
              <a href="#attention">
                {insufficient ? 'View visibility priorities' : 'View management priorities'} <span aria-hidden="true">↘</span>
              </a>
              <a href="#next-step">Compare next steps</a>
            </div>
          </div>
        </div>
        <div className="executive-boundary">
          <p>
            Self-report indicates a recorded readiness position. It does not verify control effectiveness,
            actual fraud or financial loss.{' '}
            {snapshot.exposureBand
              ? `Recorded exposure: ${snapshot.exposureBand}, assessed separately.`
              : 'No exposure score was assessed.'}
          </p>
          <span>
            {methodologyLabel ?? 'MK Fraud Readiness Methodology'}
            {scoredAt ? ` · ${scoredAt}` : ''}
          </span>
        </div>
      </div>
    </section>
  );
}
