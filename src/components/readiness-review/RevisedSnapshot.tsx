'use client';

import { useState } from 'react';
import type { snapshotView, ControlItem } from '@/lib/readiness-review/view-model';
import { unknownItems, type SnapshotBrief } from '@/lib/readiness-review/snapshot-brief';
import type { SnapshotNarrative } from '@/lib/readiness-review/snapshot-narrative';

type Snapshot = ReturnType<typeof snapshotView>;
type Tier = 'essential' | 'comprehensive' | 'advisory';
type Card = { tier: Tier; label: string; price: string; summary: string; includes: readonly string[] };

/** Line icons in the MK palette (stroke follows the text colour). */
const ICONS = {
  alert: ['M12 9v4', 'M12 17h.01', 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z'],
  check: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z', 'm9 12 2 2 4-4'],
  layers: ['m12 2 10 5-10 5L2 7l10-5Z', 'm2 17 10 5 10-5', 'm2 12 10 5 10-5'],
  target: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z', 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z'],
  report: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z', 'M14 2v6h6', 'M8 13h8', 'M8 17h5'],
  people: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M22 21v-2a4 4 0 0 0-3-3.9', 'M16 3.1a4 4 0 0 1 0 7.8'],
  arrow: ['M5 12h14', 'm13 6 6 6-6 6']
} as const;
function Icon({ name, className = 'h-5 w-5' }: { name: keyof typeof ICONS; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name].map((d) => <path key={d} d={d} />)}
    </svg>
  );
}

