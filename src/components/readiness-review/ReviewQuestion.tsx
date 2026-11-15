'use client';

import { useEffect, useId, useState } from 'react';
import type { StepView } from '@/lib/readiness-review/view-model';

/** Kept for callers that still pass it; the interview no longer asks for optional detail. */
export type AnswerDetail = { reach?: string; note?: string; tested?: string; ev?: string };

/** "I don't know" is an honest answer: the question stays open and is not counted in the score. */
const UNKNOWN_MEANING = 'The question stays open in your Snapshot and is not counted in the score.';

/**
 * One question, answered in one step (owner direction, 15 November 2026): choosing an answer saves it and the next
 * question follows. There is no optional detail, no free text and no separate save button. A question that allows
 * several answers is the only one with a button, because the respondent has to say when the selection is complete.
 */
export function ReviewQuestion({
  step,
  initialValue = null,
  saving,
  onSubmit
}: {
  step: StepView;
  initialValue?: string | string[] | null;
  saving: boolean;
  /** Accepted for compatibility; motion is handled by the interview. */
  collapsing?: boolean;
  confirmed?: boolean;
  onSubmit: (value: string | string[], detail?: AnswerDetail) => void;
}) {
  const ids = useId();
  const [chosen, setChosen] = useState<string | null>(typeof initialValue === 'string' ? initialValue : null);
  const [multi, setMulti] = useState<string[]>(Array.isArray(initialValue) ? initialValue : []);
  useEffect(() => {
    setChosen(typeof initialValue === 'string' ? initialValue : null);
    setMulti(Array.isArray(initialValue) ? initialValue : []);
  }, [step.q, initialValue]);

  const legend = `Choose an answer for: ${step.text}`;

  if (step.format === 'multi') {
    const exclusive = new Set(step.choices.filter((c) => c.exclusive).map((c) => c.value));
    const toggle = (value: string) =>
      setMulti((current) => {
        if (current.includes(value)) return current.filter((v) => v !== value);
        if (exclusive.has(value)) return [value];
        return current.filter((v) => !exclusive.has(v)).concat(value);
      });
    return (
      <fieldset className="mt-6" disabled={saving} data-review-multi>
        <legend className="sr-only">{legend}</legend>
        <p className="mb-3 text-sm text-mk-muted">Select every option that applies.</p>
        <div className="grid gap-2">
          {step.choices.map((c) => {
            const on = multi.includes(c.value);
            return (
              <label
                key={c.value}
                className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-md border px-4 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-mk-navy has-[:focus-visible]:ring-offset-2 ${
                  on ? 'border-mk-navy bg-mk-surface' : 'border-mk-line bg-white hover:border-mk-muted'
                }`}
              >
                <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[#001030]" checked={on} onChange={() => toggle(c.value)} />
                <span className="min-w-0">
                  <span className="block text-base font-medium text-mk-ink">{c.label}</span>
                  {(c.uncertain ? UNKNOWN_MEANING : c.meaning) && <span className="mt-0.5 block text-sm leading-6 text-mk-muted">{c.uncertain ? UNKNOWN_MEANING : c.meaning}</span>}
                </span>
              </label>
            );
          })}
        </div>
        <div className="mt-5">
          <button
            type="button"
            disabled={!multi.length || saving}
            onClick={() => onSubmit(multi)}
            className="inline-flex min-h-12 w-full items-center justify-center rounded-md bg-mk-navy px-6 text-base font-semibold text-white transition-opacity disabled:opacity-40 sm:w-auto"
          >
            Continue
          </button>
        </div>
      </fieldset>
    );
  }

  return (
    <fieldset className="mt-6" disabled={saving}>
      <legend className="sr-only">{legend}</legend>
      <div className="grid gap-2" role="radiogroup" aria-label={legend}>
        {step.choices.map((c) => {
          const on = chosen === c.value;
          const meaning = c.uncertain ? UNKNOWN_MEANING : c.meaning;
          return (
            <label
              key={c.value}
              className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-md border px-4 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-mk-navy has-[:focus-visible]:ring-offset-2 ${
                on ? 'border-mk-navy bg-mk-navy text-white' : 'border-mk-line bg-white text-mk-ink hover:border-mk-muted'
              } ${c.uncertain ? 'mt-2' : ''}`}
            >
              <input
                type="radio"
                className="sr-only"
                name={`${ids}-${step.q}`}
                value={c.value}
                checked={on}
                // A tap always counts, including on the answer already selected (keeping an earlier answer): a radio
                // reports no change when it is already checked, so the tap is taken from the click, not the change.
                onChange={() => undefined}
                onClick={() => {
                  if (saving) return;
                  setChosen(c.value);
                  onSubmit(c.value);
                }}
              />
              <span aria-hidden className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? 'border-white' : 'border-mk-muted'}`}>
                {on && <span className="h-2 w-2 rounded-full bg-white" />}
              </span>
              <span className="min-w-0">
                <span className="block text-base font-medium">{c.label}</span>
                {meaning && <span className={`mt-0.5 block text-sm leading-6 ${on ? 'text-white/80' : 'text-mk-muted'}`}>{meaning}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
