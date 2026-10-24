export default function ProblemSection() {
  return (
    <section className="clarity-problem" aria-labelledby="home-problem-heading">
      <div className="clarity-container problem-layout">
        <p className="clarity-eyebrow">02 / THE MISSING VIEW</p>
        <div>
          <h2 id="home-problem-heading">
            A control can exist.
            <br />
            <em>And a gap can remain.</em>
          </h2>
          <div className="problem-text">
            <p>
              Payment approvals. Supplier checks. Access permissions. Most
              organisations already have fraud-relevant controls. They sit in
              different teams, designed for different purposes.
            </p>
            <p>
              MK examines how those parts fit together, so leadership can
              understand the exposure, challenge false comfort and decide what
              needs attention.
            </p>
          </div>
          <div className="clarity-equation">
            <span>EXPOSURE</span>
            <b>+</b>
            <span>CONTROL REALITY</span>
            <b>→</b>
            <strong>MANAGEMENT CLARITY</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
