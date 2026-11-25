"use client";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import Link from "next/link";
import example from "@/lib/readiness-review/fixtures/preview-example.json";
import { CAPABILITIES } from "@/lib/website/capabilities";
import { readinessTrack } from "@/lib/website/readiness-track";
import { REVIEW_PREVIEW_CAPTION } from "@/lib/website/review-track-copy";
import styles from "./ManagementView.module.css";

/**
 * The management view: one architectural illustration seen from four perspectives.
 *
 * The drawing is the lane diagram from the MK corporate profile (page 2): each fraud-relevant
 * process is a hairline lane, everyday decisions are ticks along it, and a single sage bracket
 * gathers the lanes into one management view. The same elements persist across all four states
 * and are repositioned with transform and opacity only, so a state change never moves the page.
 *
 * Every figure is illustrative. The Snapshot readout uses the fictional example produced by the
 * review engine (`preview-example.json`) on the review track, and the long-standing illustrative
 * example on the scored track; nothing here represents an assessment, a test of controls or
 * independent assurance.
 */

export const VIEWS = ["Exposure", "Controls", "MK support", "Snapshot"] as const;

/** Process, the fraud-relevant decision inside it, its control context, and where it sits on the lane. */
const LANES = [
  { process: "Finance", decision: "Releasing a payment", control: "Payment approvals", x: 0.62, phase: 0.1 },
  { process: "People", decision: "Delegating authority", control: "Access & authority", x: 0.36, phase: 0.55 },
  { process: "Procurement", decision: "Appointing a supplier", control: "Supplier checks", x: 0.78, phase: 0.3 },
  { process: "Digital channels", decision: "Onboarding a customer", control: "Identity & onboarding", x: 0.56, phase: 0.8 },
  { process: "Governance", decision: "Permitting an exception", control: "Ownership & oversight", x: 0.24, phase: 0.45 },
] as const;

/** Positions of the four capability rules across the drawing. Equal standing, no sequence marks. */
const RULES = [0.14, 0.38, 0.62, 0.86];
const TICKS = 6;

const REVIEW = readinessTrack() === "review";

const CAPTIONS = [
  "Fraud-relevant decisions sit inside ordinary processes across the organisation. Each is defensible on its own terms, and together they shape where the organisation is exposed.",
  "Each process carries its own controls, owned by different teams. Having controls is not the same as knowing whether, together, they cover the exposure. These are examples and have not been tested.",
  "",
  REVIEW
    ? REVIEW_PREVIEW_CAPTION
    : "A private Snapshot brings the separate lanes into one management view: the recorded readiness position, findings and management priorities. The values shown here are illustrative.",
];

type ReadoutItem = { figure: string; text: string };
type Readout = {
  label: string;
  items: ReadoutItem[];
  rows?: { name: string; value: number }[];
  note?: { title: string; body: string };
};
const READOUT: Readout = REVIEW
  ? {
      label: "Fictional example",
      items: [
        { figure: String(example.counts["reported-gaps"].value), text: "of 51 controls reported as a gap" },
        { figure: String(example.counts["open-scenarios"].value), text: "of 90 material scenarios still open" },
      ],
      note: example.exampleGap ? { title: example.exampleGap.title, body: example.exampleGap.state } : undefined,
    }
  : {
      // The scored track keeps the long-standing illustrative example used by SnapshotPreview.
      label: "Illustrative example",
      items: [{ figure: "Structured", text: "example position" }],
      rows: [
        { name: "Governance", value: 74 },
        { name: "Detection", value: 58 },
        { name: "Response", value: 42 },
      ],
      note: { title: "Clarify response ownership", body: "Example priority action" },
    };

