"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CAPABILITIES } from "@/lib/website/capabilities";
import { CtaLink } from "@/components/website/primitives/CtaLink";
import { SnapshotPreview } from "@/components/website/SnapshotPreview";
import { readinessTrack } from "@/lib/website/readiness-track";
import { REVIEW_JOURNEY } from "@/lib/website/review-track-copy";
import { MkMark } from "@/components/website/marks/MkMark";
import { ManagementView } from "./ManagementView";
import styles from "./HomeStory.module.css";

const reviewTrack = readinessTrack() === "review";

/**
 * Server-readable narrative with one sticky management view beside it on desktop. On smaller
 * screens the view follows the opening so the visitor meets it before the detail.
 */
export function HomeStory({
  composition = "story",
}: {
  composition?: "story" | "board";
}) {
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (composition !== "story") return;
    // Scroll follows the narrative only where the view is sticky beside it.
    const sticky = window.matchMedia("(min-width:1024px) and (min-height:640px)");
    const headings = [...(root.current?.querySelectorAll<HTMLElement>("[data-story-heading]") ?? [])];
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!sticky.matches) return;
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
  const panel = <ManagementView active={active} onSelect={setActive} />;
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
        className="mk-display mt-5 max-w-[17ch] font-medium text-mk-navy"
      >
        Turn fraud readiness into a management decision.
      </h1>
      <p className="mk-measure mt-6 text-base leading-relaxed text-mk-muted sm:text-lg">
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
        className="mk-heading mt-3 max-w-[22ch] font-medium text-mk-navy"
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
        className="mk-heading mt-3 max-w-[24ch] font-medium text-mk-navy"
      >
        Four points of entry, each starting from a management question.
      </h2>
      <ul className="mt-6 grid gap-x-10 sm:grid-cols-2">
        {CAPABILITIES.map((c) => (
          <li key={c.id} className="border-t border-mk-line">
            <Link
              href={`/services#${c.id}`}
              className="group block h-full py-5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-mk-navy"
            >
              <span className="flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-mk-navy">{c.name}</h3>
                <span className="text-mk-accent transition-transform duration-300 group-hover:translate-x-1">
                  <MkMark name="arrow" />
                </span>
              </span>
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
        className="mk-heading mt-3 font-medium text-mk-navy"
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
        {(reviewTrack ? REVIEW_JOURNEY : [
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
        ]).map(([title, body], index) => (
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
      <div ref={root} className="mk-frame py-8">
        <div className="mk-split">
          {opening}
          {panel}
        </div>
        <div className="mt-10 mk-split">
          {problem}
          {capabilities}
        </div>
        <div className="mt-10">{product}</div>
      </div>
    );
  return (
    <div ref={root} className={`${styles.story} mk-frame`}>
      <div className="min-w-0">{opening}</div>
      <aside className={styles.companion} aria-label="Conceptual management view">
        <div className={styles.stickyCompanion}>{panel}</div>
      </aside>
      <div className="min-w-0">{problem}</div>
      <div className="min-w-0">{capabilities}</div>
      <div className="min-w-0">{product}</div>
    </div>
  );
}
