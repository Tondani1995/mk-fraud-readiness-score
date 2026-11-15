'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { RespondentView } from '@/lib/readiness-review/view-model';
import { ReviewQuestion } from './ReviewQuestion';
import { useReviewAction, type ReviewActionInput } from './useReviewAction';
import { overallProgress } from '@/lib/readiness-review/progress';

type HistoryItem = RespondentView['history'][number];

/**
 * The readiness interview: one person, one question at a time, from start to finish. Choosing an answer saves it and the
 * next question follows at once; there are no hand-offs to other people, no optional detail and no free text.
 */
export function ReviewInterview({ token, initial, faultOnce = false }: { token: string; initial: RespondentView; faultOnce?: boolean }) {
  const { view, send, retry, discardPending } = useReviewAction<RespondentView>(token, initial, { faultOnce });
  const [saving, setSaving] = useState(false);
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

  // Each new question is focused for screen readers and starts at the top of the page. Its fade-in is a CSS animation
  // (review.css), which always completes, also in a background tab.
  useEffect(() => {
    if (!shownQ) return;
    headingRef.current?.focus({ preventScroll: true });
    const top = topRef.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) window.scrollTo({ top: window.scrollY + top - 8, behavior: 'instant' as ScrollBehavior });
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
    setRetryable(outcome.retryable);
    setMessage(outcome.message);
    if (!outcome.retryable) setReviewIndex(null);
  }

  const progress = overallProgress(view.status);
  best.current = Math.max(best.current, progress.pct);

  if (!step && !reviewing) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16" aria-labelledby="done-title" data-review-complete>
        <p className="clarity-eyebrow">Fraud Readiness Assessment</p>
        <h1 id="done-title" tabIndex={-1} className="mt-3 text-2xl font-semibold text-mk-ink outline-none sm:text-3xl">
          {view.canResume ? 'Your answers so far are saved' : 'Thank you. Your answers are complete'}
        </h1>
        <p className="mt-4 text-base leading-7 text-mk-ink">
          {view.canResume
            ? 'You can continue where you stopped, or open your Snapshot on the answers so far.'
            : 'Your Fraud Readiness Snapshot is ready. It shows your MK Fraud Readiness score, the gaps you reported and the questions that are still open.'}
        </p>
        {message && <p role="status" className="mt-4 text-sm text-mk-ink">{message}</p>}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href={`/review/s/${token}/snapshot`} className="inline-flex min-h-12 items-center justify-center rounded-md bg-mk-navy px-6 text-base font-semibold text-white">
            View your Snapshot
          </Link>
          {view.canResume && (
            <button type="button" disabled={saving} onClick={() => run({ type: 'respondent.resume' })} className="inline-flex min-h-12 items-center justify-center rounded-md border border-mk-line bg-white px-6 text-base font-semibold text-mk-ink">
              Continue the assessment
            </button>
          )}
        </div>
        {changeable.length > 0 && (
          <details className="mt-12 border-t border-mk-line pt-4" data-review-answers>
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
      void run({ type: 'respondent.correct', q: reviewing.q, value }, () => setReviewIndex(null));
      return;
    }
    void run({ type: 'respondent.answer', q: step!.q, value });
  }

  return (
    <div ref={topRef} className="bg-white" data-adaptive-assessment="true" data-review-interview data-save-state={saving ? 'saving' : 'ready'}>
      <div className="sticky top-0 z-10 border-b border-mk-line bg-white/95 backdrop-blur-0">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 pb-2 pt-3 text-sm text-mk-muted sm:px-6">
          <span className="tabular-nums">{best.current}% complete</span>
          <span className="tabular-nums">About {progress.minutesLeft} {progress.minutesLeft === 1 ? 'minute' : 'minutes'} left</span>
        </div>
        <div
          className="h-1 w-full bg-mk-line"
          role="progressbar"
          aria-label="Assessment progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={best.current}
          aria-valuetext={`About ${best.current}% complete, about ${progress.minutesLeft} minutes left`}
        >
          <div className="h-1 bg-mk-navy transition-[width] duration-300 ease-out" style={{ width: `${best.current}%` }} />
        </div>
      </div>

      <section className="mx-auto max-w-2xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12" aria-label="Current question">
        <div
          className="review-fade-in"
          key={`${shown.q}-${reviewIndex ?? 'now'}`}
          data-question-stage
          data-question-id={shown.q}
        >
          <p className="clarity-eyebrow">{reviewing ? 'Your earlier answer' : shown.areaName}</p>
          <h1 ref={headingRef} tabIndex={-1} className="mt-3 text-xl font-semibold leading-8 text-mk-ink outline-none sm:text-2xl sm:leading-9">
            {shown.text}
          </h1>
          {shown.help && <p className="mt-3 text-base leading-7 text-mk-muted">{shown.help}</p>}
          <ReviewQuestion step={questionStep} initialValue={reviewing ? reviewing.value : null} saving={saving} onSubmit={submitAnswer} />
          {shown.why && (
            <details className="mt-6 text-sm text-mk-muted">
              <summary className="min-h-11 cursor-pointer py-2 font-medium text-mk-navy">Why we ask this</summary>
              <p className="mt-1 leading-6">{shown.why}</p>
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
            <span>Your answers are saved as you go.</span>
          )}
        </div>
      </section>
    </div>
  );
}
