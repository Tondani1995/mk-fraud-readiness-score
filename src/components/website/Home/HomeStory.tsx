"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { CAPABILITIES } from "@/lib/website/capabilities";
import { CtaLink } from "@/components/website/primitives/CtaLink";
import { SnapshotPreview } from "@/components/website/SnapshotPreview";
import styles from "./HomeStory.module.css";
import motion from "@/components/ui/motion.module.css";

const views = ["Exposure", "Controls", "MK support", "Snapshot"];
const anchors = [
  "home-hero-heading",
  "home-problem-heading",
  "home-capabilities-heading",
  "home-fraud-readiness-heading",
];
const lanes = [
  ["Finance", "Payment approvals"],
  ["People", "Access & authority"],
  ["Procurement", "Supplier checks"],
  ["Digital channels", "Identity & onboarding"],
  ["Governance", "Ownership & oversight"],
];
const captions = [
  "Fraud-relevant decisions sit across the organisation. Familiar processes are a starting point for examining their control context.",
  "Each process is paired with an example control context. Management can examine what is covered, what is evidenced and what falls between teams.",
  "Assess, Build, Enable and Monitor are independent points of entry. The management question determines the support required.",
  "A private Snapshot presents the recorded readiness position, findings and management priorities. The values shown here are illustrative.",
];

