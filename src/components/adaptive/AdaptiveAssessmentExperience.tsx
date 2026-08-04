'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Link from 'next/link';

type AdaptiveState = any;

function label(value: string) { return value.replace(/^\s*(?:G\d{2}|D\d{1,2}-Q\d{1,2}|OV-[^·:—-]+)\s*(?:[·:—-]\s*)?/i, '').trim(); }

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
  const headingRef = useRef<HTMLHeadingElement>(null);

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

  async function persist(nextGatewayAnswers = gatewayAnswers, nextControlResponses = controlResponses, nextScreen = screen, nextId = currentId, confirmGatewayChange = false, preservePosition = false) {
    setSaveState('saving'); setMessage(null);
    const response = await fetch(`/score/api/adaptive/${encodeURIComponent(assessmentReference)}/state`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      token, expectedSaveSequence: Number(state.navigation.save_sequence), currentScreen: nextScreen, currentQuestionId: nextId,
      visitedQuestionIds: visited.includes(nextId ?? '') ? visited : nextId ? [...visited, nextId] : visited,
      gatewayAnswers: nextGatewayAnswers, controlResponses: nextControlResponses, confirmGatewayChange
    }) });
    const body = await response.json().catch(() => ({}));
    if (body.reason === 'gateway_change_confirmation_required') { setSaveState('ready'); setInvalidation({ ...body, nextGatewayAnswers, nextControlResponses, nextScreen, nextId }); return false; }
    if (body.reason === 'save_conflict') { setSaveState('error'); setMessage('This assessment was updated in another tab. Reloading the current saved state.'); await reload(); return false; }
    if (!response.ok || !body.ok) { setSaveState('error'); setMessage((body.errors ?? ['Save failed. Please retry.']).join(' ')); return false; }
    setState(body.state); setGatewayAnswers(body.state.gatewayAnswers ?? nextGatewayAnswers); setControlResponses(body.state.controlResponses ?? nextControlResponses);
    setScreen(preservePosition ? nextScreen : body.state.navigation.current_screen); setCurrentId(preservePosition ? nextId : body.state.path.currentNextNode ?? null); setVisited(body.state.navigation.visited_question_ids ?? visited); setSaveState('saved');
    return true;
  }

  async function reload() {
    const response = await fetch(`/score/api/adaptive/${encodeURIComponent(assessmentReference)}/state?token=${encodeURIComponent(token)}`);
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.ok) { setState(body.state); setGatewayAnswers(body.state.gatewayAnswers ?? {}); setControlResponses(body.state.controlResponses ?? {}); setScreen(body.state.navigation.current_screen); setCurrentId(body.state.path.currentNextNode ?? null); setVisited(body.state.navigation.visited_question_ids ?? []); setSaveState('saved'); setMessage(null); }
  }

  async function chooseGateway(node: any, value: string) {
    const next = { ...gatewayAnswers, [node.nodeId]: value }; setGatewayAnswers(next);
    await persist(next, controlResponses, 'gateway', node.nodeId, false, true);
  }

  async function chooseControl(node: any, response: { responseState: 'maturity' | 'unknown'; responseValue: number | null }) {
    const next = { ...controlResponses, [node.nodeId]: response }; setControlResponses(next);
    await persist(gatewayAnswers, next, 'question', node.nodeId, false, true);
  }

  async function continueFromCurrent() {
    if (!currentNode || saveState === 'saving') return;
    const selected = currentNode.kind === 'gateway' ? gatewayAnswers[currentNode.nodeId] : controlResponses[currentNode.nodeId];
    if (!selected) {
      setMessage('Choose an answer before continuing.');
      return;
    }
    await persist(gatewayAnswers, controlResponses, screen, currentId, false, false);
  }

  async function submit() {
    setSaveState('saving'); setMessage(null);
    const response = await fetch(`/score/api/adaptive/${encodeURIComponent(assessmentReference)}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, expectedSaveSequence: Number(state.navigation.save_sequence) }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) { setSaveState('error'); setMessage((body.errors ?? ['Submission could not be completed.']).join(' ')); return; }
    setState(body.state); setSnapshotUrl(body.snapshotUrl ?? null); setSubmitted(true); setSaveState('saved');
  }

  const domainProgress = useMemo(() => (state.path?.domainBoundaries ?? []).filter((domain: any) => domain.activeCount > 0), [state.path?.domainBoundaries]);
  if (submitted || state.navigation?.current_screen === 'complete') return <Card><CardHeader><Badge>Assessment submitted</Badge><CardTitle className="mt-3">Your assessment is complete</CardTitle></CardHeader><CardContent className="space-y-4 text-sm leading-6 text-mk-muted"><p>Your responses have been securely recorded and your persisted result is ready.</p><p>Applicable assessment areas recorded: {state.path?.nodes?.length ?? 0}.</p><p className="font-medium text-mk-ink">Reference: {assessmentReference}</p>{snapshotUrl ? <Button asChild><Link href={snapshotUrl}>View your Fraud Readiness Result</Link></Button> : <><p>The result link is being prepared.</p><Button type="button" onClick={() => void submit()} disabled={saveState === 'saving'}>Prepare your result</Button></>}</CardContent></Card>;

  if (screen === 'review' || !currentNode) return <Card><CardHeader><Badge>Review before submission</Badge><h1 ref={headingRef} tabIndex={-1} className="mt-3 text-2xl font-semibold text-mk-ink">Review your assessed scope</h1></CardHeader><CardContent className="space-y-6"><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-mk-paper p-4"><p className="text-xs text-mk-muted">Applicable</p><p className="mt-1 text-2xl font-semibold">{state.path.activePathCount}</p></div><div className="rounded-xl bg-mk-paper p-4"><p className="text-xs text-mk-muted">Excluded</p><p className="mt-1 text-2xl font-semibold">{state.path.excludedCount}</p></div><div className="rounded-xl bg-mk-paper p-4"><p className="text-xs text-mk-muted">Redirected</p><p className="mt-1 text-2xl font-semibold">{state.path.redirectedCount}</p></div></div><div><h2 className="font-semibold text-mk-ink">Scope notes</h2><ul className="mt-3 space-y-2 text-sm text-mk-muted">{state.path.nodes.filter((node: any) => node.state === 'excluded' || node.state === 'redirected').slice(0, 12).map((node: any) => <li key={node.nodeId}><strong>{node.nodeId}</strong> — {node.state === 'excluded' ? `excluded (${node.skipReason ?? 'gateway scope'})` : `redirected to ${node.redirectTo}`}</li>)}</ul></div>{state.integritySignals?.length ? <div><h2 className="font-semibold text-mk-ink">Assessment notes</h2><ul className="mt-3 space-y-2 text-sm text-mk-muted">{state.integritySignals.map((signal: any) => <li key={signal.signalId}>{signal.signalId.replaceAll('_', ' ')}</li>)}</ul></div> : null}<div className="flex flex-wrap gap-3"><Button type="button" variant="secondary" onClick={() => { setScreen('question'); setCurrentId(state.path.currentPreviousNode ?? state.path.currentNextNode); }}>Edit answers</Button><Button type="button" disabled={saveState === 'saving'} onClick={() => void submit()}>Submit assessment</Button></div></CardContent></Card>;

  const gateway = currentNode.kind === 'gateway' ? state.gateways.find((item: any) => item.questionId === currentNode.nodeId) : null;
  const response = currentNode.kind !== 'gateway' ? controlResponses[currentNode.nodeId] : null;
  return <div className="space-y-5" data-adaptive-assessment="true">
    <div className="rounded-2xl border border-mk-line bg-white p-4" aria-live="polite"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold text-mk-ink">Assessment · {progress}% complete</p><p className="mt-1 text-xs text-mk-muted">{state.path.completedApplicableCount} of {state.path.activePathCount} applicable controls complete · {state.path.unansweredApplicableCount} remaining</p></div><p className="text-xs text-mk-muted">{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'error' ? 'Save needs attention' : 'Ready'}</p></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-mk-line" role="progressbar" aria-label="Assessment completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><div className="h-full bg-mk-charcoal" style={{ width: `${progress}%` }} /></div></div>
    {message ? <div role="alert" className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-sm text-mk-danger">{message}<Button type="button" variant="secondary" className="mt-3" onClick={() => void reload()}>Reload saved state</Button></div> : null}
    <Card><CardHeader><Badge>{currentNode.kind === 'gateway' ? 'About your organisation' : `Domain ${currentNode.domainCode}`}</Badge><h1 ref={headingRef} tabIndex={-1} className="mt-3 text-2xl font-semibold leading-tight text-mk-ink">{label(currentNode.prompt)}</h1>{currentNode.controlObjective ? <p className="mt-3 text-sm leading-6 text-mk-muted">Why this matters: {currentNode.controlObjective}</p> : <p className="mt-3 text-sm leading-6 text-mk-muted">This short question helps tailor which controls are relevant to your organisation.</p>}</CardHeader><CardContent className="space-y-5">
      {currentNode.guidance ? <details className="rounded-xl border border-mk-line bg-mk-paper p-4"><summary className="cursor-pointer text-sm font-semibold text-mk-ink">Examples of evidence that may support your answer</summary><p className="mt-3 text-sm leading-6 text-mk-muted">{currentNode.guidance.goodEvidenceLooksLike}</p><ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-mk-muted">{currentNode.guidance.exampleArtifacts.map((item: string) => <li key={item}>{item}</li>)}</ul>{currentNode.guidance.likelyEvidenceOwner ? <p className="mt-3 text-xs text-mk-muted">Who may hold this evidence: {currentNode.guidance.likelyEvidenceOwner}</p> : null}</details> : null}
      {gateway ? <fieldset><legend className="sr-only">Select one answer</legend><div className="grid gap-3 sm:grid-cols-2">{gateway.responseOptions.map((option: any) => <label key={option.value} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-4 text-sm ${gatewayAnswers[gateway.questionId] === option.value ? 'border-mk-charcoal bg-mk-cream font-semibold' : 'border-mk-line bg-white'}`}><input type="radio" name={gateway.questionId} value={option.value} checked={gatewayAnswers[gateway.questionId] === option.value} onChange={() => void chooseGateway(currentNode, option.value)} disabled={saveState === 'saving'} /><span>{label(option.label)}</span></label>)}</div></fieldset> : <fieldset><legend className="sr-only">Select a maturity response</legend><div className="grid gap-3 sm:grid-cols-2">{state.responseScale.map((option: any) => <label key={option.responseValue} className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm ${response?.responseState === 'maturity' && response.responseValue === option.responseValue ? 'border-mk-charcoal bg-mk-cream font-semibold' : 'border-mk-line bg-white'}`}><input type="radio" name={currentNode.nodeId} checked={response?.responseState === 'maturity' && response.responseValue === option.responseValue} onChange={() => void chooseControl(currentNode, { responseState: 'maturity', responseValue: option.responseValue })} disabled={saveState === 'saving'} /><span><span className="block">{label(option.label)}</span><span className="mt-1 block text-xs font-normal text-mk-muted">{label(option.operationalMeaning ?? '')}</span></span></label>)}<label className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm ${response?.responseState === 'unknown' ? 'border-mk-charcoal bg-mk-cream font-semibold' : 'border-mk-line bg-white'}`}><input type="radio" name={currentNode.nodeId} checked={response?.responseState === 'unknown'} onChange={() => void chooseControl(currentNode, { responseState: 'unknown', responseValue: null })} disabled={saveState === 'saving'} /><span><span className="block">I do not know</span><span className="mt-1 block text-xs font-normal text-mk-muted">This remains an applicable response and is recorded as uncertainty.</span></span></label></div></fieldset>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-mk-line pt-5"><Button type="button" variant="secondary" disabled={!previousNode || saveState === 'saving'} onClick={() => { if (previousNode) { setCurrentId(previousNode.nodeId); setScreen(previousNode.kind === 'gateway' ? 'gateway' : 'question'); void persist(gatewayAnswers, controlResponses, previousNode.kind === 'gateway' ? 'gateway' : 'question', previousNode.nodeId, false, true); } }}>Back</Button><div className="flex gap-3"><Button type="button" variant="ghost" disabled={saveState === 'saving'} onClick={() => void persist(gatewayAnswers, controlResponses, screen, currentId, false, true)}>Save now</Button><Button type="button" disabled={saveState === 'saving' || !response && !gatewayAnswers[currentNode.nodeId]} onClick={() => void continueFromCurrent()}>Continue</Button></div></div>
    </CardContent></Card>
    {invalidation ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-mk-ink/45 p-5" role="dialog" aria-modal="true" aria-labelledby="adaptive-invalidation-title"><div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"><h2 id="adaptive-invalidation-title" className="text-xl font-semibold text-mk-ink">This change affects saved answers</h2><p className="mt-3 text-sm leading-6 text-mk-muted">Changing this answer removes {invalidation.affectedQuestionIds.length} saved response(s) from the current assessment scope. Their history is retained. Do you want to continue?</p><div className="mt-5 flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setInvalidation(null)}>Keep current answer</Button><Button type="button" onClick={() => { const value = invalidation; setInvalidation(null); void persist(value.nextGatewayAnswers, value.nextControlResponses, value.nextScreen, value.nextId, true); }}>Change scope and continue</Button></div></div></div> : null}
    <div className="grid gap-3 sm:grid-cols-2">{domainProgress.map((domain: any) => <div key={domain.domainCode} className="rounded-xl border border-mk-line bg-white p-4 text-xs text-mk-muted"><div className="flex justify-between gap-3"><span>{domain.domainCode} · {label(domain.name)}</span><span>{domain.completedCount}/{domain.activeCount}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-mk-line"><div className="h-full bg-mk-charcoal" style={{ width: `${domain.activeCount ? (domain.completedCount / domain.activeCount) * 100 : 0}%` }} /></div></div>)}</div>
  </div>;
}
