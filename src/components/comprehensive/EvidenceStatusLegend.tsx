import type { EvidenceValidationStatus } from '@/lib/reports/comprehensive';

const LABELS: Record<EvidenceValidationStatus, string> = {
  NOT_REQUESTED: 'Not requested',
  REQUESTED: 'Requested',
  RECEIVED: 'Received',
  SELF_REPORTED: 'Self-reported',
  EVIDENCE_REVIEWED: 'Evidence reviewed',
  VALIDATED_SUPPORTED: 'Validated / supported',
  NOT_SUPPORTED: 'Not supported',
  NOT_VALIDATED_INSUFFICIENT: 'Not validated / insufficient',
  NOT_APPLICABLE: 'Not applicable',
  REVIEWER_JUDGEMENT: 'Reviewer judgement'
};

export function EvidenceStatusLegend({ statuses = Object.keys(LABELS) as EvidenceValidationStatus[] }: { statuses?: EvidenceValidationStatus[] }) {
  return (
    <div aria-label="Evidence status legend" className="flex flex-wrap gap-2 text-xs text-slate-600">
      {statuses.map((status) => (
        <span key={status} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${status === 'VALIDATED_SUPPORTED' ? 'bg-emerald-600' : status === 'NOT_VALIDATED_INSUFFICIENT' ? 'bg-red-600' : status === 'REVIEWER_JUDGEMENT' ? 'bg-violet-600' : status === 'EVIDENCE_REVIEWED' ? 'bg-sky-700' : 'bg-slate-500'}`} />
          {LABELS[status]}
        </span>
      ))}
    </div>
  );
}