/** Server-readable narrative, enhanced by a single optional sticky conceptual companion. */
export function HomeStory({
  composition = "story",
}: {
  composition?: "story" | "board";
}) {
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (composition !== "story") return;
    const desktop = window.matchMedia("(min-width:1100px) and (min-height:800px)");
    const headings = [...(root.current?.querySelectorAll<HTMLElement>("[data-story-heading]") ?? [])];
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!desktop.matches) return;
      let next = 0;
      headings.forEach((heading, index) => {
        if (heading.getBoundingClientRect().top <= window.innerHeight * 0.4) next = index;
      });
      setActive(next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [composition]);
  const panel = (
    <figure
      className="m-0 min-w-0 rounded-panel border border-mk-navy bg-mk-navy p-5 text-white sm:p-6"
      aria-label="Illustration of MK's approach to fraud risk"
      data-story-active={active}
    >
      <div className="flex flex-wrap justify-between gap-2 border-b border-white/25 pb-4 text-xs">
        <span className="font-semibold uppercase tracking-[.12em]">
          The management view
        </span>
        <span className="text-white/80">MK / Fraud Readiness</span>
      </div>
      <div
        className="my-4 grid grid-cols-4 gap-2"
        role="group"
        aria-label="Explore the MK method"
      >
        {views.map((view, index) => (
          <button
            key={view}
            type="button"
            aria-pressed={active === index}
            aria-controls={panelId}
            onClick={() => setActive(index)}
            className={`min-h-11 rounded-brand border px-2 py-2 text-xs font-medium transition-colors duration-150 focus-visible:!outline-white ${active === index ? "border-white bg-white text-mk-navy" : "border-white/35 text-white hover:bg-white/10"}`}
          >
            {view}
          </button>
        ))}
      </div>
      <div id={panelId} key={active} className={motion.arrive}>
        {active < 2 ? (
          <>
            <div className="mb-2 grid grid-cols-[minmax(0,1fr)_20px_minmax(0,1.1fr)] text-xs text-white/80">
              <span>Process</span>
              <span />
              <span>Control context</span>
            </div>
            <ul
              className="space-y-2"
              aria-label="Illustrative processes and control contexts"
            >
              {lanes.map(([process, control]) => (
                <li
                  key={process}
                  className="grid grid-cols-[minmax(0,1fr)_20px_minmax(0,1.1fr)] items-stretch text-[13px] leading-relaxed"
                >
                  <span
                    className={`flex items-center rounded-[14px] border px-3 py-2.5 ${active === 0 ? "border-white/65 bg-white/10" : "border-white/25"}`}
                  >
                    {process}
                  </span>
                  <span
                    aria-hidden="true"
                    className="relative flex items-center"
                  >
                    <i className="h-px w-full bg-white/50" />
                    <i className="absolute left-1/2 h-2 w-2 -translate-x-1/2 rounded-sm bg-white" />
                  </span>
                  <span
                    className={`flex items-center rounded-[14px] border px-3 py-2.5 ${active === 1 ? "border-white/65 bg-white/10" : "border-white/25"}`}
                  >
                    {control}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : active === 2 ? (
          <ul className="grid gap-2" aria-label="MK capabilities">
            {CAPABILITIES.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/services#${c.id}`}
                  className="grid grid-cols-[80px_1fr_auto] items-start gap-3 rounded-brand border border-white/30 px-3 py-3 text-sm transition-colors hover:bg-white/10 focus-visible:!outline-white"
                >
                  <b className="font-semibold">{c.name}</b>
                  <span className="text-xs leading-relaxed text-white/90">
                    {c.question}
                  </span>
                  <span aria-hidden="true">↗</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <SnapshotPreview story />
        )}
        {active !== 3 && <p className="mt-4 text-sm leading-relaxed text-white/90">
          {captions[active]}
        </p>}
      </div>
      <figcaption className="mt-4 border-t border-white/25 pt-3 text-xs leading-relaxed text-white/80">
        Method illustration using example processes and controls. This is not an
        assessment result.
      </figcaption>
    </figure>
  );
  const opening = (
    <section
      className={styles.storySection}
      aria-labelledby="home-hero-heading"
    >
      <p className="text-xs font-semibold uppercase tracking-[.12em] text-mk-muted">
        Independent fraud risk advisory
      </p>
      <h1
        id="home-hero-heading"
        data-story-heading
        className="mt-5 max-w-[24ch] text-[34px] font-medium leading-[1.2] tracking-normal text-mk-navy sm:text-[46px] 2xl:text-[52px]"
      >
        Turn fraud readiness into a management decision.
      </h1>
      <p className="mt-5 max-w-[65ch] text-base leading-relaxed text-mk-muted sm:text-lg">
        We help South African organisations understand where their fraud
        exposure sits, whether existing controls genuinely cover it, and what
        management should address first.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <CtaLink
          href="/score/start"
          ctaName="assess_your_organisation"
          placement="home_hero"
        >
          Assess your organisation
        </CtaLink>
        <CtaLink
          href="/contact"
          variant="secondary"
          ctaName="speak_to_mk"
          placement="home_hero"
        >
          Speak to MK
        </CtaLink>
      </div>
      <p className="mt-4 max-w-[65ch] text-sm leading-relaxed text-mk-muted">
        The assessment is free, and your Snapshot is visible only to your
        organisation.
      </p>
    </section>
  );
  const problem = (
    <section
      className={`${styles.storySection} border-t border-mk-line pt-8`}
      aria-labelledby="home-problem-heading"
    >
      <p className="text-xs font-semibold uppercase tracking-[.12em] text-mk-muted">
        The management question
      </p>
      <h2
        id="home-problem-heading"
        data-story-heading
        className="mt-3 max-w-[27ch] text-[28px] font-medium leading-snug text-mk-navy sm:text-[34px]"
      >
        Controls are not the same as readiness.
      </h2>
      <p className="mt-4 text-base leading-relaxed text-mk-muted">
        Most organisations already have fraud-relevant controls spread across
        finance, operations, digital channels, risk and their third parties.
        Each one was designed for a local purpose, owned by a different team and
        reported in a different place.
      </p>
      <p className="mt-4 text-base leading-relaxed text-mk-muted">
        What is usually missing is the assembled view. Without it, leadership
        can say that controls exist but cannot say whether the organisation is
        ready.
      </p>
    </section>
  );
  const capabilities = (
    <section
      id="how-we-help"
      className={`${styles.storySection} border-t border-mk-line pt-8`}
      aria-labelledby="home-capabilities-heading"
    >
      <p className="text-xs font-semibold uppercase tracking-[.12em] text-mk-muted">
        How we help
      </p>
      <h2
        id="home-capabilities-heading"
        data-story-heading
        className="mt-3 text-[28px] font-medium leading-snug text-mk-navy sm:text-[34px]"
      >
        Four points of entry, each starting from a management question.
      </h2>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {CAPABILITIES.map((c) => (
          <li key={c.id}>
            <Link
              href={`/services#${c.id}`}
              className="group block h-full rounded-brand border border-mk-line p-4 transition-colors hover:border-mk-accent hover:bg-mk-surface"
            >
              <div className="flex justify-between gap-2 text-lg font-semibold text-mk-navy">
                <h3>{c.name}</h3>
                <span
                  aria-hidden="true"
                  className="transition-transform group-hover:translate-x-1"
                >
                  ↗
                </span>
              </div>
              <p className="mt-2 text-base leading-relaxed text-mk-muted">
                {c.question}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm leading-relaxed text-mk-muted">
        Fraud Readiness is our flagship assessment. Our practice extends to
        strategy, controls, training and ongoing monitoring.{" "}
        <Link href="/services" className="underline underline-offset-4">
          Explore the full service portfolio.
        </Link>
      </p>
    </section>
  );
  const product = (
    <section
      id="fraud-readiness"
      className={`${styles.storySection} border-t border-mk-line pt-8`}
      aria-labelledby="home-fraud-readiness-heading"
    >
      <p className="text-xs font-semibold uppercase tracking-[.12em] text-mk-muted">
        Flagship assessment
      </p>
      <h2
        id="home-fraud-readiness-heading"
        data-story-heading
        className="mt-3 text-[28px] font-medium text-mk-navy sm:text-[34px]"
      >
        Fraud Readiness
      </h2>
      <p className="mt-4 text-base leading-relaxed text-mk-muted">
        Fraud Readiness is MK&apos;s structured way of making organisational
        fraud exposure visible, measurable and discussable at management level.
        It starts with a free assessment, and the organisation decides how far
        to take it.
      </p>
      <div className={styles.inlineProof}><SnapshotPreview story /></div>
      <ol className="mt-5 grid gap-3 sm:grid-cols-2">
        {[
          [
            "Structured assessment",
            "Leadership answers a tailored set of questions about how fraud risk is governed, prevented, detected and handled.",
          ],
          [
            "Private readiness Snapshot",
            "An immediate, confidential view of where readiness appears stronger and where gaps may deserve attention.",
          ],
          [
            "Fuller analysis and formal reporting",
            "Where the Snapshot raises questions, a detailed report sets out the position in a form management can act on.",
          ],
          [
            "Prioritisation and remediation",
            "MK can help decide what to fix first and support the work through an advisory engagement.",
          ],
        ].map(([title, body], index) => (
          <li key={title} className="border-l-2 border-mk-accent pl-4">
            <p className="text-xs text-mk-muted">{index + 1}</p>
            <h3 className="mt-1 text-base font-semibold text-mk-navy">
              {title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-mk-muted">{body}</p>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <CtaLink
          href="/score/start"
          ctaName="start_fraud_readiness_assessment"
          placement="home_fraud_readiness"
        >
          Start the Fraud Readiness Assessment
        </CtaLink>
        <Link
          href="/fraud-readiness"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-mk-accent underline underline-offset-4"
        >
          Reports and options
        </Link>
      </div>
    </section>
  );
  if (composition === "board")
    return (
      <div ref={root} className="mx-auto max-w-[1600px] px-5 py-8 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
          {opening}
          {panel}
        </div>
        <div className="mt-10 grid gap-8 lg:grid-cols-[.8fr_1.2fr]">
          {problem}
          {capabilities}
        </div>
        <div className="mt-10">{product}</div>
      </div>
    );
  return (
    <div
      ref={root}
      className={`${styles.story} mx-auto max-w-[1600px] gap-8 px-5 py-8 sm:px-8 lg:gap-10 min-[1600px]:gap-16`}
    >
      <div className="min-w-0">
        {opening}
      </div>
      <aside
        className={styles.companion}
        aria-label="Conceptual management view"
      >
        <div className={styles.stickyCompanion}>
          {panel}
          <p className={`${styles.companionHint} mt-3 text-xs leading-relaxed text-mk-muted`}>
            The companion follows the narrative. You can also explore each view
            directly.
          </p>
        </div>
      </aside>
      <div className="min-w-0">{problem}</div>
      <div className="min-w-0">{capabilities}</div>
      <div className="min-w-0">{product}</div>
    </div>
  );
}