function ScoreDial({ percent }: { percent: number | null }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent ?? 0));
  return (
    <svg viewBox="0 0 128 128" className="h-36 w-36 shrink-0 sm:h-40 sm:w-40" role="img" aria-label={percent === null ? 'Score not yet available' : `MK Fraud Readiness score ${percent}%`}>
      <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="10" />
      <circle cx="64" cy="64" r={r} fill="none" stroke="#FFFFFF" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(p / 100) * c} ${c}`} transform="rotate(-90 64 64)" className="review-dial" />
      <text x="64" y="70" textAnchor="middle" className="fill-white text-[30px] font-semibold tabular-nums">{percent === null ? '–' : `${percent}%`}</text>
      <text x="64" y="90" textAnchor="middle" className="fill-white/60 text-[8px] uppercase tracking-[.14em]">Readiness score</text>
    </svg>
  );
}

const SECTIONS: [string, string][] = [
  ['result', 'Your result'],
  ['findings', 'What your answers show'],
  ['exposure', 'Where exposure sits'],
  ['next-step', 'Recommended next step'],
  ['reports', 'Choose a report'],
  ['detail', 'Full detail']
];
const TIER_ICON: Record<Tier, keyof typeof ICONS> = { essential: 'report', comprehensive: 'layers', advisory: 'people' };

/**
 * The customer Snapshot for the revised review, built to sell as the previous Snapshot did and better (owner direction,
 * 15 November 2026): an AI narrative from the organisation's own answers leads; figures, stats and the exposure by area
 * show the problem is real; a recommendation from the answers points to the right report; the three ways to act are
 * cards; choosing one goes straight into the existing order journey (confirm, tax invoice and VAT, EFT banking details)
 * with the contact given at the start.
 */
export function RevisedSnapshot({ view, token, cards, ordering, brief, narrative }: { view: Snapshot; token: string; cards: Card[]; ordering: boolean; brief: SnapshotBrief; narrative: SnapshotNarrative }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const score = brief.score;
  const unknown = unknownItems(view);
  const maxTotal = Math.max(1, ...brief.areas.map((a) => a.gaps + a.inPlace + a.unknown));
  const rec = brief.recommendation;
  const recLabel = rec.tier === 'advisory' ? 'Speak to MK first' : `${rec.tier === 'comprehensive' ? 'Comprehensive' : 'Essential'} suits this result`;

  async function choose(tier: Tier) {
    if (busy) return;
    setBusy(tier);
    setError(null);
    try {
      const res = await fetch(`/review/api/s/${encodeURIComponent(token)}/commercial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ useStoredContact: true })
      });
      const json = await res.json().catch(() => ({}));
      // Advisory does not depend on the coverage rule: where the answers cannot be bound yet, MK is reached through the
      // website's contact page instead.
      if ((!res.ok || !json.ok) && tier === 'advisory') {
        window.location.assign('/contact?topic=advisory');
        return;
      }
      if (!res.ok || !json.ok) throw new Error(json.message ?? 'Your report could not be started. Please try again.');
      const ref = encodeURIComponent(json.assessmentReference);
      const tok = encodeURIComponent(json.snapshotToken);
      // A full page load into the existing order journey (confirm, tax invoice and VAT, payment with banking details).
      window.location.assign(tier === 'advisory' ? `/score/advisory/${ref}?token=${tok}` : `/score/order/new?tier=${tier}&ref=${ref}&token=${tok}`);
    } catch (e) {
      setBusy(null);
      setError(e instanceof Error ? e.message : 'Your report could not be started. Please try again.');
    }
  }

  const stats: { icon: keyof typeof ICONS; label: string; value: string; note: string; tone: string }[] = [
    { icon: 'target', label: 'Fraud scenarios that apply', value: score ? String(score.applicable) : '–', note: score ? `${score.counted} with every core answer known` : 'Answer more to calculate', tone: 'text-mk-navy' },
    { icon: 'alert', label: 'Scenarios with a core-control gap', value: score ? String(score.gapScenarios) : '–', note: score ? `of the ${score.counted} counted in the score` : '', tone: 'text-mk-danger' },
    { icon: 'layers', label: 'Areas with a gap', value: `${brief.areasWithGaps} of ${brief.areas.length}`, note: brief.areas[0]?.gaps ? `Most in ${brief.areas[0].name}` : 'No gaps reported', tone: 'text-mk-navy' },
    { icon: 'check', label: 'Strongest area', value: brief.strongest ? String(brief.strongest.inPlace) : '–', note: brief.strongest ? `controls in place in ${brief.strongest.name}` : 'Few controls reported in place', tone: 'text-mk-success' }
  ];

  return (
    <article data-review-snapshot data-snapshot-layout="live" data-narrative-source={narrative.source} className="bg-white">
      {/* Result band */}
      <section id="result" className="relative overflow-hidden bg-mk-navy text-white">
        <div aria-hidden className="pointer-events-none absolute -right-48 -top-48 h-[36rem] w-[36rem] rounded-full border border-white/[0.06]" />
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-[24rem] w-[24rem] rounded-full border border-white/[0.06]" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pb-24 pt-12 sm:px-6 lg:grid-cols-12 lg:items-center lg:pb-28 lg:pt-16">
          <div className="review-rise lg:col-span-7">
            <p className="text-xs font-semibold uppercase tracking-[.12em] text-white/60">Fraud Readiness Snapshot · {brief.organisation}</p>
            <h1 className="mt-4 text-3xl font-semibold leading-tight sm:text-[2.6rem] sm:leading-[1.15]">{narrative.headline}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/85">{narrative.diagnosis}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href="#reports" className="group inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-white px-6 text-base font-semibold text-mk-navy transition-transform hover:-translate-y-0.5">
                See the report that suits you <Icon name="arrow" className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </a>
              <a href="#findings" className="inline-flex min-h-12 items-center justify-center rounded-md border border-white/30 px-6 text-base font-semibold text-white transition-colors hover:bg-white/10">Read your result</a>
            </div>
          </div>
          <div className="review-rise lg:col-span-5" style={{ animationDelay: '90ms' }}>
            <div className="rounded-lg border border-white/15 bg-white/[0.04] p-6">
              <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:gap-6 sm:text-left">
                <ScoreDial percent={score ? score.percent : null} />
                <div>
                  <p className="text-sm font-semibold">MK Fraud Readiness score</p>
                  <p className="mt-2 text-sm leading-6 text-white/70">How far the controls you reported in place cover the fraud scenarios that apply to you. On your own answers; nothing was tested and it is not a readiness label.</p>
                </div>
              </div>
              <dl className="mt-6 grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 pt-5 text-center">
                <div><dt className="text-[11px] uppercase tracking-[.1em] text-white/60">Counted</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{score ? score.counted : '–'}</dd></div>
                <div><dt className="text-[11px] uppercase tracking-[.1em] text-white/60">With a gap</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{score ? score.gapScenarios : '–'}</dd></div>
                <div><dt className="text-[11px] uppercase tracking-[.1em] text-white/60">Not known</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{brief.unknown}</dd></div>
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/* Stat cards, lifted over the band */}
      <div className="relative mx-auto -mt-14 max-w-6xl px-4 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s, i) => (
            <div key={s.label} className="review-rise rounded-lg border border-mk-line bg-white p-5 shadow-[0_14px_40px_rgba(0,16,48,0.08)]" style={{ animationDelay: `${140 + i * 50}ms` }}>
              <div className={`flex h-9 w-9 items-center justify-center rounded-md bg-mk-surface ${s.tone}`}><Icon name={s.icon} /></div>
              <p className="mt-4 text-3xl font-semibold tabular-nums text-mk-ink">{s.value}</p>
              <p className="mt-1 text-sm font-medium text-mk-ink">{s.label}</p>
              {s.note && <p className="mt-1 text-xs leading-5 text-mk-muted">{s.note}</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto grid max-w-6xl gap-12 px-4 pb-28 pt-14 sm:px-6 lg:grid-cols-[190px_minmax(0,1fr)] lg:pb-20">
        <nav aria-label="Snapshot sections" className="hidden lg:block">
          <ul className="sticky top-8 space-y-1 border-l border-mk-line text-sm">
            {SECTIONS.map(([id, label]) => (
              <li key={id}><a href={`#${id}`} className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 text-mk-muted transition-colors hover:border-mk-navy hover:text-mk-navy">{label}</a></li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-20">
          {/* What your answers show */}
          <section id="findings" aria-labelledby="findings-h" className="scroll-mt-8">
            <p className="clarity-eyebrow">What your answers show</p>
            <h2 id="findings-h" className="mt-2 text-2xl font-semibold text-mk-ink sm:text-3xl">Three things management should know</h2>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {narrative.signals.map((s, i) => (
                <div key={i} className="flex flex-col rounded-lg border border-mk-line p-6 transition-shadow hover:shadow-[0_12px_32px_rgba(0,16,48,0.07)]">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-mk-danger/10 text-mk-danger"><Icon name="alert" /></div>
                  <h3 className="mt-4 text-lg font-semibold leading-snug text-mk-ink">{s.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-mk-ink">{s.text}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              <div className="flex gap-4 rounded-lg bg-mk-surface p-6">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-mk-success/10 text-mk-success"><Icon name="check" /></div>
                <div>
                  <p className="text-sm font-semibold text-mk-ink">What is working</p>
                  <p className="mt-1 text-sm leading-6 text-mk-ink">{narrative.strength}</p>
                </div>
              </div>
              <blockquote className="rounded-lg border-l-4 border-mk-navy bg-white p-6 shadow-[inset_0_0_0_1px_#E2E8F0]">
                <p className="text-xs font-semibold uppercase tracking-[.12em] text-mk-muted">Why it matters now</p>
                <p className="mt-2 text-lg leading-8 text-mk-ink">{narrative.implication}</p>
              </blockquote>
            </div>
          </section>

          {/* Where exposure sits */}
          <section id="exposure" aria-labelledby="exposure-h" className="scroll-mt-8">
            <p className="clarity-eyebrow">Readiness by area</p>
            <h2 id="exposure-h" className="mt-2 text-2xl font-semibold text-mk-ink sm:text-3xl">Where your exposure sits</h2>
            <div className="mt-8 rounded-lg border border-mk-line">
              <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-mk-line px-5 py-3 text-xs text-mk-muted">
                <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-mk-danger" />Reported as a gap</span>
                <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm bg-mk-accent" />Reported in place</span>
                <span className="inline-flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-sm border border-dashed border-mk-muted" />Not known</span>
              </div>
              <ul className="divide-y divide-mk-line">
                {brief.areas.map((a) => (
                  <li key={a.name} className="grid gap-2 px-5 py-3.5 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_7.5rem] sm:items-center">
                    <span className="text-sm font-medium text-mk-ink">{a.name}</span>
                    <span className="flex h-3.5 overflow-hidden rounded-sm bg-mk-surface" aria-hidden>
                      <i className="review-bar h-full bg-mk-danger" style={{ width: `${(a.gaps / maxTotal) * 100}%` }} />
                      <i className="review-bar h-full bg-mk-accent" style={{ width: `${(a.inPlace / maxTotal) * 100}%` }} />
                      <i className="review-bar h-full border border-dashed border-mk-muted/60" style={{ width: `${(a.unknown / maxTotal) * 100}%` }} />
                    </span>
                    <span className="text-xs tabular-nums text-mk-muted sm:text-right">{a.gaps} {a.gaps === 1 ? 'gap' : 'gaps'} · {a.inPlace} in place</span>
                  </li>
                ))}
              </ul>
            </div>
            {brief.areas.some((a) => a.gaps) && (
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {brief.areas.filter((a) => a.gaps).slice(0, 3).map((a) => (
                  <div key={a.name} className="rounded-lg border border-mk-line p-5">
                    <p className="text-xs font-semibold uppercase tracking-[.12em] text-mk-muted">{a.name}</p>
                    <p className="mt-2 text-3xl font-semibold tabular-nums text-mk-ink">{a.gaps} <span className="text-base font-normal text-mk-muted">{a.gaps === 1 ? 'gap' : 'gaps'}</span></p>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-mk-ink">
                      {a.gapTitles.slice(0, 2).map((t) => <li key={t} className="border-l-2 border-mk-danger/60 pl-3">{t}</li>)}
                    </ul>
                    {a.gaps > 2 && <p className="mt-3 text-sm text-mk-muted">and {a.gaps - 2} more, each explained in the report</p>}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Recommended next step */}
          <section id="next-step" aria-labelledby="next-h" className="scroll-mt-8">
            <div className="relative overflow-hidden rounded-lg bg-mk-navy p-8 text-white sm:p-10">
              <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full border border-white/10" />
              <p className="text-xs font-semibold uppercase tracking-[.12em] text-white/60">Recommended next step</p>
              <h2 id="next-h" className="mt-2 text-2xl font-semibold sm:text-3xl">{recLabel}</h2>
              <p className="mt-4 max-w-3xl text-base leading-7 text-white/85">{rec.reason}</p>
              <a href="#reports" className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-md bg-white px-6 text-base font-semibold text-mk-navy">Compare the options <Icon name="arrow" className="h-4 w-4" /></a>
              <p className="mt-4 text-sm text-white/60">The recommendation is based only on your answers. You can choose any option.</p>
            </div>
          </section>

          {/* Reports */}
          <section id="reports" aria-labelledby="reports-h" className="scroll-mt-8">
            <p className="clarity-eyebrow">After your Snapshot</p>
            <h2 id="reports-h" className="mt-2 text-2xl font-semibold text-mk-ink sm:text-3xl">What your organisation can do with its result</h2>
            <p className="mt-3 max-w-3xl text-base leading-7 text-mk-ink">Each report is written from the answers you have already given, so you do not answer again, and carries your MK Fraud Readiness score. The contact details you gave at the start are used for the order.</p>
            {error && <p role="alert" className="mt-4 rounded-md border border-mk-danger/30 p-3 text-sm text-mk-danger">{error}</p>}
            <div className="mt-10 grid gap-4 lg:grid-cols-3" data-review-report-cards>
              {cards.map((card) => {
                const recommended = card.tier === rec.tier;
                const orderable = card.tier === 'advisory' || (ordering && Boolean(score?.coverageMet));
                return (
                  <div key={card.tier} data-report-card={card.tier} className={`relative flex flex-col rounded-lg border bg-white p-7 transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_44px_rgba(0,16,48,0.10)] ${recommended ? 'border-mk-navy shadow-[0_18px_44px_rgba(0,16,48,0.10)] ring-1 ring-mk-navy' : 'border-mk-line'}`}>
                    {recommended && <span className="absolute -top-3 left-6 whitespace-nowrap rounded-sm bg-mk-navy px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[.1em] text-white">Recommended from your answers</span>}
                    <div className="flex h-11 w-11 items-center justify-center rounded-md bg-mk-surface text-mk-navy"><Icon name={TIER_ICON[card.tier]} className="h-6 w-6" /></div>
                    <h3 className="mt-5 text-xl font-semibold text-mk-ink">{card.label}</h3>
                    <p className="mt-1 text-lg tabular-nums text-mk-ink">{card.price}</p>
                    <p className="mt-4 text-sm leading-6 text-mk-muted">{card.summary}</p>
                    <ul className="mt-5 flex-1 space-y-2.5 border-t border-mk-line pt-5 text-sm leading-6 text-mk-ink">
                      {card.includes.slice(0, 5).map((i) => <li key={i} className="flex gap-2"><span className="text-mk-muted" aria-hidden>·</span><span>{i}</span></li>)}
                      {card.includes.length > 5 && <li className="text-mk-muted">and {card.includes.length - 5} more</li>}
                    </ul>
                    <button
                      type="button"
                      disabled={!orderable || busy !== null}
                      onClick={() => choose(card.tier)}
                      data-choose-report={card.tier}
                      className={`mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md px-5 text-base font-semibold transition-colors disabled:opacity-50 ${recommended ? 'bg-mk-navy text-white hover:bg-mk-accent' : 'border border-mk-navy text-mk-navy hover:bg-mk-surface'}`}
                    >
                      {busy === card.tier ? 'Opening…' : card.tier === 'advisory' ? 'Speak to MK' : `Order ${card.label}`}
                      {busy !== card.tier && <Icon name="arrow" className="h-4 w-4" />}
                    </button>
                    {!orderable && card.tier !== 'advisory' && <p className="mt-2 text-xs leading-5 text-mk-muted">Available once at least half of the scenarios that apply are covered by your answers.</p>}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Full detail */}
          <section id="detail" aria-labelledby="detail-h" className="scroll-mt-8">
            <p className="clarity-eyebrow">Full detail</p>
            <h2 id="detail-h" className="mt-2 text-2xl font-semibold text-mk-ink">Everything you reported</h2>
            <div className="mt-4 divide-y divide-mk-line rounded-lg border border-mk-line">
              {([
                ['Gaps you reported', view.reportedGaps, 'No gaps were reported among the controls that were asked.'],
                ['Answered “I don’t know”', unknown, 'You answered every question.'],
                ['Reported in place', view.reportedInPlace, 'None reported in place.']
              ] as [string, ControlItem[], string][]).map(([title, items, empty]) => (
                <details key={title} className="group px-5 py-4">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-base font-medium text-mk-ink">
                    {title} ({items.length})<span className="text-xl text-mk-muted transition-transform group-open:rotate-45" aria-hidden>+</span>
                  </summary>
                  {items.length ? (
                    <ul className="mt-3 grid gap-x-8 gap-y-2 text-sm leading-6 md:grid-cols-2">
                      {items.map((c) => <li key={c.id}><span className="text-mk-ink">{c.title}</span> <span className="text-mk-muted">· {c.area}</span></li>)}
                    </ul>
                  ) : <p className="mt-2 text-sm text-mk-muted">{empty}</p>}
                </details>
              ))}
              <details className="group px-5 py-4">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-base font-medium text-mk-ink">
                  Scenarios not yet established ({view.openScenarios.length})<span className="text-xl text-mk-muted transition-transform group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <ul className="mt-3 grid gap-x-8 gap-y-2 text-sm leading-6 md:grid-cols-2">
                  {view.openScenarios.map((sc: { id: string; name: string }) => <li key={sc.id} className="text-mk-ink">{sc.name}</li>)}
                </ul>
              </details>
            </div>
          </section>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-mk-line bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">
        <a href="#reports" className="flex min-h-12 items-center justify-center gap-2 rounded-md bg-mk-navy text-base font-semibold text-white">Choose your report <Icon name="arrow" className="h-4 w-4" /></a>
      </div>
    </article>
  );
}
