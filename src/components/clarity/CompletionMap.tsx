/** Completion only. This device must never encode a readiness score or inferred finding. */
export function CompletionMap({ progress }: { progress: number }) {
  const completion = Math.max(
    0,
    Math.min(100, Number.isFinite(progress) ? progress : 0),
  );
  return (
    <div aria-hidden="true" data-completion-map>
      <div className="completion-map-label">
        <span>ASSEMBLING YOUR ORGANISATION’S PICTURE</span>
        <span>COMPLETION ONLY</span>
      </div>
      <div className="completion-map">
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i}>
            <i
              style={{
                width: `${Math.max(0, Math.min(100, completion * 8 - i * 100))}%`,
              }}
            />
          </span>
        ))}
      </div>
    </div>
  );
}
