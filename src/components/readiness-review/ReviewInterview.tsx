'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { RespondentView } from '@/lib/readiness-review/view-model';
import { ReviewQuestion } from './ReviewQuestion';
import { useReviewAction, type ReviewActionInput } from './useReviewAction';
import { overallProgress } from '@/lib/readiness-review/progress';

type HistoryItem = RespondentView['history'][number];

function ProgressRing({ pct }: { pct: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 72 72" className="h-[72px] w-[72px] shrink-0" aria-hidden>
      <circle cx="36" cy="36" r={r} fill="none" stroke="#E2E8F0" strokeWidth="6" />
      <circle cx="36" cy="36" r={r} fill="none" stroke="#001030" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(pct / 100) * c} ${c}`} transform="rotate(-90 36 36)" className="transition-[stroke-dasharray] duration-500 ease-out" />
      <text x="36" y="41" textAnchor="middle" className="fill-[#001030] text-[15px] font-semibold tabular-nums">{pct}%</text>
    </svg>
  );
}

/**
 * The readiness interview: one person, one question at a time, from start to finish (owner direction, 15 November 2026).
 * On large screens the page uses its width: a left panel with overall progress and the areas, and the question with
 * numbered answers (keys 1 to 9). Choosing an answer saves it; the question leaves at once and the next one slides in as
 * soon as it arrives. No hand-offs, no optional detail, no free text.
 */
export function ReviewInterview({ token, initial, faultOnce = false }: { token: string; initial: RespondentView; faultOnce?: boolean }) {
  const { view, send, retry, discardPending } = useReviewAction<RespondentView>(token, initial, { faultOnce });
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const best = useRef(0);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const topRef = useRef<HTMLDivElement | null>(null);

  const step = view.step;
  const reviewing: HistoryItem | null = reviewIndex !== null ? view.history[reviewIndex] ?? null : null;
  const changeable = view.history.map((h, i) => ({ h, i })).filter((x) => x.h.changeable);
  const shownQ = reviewing?.q ?? step?.q ?? null;

  // Each new question is focused for screen readers and starts at the top of the page.
  useEffect(() => {
    if (!shownQ) return;
    setLeaving(false);
    headingRef.current?.focus({ preventScroll: true });
    const top = topRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) window.scrollTo({ top: window.scrollY + top, behavior: 'instant' as ScrollBehavior });
  }, [shownQ, reviewIndex]);

  async function run(action: ReviewActionInput, after?: () => void) {
    setSaving(true);
    setMessage(null);
    setRetryable(false);
    const outcome = await send(action);
    setSaving(false);
    if (outcome.ok) {
      after?.();
      return;
    }
    setLeaving(false);
    setRetryable(outcome.retryable);
    setMessage(outcome.message);
    if (!outcome.retryable) setReviewIndex(null);
  }

  const progress = overallProgress(view.status);
  best.current = Math.max(best.current, progress.pct);

  if (!step && !reviewing) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-20" aria-labelledby="done-title" data-review-complete>
        <div className="review-rise">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-mk-success/10 text-mk-success" aria-hidden>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </div>
          <p className="clarity-eyebrow mt-6">Fraud Readiness Assessment</p>
          <h1 id="done-title" tabIndex={-1} className="mt-3 text-3xl font-semibold text-mk-ink outline-none sm:text-4xl">
            {view.canResume ? 'Your answers so far are saved' : 'Thank you. Your answers are complete'}
          </h1>
          <p className="mt-4 text-lg leading-8 text-mk-ink">
            {view.canResume
              ? 'You can continue where you stopped, or open your Snapshot on the answers so far.'
              : 'Your Fraud Readiness Snapshot is ready: your MK Fraud Readiness score, where your exposure sits, and which report suits your result.'}
          </p>
          {message && <p role="status" className="mt-4 text-sm text-mk-ink">{message}</p>}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href={`/review/s/${token}/snapshot`} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-mk-navy px-7 text-base font-semibold text-white transition-transform hover:-translate-y-0.5">
              View your Snapshot <span aria-hidden>→</span>
            </Link>
            {view.canResume && (
              <button type="button" disabled={saving} onClick={() => run({ type: 'respondent.resume' })} className="inline-flex min-h-12 items-center justify-center rounded-md border border-mk-line bg-white px-6 text-base font-semibold text-mk-ink">
                Continue the assessment
              </button>
            )}
          </div>
        </div>
        {changeable.length > 0 && (
          <details className="mt-14 border-t border-mk-line pt-4" data-review-answers>
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-mk-navy">Change an answer</summary>
            <ul className="mt-2 divide-y divide-mk-line">
              {changeable.map(({ h, i }) => (
                <li key={h.q} className="flex items-start justify-between gap-4 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block text-mk-ink">{h.text}</span>
                    <span className="mt-0.5 block text-mk-muted">{h.label}</span>
                  </span>
                  <button type="button" data-review-change={h.q} onClick={() => { setMessage(null); setReviewIndex(i); }} className="min-h-11 shrink-0 font-medium text-mk-navy underline underline-offset-4">
                    Change
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    );
  }

  const shown = reviewing
    ? { q: reviewing.q, text: reviewing.text, areaName: reviewing.areaName, help: null as string | null, why: '', choices: reviewing.choices, format: reviewing.format }
    : { q: step!.q, text: step!.text, areaName: step!.areaName, help: step!.help, why: step!.why, choices: step!.choices, format: step!.format };
  const questionStep = { ...(step ?? {}), q: shown.q, text: shown.text, areaName: shown.areaName, format: shown.format, choices: shown.choices, detailFor: { reach: [], tested: [], ev: [] } } as any;
  const areas = view.areas.filter((a) => a.name);
  const currentArea = Math.max(0, areas.findIndex((a) => a.current));

  function previousChangeable(from: number | null): number | null {
    const limit = from === null ? view.history.length : from;
    const prev = [...changeable].reverse().find((x) => x.i < limit);
    return prev ? prev.i : null;
  }
  function nextChangeable(from: number): number | null {
    const next = changeable.find((x) => x.i > from);
    return next ? next.i : null;
  }

  function submitAnswer(value: string | string[]) {
    if (reviewing) {
      if (JSON.stringify(value) === JSON.stringify(reviewing.value)) {
        setReviewIndex(nextChangeable(reviewIndex!));
        return;
      }
      setLeaving(true);
      void run({ type: 'respondent.correct', q: reviewing.q, value }, () => setReviewIndex(null));
      return;
    }
    // The question leaves the moment the answer is chosen; the next one enters when the server has recorded it.
    setLeaving(true);
    void run({ type: 'respondent.answer', q: step!.q, value });
  }

  return (
    <div ref={topRef} className="min-h-[calc(100dvh-4rem)] bg-white lg:grid lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)]" data-adaptive-assessment="true" data-review-interview data-save-state={saving ? 'saving' : 'ready'}>
      {/* Progress: a bar on phones and tablets, a panel with the areas on large screens. */}
      <div className="sticky top-0 z-10 border-b border-mk-line bg-white lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 pb-2 pt-3 text-sm text-mk-muted sm:px-6">
          <span className="tabular-nums">{best.current}% complete</span>
          <span className="tabular-nums">About {progress.minutesLeft} {progress.minutesLeft === 1 ? 'minute' : 'minutes'} left</span>
        </div>
        <div className="h-1 w-full bg-mk-line" role="progressbar" aria-label="Assessment progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={best.current} aria-valuetext={`About ${best.current}% complete, about ${progress.minutesLeft} minutes left`}>
          <div className="h-1 bg-mk-navy transition-[width] duration-500 ease-out" style={{ width: `${best.current}%` }} />
        </div>
      </div>

      <aside className="hidden border-r border-mk-line bg-mk-surface lg:block" aria-label="Assessment progress">
        <div className="sticky top-0 flex max-h-[100dvh] flex-col gap-8 overflow-y-auto px-8 py-10">
          <div className="flex items-center gap-4">
            <ProgressRing pct={best.current} />
            <div>
              <p className="text-sm font-semibold text-mk-ink">{best.current}% complete</p>
              <p className="mt-0.5 text-sm tabular-nums text-mk-muted">About {progress.minutesLeft} {progress.minutesLeft === 1 ? 'minute' : 'minutes'} left</p>
            </div>
          </div>
          {areas.length > 0 && (
            <ol className="space-y-1" aria-label="Areas">
              {areas.map((a, i) => {
                const done = !a.current && a.answered > 0 && i < currentArea;
                return (
                  <li key={a.id} aria-current={a.current ? 'step' : undefined} className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${a.current ? 'bg-white font-semibold text-mk-ink shadow-soft' : done ? 'text-mk-ink' : 'text-mk-muted'}`}>
                    <span aria-hidden className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${a.current ? 'border-mk-navy bg-mk-navy text-white' : done ? 'border-mk-success bg-mk-success text-white' : 'border-mk-line bg-white'}`}>
                      {done ? '✓' : a.current ? '•' : ''}
                    </span>
                    <span className="leading-snug">{a.name}</span>
                  </li>
                );
              })}
            </ol>
          )}
          <p className="mt-auto text-xs leading-5 text-mk-muted">Your answers are saved as you go. You can close this page and return with the same link.</p>
        </div>
      </aside>

      <section className="relative mx-auto w-full max-w-3xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12 lg:px-12 lg:pt-16 xl:max-w-4xl" aria-label="Current question">
        {/* A thin line runs while the answer is being recorded, so a slower save never looks stuck. */}
        <div aria-hidden className={`absolute inset-x-0 top-0 h-0.5 overflow-hidden transition-opacity duration-200 ${saving ? 'opacity-100' : 'opacity-0'}`}>
          <div className="review-saving h-full w-1/3 bg-mk-navy" />
        </div>
        <div
          className={`${leaving ? 'review-leave' : 'review-enter'}`}
          key={`${shown.q}-${reviewIndex ?? 'now'}`}
          data-question-stage
          data-question-id={shown.q}
        >
          <p className="clarity-eyebrow">{reviewing ? 'Your earlier answer' : shown.areaName}</p>
          <h1 ref={headingRef} tabIndex={-1} className="mt-3 text-xl font-semibold leading-8 text-mk-ink outline-none sm:text-2xl sm:leading-9 lg:text-[1.75rem] lg:leading-[2.4rem]">
            {shown.text}
          </h1>
          {shown.help && <p className="mt-3 max-w-2xl text-base leading-7 text-mk-muted">{shown.help}</p>}
          <ReviewQuestion step={questionStep} initialValue={reviewing ? reviewing.value : null} saving={saving} onSubmit={submitAnswer} />
          {shown.why && (
            <details className="mt-6 text-sm text-mk-muted">
              <summary className="min-h-11 cursor-pointer py-2 font-medium text-mk-navy">Why we ask this</summary>
              <p className="mt-1 max-w-2xl leading-6">{shown.why}</p>
            </details>
          )}
        </div>

        {message && (
          <div role="alert" className="mt-6 rounded-md border border-mk-danger/30 bg-white p-4 text-sm leading-6 text-mk-ink" data-review-message>
            <p>{message}</p>
            {retryable && (
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="min-h-11 rounded-md bg-mk-navy px-4 font-semibold text-white"
                  onClick={async () => {
                    setSaving(true);
                    setMessage(null);
                    const outcome = await retry();
                    setSaving(false);
                    if (outcome && !outcome.ok) {
                      setRetryable(outcome.retryable);
                      setMessage(outcome.message);
                    }
                  }}
                >
                  Try again
                </button>
                <button type="button" className="min-h-11 px-2 font-medium text-mk-navy underline underline-offset-4" onClick={() => { discardPending(); setMessage(null); setRetryable(false); }}>
                  Choose again
                </button>
              </div>
            )}
          </div>
        )}

        <div className="mt-10 flex items-center justify-between gap-4 border-t border-mk-line pt-4 text-sm text-mk-muted">
          <button
            type="button"
            disabled={saving || retryable || previousChangeable(reviewIndex) === null}
            onClick={() => { setMessage(null); setReviewIndex(previousChangeable(reviewIndex)); }}
            className="min-h-11 font-medium text-mk-navy disabled:text-mk-line"
          >
            ← Back
          </button>
          {reviewing ? (
            <button type="button" disabled={saving} onClick={() => setReviewIndex(nextChangeable(reviewIndex!))} className="min-h-11 font-medium text-mk-navy">
              Keep this answer →
            </button>
          ) : (
            <span className="hidden sm:inline">Press 1 to 9 to choose an answer</span>
          )}
        </div>
      </section>
    </div>
  );
}
