import example from "@/lib/readiness-review/fixtures/preview-example.json";
import { readinessTrack } from "@/lib/website/readiness-track";

const previewDomains = [
  { name: "Governance", value: 74 },
  { name: "Detection", value: 58 },
  { name: "Response", value: 42 },
];
export function SnapshotPreview({ compact = false, story = false }: { compact?: boolean; story?: boolean }) {
  if (readinessTrack() === "review") return <ReviewSnapshotPreview story={story} compact={compact} />;
  if (story) return (
    <section data-snapshot-preview className="rounded-brand bg-white p-4 text-mk-navy" aria-label="Illustrative Fraud Readiness Snapshot preview">
      <p className="text-xs font-semibold uppercase tracking-[.1em] text-mk-muted">Illustrative product preview</p>
      <h3 className="mt-2 text-[22px] font-semibold leading-snug">Your Fraud Readiness Snapshot</h3>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 border-y border-mk-line py-3">
        <span className="text-xs text-mk-muted">Example position</span>
        <strong className="text-xl font-semibold">Structured</strong>
      </div>
      <div className="mt-3 space-y-3">
        {previewDomains.map(d => (
          <div key={d.name} className="text-sm">
            <div className="flex justify-between gap-3"><span>{d.name}</span><strong className="font-semibold tabular-nums">{d.value}<small className="text-xs font-normal">/100</small></strong></div>
            <div className="relative mt-1 h-3" aria-hidden="true">
              <span className="absolute inset-x-0 top-1/2 h-[3px] rounded bg-mk-line" />
              <span className="absolute left-0 top-1/2 h-[3px] rounded bg-mk-accent" style={{width:`${d.value}%`}} />
              <i className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-[4px] rounded-[4px] border-2 border-mk-accent bg-white" style={{left:`${d.value}%`}} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 border-t border-mk-line pt-3">
        <p className="text-xs text-mk-muted">Example priority action</p>
        <p className="mt-1 text-sm font-semibold">Clarify response ownership</p>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-mk-muted">Illustration only. Your private Snapshot is based on your submitted responses.</p>
    </section>
  );
  return (
    <section
      data-snapshot-preview
      className={`snapshot-specimen ${compact ? "compact" : ""}`}
      aria-label="Illustrative Fraud Readiness Snapshot preview"
    >
      <div className="specimen-top">
        <span>MK / FRAUD READINESS</span>
        <span className="specimen-example">ILLUSTRATIVE EXAMPLE</span>
      </div>
      <p className="specimen-kicker">YOUR MANAGEMENT VIEW</p>
      <h2>Your Fraud Readiness Snapshot</h2>
      <div className="specimen-position">
        <span className="position-mark" aria-hidden="true">
          ↗
        </span>
        <div>
          <span className="clarity-eyebrow">EXAMPLE POSITION</span>
          <strong>Structured</strong>
          <p>
            The example shows established foundations with uneven evidence and response ownership.
          </p>
        </div>
      </div>
      <div className="specimen-domains">
        {previewDomains.map((d) => (
          <div key={d.name}>
            <div>
              <span>{d.name}</span>
              <strong>
                {d.value}
                <small>/100</small>
              </strong>
            </div>
            <div className="specimen-track">
              <span style={{ width: `${d.value}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="specimen-priority">
        <span>PRIORITY ACTION</span>
        <strong>Clarify response ownership ↗</strong>
      </div>
      <p className="specimen-note">
        Illustration only. Your private Snapshot is based on your submitted
        responses.
      </p>

    </section>
  );
}

/**
 * Unscored preview for the review track. Every figure comes from a fictional organisation run through the review
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
        Fictional example produced by the review method. No score is calculated; your private Snapshot reflects only your own answers.
      </p>
    </section>
  );
}
