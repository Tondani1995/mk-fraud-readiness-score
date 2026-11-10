'use client';

import { useEffect, useId, useState } from 'react';
import { AdaptiveResponseCanvas } from '@/components/adaptive/AdaptiveResponseCanvas';
import { Button } from '@/components/ui/Button';
import type { StepView } from '@/lib/readiness-review/view-model';

export type AnswerDetail = { reach?: string; note?: string; tested?: string; ev?: string };

type Choice = StepView['choices'][number];

const REACH = [
  ['units', 'Some sites, units or entities'],
  ['cases', 'Some cases or periods'],
  ['provider', 'Work done by a provider']
] as const;
const TESTED = [
  ['yes', 'Yes'],
  ['no', 'No'],
  ['unsure', 'Not sure']
] as const;
const EV = [
  ['yes', 'Yes'],
  ['partly', 'Partly'],
  ['no', 'No']
] as const;

function OptionGroup({ legend, name, options, value, onChange }: { legend: string; name: string; options: readonly (readonly [string, string])[]; value?: string; onChange: (v?: string) => void }) {
  return (
    <fieldset className="mt-4">
      <legend className="text-sm font-medium text-mk-ink">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map(([v, label]) => (
          <label key={v} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-mk-line bg-white px-3 py-2 text-sm text-mk-ink has-[:checked]:border-mk-navy has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-mk-navy">
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="h-4 w-4 accent-[#001030]" />
            {label}
          </label>
        ))}
        {value && (
          <button type="button" className="min-h-11 px-2 text-sm text-mk-muted underline underline-offset-4" onClick={() => onChange(undefined)}>
            Clear
          </button>
        )}
      </div>
    </fieldset>
  );
}

/**
 * One question from the readiness engine. Single answers use the approved response canvas: choosing saves and moves
 * on. When the chosen answer allows optional detail (where it falls short, whether it was tested, whether a record
 * could be shown), the detail is offered before saving and can be skipped. Multi-select questions are saved with a
 * button, because several options can be chosen.
 */
export function ReviewQuestion({
  step,
  initialValue = null,
  saving,
  collapsing = saving,
  confirmed = false,
  onSubmit
}: {
  step: StepView;
  initialValue?: string | string[] | null;
  saving: boolean;
  /** Approved transition phases from the assessment flow: other answers collapse, the chosen one confirms. */
  collapsing?: boolean;
  confirmed?: boolean;
  onSubmit: (value: string | string[], detail?: AnswerDetail) => void;
}) {
  const ids = useId();
  const [pending, setPending] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [detail, setDetail] = useState<AnswerDetail>({});
  const [multi, setMulti] = useState<string[]>(Array.isArray(initialValue) ? initialValue : []);
  useEffect(() => {
    setPending(null);
    setChosen(null);
    setDetail({});
    setMulti(Array.isArray(initialValue) ? initialValue : []);
  }, [step.q, initialValue]);

  const wantsDetail = (value: string) => step.detailFor.reach.includes(value) || step.detailFor.tested.includes(value) || step.detailFor.ev.includes(value);
  const legend = `Choose an answer for: ${step.text}`;

  if (step.format === 'multi') {
    const exclusive = new Set(step.choices.filter((c) => c.exclusive).map((c) => c.value));
    const toggle = (c: Choice) => {
      setMulti((current) => {
        if (current.includes(c.value)) return current.filter((v) => v !== c.value);
        if (exclusive.has(c.value)) return [c.value];
        return current.filter((v) => !exclusive.has(v)).concat(c.value);
      });
    };
    return (
      <fieldset className="response-canvas" disabled={saving} data-review-multi>
        <legend className="sr-only">{legend}</legend>
        <p className="mb-3 text-sm text-mk-muted">Select every option that applies.</p>
        <div className="grid gap-2">
          {step.choices.map((c) => (
            <label
              key={c.value}
              className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-md border bg-white px-4 py-3 text-base text-mk-ink has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-mk-navy ${multi.includes(c.value) ? 'border-mk-navy' : 'border-mk-line'} ${c.uncertain ? 'mt-2 border-dashed' : ''}`}
            >
              <input type="checkbox" className="mt-1 h-4 w-4 accent-[#001030]" checked={multi.includes(c.value)} onChange={() => toggle(c)} />
              <span>
                <span className="font-medium">{c.label}</span>
                {c.meaning && <span className="mt-1 block text-sm text-mk-muted">{c.meaning}</span>}
              </span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="button" disabled={!multi.length || saving} onClick={() => onSubmit(multi)}>
            {saving ? 'Saving…' : 'Save answer'}
          </Button>
        </div>
      </fieldset>
    );
  }

  const choices = step.choices.map((c) => ({ value: c.value, label: c.label, meaning: c.meaning, uncertain: c.uncertain }));
  return (
    <>
      <AdaptiveResponseCanvas
        choices={choices}
        selected={pending ?? chosen ?? (typeof initialValue === 'string' ? initialValue : null)}
        saving={saving}
        collapsing={collapsing}
        confirmed={confirmed}
        name={`${ids}-${step.q}`}
        legend={legend}
        onChoose={(value) => {
          if (saving) return;
          if (wantsDetail(value)) {
            setPending(value);
            setDetail({});
            return;
          }
          setChosen(value);
          onSubmit(value);
        }}
      />
      {pending && !saving && (
        <div className="mt-5 rounded-md border border-mk-line bg-white p-4" data-review-detail>
          <p className="text-sm font-medium text-mk-ink">Optional detail before saving</p>
          <p className="mt-1 text-sm text-mk-muted">These are your own statements. They help MK decide what evidence to ask for; nothing is verified by them.</p>
          {step.detailFor.reach.includes(pending) && (
            <>
              <OptionGroup legend="Where does it fall short?" name={`${ids}-reach`} options={REACH} value={detail.reach} onChange={(v) => setDetail((d) => ({ ...d, reach: v }))} />
              <label className="mt-3 block text-sm text-mk-ink">
                Which parts? <span className="text-mk-muted">(optional)</span>
                <textarea className="mt-1 block w-full rounded-md border border-mk-line p-2 text-sm" rows={2} maxLength={500} value={detail.note ?? ''} onChange={(e) => setDetail((d) => ({ ...d, note: e.target.value }))} />
              </label>
            </>
          )}
          {step.detailFor.tested.includes(pending) && (
            <OptionGroup legend="Has it been checked or tested in the last 12 months?" name={`${ids}-tested`} options={TESTED} value={detail.tested} onChange={(v) => setDetail((d) => ({ ...d, tested: v }))} />
          )}
          {step.detailFor.ev.includes(pending) && (
            <OptionGroup legend="Could a record of it be shown if MK asked?" name={`${ids}-ev`} options={EV} value={detail.ev} onChange={(v) => setDetail((d) => ({ ...d, ev: v }))} />
          )}
          <div className="mt-4 flex flex-wrap justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setPending(null)}>
              Choose a different answer
            </Button>
            <Button type="button" onClick={() => { setChosen(pending); setPending(null); onSubmit(pending, detail); }}>
              Save answer
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
