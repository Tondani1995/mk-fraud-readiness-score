'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type ReportRow = {
  id: string;
  report_reference: string;
  report_type?: string | null;
  product_name?: string | null;
  order_reference?: string | null;
  version_number: number;
  status: string;
  storage_status: string | null;
};

type AttemptRow = {
  id: string;
  status: string;
  trigger_source: string;
  report_version: number;
  error_category: string | null;
  requested_at: string;
};

function productLabel(report: ReportRow) {
  if (report.report_type === 'mk_validated' || /comprehensive/i.test(report.product_name ?? '')) return 'Comprehensive';
  if (report.report_type === 'essential_self_assessment' || /essential/i.test(report.product_name ?? '')) return 'Essential';
  return 'Assessment';
}

export function AssessmentReportActions(props: {
  assessmentReference: string;
  canGenerate: boolean;
  canRegenerate: boolean;
  canDownload: boolean;
  reports: ReportRow[];
  generationAttempts: AttemptRow[];
}) {
  const router = useRouter();
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reportRows, setReportRows] = useState(props.reports);
  const [attemptRows, setAttemptRows] = useState(props.generationAttempts);

  useEffect(() => {
    setReportRows(props.reports);
    setAttemptRows(props.generationAttempts);
  }, [props.reports, props.generationAttempts]);

  const currentReport = useMemo(
    () => reportRows.find((report) => ['generated', 'under_review', 'approved', 'released'].includes(report.status)
      && report.storage_status === 'VERIFIED'),
    [reportRows]
  );
  const activeAttempt = attemptRows.find((attempt) => ['REPORT_QUEUED', 'REPORT_GENERATING'].includes(attempt.status));
  const showGenerationControls = props.canGenerate;

  async function run(action: 'assessment_admin_generate' | 'assessment_admin_retry' | 'assessment_admin_regenerate') {
    setBusyAction(action);
    setMessage(null);
    try {
      // The assessment-scoped generation contract remains the existing Essential route. This
      // neutral panel only removes the Essential-only presentation from the surrounding UI.
      const response = await fetch(`/score/api/admin/assessments/${encodeURIComponent(props.assessmentReference)}/generate-essential-report`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-idempotency-key': `${props.assessmentReference}:${action}:${crypto.randomUUID()}`
        },
        body: JSON.stringify({ action })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        setMessage(payload.message ?? 'The report action could not be completed.');
        return;
      }
      if (payload.report) {
        setReportRows((rows) => [payload.report, ...rows.filter((row) => row.id !== payload.report.id)]);
      } else if (payload.reportId) {
        setReportRows((rows) => [{
          id: payload.reportId,
          report_reference: payload.reportReference,
          report_type: 'essential_self_assessment',
          version_number: Number(payload.versionNumber),
          status: 'generated',
          storage_status: 'VERIFIED'
        }, ...rows.filter((row) => row.id !== payload.reportId)]);
      }
      if (payload.attemptId) {
        setAttemptRows((rows) => rows.some((row) => row.id === payload.attemptId)
          ? rows.map((row) => row.id === payload.attemptId ? { ...row, status: 'REPORT_READY' } : row)
          : [{
            id: payload.attemptId,
            status: 'REPORT_READY',
            trigger_source: action,
            report_version: Number(payload.versionNumber),
            error_category: null,
            requested_at: new Date().toISOString()
          }, ...rows]);
      }
      setMessage(payload.reusedExistingReport ? 'The current verified assessment report is ready to download.' : 'Assessment report generated and verified.');
      router.refresh();
    } catch {
      setMessage('The report action could not be completed.');
    } finally {
      setBusyAction(null);
    }
  }

  const downloadHref = currentReport?.order_reference
    ? `/score/api/admin/reports/${encodeURIComponent(currentReport.id)}/download?order=${encodeURIComponent(currentReport.order_reference)}`
    : currentReport
      ? `/score/api/admin/assessments/${encodeURIComponent(props.assessmentReference)}/reports/${encodeURIComponent(currentReport.id)}/download`
      : null;

  return (
    <section className="rounded-2xl border border-mk-line bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mk-brassDark">Assessment reports</p>
          <h2 className="mt-1 text-xl font-semibold text-mk-ink">Report actions</h2>
          <p className="mt-1 max-w-2xl text-sm text-mk-muted">Generate from the locked V1.2 score, then access the verified private report file.</p>
        </div>
        {showGenerationControls ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={Boolean(busyAction) || Boolean(activeAttempt)}
              onClick={() => run('assessment_admin_generate')}
              className="rounded-xl bg-mk-ink px-4 py-2 text-sm font-semibold text-mk-cream disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busyAction === 'assessment_admin_generate' ? 'Generating…' : activeAttempt ? 'Generation in progress…' : 'Generate assessment report'}
            </button>
            {attemptRows.some((attempt) => attempt.status === 'GENERATION_FAILED') ? (
              <button
                type="button"
                disabled={Boolean(busyAction) || Boolean(activeAttempt)}
                onClick={() => run('assessment_admin_retry')}
                className="rounded-xl border border-mk-line px-4 py-2 text-sm font-semibold text-mk-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                Retry generation
              </button>
            ) : null}
            {props.canRegenerate && currentReport ? (
              <button
                type="button"
                disabled={Boolean(busyAction) || Boolean(activeAttempt)}
                onClick={() => run('assessment_admin_regenerate')}
                className="rounded-xl border border-mk-line px-4 py-2 text-sm font-semibold text-mk-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                Regenerate version
              </button>
            ) : null}
          </div>
        ) : <p className="text-sm text-mk-muted">Read-only role: report generation is unavailable.</p>}
      </div>

      {message ? <p className="mt-4 rounded-xl bg-mk-cream px-3 py-2 text-sm text-mk-ink">{message}</p> : null}

      {currentReport ? (
        <div className="mt-5 flex flex-col gap-3 rounded-xl border border-mk-line bg-mk-cream/40 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-mk-ink">{currentReport.report_reference}</p>
            <p className="text-xs text-mk-muted">{productLabel(currentReport)} · Version {currentReport.version_number} · {currentReport.status} · private report verified</p>
          </div>
          {props.canDownload && downloadHref ? (
            <a
              href={downloadHref}
              className="inline-flex rounded-xl bg-mk-brass px-4 py-2 text-sm font-semibold text-mk-ink hover:bg-mk-brass/80"
            >
              Download report
            </a>
          ) : <p className="text-sm text-mk-muted">Report download is unavailable for this role.</p>}
        </div>
      ) : <p className="mt-5 text-sm text-mk-muted">No verified assessment report is currently available.</p>}

      {attemptRows.length ? (
        <div className="mt-4 text-xs text-mk-muted">
          Latest attempt: {attemptRows[0].status} · {attemptRows[0].trigger_source} · version {attemptRows[0].report_version}
          {attemptRows[0].error_category ? ` · ${attemptRows[0].error_category}` : ''}
        </div>
      ) : null}
    </section>
  );
}
