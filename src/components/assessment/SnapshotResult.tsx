'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ScoreGauge } from '@/components/assessment/ScoreGauge';
import { ProductChoice } from '@/components/products/ProductChoice';
import type { CommercialSnapshotInsights } from '@/lib/snapshot/commercial-insights';
import type { FreeSnapshot } from '@/lib/snapshot/free-snapshot';
import type { SnapshotNarrative } from '@/lib/snapshot/narrative';
import { buildMinimalSafeSnapshotNarrativeContent } from '@/lib/snapshot/deterministic-narrative';
import { buildFalseComfortPairing, buildGapInventory } from '@/lib/snapshot/gap-inventory';
import { buildNextStepRecommendation } from '@/lib/snapshot/next-step-recommendation';
import {
  INVENTORY_HEADING,
  INVENTORY_TABLE_LABEL,
  METHODOLOGY_DISCLOSURE,
  ORDER_RELEASE_NOTE,
  WHAT_HAPPENS_NEXT,
  factStrip,
  fairnessLine,
  inventoryBody,
  inventoryDefinition,
  meaningHeading,
  tensionLine
} from '@/lib/snapshot/result-copy';

const SCORE_BASE_PATH = '/score';

const SECTIONS = [
  { id: 'position', label: 'Your position' },
  { id: 'meaning', label: 'What this means' },
  { id: 'attention', label: 'What needs attention' },
  { id: 'next-step', label: 'Your next step' }
] as const;

function scorePath(path: string) {
  return `${SCORE_BASE_PATH}${path.startsWith('/') ? path : `/${path}`}`;
}

function snapshotTokenFromUrl(snapshotUrl?: string | null) {
  try {
    if (snapshotUrl) return new URL(snapshotUrl, window.location.origin).searchParams.get('token');
    return new URL(window.location.href).searchParams.get('token');
  } catch {
    return null;
  }
}

