'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { StagedSendView } from '@/lib/readiness-review/view-model';
import { useReviewAction } from './useReviewAction';

/**
 * Sends questions to accountable functions. Build 1.5: the open material questions, once, after the interview has
 * ended. Build 1.6: once the core stage is complete, the recommended depth questions or the ones the organisation
 * chooses; it can be sent again, and a question already with a function is never sent twice.
 */
export function SendToOwners({ token, seq, staged = null }: { token: string; seq: number; staged?: StagedSendView | null }) {
  const router = useRouter();
  const { send } = useReviewAction<{ seq: number }>(token, { seq });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>(staged?.recommended ?? []);

  async function submit(depth?: 'recommended' | 'none' | string[]) {
    setBusy(true);
    setMessage(null);
    const outcome = await send(depth === undefined ? { type: 'organisation.sendToOwners' } : { type: 'organisation.sendToOwners', depth });
    setBusy(false);
    if (outcome.ok) router.refresh();
    else setMessage(outcome.message);
  }

  if (!staged) {
    return (
      <div data-review-send-owners>
        <Button type="button" disabled={busy} onClick={() => submit()}>
          {busy ? 'Sending…' : 'Send open questions to accountable functions'}
        </Button>
        {message && <p role="alert" className="mt-2 text-sm text-mk-danger">{message}</p>}
      </div>
    );
  }

  const same = chosen.length === staged.recommended.length && chosen.every((id) => staged.recommended.includes(id));
  const toggle = (id: string) => setChosen((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));
  return (
    <div data-review-send-owners data-staged>
      <details className="rounded-md border border-mk-line bg-mk-surface p-3">
        <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-mk-ink">
          Choose the questions ({chosen.length} selected of {staged.candidates.length} shown)
        </summary>
        <p className="mt-2 text-sm leading-6 text-mk-muted">
          Recommended questions are selected because their answers would add most to what is known: they cover an objective no confirmation covers, say which part of a partly reported
          control is in place, or decide which other questions apply. You can add or remove any of them.
        </p>
        <ul className="mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
          {staged.candidates.map((c) => (
            <li key={c.id}>
              <label className="flex min-h-11 cursor-pointer gap-3 text-sm leading-6">
                <input type="checkbox" className="mt-1.5 h-4 w-4 shrink-0" checked={chosen.includes(c.id)} onChange={() => toggle(c.id)} />
                <span>
                  <span className="block font-medium text-mk-ink">{c.title}</span>
                  <span className="block text-mk-muted">{c.fn}. {c.kind}: {c.scenario}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </details>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" disabled={busy || chosen.length === 0} onClick={() => submit(same ? 'recommended' : chosen)}>
          {busy ? 'Sending…' : `Send ${chosen.length} ${chosen.length === 1 ? 'question' : 'questions'} to accountable functions`}
        </Button>
      </div>
      {message && <p role="alert" className="mt-2 text-sm text-mk-danger">{message}</p>}
    </div>
  );
}
