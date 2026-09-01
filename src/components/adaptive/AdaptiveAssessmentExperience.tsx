'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { customerExplanationForNode } from '@/lib/adaptive/customer-explanations';
import { trackEvent } from '@/lib/website/gtag';
import Link from 'next/link';
import { createPortal } from 'react-dom';

type AdaptiveState = any;

type PendingWrite = {
  nextGatewayAnswers: Record<string, string>;
  nextControlResponses: Record<string, any>;
  nextScreen: string;
  nextId: string | null;
  confirmGatewayChange: boolean;
};

function label(value: string) {
  return value.replace(/^\s*(?:G\d{2}|D\d{1,2}-Q\d{1,2}|OV-[^·:\u2014-]+)\s*(?:[·:\u2014-]\s*)?/i, '').trim();
}

/**
 * Reports authoritative progress without exposing a question denominator. The phrase
 * "applicable assessment questions completed" belongs to the internal test vocabulary only; the
 * customer sees a percentage and the current area instead.
 */
export function assessmentProgressLabel(completedApplicableCount: number, activePathCount: number, applicabilityResolved: boolean) {
  const completed = Math.max(0, Math.floor(Number.isFinite(completedApplicableCount) ? completedApplicableCount : 0));
  const applicable = Math.max(0, Math.floor(Number.isFinite(activePathCount) ? activePathCount : 0));
  if (!applicabilityResolved) {
    return 'Your assessment scope is being determined. Tailoring the assessment to your organisation.';
  }
  if (applicable <= 0) return 'Your assessment scope is being determined.';
  return `${Math.min(100, Math.max(0, Math.round((completed / applicable) * 100)))}% complete.`;
}

function SubmissionProcessingCard({ assessmentReference }: { assessmentReference: string }) {
  return (
    <div aria-busy="true">
      <Card>
        <CardHeader>
          <Badge>Submission received</Badge>
          <h1 tabIndex={-1} className="mt-3 text-2xl font-semibold tracking-tight text-mk-ink">Preparing your Fraud Readiness Snapshot</h1>
        </CardHeader>
        <CardContent className="space-y-5 text-sm leading-6 text-mk-muted">
          <p>Your assessment has been submitted. We are calculating your result and preparing your personalised Snapshot.</p>
          <p className="font-medium text-mk-ink">Reference: {assessmentReference}</p>
          <div role="progressbar" aria-label="Preparing your Fraud Readiness Snapshot" aria-busy="true" className="h-2 overflow-hidden rounded-full bg-mk-line">
            <div className="h-full w-1/3 animate-pulse bg-mk-accent" />
          </div>
          <p role="status" aria-live="polite">Preparing your personalised Snapshot</p>
        </CardContent>
      </Card>
    </div>
  );
}

