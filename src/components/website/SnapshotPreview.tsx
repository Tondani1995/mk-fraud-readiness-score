import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { ScoreGauge } from '@/components/assessment/ScoreGauge';
import example from "@/lib/readiness-review/fixtures/preview-example.json";
import { readinessTrack } from "@/lib/website/readiness-track";

const previewDomains = [
  { name: 'Governance', value: 74 },
  { name: 'Detection', value: 58 },
  { name: 'Response', value: 42 }
];

export function SnapshotPreview({ compact = false }: { compact?: boolean }) {
  // Review track (switch-over): the preview from the revised review engine's fictional example.
  if (readinessTrack() === 'review') return <ReviewSnapshotPreview story={false} compact={compact} />;
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

/**
 * Preview for the review track (lists only; the private Snapshot also carries the score). Every figure comes from a fictional organisation run through the review
 * engine (src/lib/readiness-review/fixtures/preview-example.json); no score, position or bar is shown because the
 * service produces none.
 */
const REVIEW_ROWS: { key: keyof typeof example.counts; label: string; note: string }[] = [
  { key: "reported-gaps", label: "Reported gaps", note: "self-reported, not verified" },
  { key: "waiting", label: "Waiting for an owner", note: "with the function that would know" },
  { key: "open-scenarios", label: "Material scenarios still open", note: "not established either way" },
  { key: "outstanding", label: "Information outstanding", note: "declined, unanswered or not known" },
];

function ReviewSnapshotPreview({ story, compact }: { story: boolean; compact: boolean }) {
  return (
    <section
      data-snapshot-preview
      data-preview-track="review"
      className={story ? "rounded-brand bg-white p-4 text-mk-navy" : `snapshot-specimen ${compact ? "compact" : ""}`}
      aria-label="Fictional example of a Fraud Readiness Snapshot"
    >
      <p className="text-xs font-semibold uppercase tracking-[.1em] text-mk-muted">Fictional example</p>
      <h3 className="mt-2 text-[22px] font-semibold leading-snug">Your Fraud Readiness Snapshot</h3>
      <p className="mt-1 text-xs text-mk-muted">{example.organisation} · interview stopped at its 95-screen limit</p>
      <dl className="mt-3 divide-y divide-mk-line border-y border-mk-line">
        {REVIEW_ROWS.map((row) => (
          <div key={row.key} className="flex items-baseline justify-between gap-3 py-2 text-sm">
            <dt>
              {row.label}
              <span className="block text-xs text-mk-muted">{row.note}</span>
            </dt>
            <dd className="text-lg font-semibold tabular-nums">{example.counts[row.key].value}</dd>
          </div>
        ))}
      </dl>
      {example.exampleWaiting && (
        <div className="mt-3">
          <p className="text-xs text-mk-muted">Example question waiting for an owner</p>
          <p className="mt-1 text-sm font-semibold">{example.exampleWaiting.title}</p>
          <p className="text-xs text-mk-muted">With {example.exampleWaiting.fn}</p>
        </div>
      )}
      <p className="mt-3 text-xs leading-relaxed text-mk-muted">
        Fictional example produced by the review method. Your private Snapshot also carries your MK Fraud Readiness score, and reflects only your own answers.
      </p>
    </section>
  );
}
