"use client";
import { useState } from "react";

const stages = [
  {
    name: "Exposure",
    body: "Fraud-relevant decisions sit across the organisation. The illustration locates familiar processes before considering their control context.",
  },
  {
    name: "Controls",
    body: "Each process is paired with an example control context. Management can examine what is covered, what is evidenced and what falls between teams.",
  },
  {
    name: "Decisions",
    body: "A shared view helps management frame which gaps need attention and who should own the next step.",
  },
];
const lanes = [
  ["Finance", "Payment approvals"],
  ["People", "Access & authority"],
  ["Procurement", "Supplier checks"],
  ["Digital channels", "Identity & onboarding"],
  ["Governance", "Ownership & oversight"],
];

/** Conceptual process/control pairs only. Never customer data, a score or a risk dependency map. */
export function ExposureSystem() {
  const [stage, setStage] = useState(1);
  return (
    <figure
      className="relative min-w-0 overflow-hidden rounded-panel border border-mk-navy bg-mk-navy p-5 text-white shadow-soft sm:p-7"
      aria-label="Illustration of MK's approach to fraud risk"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/20 pb-5">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-white">
          The management view
        </span>
        <span className="text-xs text-white/75">MK / Fraud Readiness</span>
      </div>
      <div
        className="mb-3 mt-6 grid grid-cols-[minmax(0,1.05fr)_24px_minmax(0,1fr)] text-[12px] text-white/75 sm:grid-cols-[minmax(0,0.85fr)_44px_minmax(0,1.15fr)]"
        aria-hidden="true"
      >
        <span>Process</span>
        <span />
        <span>Control context</span>
      </div>
      <ul
        className="space-y-3"
        aria-label="Illustrative processes and control contexts"
      >
        {lanes.map(([process, control]) => (
          <li
            key={process}
            className="grid grid-cols-[minmax(0,1.05fr)_24px_minmax(0,1fr)] items-center sm:grid-cols-[minmax(0,0.85fr)_44px_minmax(0,1.15fr)]"
          >
            <span
              className={`min-w-0 rounded-brand border px-3 py-3 text-[13px] leading-relaxed ${stage === 0 ? "border-white/60 bg-white/10" : "border-white/20"}`}
            >
              {process}
            </span>
            <span
              className="relative flex h-10 items-center"
              aria-hidden="true"
            >
              <span className="h-px w-full bg-white/35" />
              <span className="absolute left-1/2 h-3 w-3 -translate-x-1/2 rounded-[4px] border-2 border-mk-navy bg-white" />
            </span>
            <span
              className={`min-w-0 rounded-brand border px-3 py-3 text-[13px] leading-relaxed ${stage === 1 ? "border-white/60 bg-white/10" : "border-white/20"}`}
            >
              {control}
            </span>
          </li>
        ))}
      </ul>
      <div
        className="mt-6 grid grid-cols-3 gap-2"
        role="group"
        aria-label="Explore the MK method"
      >
        {stages.map((item, index) => (
          <button
            key={item.name}
            type="button"
            aria-pressed={stage === index}
            onClick={() => setStage(index)}
            className={`min-h-11 rounded-brand border px-2 py-3 text-xs font-medium focus-visible:outline-white ${stage === index ? "border-white bg-white text-mk-navy" : "border-white/25 text-white hover:border-white/60"}`}
          >
            {item.name}
          </button>
        ))}
      </div>
      <p
        className="mt-5 min-h-[6.5em] text-sm leading-relaxed text-white/85"
        aria-live="polite"
      >
        {stages[stage].body}
      </p>
      <figcaption className="mt-4 border-t border-white/20 pt-4 text-xs leading-relaxed text-white/75">
        Method illustration using example processes and controls. This is not an
        assessment result.
      </figcaption>
    </figure>
  );
}
