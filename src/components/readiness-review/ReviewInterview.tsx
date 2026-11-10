'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { questionScrollDelta } from '@/components/adaptive/question-scroll';
import { ReviewAreaContext, ReviewAreaRail } from './ReviewAreaPanels';
import { createQuestionTransition, waitForQuestionMotion, type QuestionTransitionPhase } from '@/lib/adaptive/question-transition';
import { Button } from '@/components/ui/Button';
import type { RespondentView } from '@/lib/readiness-review/view-model';
import { ReviewQuestion, type AnswerDetail } from './ReviewQuestion';
import { useReviewAction, type ReviewActionInput } from './useReviewAction';

type SaveState = 'ready' | 'saving' | 'saved' | 'error';
type HistoryItem = RespondentView['history'][number];

function Orientation({ onBegin }: { onBegin: () => void }) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12" aria-labelledby="orientation-title" data-review-orientation>
      <p className="clarity-eyebrow">Before you begin</p>
      <h1 id="orientation-title" className="mt-3 text-2xl font-semibold text-mk-ink outline-none sm:text-3xl" tabIndex={-1}>
        How the readiness interview works
      </h1>
      <div className="mt-6 space-y-4 text-base leading-7 text-mk-ink">
        <p>
          Each screen asks one question. Choosing an answer saves it and moves to the next question, and Back lets you look at an earlier answer and change it. Your answers decide which
          questions apply: an activity your organisation does not carry out removes the questions that depend on it, and changing an earlier answer can open or close later ones.
        </p>
        <p>
          The interview stops after at most 95 screens, including the questions about your organisation. Anything it has not reached by then stays open in your Snapshot and is not
          assumed to be either in place or missing.
        </p>
        <p>
          If you do not know an answer, choose &ldquo;I don&rsquo;t know&rdquo;. The question then waits for the function that would know, such as Finance or HR and payroll, and nothing
          is assumed in the meantime. If a whole area is outside your knowledge, you can send the rest of it to that function in one step.
        </p>
        <p>
          Nothing is scored. Your Snapshot lists what you reported, what is unknown, what is still open and what evidence MK would need to see. Your answers remain your own statements
          until an MK reviewer has examined evidence.
        </p>
      </div>
      <div className="mt-8 rounded-md border border-mk-line bg-white p-5" role="group" aria-label="Worked example, not saved">
        <p className="text-sm font-semibold uppercase tracking-[.12em] text-mk-muted">Worked example, not saved</p>
        <p className="mt-3 font-medium text-mk-ink">Are supplier bank account changes confirmed with the supplier through contact details you already hold, before the change takes effect?</p>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-mk-ink">
          <li><span className="font-medium">Yes, across everything it should cover:</span> every change is confirmed this way, for every supplier.</li>
          <li><span className="font-medium">Partly:</span> it happens for some suppliers, sites or periods but not all; you can say where it falls short.</li>
          <li><span className="font-medium">Set out but not yet working:</span> the rule exists on paper but is not yet followed in practice.</li>
          <li><span className="font-medium">No:</span> changes are made without that confirmation.</li>
          <li><span className="font-medium">I don&rsquo;t know:</span> the question goes to the person who would know.</li>
        </ul>
      </div>
      <p className="mt-6 text-sm leading-6 text-mk-muted">
        Your answers are saved as you go, and this link returns you to where you stopped. We do not state a typical duration because completion times have not yet been measured.
      </p>
      <div className="mt-8">
        <Button type="button" onClick={onBegin}>
          Begin the interview
        </Button>
      </div>
    </section>
  );
}

const useStageLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function ReviewInterview({ token, initial, faultOnce = false }: { token: string; initial: RespondentView; faultOnce?: boolean }) {
  const { view, send, retry, discardPending, applyView } = useReviewAction<RespondentView>(token, initial, { faultOnce });
  const [phase, setPhase] = useState<QuestionTransitionPhase>('idle');
  const [screen, setScreen] = useState<'orientation' | 'question'>(initial.history.length === 0 && initial.status.interview === 'in progress' ? 'orientation' : 'question');
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('ready');
  const [message, setMessage] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const saving = saveState === 'saving' || phase !== 'idle';
  const changeable = view.history.map((h, i) => ({ h, i })).filter((x) => x.h.changeable);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const promptPlacedRef = useRef(false);
  // Same positioning rule as the approved assessment flow: bring the prompt (and its confirmation line when both fit)
  // clear of the sticky progress header. Does nothing when the prompt is already there.
  function placePrompt(heading: HTMLHeadingElement) {
    const root = rootRef.current;
    if (!root) {
      heading.scrollIntoView({ block: 'start' });
      return;
    }
    const headerHeight = root.querySelector('.instrument-progress')?.getBoundingClientRect().height ?? 80;
    const anchor = headerHeight + 58;
    const rect = heading.getBoundingClientRect();
    if (rect.top < anchor - 10 || rect.bottom > window.innerHeight * 0.7)
      window.scrollBy({
        top: questionScrollDelta({
          headingTop: rect.top,
          headingBottom: rect.bottom,
          contextTop: root.querySelector('.question-topline')?.getBoundingClientRect().top ?? rect.top,
          headerHeight,
          viewportHeight: window.innerHeight,
          preferredAnchor: anchor
        }),
        behavior: 'instant' as ScrollBehavior
      });
  }
  // A new prompt is focused without the browser's own jump, then placed.
  useStageLayoutEffect(() => {
    const heading = headingRef.current;
    if (!heading) return;
    heading.focus({ preventScroll: true });
    placePrompt(heading);
    promptPlacedRef.current = true;
  }, [view.step?.q, reviewIndex, screen]);
  // The browser can move the page after the new prompt has been placed. When the other answers collapse, the page gets
  // shorter and the scroll position is clamped; on phones, after scrolling down to save the optional detail, Chromium
  // was seen to return the position to the bottom of the regrown page during the entry, with no script involved. The
  // prompt is therefore placed again as the transition ends, before input unlocks. A failed save changes no question
  // and leaves the page where the respondent is.
  useStageLayoutEffect(() => {
    if (phase !== 'idle' || !promptPlacedRef.current) return;
    promptPlacedRef.current = false;
    if (headingRef.current) placePrompt(headingRef.current);
  }, [phase]);

  async function run(action: ReviewActionInput, after?: () => void) {
    setSaveState('saving');
    setMessage(null);
    setRetryable(false);
    const outcome = await send(action);
    settle(outcome, after);
  }

  /**
   * A new answer uses the approved question transition: other answers collapse while the save is in flight, the chosen
   * answer confirms once the server has recorded it, and only then does the next question enter. Motion never delays
   * the save, and every phase is skipped under reduced motion. A failed save cancels the transition and keeps the choice.
   */
  async function answerWithMotion(action: ReviewActionInput) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const transition = createQuestionTransition({
      reduced,
      phase: setPhase,
      exit: (signal) => waitForQuestionMotion(() => rootRef.current, 'exit', signal, reduced),
      entry: async (signal) => {
        await waitForQuestionMotion(() => rootRef.current, 'entry', signal, reduced);
        // The stage's entry runs at 40ms only while the phase is 'entering'. Leaving that phase would otherwise resume
        // the same animation at the default 240ms and move the prompt about 2px after input unlocks. The entry has
        // completed or used its budget by now, so it is ended here; the resting position is the animation's end state.
        rootRef.current?.querySelectorAll<HTMLElement>('.question-stage').forEach((stage) => stage.getAnimations().forEach((animation) => animation.cancel()));
      }
    });
    setSaveState('saving');
    setMessage(null);
    setRetryable(false);
    const outcome = await send(action, { defer: true });
    if (!outcome.ok) {
      transition.cancel();
      settle(outcome);
      return;
    }
    setSaveState('saved');
    try {
      await transition.confirm();
    } catch {
      // A cancelled or interrupted animation never blocks the recorded answer from showing.
    }
    applyView(outcome.view);
    try {
      await transition.enter();
    } catch {
      transition.cancel();
    }
  }

  function settle(outcome: Awaited<ReturnType<typeof send>> | null, after?: () => void) {
    if (!outcome) return;
    if (outcome.ok) {
      setSaveState('saved');
      after?.();
      return;
    }
    setSaveState(outcome.retryable ? 'error' : 'ready');
    setRetryable(outcome.retryable);
    setMessage(outcome.message);
    if (!outcome.retryable) setReviewIndex(null);
  }

  if (screen === 'orientation') return <Orientation onBegin={() => setScreen('question')} />;

  const step = view.step;
  const reviewing: HistoryItem | null = reviewIndex !== null ? view.history[reviewIndex] ?? null : null;
  const s = view.status;

  if (!step && !reviewing) {
    return (
      <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6" aria-labelledby="done-title" data-review-complete>
        <p className="clarity-eyebrow">Fraud readiness review</p>
        <h1 id="done-title" ref={headingRef} tabIndex={-1} className="mt-3 text-2xl font-semibold text-mk-ink outline-none sm:text-3xl">
          Your answers are recorded
        </h1>
        <p className="mt-4 text-base leading-7 text-mk-ink">
          {s.stopLabel ?? 'The interview has ended'}. {s.screensUsed} of the 95 respondent screens were used. Your Snapshot is prepared from these answers and lists everything that is
          still open, including any questions waiting for other functions.
        </p>
        {message && <p role="status" className="mt-4 text-sm text-mk-ink">{message}</p>}
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link href={`/review/s/${token}/snapshot`}>Open the Snapshot</Link>
          </Button>
          {view.canResume && (
            <Button type="button" variant="secondary" disabled={saving} onClick={() => run({ type: 'respondent.resume' })}>
              Resume the interview
            </Button>
          )}
        </div>
        {changeable.length > 0 && (
          <details className="mt-10 rounded-md border border-mk-line bg-white p-4" data-review-answers>
            <summary className="min-h-11 cursor-pointer py-2 font-medium text-mk-ink">Review or change an answer ({changeable.length})</summary>
            <p className="mt-2 text-sm leading-6 text-mk-muted">
              A change is recorded with the earlier answer kept in its history. If an MK reviewer has already looked at that answer, their record is kept but marked as relating to the
              earlier answer. A change after the interview has ended does not reopen it.
            </p>
            <ul className="mt-3 divide-y divide-mk-line">
              {changeable.map(({ h, i }) => (
                <li key={h.q} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block text-mk-ink">{h.text}</span>
                    <span className="block text-mk-muted">{h.areaName} · {h.label}</span>
                  </span>
                  <Button type="button" variant="secondary" data-review-change={h.q} onClick={() => { setMessage(null); setReviewIndex(i); }}>
                    Change
                  </Button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    );
  }

  const shown = reviewing
    ? { q: reviewing.q, text: reviewing.text, areaName: reviewing.areaName, phase: 'Your earlier answer', choices: reviewing.choices, format: reviewing.format }
    : { q: step!.q, text: step!.text, areaName: step!.areaName, phase: step!.phase, choices: step!.choices, format: step!.format };
  const questionStep = reviewing
    ? {
        q: reviewing.q,
        kind: 'review',
        phase: shown.phase,
        areaId: null,
        areaName: reviewing.areaName,
        moduleName: null,
        modulePurpose: null,
        showAreaIntroduction: false,
        text: reviewing.text,
        help: null,
        why: '',
        format: reviewing.format,
        choices: reviewing.choices,
        detailFor: { reach: [], tested: [], ev: [] },
        suggestedOwner: null,
        suggestedFunction: null,
        provenance: null
      }
    : step!;

  function submitAnswer(value: string | string[], detail?: AnswerDetail) {
    if (reviewing) {
      const same = JSON.stringify(value) === JSON.stringify(reviewing.value);
      if (same) {
        setReviewIndex(reviewIndex! + 1 < view.history.length ? nextChangeable(reviewIndex!) : null);
        return;
      }
      void run({ type: 'respondent.correct', q: reviewing.q, value }, () => {
        setReviewIndex(null);
        setMessage(
          s.interview === 'ended'
            ? 'Your change is saved, with the earlier answer kept in its history. The Snapshot reflects it, and the interview stays ended.'
            : 'Your change is saved. The interview has been updated to reflect it, so the next question may be different.'
        );
      });
      return;
    }
    void answerWithMotion({ type: 'respondent.answer', q: step!.q, value, detail });
  }

  function nextChangeable(from: number): number | null {
    const next = changeable.find((x) => x.i > from);
    return next ? next.i : null;
  }
  function previousChangeable(from: number | null): number | null {
    const limit = from === null ? view.history.length : from;
    const prev = [...changeable].reverse().find((x) => x.i < limit);
    return prev ? prev.i : null;
  }

  const unknownArea = !reviewing ? view.lastSaved?.unknownArea : null;
  const confirmation = view.lastSaved && saveState === 'saved' && !reviewing ? `✓ ${view.lastSaved.label}` : null;

  return (
    <div className="assessment-session-entry">
      <div ref={rootRef} className="assessment-instrument" data-adaptive-assessment="true" data-review-interview data-save-state={saveState} data-transition-phase={phase}>
        <header className="instrument-progress">
          <div>
            <p className="clarity-eyebrow">FRAUD READINESS / REVIEW</p>
            <span>{shown.areaName}</span>
            <p className="mt-1 text-sm text-mk-muted">About {s.pctOfLimit}% of the 95-screen interview limit used</p>
          </div>
          <p role="status" aria-live="polite" aria-atomic="true" className="instrument-save ml-auto" data-save-state={saveState}>
            {saveState === 'saved' ? 'Saved' : saving ? 'Selected · Saving…' : saveState === 'error' ? 'Save needs attention' : 'Ready'}
          </p>
          <div
            className="instrument-progress-track"
            role="progressbar"
            aria-label="Share of the interview limit used"
            aria-valuetext={`About ${s.pctOfLimit}% of the 95-screen interview limit used`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={s.pctOfLimit}
          >
            <i style={{ width: `${s.pctOfLimit}%` }} />
          </div>
        </header>
        <div className="instrument-layout xl:[&:has(>.assessment-contextual)]:grid-cols-[160px_minmax(0,1fr)_220px]">
          <ReviewAreaRail areas={view.areas} />
          <section className="question-instrument" aria-label="Current question">
            <div className="question-topline">
              <p className="clarity-eyebrow max-md:sr-only">{shown.phase}</p>
              <span className="question-confirmation" data-review-confirmation>
                {confirmation ? (
                  <>
                    {confirmation} <small>saved</small>
                  </>
                ) : (
                  'SELF-REPORTED ANSWERS'
                )}
              </span>
            </div>
            {unknownArea && (
              <div className="mb-5 rounded-md border border-mk-line bg-white p-4 text-sm leading-6 text-mk-ink" data-review-area-handoff>
                <p>
                  Your last answer was &ldquo;I don&rsquo;t know&rdquo;, so that question now waits for {unknownArea.fn} (suggested person: {unknownArea.owner}). If {unknownArea.areaName} is
                  generally outside your knowledge, you can send the rest of it to the same function instead of answering each question.
                </p>
                <div className="mt-3">
                  <Button type="button" variant="secondary" disabled={saving} onClick={() => run({ type: 'respondent.assignArea', domain: unknownArea.domain, owner: unknownArea.owner })}>
                    Send the rest of {unknownArea.areaName} to {unknownArea.fn}
                  </Button>
                </div>
              </div>
            )}
            {!reviewing && step!.showAreaIntroduction && (
              <div data-area-introduction className="mb-5 border-b border-mk-line pb-4">
                <p className="font-medium text-mk-navy">{step!.areaName}</p>
                {step!.moduleName && <p className="mt-1 text-sm text-mk-muted">{step!.moduleName}</p>}
              </div>
            )}
            {reviewing && (
              <p className="mb-4 rounded-md bg-mk-cream p-3 text-sm leading-6 text-mk-ink" data-review-back>
                You are looking at an earlier answer. Choosing a different answer changes it and may change which questions follow; your saved answer is shown as selected.
              </p>
            )}
            <div className="question-stage" key={`${shown.q}-${reviewIndex ?? 'now'}`} data-question-stage data-question-id={shown.q}>
              <h1 ref={headingRef} tabIndex={-1}>
                {shown.text}
              </h1>
              {!reviewing && step!.help && <p className="question-context">{step!.help}</p>}
              {!reviewing && step!.why && (
                <details className="question-evidence">
                  <summary>Why this question is asked</summary>
                  <p>{step!.why}</p>
                </details>
              )}
              <ReviewQuestion
                step={questionStep as any}
                initialValue={reviewing ? reviewing.value : null}
                saving={saving}
                collapsing={phase === 'collapsing' || phase === 'confirmed' || (saveState === 'saving' && phase === 'idle')}
                confirmed={phase === 'confirmed'}
                onSubmit={submitAnswer}
              />
            </div>
            {message && (
              <div role="alert" className="instrument-recovery" data-review-message>
                <p>{message}</p>
                {retryable && (
                  <>
                    <p>Your selection is kept in this window, so you can save it again or choose a different answer.</p>
                    <div className="mt-2 flex flex-wrap gap-3">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={async () => {
                          setSaveState('saving');
                          setMessage(null);
                          settle(await retry());
                        }}
                      >
                        Try saving again
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          discardPending();
                          setMessage(null);
                          setRetryable(false);
                          setSaveState('ready');
                        }}
                      >
                        Choose again
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
            <footer className="instrument-navigation">
              <Button
                type="button"
                variant="ghost"
                disabled={saving || retryable || previousChangeable(reviewIndex) === null}
                onClick={() => {
                  setMessage(null);
                  setReviewIndex(previousChangeable(reviewIndex));
                }}
              >
                ← Back
              </Button>
              {reviewing && (
                <Button type="button" variant="secondary" disabled={saving} onClick={() => setReviewIndex(nextChangeable(reviewIndex!))}>
                  Continue with saved response →
                </Button>
              )}
              <span>Your answers are saved as you go.</span>
            </footer>
            {!reviewing && (
              <div className="mt-6 border-t border-mk-line pt-4 text-sm text-mk-muted" data-review-stop>
                {!confirmStop ? (
                  <button type="button" className="min-h-11 underline underline-offset-4" onClick={() => setConfirmStop(true)} disabled={saving}>
                    Stop here and view the Snapshot
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <span>Stopping leaves every question not yet reached open in the Snapshot. You can resume later.</span>
                    <Button type="button" variant="secondary" disabled={saving} onClick={() => run({ type: 'respondent.stop' }, () => setConfirmStop(false))}>
                      Stop the interview
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setConfirmStop(false)}>
                      Keep going
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>
          <ReviewAreaContext areas={view.areas} screensUsed={s.screensUsed} limit={s.limit} />
        </div>
      </div>
    </div>
  );
}
