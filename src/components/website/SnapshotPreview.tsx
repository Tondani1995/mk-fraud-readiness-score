const previewDomains = [
  { name: "Governance", value: 74 },
  { name: "Detection", value: 58 },
  { name: "Response", value: 42 },
];
export function SnapshotPreview({ compact = false }: { compact?: boolean }) {
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