export function AdaptiveAssessmentExperience({ assessmentReference, token, initialState, visualReview = false }: { assessmentReference: string; token: string; initialState: AdaptiveState; visualReview?: boolean }) {
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
  const [submissionState, setSubmissionState] = useState<'idle' | 'processing' | 'error'>('idle');
  const savingRef = useRef(false);
  const pendingWriteRef = useRef<PendingWrite | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const completionHeadingRef = useRef<HTMLHeadingElement>(null);

  const nodes = state.path?.nodes ?? [];
  const activeNodes = state.path?.activeNodes ?? [];
  const currentNode = nodes.find((node: any) => node.nodeId === currentId)
    ?? activeNodes.find((node: any) => node.nodeId === state.path?.currentNextNode)
    ?? null;
  const activePathCount = Number(state.path?.activePathCount ?? 0);
  const completedApplicableCount = Number(state.path?.completedApplicableCount ?? 0);
  const progress = activePathCount > 0
    ? Math.min(100, Math.max(0, Math.round((completedApplicableCount / activePathCount) * 100)))
    : 0;
  const navigableNodes = nodes.filter((node: any) => node.state === 'active' || (node.kind === 'gateway' && node.state === 'profile-only'));
  const currentIndex = currentNode ? navigableNodes.findIndex((node: any) => node.nodeId === currentNode.nodeId) : -1;
  const previousNode = currentIndex > 0
    ? [...navigableNodes.slice(0, currentIndex)].reverse().find((node: any) =>
        node.kind === 'gateway' ? Boolean(gatewayAnswers[node.nodeId]) : Boolean(controlResponses[node.nodeId])
      ) ?? null
    : null;
  const domainNameByCode = useMemo(() => new Map(
    (state.path?.domainBoundaries ?? []).map((domain: any) => [domain.domainCode, domain.name])
  ), [state.path?.domainBoundaries]);
  const customerAreas = useMemo<string[]>(() => Array.from(new Set(
    (state.path?.domainBoundaries ?? [])
      .filter((domain: any) => domain.activeCount > 0 && domain.name)
      .map((domain: any) => String(domain.name))
  )), [state.path?.domainBoundaries]);
  const applicabilityResolved = !nodes.some((node: any) =>
    node.kind === 'gateway' && node.state === 'active' && !gatewayAnswers[node.nodeId]
  );
  const progressLabel = assessmentProgressLabel(completedApplicableCount, activePathCount, applicabilityResolved);

  const reload = useCallback(async () => {
    if (visualReview) {
      setMessage('This is a deterministic visual-review fixture. No assessment data is saved.');
      return;
    }
    try {
      const response = await fetch(`/score/api/adaptive/${encodeURIComponent(assessmentReference)}/state?token=${encodeURIComponent(token)}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error('reload_failed');
      setState(body.state);
      setGatewayAnswers(body.state.gatewayAnswers ?? {});
      setControlResponses(body.state.controlResponses ?? {});
      setScreen(body.state.navigation?.current_screen ?? 'gateway');
      setCurrentId(body.state.path?.currentNextNode ?? null);
      setVisited(body.state.navigation?.visited_question_ids ?? []);
      setSaveState('saved');
      setMessage(null);
    } catch {
      setSaveState('error');
      setMessage('The saved assessment could not be reloaded. Please try again.');
    }
  }, [assessmentReference, token, visualReview]);

  useEffect(() => { headingRef.current?.focus(); }, [currentId, screen]);

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
        pendingWriteRef.current = null;
        void reload();
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
  }, [invalidation, reload]);

  async function persist(
    nextGatewayAnswers = gatewayAnswers,
    nextControlResponses = controlResponses,
    nextScreen = screen,
    nextId = currentId,
    confirmGatewayChange = false
  ) {
    if (savingRef.current) return false;
    if (visualReview) {
      setMessage('This is a deterministic visual-review fixture. No assessment data is saved.');
      return false;
    }

    const write: PendingWrite = {
      nextGatewayAnswers,
      nextControlResponses,
      nextScreen,
      nextId,
      confirmGatewayChange
    };
    pendingWriteRef.current = write;
    savingRef.current = true;
    setSaveState('saving');
    setMessage(null);

    try {
      const response = await fetch(`/score/api/adaptive/${encodeURIComponent(assessmentReference)}/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          expectedSaveSequence: Number(state.navigation.save_sequence),
          currentScreen: nextScreen,
          currentQuestionId: nextId,
          visitedQuestionIds: visited.includes(nextId ?? '') ? visited : nextId ? [...visited, nextId] : visited,
          gatewayAnswers: nextGatewayAnswers,
          controlResponses: nextControlResponses,
          confirmGatewayChange
        })
      });
      const body = await response.json().catch(() => ({}));

      if (body.reason === 'gateway_change_confirmation_required') {
        previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setSaveState('ready');
        setInvalidation({ ...body, ...write });
        return false;
      }
      if (body.reason === 'save_conflict') {
        setSaveState('error');
        setMessage('This assessment was updated in another tab. Reloading the current saved state.');
        pendingWriteRef.current = null;
        await reload();
        return false;
      }
      if (!response.ok || !body.ok) {
        setSaveState('error');
        setMessage(Array.isArray(body.errors) && body.errors.length ? body.errors.join(' ') : 'Save failed. Please try again.');
        return false;
      }

      setState(body.state);
      setGatewayAnswers(body.state.gatewayAnswers ?? nextGatewayAnswers);
      setControlResponses(body.state.controlResponses ?? nextControlResponses);
      setScreen(body.state.navigation?.current_screen ?? nextScreen);
      setCurrentId(body.state.path?.currentNextNode ?? null);
      setVisited(body.state.navigation?.visited_question_ids ?? visited);
      setSaveState('saved');
      setMessage(null);
      pendingWriteRef.current = null;
      return true;
    } catch {
      setSaveState('error');
      setMessage('The answer could not be saved. Check your connection and try again.');
      return false;
    } finally {
      savingRef.current = false;
    }
  }

  async function retryLastSave() {
    const write = pendingWriteRef.current;
    if (!write || savingRef.current) return;
    await persist(
      write.nextGatewayAnswers,
      write.nextControlResponses,
      write.nextScreen,
      write.nextId,
      write.confirmGatewayChange
    );
  }

  async function chooseGateway(node: any, value: string) {
    if (savingRef.current) return;
    const next = { ...gatewayAnswers, [node.nodeId]: value };
    setGatewayAnswers(next);
    await persist(next, controlResponses, 'gateway', node.nodeId, false);
  }

  async function chooseControl(node: any, response: { responseState: 'maturity' | 'unknown'; responseValue: number | null }) {
    if (savingRef.current) return;
    const next = { ...controlResponses, [node.nodeId]: response };
    setControlResponses(next);
    await persist(gatewayAnswers, next, 'question', node.nodeId, false);
  }

  async function submit() {
    if (savingRef.current || submissionState === 'processing') return;
    if (visualReview) {
      setMessage('This is a deterministic visual-review fixture. No assessment is submitted.');
      return;
    }
    savingRef.current = true;
    setSubmissionState('processing');
    setSaveState('saving');
    setMessage(null);
    try {
      const response = await fetch(`/score/api/adaptive/${encodeURIComponent(assessmentReference)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, expectedSaveSequence: Number(state.navigation.save_sequence) })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) {
        setSubmissionState('error');
        setSaveState('error');
        setMessage(Array.isArray(body.errors) && body.errors.length ? body.errors.join(' ') : 'Submission could not be completed.');
        return;
      }
      if (typeof body.snapshotUrl !== 'string' || !body.snapshotUrl) {
        setSubmissionState('error');
        setSaveState('error');
        setMessage('Your assessment was submitted, but the private result link could not be opened. Please try again.');
        return;
      }
      setState(body.state);
      setSnapshotUrl(body.snapshotUrl);
      setSubmitted(true);
      setSaveState('saved');
      setSubmissionState('idle');
      trackEvent('fraud_readiness_completed', { flow: 'adaptive' });
      window.location.replace(body.snapshotUrl);
    } catch {
      setSubmissionState('error');
      setSaveState('error');
      setMessage('Submission could not be completed. Check your connection and try again.');
    } finally {
      savingRef.current = false;
    }
  }

  if (submissionState === 'processing') return <SubmissionProcessingCard assessmentReference={assessmentReference} />;

  if (submitted || state.navigation?.current_screen === 'complete') return (
    <Card>
      <CardHeader>
        <Badge>Assessment submitted</Badge>
        <h1 ref={completionHeadingRef} tabIndex={-1} className="mt-3 text-2xl font-semibold tracking-tight text-mk-ink">Your assessment is complete</h1>
      </CardHeader>
      <CardContent className="space-y-4 text-sm leading-6 text-mk-muted">
        <p>Your responses have been securely recorded. Your private result link is shown below when available.</p>
        <p className="font-medium text-mk-ink">Reference: {assessmentReference}</p>
        {snapshotUrl ? <Button asChild><Link href={snapshotUrl}>View your Fraud Readiness Result</Link></Button> : <p>We are preparing your private result link. Refresh this page to check again.</p>}
      </CardContent>
    </Card>
  );

  if (screen === 'review' || !currentNode) return (
    <Card>
      <CardHeader>
        <Badge>Ready to submit</Badge>
        <h1 ref={headingRef} tabIndex={-1} className="mt-3 text-2xl font-semibold text-mk-ink">Your assessment is ready to submit</h1>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-sm leading-6 text-mk-muted">Your responses have been recorded. Review the areas included below, edit an answer if needed, and submit when you are ready.</p>
        {submissionState === 'error' && message ? (
          <div role="alert" className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-sm text-mk-danger">
            <p>{message}</p>
            <Button type="button" variant="secondary" className="mt-3" onClick={() => void submit()}>Try submission again</Button>
          </div>
        ) : null}
        {customerAreas.length ? (
          <div className="rounded-xl bg-mk-paper p-4">
            <h2 className="font-semibold text-mk-ink">Areas included in your review</h2>
            <ul className="mt-3 grid gap-2 text-sm text-mk-muted sm:grid-cols-2">
              {customerAreas.map((area) => <li key={area} className="rounded-lg border border-mk-line bg-white px-3 py-2">{area}</li>)}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="secondary" onClick={() => { setScreen('question'); setCurrentId(state.path?.currentPreviousNode ?? state.path?.currentNextNode ?? null); }}>Edit answers</Button>
          <Button type="button" disabled={saveState === 'saving'} onClick={() => void submit()}>Submit assessment</Button>
        </div>
      </CardContent>
    </Card>
  );

  const gateway = currentNode.kind === 'gateway' ? state.gateways.find((item: any) => item.questionId === currentNode.nodeId) : null;
  const response = currentNode.kind !== 'gateway' ? controlResponses[currentNode.nodeId] : null;
  const areaName = currentNode.kind === 'gateway'
    ? 'About your organisation'
    : label(String(domainNameByCode.get(currentNode.domainCode) ?? 'Current assessment area'));
  const customerExplanation = customerExplanationForNode(String(currentNode.nodeId));
  const saving = saveState === 'saving';

  return <>
      <div ref={rootRef} className="space-y-5" data-adaptive-assessment="true" data-visual-review={visualReview ? 'true' : undefined}>
      <div className="rounded-2xl border border-mk-line bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-mk-ink">Assessment progress</p>
            <p className="mt-1 text-xs text-mk-muted">{progressLabel}</p>
          </div>
          <p role="status" aria-live="polite" aria-atomic="true" className="text-xs text-mk-muted">
            {saving ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save needs attention' : 'Ready'}
          </p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-mk-line" role="progressbar" aria-label="Assessment completion" aria-valuetext={progressLabel} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <div className="h-full bg-mk-charcoal" style={{ width: `${progress}%` }} />
        </div>
      </div>
      {message ? (
        <div role="alert" className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-sm text-mk-danger">
          <p>{message}</p>
          {saveState === 'error' && pendingWriteRef.current ? <Button type="button" variant="secondary" className="mt-3" onClick={() => void retryLastSave()}>Try saving again</Button> : null}
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <Badge>{areaName}</Badge>
          <h1 ref={headingRef} tabIndex={-1} className="mt-3 text-2xl font-semibold leading-tight text-mk-ink">{label(currentNode.prompt)}</h1>
          {customerExplanation ? <p className="mt-3 text-sm leading-6 text-mk-muted">{customerExplanation}</p> : null}
        </CardHeader>
        <CardContent className="space-y-5">
          {currentNode.guidance ? <details className="rounded-xl border border-mk-line bg-mk-paper p-4"><summary className="cursor-pointer text-sm font-semibold text-mk-ink">Examples of evidence that may support your answer</summary><p className="mt-3 text-sm leading-6 text-mk-muted">{currentNode.guidance.goodEvidenceLooksLike}</p><ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-mk-muted">{currentNode.guidance.exampleArtifacts.map((item: string) => <li key={item}>{item}</li>)}</ul>{currentNode.guidance.likelyEvidenceOwner ? <p className="mt-3 text-xs text-mk-muted">Who may hold this evidence: {currentNode.guidance.likelyEvidenceOwner}</p> : null}</details> : null}
          {gateway ? <fieldset><legend className="sr-only">Choose an answer for {label(currentNode.prompt)}</legend><div className="grid gap-3 sm:grid-cols-2">{gateway.responseOptions.map((option: any) => <label key={option.value} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-4 text-sm transition-colors ${gatewayAnswers[gateway.questionId] === option.value ? 'border-mk-charcoal bg-mk-cream font-semibold' : 'border-mk-line bg-white'}`}><input type="radio" name={gateway.questionId} value={option.value} checked={gatewayAnswers[gateway.questionId] === option.value} onChange={() => void chooseGateway(currentNode, option.value)} disabled={saving} /><span>{label(option.label)}</span></label>)}</div></fieldset> : <fieldset><legend className="sr-only">Choose a maturity response for {label(currentNode.prompt)}</legend><div className="grid gap-3 sm:grid-cols-2">{state.responseScale.map((option: any) => <label key={option.responseValue} className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm transition-colors ${response?.responseState === 'maturity' && response.responseValue === option.responseValue ? 'border-mk-charcoal bg-mk-cream font-semibold' : 'border-mk-line bg-white'}`}><input type="radio" name={currentNode.nodeId} checked={response?.responseState === 'maturity' && response.responseValue === option.responseValue} onChange={() => void chooseControl(currentNode, { responseState: 'maturity', responseValue: option.responseValue })} disabled={saving} /><span><span className="block">{label(option.label)}</span><span className="mt-1 block text-xs font-normal text-mk-muted">{label(option.operationalMeaning ?? '')}</span></span></label>)}<label className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm transition-colors ${response?.responseState === 'unknown' ? 'border-mk-charcoal bg-mk-cream font-semibold' : 'border-mk-line bg-white'}`}><input type="radio" name={currentNode.nodeId} checked={response?.responseState === 'unknown'} onChange={() => void chooseControl(currentNode, { responseState: 'unknown', responseValue: null })} disabled={saving} /><span><span className="block">I do not know</span><span className="mt-1 block text-xs font-normal text-mk-muted">This remains an applicable response and is recorded as uncertainty.</span></span></label></div></fieldset>}
          <div className="flex items-center justify-start border-t border-mk-line pt-5">
            <Button type="button" variant="secondary" disabled={!previousNode || saving} onClick={() => { if (previousNode) { setCurrentId(previousNode.nodeId); setScreen(previousNode.kind === 'gateway' ? 'gateway' : 'question'); setMessage(null); } }}>Back</Button>
          </div>
        </CardContent>
      </Card>
    </div>
    {invalidation && typeof document !== 'undefined' ? createPortal(
      <div className="fixed inset-0 z-50 overflow-y-auto bg-mk-ink/45 p-4 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="adaptive-invalidation-title" aria-describedby="adaptive-invalidation-description" ref={dialogRef}>
        <div className="flex min-h-full items-start justify-center py-4 sm:items-center sm:py-0">
          <div className="w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6">
            <h2 id="adaptive-invalidation-title" className="text-xl font-semibold text-mk-ink">This change affects saved answers</h2>
            <p id="adaptive-invalidation-description" className="mt-3 text-sm leading-6 text-mk-muted">Some saved answers are outside the new assessment scope. Their history is retained. Do you want to continue with this change?</p>
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => { setInvalidation(null); pendingWriteRef.current = null; void reload(); }}>Keep current answer</Button>
              <Button type="button" onClick={() => { const value = invalidation; setInvalidation(null); void persist(value.nextGatewayAnswers, value.nextControlResponses, value.nextScreen, value.nextId, true); }}>Change scope and continue</Button>
            </div>
          </div>
        </div>
      </div>,
      document.body
    ) : null}
  </>;
}