export function ManagementView({
  active,
  onSelect,
}: {
  active: number;
  onSelect: (index: number) => void;
}) {
  const base = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ x: number; w: number } | null>(null);
  const figureRef = useRef<HTMLElement>(null);
  // Server markup arrives undrawn; the lanes draw themselves in when the view first enters the viewport.
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const node = figureRef.current;
    if (!node || typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDrawn(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setDrawn(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const measure = useCallback(() => {
    const tab = tabRefs.current[active];
    const list = listRef.current;
    if (!tab || !list) return;
    const label = tab.querySelector<HTMLElement>("[data-label]") ?? tab;
    const a = label.getBoundingClientRect();
    const b = list.getBoundingClientRect();
    setIndicator({ x: a.left - b.left, w: a.width });
  }, [active]);

  useLayoutEffect(measure, [measure]);
  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => observer.disconnect();
  }, [measure]);

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const last = VIEWS.length - 1;
    const next =
      event.key === "ArrowRight" ? (active === last ? 0 : active + 1)
      : event.key === "ArrowLeft" ? (active === 0 ? last : active - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    onSelect(next);
    tabRefs.current[next]?.focus();
  };

  const panelId = `${base}-panel`;
  return (
    <figure
      ref={figureRef}
      className={styles.view}
      data-drawn={drawn}
      aria-label="Illustration of MK's approach to fraud risk"
      data-management-view
      data-story-active={active}
      data-state={active}
    >
      <noscript>
        <style>{`[data-management-view][data-drawn="false"] li{--len:1!important}[data-management-view][data-drawn="false"] li>span[aria-hidden]{opacity:1!important}`}</style>
      </noscript>
      <p className={styles.eyebrow}>The management view</p>
      <div ref={listRef} role="tablist" aria-label="Perspectives on fraud readiness" className={styles.tabs} onKeyDown={onKey}>
        {VIEWS.map((view, index) => (
          <button
            key={view}
            ref={(node) => {
              tabRefs.current[index] = node;
            }}
            id={`${base}-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={active === index}
            aria-controls={panelId}
            tabIndex={active === index ? 0 : -1}
            onClick={() => onSelect(index)}
            className={styles.tab}
          >
            <span data-label data-text={view}>{view}</span>
          </button>
        ))}
        <span
          aria-hidden="true"
          className={styles.indicator}
          style={indicator ? ({ "--ix": `${indicator.x}px`, "--iw": indicator.w } as CSSProperties) : { opacity: 0 }}
        />
      </div>

      <div id={panelId} role="tabpanel" aria-labelledby={`${base}-tab-${active}`} className={styles.panel}>
        <div className={styles.stage}>
          <ul className={styles.lanes} aria-label="Example processes">
            {LANES.map((lane, i) => (
              <li
                key={lane.process}
                className={styles.lane}
                style={{ "--i": i, "--x": lane.x, "--anchor": lane.x >= 0.5 ? "-100%" : "0%", "--nudge": lane.x >= 0.5 ? "5px" : "-5px" } as CSSProperties}
              >
                <span className={styles.process}>{lane.process}</span>
                <span className={styles.track} aria-hidden="true">
                  <i className={styles.rule} />
                  <i className={styles.dash} />
                  {Array.from({ length: TICKS }, (_, k) => (
                    <i key={k} className={styles.tick} style={{ "--t": (k + lane.phase) / TICKS, "--k": k } as CSSProperties} />
                  ))}
                  <i className={styles.ring} />
                  <i className={styles.node} />
                </span>
                <span className={styles.point}>
                  <span className={styles.decision}>{lane.decision}</span>
                  <span className={styles.control}>{lane.control}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className={styles.rules}>
            {CAPABILITIES.map((capability, i) => (
              <div key={capability.id} className={styles.capability} style={{ "--r": RULES[i], "--j": i } as CSSProperties}>
                <Link href={`/services#${capability.id}`} className={styles.capabilityLink} tabIndex={active === 2 ? 0 : -1}>
                  {capability.name}
                  <span className={styles.srOnly}>: {capability.question}</span>
                </Link>
                <i aria-hidden="true" className={styles.capabilityRule} />
                {LANES.map((lane, li) => (
                  <i key={lane.process} aria-hidden="true" className={styles.crossing} style={{ "--li": li } as CSSProperties} />
                ))}
              </div>
            ))}
          </div>

          <i aria-hidden="true" className={styles.bracket} />
          <div className={styles.readout}>
            <p className={styles.readoutLabel}>{READOUT.label}</p>
            <dl>
              {READOUT.items.map((item, i) => (
                <div key={item.text} className={styles.readoutItem} style={{ "--j": i } as CSSProperties}>
                  <dt className={styles.figure} data-long={item.figure.length > 4 || undefined}>{item.figure}</dt>
                  <dd>{item.text}</dd>
                </div>
              ))}
            </dl>
            {READOUT.rows && (
              <dl className={`${styles.readoutItem} ${styles.readoutRows}`} style={{ "--j": 1 } as CSSProperties}>
                {READOUT.rows.map((row) => (
                  <div key={row.name}>
                    <dt>{row.name}</dt>
                    <dd>
                      {row.value}
                      <span>/100</span>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {READOUT.note && (
              <p className={styles.readoutNote}>
                <span>{READOUT.note.body}</span>
                <strong>{READOUT.note.title}</strong>
              </p>
            )}
          </div>
        </div>

        <div className={styles.captions}>
          {CAPTIONS.map((caption, i) =>
            i === 2 ? (
              <div key={i} className={styles.caption} data-for={i}>
                <p>Assess, Build, Enable and Monitor are independent points of entry. The management question decides where MK starts.</p>
                <dl className={styles.questions}>
                  {CAPABILITIES.map((c) => (
                    <div key={c.id}>
                      <dt>{c.name}</dt>
                      <dd>{c.question}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : (
              <div key={i} className={styles.caption} data-for={i}>
                <p>{caption}</p>
                {i === 3 && (
                  <Link href="#fraud-readiness" className={styles.captionLink} tabIndex={active === 3 ? 0 : -1}>
                    How Fraud Readiness works
                  </Link>
                )}
              </div>
            ),
          )}
        </div>
      </div>

      <figcaption className={styles.figcaption}>
        Method illustration using example processes and controls. This is not an assessment result.
      </figcaption>
    </figure>
  );
}
