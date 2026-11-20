'use client';

import { useEffect, useId, useState } from 'react';
import type { StepView } from '@/lib/readiness-review/view-model';

/** Kept for callers that still pass it; the interview no longer asks for optional detail. */
export type AnswerDetail = { reach?: string; note?: string; tested?: string; ev?: string };

/** "I don't know" is an honest answer: the question stays open and is not counted in the score. */
const UNKNOWN_MEANING = 'The question stays open in your Snapshot and is not counted in the score.';

/**
 * One question, answered in one step (owner direction, 15 November 2026): choosing an answer saves it and the next
 * question follows. Answers are numbered and the keys 1 to 9 choose them; on wide screens four or more answers sit two to
 * a row, with "I don't know" across the full width. A question that allows several answers is the only one with a button
 * (or Enter), because the respondent says when the selection is complete. No optional detail, no free text.
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

  const isMulti = step.format === 'multi';
  const exclusive = new Set(step.choices.filter((c) => c.exclusive).map((c) => c.value));
  const toggle = (value: string) =>
    setMulti((current) => {
      if (current.includes(value)) return current.filter((v) => v !== value);
      if (exclusive.has(value)) return [value];
      return current.filter((v) => !exclusive.has(v)).concat(value);
    });
  const pick = (value: string) => {
    if (saving) return;
    setChosen(value);
    onSubmit(value);
  };

  // Keys 1 to 9 choose an answer (toggle on a multi-select question); Enter continues a multi-select question.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || saving) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) && (target as HTMLInputElement).type !== 'radio' && (target as HTMLInputElement).type !== 'checkbox') return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= Math.min(9, step.choices.length)) {
        e.preventDefault();
        const value = step.choices[n - 1].value;
        if (isMulti) toggle(value);
        else pick(value);
      } else if (e.key === 'Enter' && isMulti && multi.length) {
        e.preventDefault();
        onSubmit(multi);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const legend = `Choose an answer for: ${step.text}`;
  const wide = step.choices.filter((c) => !c.uncertain).length >= 4;
  const key = (i: number, on: boolean) => (
    <span aria-hidden className={`hidden h-6 w-6 shrink-0 items-center justify-center rounded border text-xs font-semibold tabular-nums lg:flex ${on ? 'border-white/40 text-white' : 'border-mk-line text-mk-muted'}`}>{i + 1}</span>
  );

  if (isMulti) {
    return (
      <fieldset className="mt-8" disabled={saving} data-review-multi>
        <legend className="sr-only">{legend}</legend>
        <p className="mb-3 text-sm text-mk-muted">Select every option that applies.</p>
        <div className={`grid gap-2.5 ${wide ? 'xl:grid-cols-2' : ''}`}>
          {step.choices.map((c, i) => {
            const on = multi.includes(c.value);
            const meaning = c.uncertain ? UNKNOWN_MEANING : c.meaning;
            return (
              <label
                key={c.value}
                className={`review-option flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border px-4 py-3.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-mk-navy has-[:focus-visible]:ring-offset-2 ${
                  on ? 'border-mk-navy bg-mk-surface' : 'border-mk-line bg-white hover:border-mk-muted hover:shadow-soft'
                } ${c.uncertain ? 'xl:col-span-2' : ''}`}
              >
                <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[#001030]" checked={on} onChange={() => toggle(c.value)} />
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium text-mk-ink">{c.label}</span>
                  {meaning && <span className="mt-0.5 block text-sm leading-6 text-mk-muted">{meaning}</span>}
                </span>
                {key(i, false)}
              </label>
            );
          })}
        </div>
        <div className="mt-6">
          <button
            type="button"
            disabled={!multi.length || saving}
            onClick={() => onSubmit(multi)}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-mk-navy px-7 text-base font-semibold text-white transition-opacity disabled:opacity-40 sm:w-auto"
          >
            Continue <span aria-hidden className="hidden text-white/60 lg:inline">↵</span>
          </button>
        </div>
      </fieldset>
    );
  }

  return (
    <fieldset className="mt-8" disabled={saving}>
      <legend className="sr-only">{legend}</legend>
      <div className={`grid gap-2.5 ${wide ? 'xl:grid-cols-2' : ''}`} role="radiogroup" aria-label={legend}>
        {step.choices.map((c, i) => {
          const on = chosen === c.value;
          const meaning = c.uncertain ? UNKNOWN_MEANING : c.meaning;
          return (
            <label
              key={c.value}
              className={`review-option flex min-h-14 cursor-pointer items-start gap-3 rounded-lg border px-4 py-3.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-mk-navy has-[:focus-visible]:ring-offset-2 ${
                on ? 'review-chosen border-mk-navy bg-mk-navy text-white' : 'border-mk-line bg-white text-mk-ink hover:border-mk-muted hover:shadow-soft'
              } ${c.uncertain ? 'mt-1 xl:col-span-2' : ''}`}
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
                onClick={() => pick(c.value)}
              />
              <span aria-hidden className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${on ? 'border-white' : 'border-mk-muted'}`}>
                {on && <span className="h-2 w-2 rounded-full bg-white" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-medium">{c.label}</span>
                {meaning && <span className={`mt-0.5 block text-sm leading-6 ${on ? 'text-white/80' : 'text-mk-muted'}`}>{meaning}</span>}
              </span>
              {key(i, on)}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