function formatScoredAt(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

export function SnapshotResult({
  snapshot,
  snapshotUrl,
  commercialInsights,
  snapshotNarrative,
  methodologyLabel,
  visualReview = false
}: {
  snapshot: FreeSnapshot;
  snapshotUrl?: string | null;
  commercialInsights: CommercialSnapshotInsights;
  snapshotNarrative?: SnapshotNarrative;
  methodologyLabel?: string | null;
  /** Preview-only fixture mode. It never changes the normal customer result path. */
  visualReview?: boolean;
}) {
  // The normal server path supplies a fully validated narrative. If that optional layer is
  // unavailable, render only the minimal customer-safe copy while keeping the authoritative
  // result shell below it available.
  const narrative = snapshotNarrative ?? buildMinimalSafeSnapshotNarrativeContent();

  const inventory = buildGapInventory(snapshot);
  const pairing = buildFalseComfortPairing(snapshot);
  const recommendation = buildNextStepRecommendation(snapshot);
  const areaCount = snapshot.domains.filter((d) => d.rawScore !== null && d.coveragePct > 0).length;
  const facts = factStrip(snapshot, areaCount);
  const fairness = fairnessLine(snapshot);
  const scoredAt = formatScoredAt(snapshot.scoredAt);

  return (
    <>
      <VerdictHero snapshot={snapshot} narrative={narrative} methodologyLabel={methodologyLabel} scoredAt={scoredAt} />

      <section aria-label="Assessment coverage figures" className="border-b border-mk-line bg-mk-surface">
        <div className="mx-auto grid max-w-[1120px] grid-cols-2 md:grid-cols-4">
          {facts.map((fact, index) => (
            <div
              key={fact.label}
              className={`px-[18px] py-3 md:px-5 ${index % 2 === 1 ? '' : 'border-r border-mk-line'} ${index < 2 ? 'border-b md:border-b-0' : ''} border-mk-line md:border-r md:last:border-r-0`}
            >
              <p className="text-[9px] uppercase tracking-[0.14em] text-mk-muted">{fact.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-mk-navy">{fact.value}</p>
            </div>
          ))}
        </div>
      </section>

      <SectionRail />

      <TrackedSection
        snapshot={snapshot}
        snapshotUrl={snapshotUrl}
        eventType="executive_summary_viewed"
        sourceSection="result_meaning"
        id="meaning"
        className="scroll-mt-28 border-b border-mk-line bg-mk-paper"
      >
        <div className="mx-auto grid max-w-[1120px] gap-8 px-[18px] py-12 md:grid-cols-12 md:px-6 md:py-16">
          <div className="md:col-span-7">
            <p className="text-[9.5px] uppercase tracking-[0.2em] text-mk-accent">What this means</p>
            <h2 className="mt-2.5 max-w-[22ch] text-[22px] font-semibold leading-tight tracking-tight text-mk-navy md:text-[28px]">
              {meaningHeading(snapshot)}
            </h2>
            <p className="mt-4 max-w-[62ch] text-[15px] leading-7 text-mk-slate md:text-base">{commercialInsights.riskImplication}</p>
            <div aria-hidden="true" className="mt-6 h-px w-[120px] bg-mk-accent/40" />
            {fairness ? <p className="mt-3 max-w-[62ch] text-sm leading-6 text-mk-muted">{fairness}</p> : null}
          </div>
          <div className="md:col-span-5 md:col-start-9">
            <dl className="border border-mk-line">
              {snapshot.capApplied && snapshot.calculatedMaturity ? (
                <>
                  <CountRow label="Calculated" value={snapshot.calculatedMaturity} />
                  <CountRow label="Recorded" value={snapshot.finalMaturity ?? 'Not recorded'} />
                </>
              ) : null}
              <CountRow label="Critical-control gaps" value={String(snapshot.criticalGapCount)} />
              <CountRow label="Major gaps" value={String(snapshot.majorGapCount)} last />
            </dl>
          </div>
        </div>
      </TrackedSection>

      <section id="attention" className="scroll-mt-28 border-b border-mk-line bg-mk-surface">
        <div className="mx-auto max-w-[1120px] px-[18px] py-12 md:px-6 md:py-16">
          <p className="text-[9.5px] uppercase tracking-[0.2em] text-mk-accent">What needs attention</p>
          <h2 className="mt-2.5 text-[22px] font-semibold tracking-tight text-mk-navy md:text-[28px]">What stood out in your responses.</h2>
          <div className="mt-8 grid gap-8 md:grid-cols-3 md:gap-0">
            <AttentionColumn label="Your clearest foundation">
              <p className="text-[15px] leading-7 text-mk-slate">{narrative.strength}</p>
            </AttentionColumn>
            <AttentionColumn label="Needs attention first" divided>
              <ul className="flex flex-col gap-3">
                {narrative.prioritySignals.map((signal) => (
                  <li key={signal} className="flex gap-3 text-[15px] leading-7 text-mk-slate">
                    <span aria-hidden="true" className="mt-3 h-px w-2 shrink-0 bg-mk-accent" />
                    <span>{signal}</span>
                  </li>
                ))}
              </ul>
            </AttentionColumn>
            <AttentionColumn label="For leadership" divided>
              <p className="text-[15px] leading-7 text-mk-slate">{narrative.managementImplication}</p>
            </AttentionColumn>
          </div>
        </div>
      </section>

      <section id="covers" className="scroll-mt-28 border-b border-mk-line bg-mk-paper">
        <div className="mx-auto max-w-[1120px] px-[18px] py-12 md:px-6 md:py-16">
          <p className="text-[9.5px] uppercase tracking-[0.2em] text-mk-accent">What this Snapshot covers</p>
          <h2 className="mt-2.5 max-w-[26ch] text-[22px] font-semibold leading-tight tracking-tight text-mk-navy md:text-[28px]">
            {INVENTORY_HEADING}
          </h2>
          <p className="mt-4 max-w-[64ch] text-[15px] leading-7 text-mk-slate">{inventoryBody(inventory)}</p>

          {inventory.showsAreaTable ? (
            <div className="mt-8 max-w-[640px] overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">{INVENTORY_TABLE_LABEL}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="border-y border-mk-line py-2.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-mk-muted">
                      {INVENTORY_TABLE_LABEL}
                    </th>
                    <th scope="col" className="border-y border-mk-line py-2.5 text-right text-[9.5px] font-semibold uppercase tracking-[0.14em] text-mk-muted">
                      Gaps
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.rows.map((row) => (
                    <tr key={row.domainCode}>
                      <th scope="row" className="border-b border-mk-line py-2.5 pr-4 text-[13px] font-semibold text-mk-navy">{row.domainName}</th>
                      <td className="border-b border-mk-line py-2.5 text-right text-[13px] font-semibold tabular-nums text-mk-accent">{row.criticalGapCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 max-w-[62ch] text-xs leading-6 text-mk-muted">{inventoryDefinition(inventory)}</p>
            </div>
          ) : null}
        </div>
      </section>

      {pairing ? (
        <section aria-label="Worth noting" className="border-b border-mk-line bg-mk-surface">
          <div className="mx-auto max-w-[1120px] px-[18px] py-10 md:px-6 md:py-12">
            <p className="text-[9.5px] uppercase tracking-[0.2em] text-mk-accent">Worth noting</p>
            <p className="mt-3 max-w-[64ch] text-base leading-8 text-mk-navy">
              Your strongest recorded area, <strong className="font-semibold">{pairing.strongestDomainName}</strong>, sits directly against your weakest,{' '}
              <strong className="font-semibold">{pairing.weakestDomainName}</strong>. Fraud rarely tests a control in isolation; it operates where a strong
              control hands over to a weak one. Both detailed reports analyse that pairing.
            </p>
          </div>
        </section>
      ) : null}

      <ProductChoice
        snapshot={snapshot}
        snapshotUrl={snapshotUrl}
        recommendation={recommendation}
        visualReview={visualReview}
      />

      <section aria-label="What happens after you order" className="border-b border-mk-line bg-mk-surface">
        <div className="mx-auto max-w-[1120px] px-[18px] py-12 md:px-6 md:py-14">
          <p className="text-[9.5px] uppercase tracking-[0.2em] text-mk-accent">What happens after you order</p>
          <ol className="mt-6 grid gap-6 md:grid-cols-4">
            {WHAT_HAPPENS_NEXT.map((step, index) => (
              <li key={step} className="border-t border-mk-accent/40 pt-3">
                <span className="text-[10px] font-semibold tabular-nums tracking-[0.16em] text-mk-accent">{String(index + 1).padStart(2, '0')}</span>
                <p className="mt-1.5 text-sm leading-6 text-mk-slate">{step}</p>
              </li>
            ))}
          </ol>
          <p className="mt-7 max-w-[62ch] text-sm leading-6 text-mk-navy">{ORDER_RELEASE_NOTE}</p>
        </div>
      </section>

      <section id="methodology" className="scroll-mt-28 bg-mk-paper">
        <div className="mx-auto max-w-[1120px] px-[18px] py-10 md:px-6">
          <details className="border border-mk-line">
            <summary className="cursor-pointer list-none px-4 py-3.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-mk-accent focus:outline-none focus:ring-2 focus:ring-mk-accent focus:ring-offset-2">
              Methodology, scope and privacy
            </summary>
            <div className="flex flex-col gap-3 border-t border-mk-line px-4 py-4">
              {METHODOLOGY_DISCLOSURE.map((paragraph) => (
                <p key={paragraph} className="max-w-[68ch] text-sm leading-6 text-mk-muted">{paragraph}</p>
              ))}
            </div>
          </details>
        </div>
      </section>

      <MobileActionBar />
    </>
  );
}

function VerdictHero({
  snapshot,
  narrative,
  methodologyLabel,
  scoredAt
}: {
  snapshot: FreeSnapshot;
  narrative: { headline: string; executiveDiagnosis: string };
  methodologyLabel?: string | null;
  scoredAt: string | null;
}) {
  return (
    <section id="position" className="scroll-mt-28 bg-mk-navy text-white">
      <div className="mx-auto max-w-[1120px] px-[18px] py-6 md:px-6 md:py-[88px]">
        <div className="grid items-center gap-7 md:grid-cols-12 md:gap-12">
          {/* Mobile puts the gauge first: on a small screen the number is the hook, and there
              is no F-pattern to respect. Desktop reads the headline first. */}
          <div className="md:order-2 md:col-span-5">
            <p className="text-[9px] uppercase tracking-[0.2em] text-white/[.72] md:hidden">Your result: {snapshot.organisationName}</p>
            <div className="mt-3 md:mt-0">
              <ScoreGauge score={snapshot.overallScore} band={snapshot.finalMaturity} size="mobile" />
            </div>
            <p className="mx-auto mt-3.5 max-w-[31ch] text-[12.5px] leading-6 text-white/[.82] md:text-center">{tensionLine(snapshot)}</p>
          </div>

          <div className="md:order-1 md:col-span-7">
            <p className="hidden text-[10px] uppercase tracking-[0.2em] text-white/[.72] md:block">Your result: {snapshot.organisationName}</p>
            <h1 className="mt-3 max-w-[22ch] text-[25px] font-semibold leading-[1.16] tracking-tight text-white md:mt-3 md:text-[40px] md:leading-[1.14]">
              {narrative.headline}
            </h1>
            <p className="mt-3 max-w-[46ch] text-[14.5px] leading-[1.62] text-white/[.82] md:mt-3.5 md:text-lg md:leading-8">
              {narrative.executiveDiagnosis}
            </p>
            <div aria-hidden="true" className="mt-5 h-px w-[120px] bg-white/[.22] md:mt-6" />
            <p className="mt-3 text-[11px] leading-[1.65] text-white/[.62]">
              MK Fraud Readiness Score{methodologyLabel ? ` · ${methodologyLabel}` : ''}
              <br />
              Self-assessment{scoredAt ? ` · completed ${scoredAt}` : ''}
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5 md:mt-6">
              <a
                href="#meaning"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-white px-5 py-3 text-[13px] font-semibold text-mk-navy transition hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-mk-navy sm:w-auto"
              >
                See what needs attention
              </a>
              <a
                href="#next-step"
                className="inline-flex min-h-12 w-full items-center justify-center rounded-xl border-2 border-white/[.28] px-5 py-3 text-[13px] font-semibold text-white transition hover:border-white/50 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-mk-navy sm:w-auto"
              >
                Compare next steps
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CountRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 px-4 py-3 ${last ? '' : 'border-b border-mk-line'}`}>
      <dt className="text-[10px] uppercase tracking-[0.14em] text-mk-muted">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums text-mk-navy">{value}</dd>
    </div>
  );
}

function AttentionColumn({ label, children, divided = false }: { label: string; children: ReactNode; divided?: boolean }) {
  return (
    <div className={divided ? 'md:border-l md:border-mk-line md:pl-8' : 'md:pr-8'}>
      <h3 className="text-[9px] uppercase tracking-[0.14em] text-mk-muted">{label}</h3>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** Desktop orientation. Appears once the hero leaves the viewport; it is also the progress cue. */
function SectionRail() {
  const [active, setActive] = useState<string>('position');
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hero = document.getElementById('position');
    if (!hero || !('IntersectionObserver' in window)) return;
    const heroObserver = new IntersectionObserver(
      (entries) => entries.forEach((entry) => setVisible(!entry.isIntersecting)),
      { rootMargin: '-80px 0px 0px 0px' }
    );
    heroObserver.observe(hero);

    const sectionObserver = new IntersectionObserver(
      (entries) => {
        const shown = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (shown?.target.id) setActive(shown.target.id);
      },
      { rootMargin: '-45% 0px -45% 0px' }
    );
    SECTIONS.forEach((section) => {
      const node = document.getElementById(section.id);
      if (node) sectionObserver.observe(node);
    });
    return () => {
      heroObserver.disconnect();
      sectionObserver.disconnect();
    };
  }, []);

  return (
    <nav
      aria-label="Result sections"
      className={`sticky top-0 z-30 hidden border-b border-mk-line bg-mk-paper transition-opacity md:block ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
    >
      <div className="mx-auto flex h-11 max-w-[1120px] items-center justify-between gap-4 px-6">
        <ul className="flex gap-5 text-[11.5px] font-medium">
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                aria-current={active === section.id ? 'true' : undefined}
                className={
                  active === section.id
                    ? 'inline-block border-b-2 border-mk-accent pb-1 font-semibold text-mk-navy'
                    : 'inline-block border-b-2 border-transparent pb-1 text-mk-muted transition hover:text-mk-navy'
                }
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>
        <a href="#next-step" className="whitespace-nowrap text-[11.5px] font-semibold text-mk-accent hover:underline">
          Compare next steps →
        </a>
      </div>
    </nav>
  );
}

/**
 * Mobile's single persistent control. Contextual by scroll position, and hidden whenever the
 * control it duplicates is already on screen -- a CTA that repeats a visible button is clutter.
 */
function MobileActionBar() {
  const [state, setState] = useState<'hidden' | 'attention' | 'next'>('hidden');

  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const flags = { hero: true, choice: false };
    function apply() {
      if (flags.hero || flags.choice) setState('hidden');
      else setState('next');
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.target.id === 'position') flags.hero = entry.isIntersecting;
          if (entry.target.id === 'next-step') flags.choice = entry.isIntersecting;
        });
        apply();
      },
      { threshold: 0 }
    );
    ['position', 'next-step'].forEach((id) => {
      const node = document.getElementById(id);
      if (node) observer.observe(node);
    });
    return () => observer.disconnect();
  }, []);

  if (state === 'hidden') return null;

  return (
    <div className="sticky bottom-0 z-30 pb-[env(safe-area-inset-bottom)] md:hidden">
      <a
        href="#next-step"
        className="flex min-h-14 items-center justify-center bg-mk-navy px-4 text-[13.5px] font-semibold text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
      >
        See your next step →
      </a>
    </div>
  );
}

/**
 * Section-visibility telemetry. Mechanism and event contract are unchanged from the previous
 * implementation; only the section ids and the sources they report differ.
 */
function TrackedSection({
  snapshot,
  snapshotUrl,
  eventType,
  sourceSection,
  id,
  className,
  children
}: {
  snapshot: FreeSnapshot;
  snapshotUrl?: string | null;
  eventType: string;
  sourceSection: string;
  id: string;
  className: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (sent || !ref.current || !('IntersectionObserver' in window)) return;
    const node = ref.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio > 0);
        if (!visible) return;
        setSent(true);
        const snapshotToken = snapshotTokenFromUrl(snapshotUrl);
        if (!snapshotToken) return;
        void fetch(scorePath(`/api/assessments/${snapshot.assessmentReference}/commercial-event`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ snapshotToken, eventType, sourceSection })
        }).catch(() => null);
      },
      { threshold: [0.5] }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [eventType, sent, snapshot.assessmentReference, snapshotUrl, sourceSection]);

  return (
    <section ref={ref} id={id} className={className}>
      {children}
    </section>
  );
}
