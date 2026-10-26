const previewDomains = [
  { name: "Governance", value: 74 },
  { name: "Detection", value: 58 },
  { name: "Response", value: 42 },
];
export function SnapshotPreview({ compact = false, story = false }: { compact?: boolean; story?: boolean }) {
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
