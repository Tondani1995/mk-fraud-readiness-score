'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { ownerView } from '@/lib/readiness-review/view-model';
import { ReviewQuestion } from './ReviewQuestion';
import { useReviewAction } from './useReviewAction';

type OwnerView = ReturnType<typeof ownerView>;

const ASSIGNMENT_LABEL: Record<string, string> = {
  assigned: 'Waiting for an answer',
  accepted: 'Waiting for an answer',
  overdue: 'Overdue',
  returned: 'Answered',
  'owner-unknown': 'Answered “I don’t know”',
  declined: 'Declined'
};

/**
 * One accountable function's package. The function answers only its own questions, one per screen. These answers
 * never use the respondent's 95 screens, and each question says why it reached this function.
 */
export function OwnerPackage({ token, initial }: { token: string; initial: OwnerView }) {
  const { view, send, retry } = useReviewAction<OwnerView>(token, initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const firstRender = useRef(true);
  // After an answer, move focus to the next question and bring it into view. On arrival the page starts at its own
  // heading and introduction, so nothing is moved.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const heading = headingRef.current;
    if (!heading) return;
    heading.focus({ preventScroll: true });
    const rect = heading.getBoundingClientRect();
    if (rect.top < 16 || rect.bottom > window.innerHeight * 0.7) window.scrollBy({ top: rect.top - 24, behavior: 'instant' as ScrollBehavior });
  }, [view.step?.q]);

  async function finish(outcome: Awaited<ReturnType<typeof send>> | null) {
    setSaving(false);
    if (!outcome) return;
    if (outcome.ok) {
      setSaved('Saved');
      return;
    }
    setMessage(outcome.message);
    setRetryable(outcome.retryable);
  }

  const step = view.step;
  const staged = view.canDecline;
  const p = view.progress;
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6" data-review-owner data-function={view.fn}>
      <p className="clarity-eyebrow">Questions for an accountable function</p>
      <h1 className="mt-3 text-2xl font-semibold text-mk-ink sm:text-3xl">{view.fn}</h1>
      {staged ? (
        <p className="mt-3 max-w-3xl text-base leading-7 text-mk-ink">
          These questions reached {view.fn} because the respondent for {view.organisationLabel} did not know the answer, delegated an area to this function, or sent them as part of
          this function&rsquo;s package. Each question says why it is here and names the person who would typically know. If a question does not belong to this function, you can
          decline it with a reason; it is then listed as outstanding and is not sent to anyone else without a decision.
        </p>
      ) : (
        <p className="mt-3 max-w-3xl text-base leading-7 text-mk-ink">
          These questions reached {view.fn} because the respondent for {view.organisationLabel} did not know the answer, or because an earlier answer opened them. Each question names the
          person who would typically know. Your answers are recorded as this function&rsquo;s and do not use any of the respondent&rsquo;s 95 interview screens.
        </p>
      )}
      <p className="mt-2 text-sm text-mk-muted" role="status" aria-live="polite">
        {staged
          ? `${p.open} ${p.open === 1 ? 'question is' : 'questions are'} open for this function. ${p.answered} answered${p.declined ? `, ${p.declined} declined` : ''}${p.unknownToFunction ? `, ${p.unknownToFunction} answered “I don’t know”` : ''}.${p.areas.length ? ` Areas delegated to this function: ${p.areas.length}.` : ''} `
          : `${view.waitingCount} ${view.waitingCount === 1 ? 'question is' : 'questions are'} waiting for this function. ${view.answeredCount} answered so far. `}
        {saved && !saving ? 'Last answer saved.' : ''}
      </p>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="question-instrument" aria-label="Current question for this function">
          {step ? (
            <>
              <div className="question-topline">
                <p className="clarity-eyebrow max-md:sr-only">{step.areaName}</p>
                <span className="question-confirmation">ANSWERED BY {view.fn.toUpperCase()}</span>
              </div>
              <div className="question-stage" key={step.q} data-question-stage data-question-id={step.q}>
                <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold text-mk-ink outline-none sm:text-2xl">
                  {step.text}
                </h2>
                {step.provenance && <p className="question-context" data-review-provenance>{step.provenance}</p>}
                {step.help && <p className="question-context">{step.help}</p>}
                <ReviewQuestion
                  step={step}
                  saving={saving}
                  onSubmit={async (value) => {
                    setSaving(true);
                    setMessage(null);
                    setRetryable(false);
                    await finish(await send({ type: 'owner.answer', fn: view.fn, q: step.q, value }));
                  }}
                />
                {staged && (
                  <div className="mt-6 border-t border-mk-line pt-4" data-review-decline>
                    {!declining ? (
                      <button type="button" className="min-h-11 py-2 text-sm font-medium text-mk-navy underline underline-offset-4" onClick={() => setDeclining(true)}>
                        This question is not for {view.fn}
                      </button>
                    ) : (
                      <form
                        onSubmit={async (event) => {
                          event.preventDefault();
                          if (!reason.trim()) return;
                          setSaving(true);
                          setMessage(null);
                          setRetryable(false);
                          const outcome = await send({ type: 'owner.decline', fn: view.fn, q: step.q, reason: reason.trim() });
                          if (outcome?.ok) {
                            setDeclining(false);
                            setReason('');
                          }
                          await finish(outcome);
                        }}
                      >
                        <label htmlFor="decline-reason" className="block text-sm font-medium text-mk-ink">Why does this question not belong to {view.fn}?</label>
                        <p className="mt-1 text-sm text-mk-muted">The question is listed as outstanding with your reason. It is not sent to another function without a decision.</p>
                        <textarea id="decline-reason" required maxLength={300} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 w-full rounded-md border border-mk-line p-3 text-base text-mk-ink" />
                        <div className="mt-3 flex flex-wrap gap-3">
                          <Button type="submit" variant="secondary" disabled={saving || !reason.trim()}>Decline this question</Button>
                          <button type="button" className="min-h-11 px-2 text-sm font-medium text-mk-navy underline underline-offset-4" onClick={() => { setDeclining(false); setReason(''); }}>Keep it</button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div data-review-owner-done>
              <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold text-mk-ink outline-none">Nothing is waiting for {view.fn}</h2>
              <p className="mt-3 text-base leading-7 text-mk-ink">
                Every question sent to this function has an answer, has been recorded as &ldquo;I don&rsquo;t know&rdquo;{staged ? ' or has been declined' : ''}. If another answer opens a
                new question for this function, it will appear here.
              </p>
            </div>
          )}
          {message && (
            <div role="alert" className="instrument-recovery">
              <p>{message}</p>
              {retryable && (
                <Button type="button" variant="secondary" onClick={async () => { setSaving(true); setMessage(null); await finish(await retry()); }}>
                  Try saving again
                </Button>
              )}
            </div>
          )}
        </section>
        <aside aria-label="This function's package" className="rounded-md border border-mk-line bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-[.12em] text-mk-muted">In this package</h2>
          {view.items.length === 0 ? (
            <p className="mt-3 text-sm text-mk-muted">No questions have been sent to this function yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {view.items.map((item) => (
                <li key={item.id} className="border-b border-mk-line pb-3 text-sm last:border-0">
                  <p className="font-medium text-mk-ink">{item.title}</p>
                  <p className="text-mk-muted">{ASSIGNMENT_LABEL[item.status] ?? item.status}</p>
                  <p className="text-mk-muted">Suggested: {item.suggestedRole}</p>
                  {item.declineReason && <p className="text-mk-muted">Reason: {item.declineReason}</p>}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
