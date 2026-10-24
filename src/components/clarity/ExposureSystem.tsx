"use client";

import { useState } from "react";

const stages = [
  {
    name: "Exposure",
    title: "The parts are familiar.",
    body: "Fraud-relevant decisions sit across the organisation. Seeing each part is only the beginning.",
  },
  {
    name: "Controls",
    title: "The connections matter.",
    body: "Bring exposure and controls into the same view. Ask what is covered, what is evidenced and what falls between teams.",
  },
  {
    name: "Decisions",
    title: "A clearer management view.",
    body: "Understand where exposure sits, which gaps need attention and who should own the next step.",
  },
];
const lanes = [
  ["Finance", "Payment approvals"],
  ["People", "Access & authority"],
  ["Procurement", "Supplier checks"],
  ["Digital channels", "Identity & onboarding"],
  ["Governance", "Ownership & oversight"],
];

/** A method illustration, with no scores or assessment findings. */
export function ExposureSystem() {
  const [stage, setStage] = useState(1);
  return (
    <figure
      className="exposure-system"
      data-stage={stage}
      aria-label="Interactive illustration of MK's approach to fraud risk"
    >
      <div className="system-meta">
        <span>
          <i /> THE MK LENS
        </span>
        <span>METHOD ILLUSTRATION</span>
      </div>
      <div className="system-column-labels">
        <span>ORGANISATIONAL PROCESS</span>
        <span>CONTROL CONTEXT</span>
      </div>
      <div className="system-lanes">
        {lanes.map(([name, control], i) => (
          <div
            className="system-lane"
            key={name}
            style={{ "--lane": i } as React.CSSProperties}
          >
            <span className="lane-number">0{i + 1}</span>
            <span className="lane-name">{name}</span>
            <span className="lane-connection" aria-hidden="true">
              <i />
            </span>
            <span className="lane-control">{control}</span>
            <span className="lane-terminal" aria-hidden="true" />
          </div>
        ))}
      </div>
      <div className="system-outcome" aria-live="polite">
        <span className="outcome-symbol" aria-hidden="true">
          ↗
        </span>
        <div>
          <strong>{stages[stage].title}</strong>
          <p>{stages[stage].body}</p>
        </div>
      </div>
      <div className="system-selector" role="group" aria-label="Explore the MK method">
        {stages.map((s, i) => (
          <button
            key={s.name}
            type="button"
            aria-pressed={stage === i}
            onClick={() => setStage(i)}
          >
            <span>0{i + 1}</span>
            {s.name}
            <span aria-hidden="true">{stage === i ? "↗" : "→"}</span>
          </button>
        ))}
      </div>
      <figcaption>From fragmented exposure to management clarity.</figcaption>
    </figure>
  );
}
