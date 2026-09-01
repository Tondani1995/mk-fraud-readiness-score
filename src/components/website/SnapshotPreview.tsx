import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { ScoreGauge } from '@/components/assessment/ScoreGauge';

const previewDomains = [
  { name: 'Governance', value: 74 },
  { name: 'Detection', value: 58 },
  { name: 'Response', value: 42 }
];

export function SnapshotPreview({ compact = false }: { compact?: boolean }) {
  return (
    <section
      data-snapshot-preview
      aria-label="Illustrative Fraud Readiness Snapshot preview"
      className={`overflow-hidden rounded-[1.8rem] border border-white/15 bg-[#0b2631] text-white shadow-[0_24px_70px_rgba(0,16,48,0.22)] ${compact ? 'p-5' : 'p-6 md:p-8'}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#a9d4ce]">Illustrative Snapshot view</p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">A result built for a decision</h2>
        </div>
        <span className="rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] text-white/70">Example</span>
      </div>

      <div className={`mt-7 grid items-center gap-6 ${compact ? '' : 'md:grid-cols-[0.72fr_1fr]'}`}>
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-5">
          <ScoreGauge score={62} band="Structured" size="mobile" />
        </div>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55">Current position</p>
            <p className="mt-2 text-sm leading-6 text-white/82">Structured foundations are present, with uneven evidence and response ownership.</p>
          </div>
          <div className="space-y-3">
            {previewDomains.map((domain) => (
              <div key={domain.name}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-white/72">{domain.name}</span>
                  <span className="font-semibold text-white">{domain.value}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/12">
                  <div className="h-full rounded-full bg-[#a9d4ce]" style={{ width: `${domain.value}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[#a9d4ce]/25 bg-[#a9d4ce]/10 px-3 py-3 text-xs">
            <span className="text-white/75">Priority action</span>
            <span className="font-semibold text-[#d6eeea]">Clarify response ownership</span>
          </div>
        </div>
      </div>

      {!compact ? (
        <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5">
          <p className="text-xs leading-5 text-white/55">A private, persisted view of the submitted assessment.</p>
          <Link href="/score/start" className="inline-flex items-center gap-1 text-xs font-semibold text-[#d6eeea] hover:text-white">
            Start your assessment <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : null}
    </section>
  );
}
