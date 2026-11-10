'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { reviewerView } from '@/lib/readiness-review/view-model';
import { useReviewAction } from './useReviewAction';

type ReviewerView = ReturnType<typeof reviewerView>;
type Control = ReviewerView['controls'][number];
type Queue = 'evidence' | 'finding' | 'task' | 'reReview' | 'all';

const QUEUES: { key: Queue; label: string }[] = [
  { key: 'evidence', label: 'Evidence to review' },
  { key: 'finding', label: 'Reviewer findings' },
  { key: 'task', label: 'Follow-ups' },
  { key: 'reReview', label: 'Needs re-review' },
  { key: 'all', label: 'All reported answers' }
];

function fmt(at: string | null) {
  return at ? at.slice(0, 16).replace('T', ' ') : '';
}

function Record({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-md border border-mk-line p-3 text-sm leading-6">
      <p className="font-semibold text-mk-ink">{title}</p>
      {children}
    </div>
  );
}

function ControlDetail({ c, view, onSaved, send }: { c: Control; view: ReviewerView; onSaved: () => void; send: ReturnType<typeof useReviewAction<ReviewerView>>['send'] }) {
  const [evidence, setEvidence] = useState('');
  const [evidenceBasis, setEvidenceBasis] = useState('');
  const [conclusion, setConclusion] = useState('');
  const [basis, setBasis] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [limitation, setLimitation] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setMessage(null);
    if (!evidence && !conclusion && !followUp.trim()) {
      setError(basis.trim() || evidenceBasis.trim() || limitation.trim() ? 'Choose an evidence state or a conclusion, or enter a follow-up, to save what you have written.' : 'Choose an evidence state or a conclusion, or enter a follow-up.');
      return;
    }
    setBusy(true);
    if (evidence) {
      const r = await send({ type: 'reviewer.evidence', q: c.id, state: evidence, basis: evidenceBasis });
      if (!r.ok) {
        setBusy(false);
        setError(r.message);
        return;
      }
    }
    if (conclusion || followUp.trim()) {
      const r = await send({ type: 'reviewer.review', q: c.id, conclusion: conclusion || null, basis, followUp, limitation });
      if (!r.ok) {
        setBusy(false);
        setError(r.message);
        return;
      }
    }
    setBusy(false);
    setEvidence('');
    setEvidenceBasis('');
    setConclusion('');
    setBasis('');
    setFollowUp('');
    setLimitation('');
    setMessage('Saved against answer version ' + (c.answerVersion ?? '') + '.');
    onSaved();
  }

  const ev = c.evidenceRecord;
  const rv = c.reviewRecord;
  return (
    <div data-review-control={c.id}>
      <p className="text-xs font-semibold uppercase tracking-[.12em] text-mk-muted">{c.area} · {c.id}</p>
      <h2 className="mt-1 text-xl font-semibold text-mk-ink">{c.title}</h2>
      <p className="mt-2 text-sm leading-6 text-mk-muted">{c.text}</p>
      <Record title="Respondent's answer (self-reported)">
        <p>
          {c.answer} <span className="text-mk-muted">· version {c.answerVersion} · {c.answeredBy} · {fmt(c.answeredAt)}</span>
        </p>
        <p className="text-mk-muted">{c.stateLabel}</p>
        {c.detail.map((d) => <p key={d} className="text-mk-muted">{d}</p>)}
        {c.answerHistory.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-mk-ink underline underline-offset-4">Earlier answers ({c.answerHistory.length})</summary>
            <ul className="mt-2 space-y-1">
              {c.answerHistory.map((h: any, i: number) => <li key={i}>Version {h.version}: {h.label} · {h.by} · {fmt(h.at)}</li>)}
            </ul>
          </details>
        )}
        {c.reReviewReason && <p className="mt-2 font-medium text-mk-ink" data-review-rereview>Needs re-review: {c.reReviewReason}</p>}
      </Record>
      <Record title="Evidence">
        {ev ? (
          <p data-review-evidence-current={ev.current ? 'true' : 'false'}>
            {ev.label} {ev.current ? <span className="text-mk-muted">· current, for answer version {ev.forVer}</span> : <span className="font-medium">· earlier answer, version {ev.forVer}; not current</span>}
            {ev.basis && <span className="block text-mk-muted">Basis: {ev.basis}</span>}
          </p>
        ) : (
          <p className="text-mk-muted">No evidence recorded.</p>
        )}
      </Record>
      <Record title="Reviewer conclusion">
        {rv ? (
          <div data-review-conclusion-current={rv.current ? 'true' : 'false'}>
            <p>
              {rv.label} {rv.current ? <span className="text-mk-muted">· current, for answer version {rv.forVer}</span> : <span className="font-medium">· earlier answer, version {rv.forVer}; not current</span>}
            </p>
            {rv.basis && <p className="text-mk-muted">Basis: {rv.basis}</p>}
            {rv.followUp && <p>{rv.current ? 'Follow-up' : 'Earlier follow-up, not carried forward'}: {rv.followUp}</p>}
            {rv.limitation && <p className="text-mk-muted">Limitation: {rv.limitation}</p>}
          </div>
        ) : (
          <p className="text-mk-muted">No conclusion recorded.</p>
        )}
      </Record>
      {(c.evidenceHistory.length > 0 || c.reviewHistory.length > 0) && (
        <details className="mt-4 text-sm" data-review-history>
          <summary className="cursor-pointer font-medium text-mk-ink underline underline-offset-4">Earlier evidence and reviewer records ({c.evidenceHistory.length + c.reviewHistory.length})</summary>
          <ul className="mt-2 space-y-2 leading-6">
            {c.evidenceHistory.map((h: any, i: number) => (
              <li key={`e${i}`}>Evidence {h.label} by {h.by}, {fmt(h.at)}, for answer version {h.forVer ?? 'not recorded'} (&ldquo;{h.forValue}&rdquo;){h.basis ? `; basis: ${h.basis}` : ''}</li>
            ))}
            {c.reviewHistory.map((h: any, i: number) => (
              <li key={`r${i}`}>Conclusion {h.label} by {h.by}, {fmt(h.at)}, for answer version {h.forVer ?? 'not recorded'} (&ldquo;{h.forValue}&rdquo;){h.basis ? `; basis: ${h.basis}` : ''}{h.followUp ? `; follow-up: ${h.followUp}` : ''}</li>
            ))}
          </ul>
        </details>
      )}
      <form className="mt-6 space-y-3 border-t border-mk-line pt-4" onSubmit={(e) => { e.preventDefault(); void save(); }} data-review-form>
        <p className="text-sm font-semibold text-mk-ink">Record against the current answer (version {c.answerVersion})</p>
        <label className="block text-sm text-mk-ink">
          Evidence state
          <select className="mt-1 block w-full rounded-md border border-mk-line bg-white px-3 py-2" name="ev" value={evidence} onChange={(e) => setEvidence(e.target.value)}>
            <option value="">No change</option>
            {view.evidenceStates.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="block text-sm text-mk-ink">
          What was examined
          <input className="mt-1 block w-full rounded-md border border-mk-line px-3 py-2" name="evbasis" value={evidenceBasis} onChange={(e) => setEvidenceBasis(e.target.value)} placeholder="For example, three months of supplier changes" />
        </label>
        <label className="block text-sm text-mk-ink">
          Conclusion <span className="text-mk-muted">(optional when you record a follow-up)</span>
          <select className="mt-1 block w-full rounded-md border border-mk-line bg-white px-3 py-2" name="con" value={conclusion} onChange={(e) => setConclusion(e.target.value)}>
            <option value="">No conclusion yet</option>
            {view.conclusions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label className="block text-sm text-mk-ink">
          Basis for the conclusion
          <input className="mt-1 block w-full rounded-md border border-mk-line px-3 py-2" name="basis" value={basis} onChange={(e) => setBasis(e.target.value)} />
        </label>
        <label className="block text-sm text-mk-ink">
          Follow-up required
          <input className="mt-1 block w-full rounded-md border border-mk-line px-3 py-2" name="fu" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
        </label>
        <label className="block text-sm text-mk-ink">
          Limitation of this review
          <input className="mt-1 block w-full rounded-md border border-mk-line px-3 py-2" name="limitation" value={limitation} onChange={(e) => setLimitation(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-mk-danger" data-review-form-error>{error}</p>}
        {message && <p role="status" className="text-sm text-mk-ink">{message}</p>}
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save reviewer record'}</Button>
      </form>
    </div>
  );
}

export function ReviewerWorkspace({ token, initial }: { token: string; initial: ReviewerView }) {
  const { view, send } = useReviewAction<ReviewerView>(token, initial);
  const firstQueue: Queue = initial.counts.evidence ? 'evidence' : 'all';
  const [queue, setQueue] = useState<Queue>(firstQueue);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const list = useMemo(() => {
    const byQueue = view.controls.filter((c) => queue === 'all' || c.queues[queue]);
    const f = filter.trim().toLowerCase();
    return f ? byQueue.filter((c) => `${c.id} ${c.title} ${c.area}`.toLowerCase().includes(f)) : byQueue;
  }, [view.controls, queue, filter]);
  const current = view.controls.find((c) => c.id === selected) ?? null;
  const count = (q: Queue) => (q === 'all' ? view.counts.all : q === 'evidence' ? view.counts.evidence : q === 'finding' ? view.counts.findings : q === 'task' ? view.counts.tasks : view.counts.reReview);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6" data-review-reviewer>
      <p className="clarity-eyebrow">MK reviewer workspace</p>
      <h1 className="mt-3 text-2xl font-semibold text-mk-ink sm:text-3xl">{view.organisationLabel}</h1>
      <p className="mt-3 max-w-3xl text-base leading-7 text-mk-ink">
        Evidence and conclusions are recorded against the answer version you are looking at. If the answer later changes, your record stays in the history but is no longer current, and
        the control returns to the re-review queue. A follow-up can be saved without a conclusion and stays open until it is resolved.
      </p>
      <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Reviewer queues">
        {QUEUES.map((q) => (
          <button
            key={q.key}
            role="tab"
            aria-selected={queue === q.key}
            type="button"
            className={`min-h-11 rounded-md border px-3 py-2 text-sm ${queue === q.key ? 'border-mk-navy bg-mk-navy text-white' : 'border-mk-line bg-white text-mk-ink'}`}
            onClick={() => { setQueue(q.key); setSelected(null); }}
          >
            {q.label} ({count(q.key)})
          </button>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div>
          <label className="block text-sm text-mk-ink">
            Find a control
            <input className="mt-1 block w-full rounded-md border border-mk-line px-3 py-2" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Name, area or question ID" data-review-filter />
          </label>
          <ul className="mt-3 max-h-[70vh] overflow-y-auto rounded-md border border-mk-line bg-white" aria-label="Controls in this queue" data-review-list>
            {list.length === 0 && <li className="p-3 text-sm text-mk-muted">Nothing in this queue.</li>}
            {list.map((c) => (
              <li key={c.id} className="border-b border-mk-line last:border-0">
                <button type="button" className={`block w-full px-3 py-3 text-left text-sm ${selected === c.id ? 'bg-mk-cream' : ''}`} aria-current={selected === c.id ? 'true' : undefined} onClick={() => setSelected(c.id)} data-review-pick={c.id}>
                  <span className="block font-medium text-mk-ink">{c.title}</span>
                  <span className="block text-mk-muted">{c.area} · {c.stateLabel}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <section aria-label="Selected control" className="rounded-md border border-mk-line bg-white p-5">
          {current ? <ControlDetail key={current.id + current.answerVersion} c={current} view={view} send={send} onSaved={() => undefined} /> : <p className="text-sm text-mk-muted">Choose a control from the list to see the answer, its history and the records against it.</p>}
        </section>
      </div>
    </div>
  );
}
