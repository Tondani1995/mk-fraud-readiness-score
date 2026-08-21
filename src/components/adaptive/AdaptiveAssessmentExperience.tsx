'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { customerHelpFor } from '@/lib/adaptive/customer-help';
import Link from 'next/link';
import { createPortal } from 'react-dom';

type AdaptiveState = any;

function label(value: string) { return value.replace(/^\s*(?:G\d{2}|D\d{1,2}-Q\d{1,2}|OV-[^·:—-]+)\s*(?:[·:—-]\s*)?/i, '').trim(); }

const AUTO_ADVANCE_DELAY_MS = 140;

type PersistInput = {
  nextGatewayAnswers?: Record<string, string>;
  nextControlResponses?: Record<string, any>;
  nextScreen?: string;
  nextId?: string | null;
  confirmGatewayChange?: boolean;
  preservePosition?: boolean;
};

export function AdaptiveAssessmentExperience({ assessmentReference, token, initialState }: { assessmentReference: string; token: string; initialState: AdaptiveState }) {
  const [state, setState] = useState<AdaptiveState>(initialState);
  const [gatewayAnswers, setGatewayAnswers] = useState<Record<string, string>>(initialState.gatewayAnswers ?? {});
  const [controlResponses, setControlResponses] = useState<Record<string, any>>(initialState.controlResponses ?? {});
  const [screen, setScreen] = useState<string>(initialState.navigation?.current_screen ?? 'gateway');
  const [currentId, setCurrentId] = useState<string | null>(initialState.navigation?.current_question_id ?? initialState.path?.currentNextNode ?? null);
  const [visited, setVisited] = useState<string[]>(initialState.navigation?.visited_question_ids ?? []);
  const [saveState, setSaveState] = useState<'ready' | 'saving' | 'saved' | 'error'>('ready');
  const [message, setMessage] = useState<string | null>(null);
  const [invalidation, setInvalidation] = useState<any>(null);
  const [submitted, setSubmitted] = useState(false);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [showReviewAnswers, setShowReviewAnswers] = useState(false);
  const [elapsedTick, setElapsedTick] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const completionHeadingRef = useRef<HTMLHeadingElement>(null);
  const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));
  const saveSequenceRef = useRef(Number(initialState.navigation?.save_sequence ?? 0));
  const visitedRef = useRef<string[]>(initialState.navigation?.visited_question_ids ?? []);
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const assessmentStartedAtRef = useRef(Date.now());

  const nodes = state.path?.nodes ?? [];
  const activeNodes = state.path?.activeNodes ?? [];
  const currentNode = nodes.find((node: any) => node.nodeId === currentId) ?? activeNodes.find((node: any) => node.nodeId === state.path?.currentNextNode) ?? null;
  const progress = state.path?.activePathCount ? Math.round((state.path.completedApplicableCount / state.path.activePathCount) * 100) : 0;
  const navigableNodes = nodes.filter((node: any) => node.state === 'active' || (node.kind === 'gateway' && node.state === 'profile-only'));
  const currentIndex = currentNode ? navigableNodes.findIndex((node: any) => node.nodeId === currentNode.nodeId) : -1;
  const previousNode = currentIndex > 0
    ? [...navigableNodes.slice(0, currentIndex)].reverse().find((node: any) =>
        node.kind === 'gateway' ? Boolean(gatewayAnswers[node.nodeId]) : Boolean(controlResponses[node.nodeId])
      ) ?? null
    : null;

  useEffect(() => { headingRef.current?.focus(); }, [currentId, screen]);

  useEffect(() => {
    if (submitted) return;
    const timer = window.setInterval(() => setElapsedTick((value) => value + 1), 10_000);
    return () => window.clearInterval(timer);
  }, [submitted]);

  useEffect(() => () => {
    if (autoAdvanceTimerRef.current) window.clearTimeout(autoAdvanceTimerRef.current);
  }, []);

  useEffect(() => {
    if (!submitted && state.navigation?.current_screen !== 'complete') return;
    const frame = window.requestAnimationFrame(() => completionHeadingRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [state.navigation?.current_screen, submitted]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !invalidation) {
      root?.removeAttribute('inert');
      return;
    }

    root.setAttribute('inert', '');
    const dialog = dialogRef.current;
    if (!dialog) return;

    const getFocusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
    )).filter((element) => element.getClientRects().length > 0);
    const focusFrame = window.requestAnimationFrame(() => getFocusable()[0]?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setInvalidation(null);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      dialog.removeEventListener('keydown', onKeyDown);
      root.removeAttribute('inert');
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
    };
  }, [invalidation]);

  async function persistNow({
    nextGatewayAnswers = gatewayAnswers,
    nextControlResponses = controlResponses,
    nextScreen = screen,
    nextId = currentId,
    confirmGatewayChange = false,
    preservePosition = false
  }: PersistInput = {}) {
    const nextVisited = visitedRef.current.includes(nextId ?? '')
      ? visitedRef.current
      : nextId
        ? [...visitedRef.current, nextId]
        : visitedRef.current;
    const response = await fetch(`/score/api/adaptive/${encodeURIComponent(assessmentReference)}/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        expectedSaveSequence: saveSequenceRef.current,
        currentScreen: nextScreen,
        currentQuestionId: nextId,
        visitedQuestionIds: nextVisited,
        gatewayAnswers: nextGatewayAnswers,
        controlResponses: nextControlResponses,
        confirmGatewayChange
      })
    });
    const body = await response.json().catch(() => ({}));
    if (body.reason === 'gateway_change_confirmation_required') {
      previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setSaveState('ready');
      setInvalidation({ ...body, nextGatewayAnswers, nextControlResponses, nextScreen, nextId });
      return false;
    }
    if (body.reason === 'save_conflict') {
      setSaveState('error');
      setMessage('This assessment was updated in another tab. Reloading the current saved state.');
      await reload();
      return false;
    }
    if (!response.ok || !body.ok) {
      setSaveState('error');
      setMessage((body.errors ?? ['Your answer could not be saved. Please retry.']).join(' '));
      return false;
    }
    saveSequenceRef.current = Number(body.state.navigation.save_sequence ?? saveSequenceRef.current);
    visitedRef.current = body.state.navigation.visited_question_ids ?? nextVisited;
    setState(body.state);
    setGatewayAnswers(body.state.gatewayAnswers ?? nextGatewayAnswers);
    setControlResponses(body.state.controlResponses ?? nextControlResponses);
    setScreen(preservePosition ? nextScreen : body.state.navigation.current_screen);
    setCurrentId(preservePosition ? nextId : body.state.path.currentNextNode ?? null);
    setVisited(visitedRef.current);
    setSaveState('saved');
    return true;
  }

  function persist(input: PersistInput = {}) {
    setSaveState('saving');
    setMessage(null);
    const queued = saveQueueRef.current.then(() => persistNow(input)).catch(() => {
      setSaveState('error');
      setMessage('Your answer could not be saved. Please retry.');
      return false;
    });
    saveQueueRef.current = queued;
    return queued;
  }

  async function flushSaveQueue() {
    return saveQueueRef.current;
  }

  async function reload() {
    const response = await fetch(`/score/api/adaptive/${encodeURIComponent(assessmentReference)}/state?token=${encodeURIComponent(token)}`);
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.ok) {
      saveSequenceRef.current = Number(body.state.navigation.save_sequence ?? saveSequenceRef.current);
      visitedRef.current = body.state.navigation.visited_question_ids ?? [];
      setState(body.state);
      setGatewayAnswers(body.state.gatewayAnswers ?? {});
      setControlResponses(body.state.controlResponses ?? {});
      setScreen(body.state.navigation.current_screen);
      setCurrentId(body.state.path.currentNextNode ?? null);
      setVisited(visitedRef.current);
      setSaveState('saved');
      setMessage(null);
    }
  }

  function queueAutoAdvance(node: any, nextGatewayAnswers: Record<string, string>, nextControlResponses: Record<string, any>) {
    if (autoAdvanceTimerRef.current) window.clearTimeout(autoAdvanceTimerRef.current);
    autoAdvanceTimerRef.current = window.setTimeout(() => {
      autoAdvanceTimerRef.current = null;
      void persist({ nextGatewayAnswers, nextControlResponses, nextScreen: node.kind === 'gateway' ? 'gateway' : 'question', nextId: node.nodeId });
    }, AUTO_ADVANCE_DELAY_MS);
  }

  function chooseGateway(node: any, value: string) {
    const next = { ...gatewayAnswers, [node.nodeId]: value };
    setGatewayAnswers(next);
    queueAutoAdvance(node, next, controlResponses);
  }

  function chooseControl(node: any, response: { responseState: 'maturity' | 'unknown'; responseValue: number | null }) {
    const next = { ...controlResponses, [node.nodeId]: response };
    setControlResponses(next);
    queueAutoAdvance(node, gatewayAnswers, next);
  }

  async function submit() {
    if (autoAdvanceTimerRef.current) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
    if (!(await flushSaveQueue())) {
      setSaveState('error');
      setMessage('Your latest answer has not been saved. Please retry before submitting.');
      return;
    }
    setSaveState('saving'); setMessage(null);
    const response = await fetch(`/score/api/adaptive/${encodeURIComponent(assessmentReference)}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, expectedSaveSequence: saveSequenceRef.current }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) { setSaveState('error'); setMessage((body.errors ?? ['Submission could not be completed.']).join(' ')); return; }
    setState(body.state); setSnapshotUrl(body.snapshotUrl ?? null); setSubmitted(true); setSaveState('saved');
  }

  const answeredCount = Object.keys(gatewayAnswers).length + Object.keys(controlResponses).length;
  const timeRemaining = useMemo(() => {
    void elapsedTick;
    if (answeredCount < 3) return 'About 8–10 min remaining';
    const elapsedMinutes = Math.max(0.1, (Date.now() - assessmentStartedAtRef.current) / 60_000);
    const activeRemaining = Math.max(1, Number(state.path?.unansweredApplicableCount ?? 1));
    const paceMinutes = elapsedMinutes / answeredCount;
    const estimate = Math.max(2, Math.min(12, Math.round(paceMinutes * activeRemaining)));
    return `About ${Math.max(1, estimate - 1)}–${Math.min(15, estimate + 1)} min remaining`;
  }, [answeredCount, elapsedTick, state.path?.unansweredApplicableCount]);
  // Use a readable domain name at the question boundary; internal domain codes stay out of the
  // customer surface.
  const domainNameByCode = useMemo(() => new Map(
    (state.path?.domainBoundaries ?? []).map((domain: any) => [domain.domainCode, domain.name])
  ), [state.path?.domainBoundaries]);
  const answeredNodes = nodes.filter((node: any) => node.kind === 'gateway'
    ? Boolean(gatewayAnswers[node.nodeId])
    : Boolean(controlResponses[node.nodeId]));
  const answerText = (node: any) => {
    if (node.kind === 'gateway') {
      const gatewayDefinition = state.gateways.find((item: any) => item.questionId === node.nodeId);
      return label(gatewayDefinition?.responseOptions?.find((option: any) => option.value === gatewayAnswers[node.nodeId])?.label ?? gatewayAnswers[node.nodeId]);
    }
    const selected = controlResponses[node.nodeId];
    if (selected?.responseState === 'unknown') return 'I do not know';
    return label(state.responseScale.find((option: any) => option.responseValue === selected?.responseValue)?.label ?? 'Answer recorded');
  };

  if (submitted || state.navigation?.current_screen === 'complete') return (
    <Card>
      <CardHeader>
        <Badge>Assessment submitted</Badge>
        <h1 ref={completionHeadingRef} tabIndex={-1} className="mt-3 text-2xl font-semibold tracking-tight text-mk-ink">Your assessment is complete</h1>
      </CardHeader>
      <CardContent className="space-y-4 text-sm leading-6 text-mk-muted">
        <p>Your responses have been securely recorded and your persisted result is ready.</p>
        <p className="font-medium text-mk-ink">Reference: {assessmentReference}</p>
        <div className="flex flex-wrap gap-3">
          {snapshotUrl ? <Button asChild><Link href={snapshotUrl}>See my Fraud Readiness Snapshot</Link></Button> : <Button type="button" onClick={() => void submit()} disabled={saveState === 'saving'}>Prepare your snapshot</Button>}
          <Button type="button" variant="secondary" onClick={() => setShowReviewAnswers((value) => !value)}>{showReviewAnswers ? 'Hide my answers' : 'Review my answers'}</Button>
        </div>
        {showReviewAnswers ? <div className="rounded-xl border border-mk-line bg-mk-paper p-4"><h2 className="font-semibold text-mk-ink">Your answers</h2><ul className="mt-3 space-y-3">{answeredNodes.map((node: any) => <li key={node.nodeId}><p className="font-medium text-mk-ink">{label(node.prompt)}</p><p className="text-mk-muted">{answerText(node)}</p></li>)}</ul></div> : null}
      </CardContent>
    </Card>
  );

  if (screen === 'review' || !currentNode) return (
    <Card>
      <CardHeader><Badge>Review before submission</Badge><h1 ref={headingRef} tabIndex={-1} className="mt-3 text-2xl font-semibold text-mk-ink">Review your answers</h1></CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm leading-6 text-mk-muted">Check the answers you have provided before submitting. You can edit an earlier answer if anything needs changing.</p>
        <ul className="space-y-3 rounded-xl border border-mk-line bg-mk-paper p-4 text-sm leading-6">{answeredNodes.map((node: any) => <li key={node.nodeId}><p className="font-medium text-mk-ink">{label(node.prompt)}</p><p className="text-mk-muted">{answerText(node)}</p></li>)}</ul>
        <div className="flex flex-wrap gap-3"><Button type="button" variant="secondary" onClick={() => { setScreen('question'); setCurrentId(state.path.currentPreviousNode ?? state.path.currentNextNode); }}>Edit answers</Button><Button type="button" onClick={() => void submit()}>Submit assessment</Button></div>
      </CardContent>
    </Card>
  );

  const gateway = currentNode.kind === 'gateway' ? state.gateways.find((item: any) => item.questionId === currentNode.nodeId) : null;
  const response = currentNode.kind !== 'gateway' ? controlResponses[currentNode.nodeId] : null;
  const helpText = customerHelpFor(currentNode.nodeId);
  return <><div ref={rootRef} className="space-y-5" data-adaptive-assessment="true">
    <div className="rounded-2xl border border-mk-line bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-mk-ink">Assessment progress</p><p className="mt-1 text-xs text-mk-muted">{timeRemaining}</p></div><p role="status" aria-live="polite" aria-atomic="true" className="text-xs text-mk-muted">{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save needs attention' : 'Ready'}</p></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-mk-line" role="progressbar" aria-label="Assessment completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-full bg-mk-charcoal" style={{ width: `${progress}%` }} /></div></div>
    {message ? <div role="alert" className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-sm text-mk-danger">{message}<Button type="button" variant="secondary" className="mt-3" onClick={() => void reload()}>Reload saved state</Button></div> : null}
    <Card><CardHeader><Badge>{currentNode.kind === 'gateway' ? 'About your organisation' : label(String(domainNameByCode.get(currentNode.domainCode) ?? 'Your fraud readiness'))}</Badge><h1 ref={headingRef} tabIndex={-1} className="mt-3 text-2xl font-semibold leading-tight text-mk-ink">{label(currentNode.prompt)}</h1>{helpText ? <div className="mt-4 rounded-xl border border-mk-line bg-mk-paper p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-mk-muted">What we mean</p><p className="mt-2 text-sm leading-6 text-mk-muted">{helpText}</p></div> : null}</CardHeader><CardContent className="space-y-5">
      {currentNode.guidance ? <details className="rounded-xl border border-mk-line bg-mk-paper p-4"><summary className="cursor-pointer text-sm font-semibold text-mk-ink">Examples of evidence that may support your answer</summary><p className="mt-3 text-sm leading-6 text-mk-muted">{currentNode.guidance.goodEvidenceLooksLike}</p><ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-mk-muted">{currentNode.guidance.exampleArtifacts.map((item: string) => <li key={item}>{item}</li>)}</ul>{currentNode.guidance.likelyEvidenceOwner ? <p className="mt-3 text-xs text-mk-muted">Who may hold this evidence: {currentNode.guidance.likelyEvidenceOwner}</p> : null}</details> : null}
      {gateway ? <fieldset><legend className="sr-only">Choose an answer for {label(currentNode.prompt)}</legend><div className="grid gap-3 sm:grid-cols-2">{gateway.responseOptions.map((option: any) => <label key={option.value} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-4 text-sm ${gatewayAnswers[gateway.questionId] === option.value ? 'border-mk-charcoal bg-mk-cream font-semibold' : 'border-mk-line bg-white'}`}><input type="radio" name={gateway.questionId} value={option.value} checked={gatewayAnswers[gateway.questionId] === option.value} onChange={() => chooseGateway(currentNode, option.value)} /><span>{label(option.label)}</span></label>)}</div></fieldset> : <fieldset><legend className="sr-only">Choose a maturity response for {label(currentNode.prompt)}</legend><div className="grid gap-3 sm:grid-cols-2">{state.responseScale.map((option: any) => <label key={option.responseValue} className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm ${response?.responseState === 'maturity' && response.responseValue === option.responseValue ? 'border-mk-charcoal bg-mk-cream font-semibold' : 'border-mk-line bg-white'}`}><input type="radio" name={currentNode.nodeId} checked={response?.responseState === 'maturity' && response.responseValue === option.responseValue} onChange={() => chooseControl(currentNode, { responseState: 'maturity', responseValue: option.responseValue })} /><span><span className="block">{label(option.label)}</span><span className="mt-1 block text-xs font-normal text-mk-muted">{label(option.operationalMeaning ?? '')}</span></span></label>)}<label className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm ${response?.responseState === 'unknown' ? 'border-mk-charcoal bg-mk-cream font-semibold' : 'border-mk-line bg-white'}`}><input type="radio" name={currentNode.nodeId} checked={response?.responseState === 'unknown'} onChange={() => chooseControl(currentNode, { responseState: 'unknown', responseValue: null })} /><span><span className="block">I do not know</span><span className="mt-1 block text-xs font-normal text-mk-muted">This remains an applicable response and is recorded as uncertainty.</span></span></label></div></fieldset>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-mk-line pt-5"><Button type="button" variant="secondary" disabled={!previousNode} onClick={() => { if (autoAdvanceTimerRef.current) { window.clearTimeout(autoAdvanceTimerRef.current); autoAdvanceTimerRef.current = null; } if (previousNode) { setCurrentId(previousNode.nodeId); setScreen(previousNode.kind === 'gateway' ? 'gateway' : 'question'); void persist({ nextGatewayAnswers: gatewayAnswers, nextControlResponses: controlResponses, nextScreen: previousNode.kind === 'gateway' ? 'gateway' : 'question', nextId: previousNode.nodeId, preservePosition: true }); } }}>Back</Button><div className="flex flex-wrap items-center justify-end gap-3"><Button type="button" variant="ghost" onClick={() => void persist({ nextGatewayAnswers: gatewayAnswers, nextControlResponses: controlResponses, nextScreen: screen, nextId: currentId, preservePosition: true })}>Save now</Button><p className="text-xs text-mk-muted">Selecting an answer saves and continues automatically.</p></div></div>
    </CardContent></Card>
  </div>{invalidation && typeof document !== 'undefined' ? createPortal(
    <div className="fixed inset-0 z-50 overflow-y-auto bg-mk-ink/45 p-4 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="adaptive-invalidation-title" aria-describedby="adaptive-invalidation-description" ref={dialogRef}>
      <div className="flex min-h-full items-start justify-center py-4 sm:items-center sm:py-0">
        <div className="w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6">
          <h2 id="adaptive-invalidation-title" className="text-xl font-semibold text-mk-ink">This change affects saved answers</h2>
          <p id="adaptive-invalidation-description" className="mt-3 text-sm leading-6 text-mk-muted">Changing this answer may remove saved answers from the current assessment path. Their history is retained. Do you want to save this change?</p>
          <div className="mt-5 flex flex-wrap justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setInvalidation(null)}>Keep current answer</Button>
            <Button type="button" onClick={() => { const value = invalidation; setInvalidation(null); void persist({ nextGatewayAnswers: value.nextGatewayAnswers, nextControlResponses: value.nextControlResponses, nextScreen: value.nextScreen, nextId: value.nextId, confirmGatewayChange: true }); }}>Save this change</Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  ) : null}</>;
}
