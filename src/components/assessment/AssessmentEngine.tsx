'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { FreeSnapshotCard } from '@/components/assessment/FreeSnapshot';
import { evaluateNAEligibility, type ExposureSelectionMap } from '@/lib/respondent/na-rules';
import { buildCommercialSnapshotInsights } from '@/lib/snapshot/commercial-insights';
import type { FreeSnapshot } from '@/lib/snapshot/free-snapshot';

type Question = { id: string; prompt: string; helpText: string | null; nAAllowed: boolean; nARuleKey: string | null; isHardGate: boolean };
type Domain = { id: string; name: string; questions: Question[] };
type ScaleOption = { responseValue: number; label: string; operationalMeaning: string | null; normalisedScore: number };
type ExposureOption = { value: string; label: string; points: number };
type ExposureFactor = { id: string; name: string; options: ExposureOption[]; sortOrder: number };
type Progress = { totalQuestions: number; answeredQuestions: number; totalExposureFactors: number; answeredExposureFactors: number; overallPct: number };
type DraftAnswer = { questionId: string; responseValue: number | null; isNotApplicable: boolean; nAReason: string };
type ExposureAnswer = { exposureFactorId: string; selectedValue: string; selectedLabel: string; pointsAwarded: number };
type SavedAnswer = { questionId: string; responseValue: number | null; isNotApplicable: boolean; nAReason: string | null };
type SavedExposure = { exposureFactorId: string; selectedValue: string | null; selectedLabel: string | null; pointsAwarded: number };
type StepKey = 'exposure' | string;
type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'offline';

type AssessmentEngineProps = {
  assessmentReference: string;
  token: string;
  organisationName: string;
  respondentName: string;
  status: string;
  domains: Domain[];
  responseScale: ScaleOption[];
  exposureFactors: ExposureFactor[];
  savedAnswers: SavedAnswer[];
  savedExposureAnswers: SavedExposure[];
  initialProgress: Progress;
  initialActiveStep?: string | null;
  initialActiveQuestionId?: string | null;
  initialSavedAt?: string | null;
};

function publicLabel(value: string) {
  return value.replace(/^\s*(?:EXP-\d{1,2}|D\d{1,2}(?:-Q\d{1,2})?)\s*(?:[·:—-]\s*)?/i, '').trim();
}

function isAnswered(answer?: DraftAnswer) {
  if (!answer) return false;
  if (answer.isNotApplicable) return answer.nAReason.trim().length >= 5;
  return typeof answer.responseValue === 'number';
}

function answerMap(saved: SavedAnswer[]): Record<string, DraftAnswer> {
  return Object.fromEntries(saved.map((answer) => [answer.questionId, { ...answer, nAReason: answer.nAReason ?? '' }]));
}

function exposureMap(saved: SavedExposure[]): Record<string, ExposureAnswer> {
  return Object.fromEntries(saved.map((answer) => [answer.exposureFactorId, {
    exposureFactorId: answer.exposureFactorId, selectedValue: answer.selectedValue ?? '', selectedLabel: answer.selectedLabel ?? '', pointsAwarded: answer.pointsAwarded
  }]));
}

function factorRule(factor: ExposureFactor) {
  return ['highRiskProcessExposure', 'thirdPartyExposure', 'digitalChannelExposure', 'identityDataExposure'][factor.sortOrder - 1] ?? null;
}

function scrollToItem(id: string) {
  window.setTimeout(() => {
    const element = document.getElementById(id);
    if (!element) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    const focusable = element.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled), button:not(:disabled)');
    focusable?.focus({ preventScroll: true });
  }, 300);
}

export function AssessmentEngine(props: AssessmentEngineProps) {
  const initialAnswers = useMemo(() => answerMap(props.savedAnswers), [props.savedAnswers]);
  const initialExposure = useMemo(() => exposureMap(props.savedExposureAnswers), [props.savedExposureAnswers]);
  const derivedInitialStep = props.exposureFactors.some((factor) => !initialExposure[factor.id]?.selectedValue)
    ? 'exposure'
    : props.domains.find((domain) => domain.questions.some((question) => !isAnswered(initialAnswers[question.id])))?.id ?? props.domains[0]?.id ?? 'exposure';
  const validInitialStep = props.initialActiveStep === 'exposure' || props.domains.some((domain) => domain.id === props.initialActiveStep)
    ? props.initialActiveStep as StepKey : derivedInitialStep;
  const [activeStep, setActiveStep] = useState<StepKey>(validInitialStep);
  const [answers, setAnswers] = useState(initialAnswers);
  const [exposureAnswers, setExposureAnswers] = useState(initialExposure);
  const [progress, setProgress] = useState(props.initialProgress);
  const [saveState, setSaveState] = useState<SaveState>(props.initialSavedAt ? 'saved' : 'idle');
  const [savedAt, setSavedAt] = useState<string | null>(props.initialSavedAt ?? null);
  const [messages, setMessages] = useState<string[]>([]);
  const [pendingItem, setPendingItem] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<'idle' | 'saving' | 'submitting' | 'submitted'>('idle');
  const [snapshot, setSnapshot] = useState<FreeSnapshot | null>(null);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const retryRef = useRef<null | (() => Promise<void>)>(null);
  const interactionLockRef = useRef(false);
  const initialScrollDone = useRef(false);
  const pendingKey = `mk-assessment-pending:${props.assessmentReference}`;

  const activeDomain = props.domains.find((domain) => domain.id === activeStep);
  const exposureSelectionMap = useMemo<ExposureSelectionMap>(() => Object.fromEntries(props.exposureFactors.flatMap((factor) => {
    const key = factorRule(factor); return key ? [[key, exposureAnswers[factor.id]?.selectedValue]] : [];
  })), [exposureAnswers, props.exposureFactors]);
  const domainNumber = activeDomain ? props.domains.findIndex((domain) => domain.id === activeDomain.id) + 1 : 0;
  const isLocked = submitState !== 'idle';
  const interactionBlocked = Boolean(pendingItem) || isLocked || ['saving', 'error', 'offline'].includes(saveState);

  useEffect(() => {
    try {
      const pending = sessionStorage.getItem(pendingKey);
      if (!pending) return;
      const parsed = JSON.parse(pending);
      if (parsed?.answers) setAnswers((current) => ({ ...current, ...parsed.answers }));
      if (parsed?.exposureAnswers) setExposureAnswers((current) => ({ ...current, ...parsed.exposureAnswers }));
      setSaveState('offline');
      setMessages(['Unsaved answers from this browser are retained locally. Retry saving when connectivity returns.']);
    } catch { sessionStorage.removeItem(pendingKey); }
  }, [pendingKey]);

  useEffect(() => {
    if (initialScrollDone.current) return;
    initialScrollDone.current = true;
    const initialQuestion = props.initialActiveQuestionId
      ?? (validInitialStep === 'exposure'
        ? null
        : props.domains.find((domain) => domain.id === validInitialStep)?.questions.find((question) => !isAnswered(initialAnswers[question.id]))?.id ?? null);
    const initialExposureFactor = validInitialStep === 'exposure'
      ? props.exposureFactors.find((factor) => !initialExposure[factor.id]?.selectedValue)?.id ?? null
      : null;
    if (initialQuestion) scrollToItem(`question-${initialQuestion}`);
    else if (initialExposureFactor) scrollToItem(`exposure-${initialExposureFactor}`);
  }, [initialAnswers, initialExposure, props.domains, props.exposureFactors, props.initialActiveQuestionId, validInitialStep]);

  function calculate(nextAnswers = answers, nextExposure = exposureAnswers): Progress {
    const totalQuestions = props.domains.reduce((sum, domain) => sum + domain.questions.length, 0);
    const answeredQuestions = props.domains.reduce((sum, domain) => sum + domain.questions.filter((question) => isAnswered(nextAnswers[question.id])).length, 0);
    const answeredExposureFactors = props.exposureFactors.filter((factor) => Boolean(nextExposure[factor.id]?.selectedValue)).length;
    const total = totalQuestions + props.exposureFactors.length;
    return { totalQuestions, answeredQuestions, totalExposureFactors: props.exposureFactors.length, answeredExposureFactors, overallPct: total ? Math.round(((answeredQuestions + answeredExposureFactors) / total) * 100) : 0 };
  }

  async function persist(nextAnswers: Record<string, DraftAnswer>, nextExposure: Record<string, ExposureAnswer>, navigation: { step: StepKey; questionId: string | null; eventType?: string }) {
    const nextProgress = calculate(nextAnswers, nextExposure);
    setProgress(nextProgress); setSaveState('saving'); setMessages([]);
    try {
      const response = await fetch(`/score/api/assessments/${props.assessmentReference}/answers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: props.token, answers: Object.values(nextAnswers), exposureAnswers: Object.values(nextExposure).filter((answer) => answer.selectedValue), navigation: {
          activeDomainKey: navigation.step, activeQuestionId: navigation.questionId, completionPercentage: nextProgress.overallPct, eventType: navigation.eventType ?? 'answer_saved'
        } })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error((body.errors ?? ['Draft could not be saved.']).join(' '));
      sessionStorage.removeItem(pendingKey); setSaveState('saved'); setSavedAt(body.savedAt ?? new Date().toISOString()); setProgress(body.progress ?? nextProgress);
      return true;
    } catch (error) {
      sessionStorage.setItem(pendingKey, JSON.stringify({ answers: nextAnswers, exposureAnswers: nextExposure }));
      setSaveState(navigator.onLine ? 'error' : 'offline');
      setMessages([error instanceof Error ? error.message : 'Draft could not be saved. Retry before continuing.']);
      return false;
    }
  }

  function nextAfterQuestion(domain: Domain, questionId: string, nextAnswers: Record<string, DraftAnswer>) {
    const index = domain.questions.findIndex((question) => question.id === questionId);
    const nextQuestion = domain.questions.slice(index + 1).find((question) => !isAnswered(nextAnswers[question.id]))
      ?? domain.questions.find((question) => !isAnswered(nextAnswers[question.id]));
    if (nextQuestion) return { step: domain.id, questionId: nextQuestion.id, domId: `question-${nextQuestion.id}`, domainCompleted: false };
    const domainIndex = props.domains.findIndex((item) => item.id === domain.id);
    const nextDomain = [...props.domains.slice(domainIndex + 1), ...props.domains.slice(0, domainIndex)]
      .find((item) => item.questions.some((question) => !isAnswered(nextAnswers[question.id])));
    if (nextDomain) {
      const question = nextDomain.questions.find((item) => !isAnswered(nextAnswers[item.id]))!;
      return { step: nextDomain.id, questionId: question.id, domId: `question-${question.id}`, domainCompleted: true };
    }
    return { step: domain.id, questionId: null, domId: 'assessment-submit', domainCompleted: true };
  }

  async function saveQuestion(question: Question, responseValue: number) {
    if (interactionBlocked || interactionLockRef.current) return;
    const domain = props.domains.find((item) => item.questions.some((candidate) => candidate.id === question.id));
    if (!domain) return;
    interactionLockRef.current = true;
    const next = { ...answers, [question.id]: { questionId: question.id, responseValue, isNotApplicable: false, nAReason: '' } };
    const target = nextAfterQuestion(domain, question.id, next);
    setAnswers(next); setPendingItem(question.id);
    const retry = async () => { if (await persist(next, exposureAnswers, { step: target.step, questionId: target.questionId, eventType: target.domainCompleted ? 'domain_completed' : 'answer_saved' })) { setActiveStep(target.step); scrollToItem(target.domId); } };
    retryRef.current = retry;
    const saved = await persist(next, exposureAnswers, { step: target.step, questionId: target.questionId, eventType: target.domainCompleted ? 'domain_completed' : 'answer_saved' });
    interactionLockRef.current = false; setPendingItem(null);
    if (saved) { setActiveStep(target.step); scrollToItem(target.domId); }
  }

  async function saveExposure(factor: ExposureFactor, selectedValue: string) {
    if (interactionBlocked || interactionLockRef.current) return;
    const option = factor.options.find((item) => item.value === selectedValue);
    if (!option) return;
    interactionLockRef.current = true;
    const next = { ...exposureAnswers, [factor.id]: { exposureFactorId: factor.id, selectedValue, selectedLabel: option.label, pointsAwarded: option.points } };
    const index = props.exposureFactors.findIndex((item) => item.id === factor.id);
    const nextFactor = props.exposureFactors.slice(index + 1).find((item) => !next[item.id]?.selectedValue)
      ?? props.exposureFactors.find((item) => !next[item.id]?.selectedValue);
    const nextDomain = props.domains.find((domain) => domain.questions.some((question) => !isAnswered(answers[question.id]))) ?? props.domains[0];
    const step = nextFactor ? 'exposure' : nextDomain?.id ?? 'exposure';
    const questionId = nextFactor ? null : nextDomain?.questions.find((question) => !isAnswered(answers[question.id]))?.id ?? null;
    const domId = nextFactor ? `exposure-${nextFactor.id}` : questionId ? `question-${questionId}` : 'assessment-submit';
    setExposureAnswers(next); setPendingItem(factor.id);
    const retry = async () => { if (await persist(answers, next, { step, questionId, eventType: nextFactor ? 'answer_saved' : 'domain_completed' })) { setActiveStep(step); scrollToItem(domId); } };
    retryRef.current = retry;
    const saved = await persist(answers, next, { step, questionId, eventType: nextFactor ? 'answer_saved' : 'domain_completed' });
    interactionLockRef.current = false; setPendingItem(null);
    if (saved) { setActiveStep(step); scrollToItem(domId); }
  }

  function toggleNA(question: Question, checked: boolean) {
    if (interactionBlocked) return;
    const next = { ...answers, [question.id]: { questionId: question.id, responseValue: checked ? null : answers[question.id]?.responseValue ?? null, isNotApplicable: checked, nAReason: checked ? answers[question.id]?.nAReason ?? '' : '' } };
    setAnswers(next); setSaveState('idle');
  }

  async function saveNAReason(question: Question) {
    const answer = answers[question.id];
    if (!answer?.isNotApplicable || answer.nAReason.trim().length < 5 || interactionBlocked || interactionLockRef.current) return;
    const domain = props.domains.find((item) => item.questions.some((candidate) => candidate.id === question.id));
    if (!domain) return;
    interactionLockRef.current = true;
    const target = nextAfterQuestion(domain, question.id, answers);
    setPendingItem(question.id);
    const retry = async () => { if (await persist(answers, exposureAnswers, { step: target.step, questionId: target.questionId, eventType: target.domainCompleted ? 'domain_completed' : 'answer_saved' })) { setActiveStep(target.step); scrollToItem(target.domId); } };
    retryRef.current = retry;
    const saved = await persist(answers, exposureAnswers, { step: target.step, questionId: target.questionId, eventType: target.domainCompleted ? 'domain_completed' : 'answer_saved' });
    interactionLockRef.current = false; setPendingItem(null);
    if (saved) { setActiveStep(target.step); scrollToItem(target.domId); }
  }

  async function submit() {
    if (interactionBlocked || interactionLockRef.current) return;
    interactionLockRef.current = true;
    setSubmitState('saving');
    const saved = await persist(answers, exposureAnswers, { step: activeStep, questionId: null, eventType: 'assessment_completed' });
    if (!saved) { interactionLockRef.current = false; setSubmitState('idle'); return; }
    setSubmitState('submitting');
    const response = await fetch(`/score/api/assessments/${props.assessmentReference}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: props.token }) });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.ok) { interactionLockRef.current = false; setMessages(body.errors ?? ['Assessment could not be submitted.']); setSubmitState('idle'); return; }
    interactionLockRef.current = false;
    setSnapshot(body.snapshot ?? null); setSnapshotUrl(body.snapshotUrl ?? null); setSubmitState('submitted'); setSaveState('saved');
  }

  if (submitState === 'submitted') {
    const insights = snapshot ? buildCommercialSnapshotInsights(snapshot) : null;
    return snapshot && insights ? <FreeSnapshotCard snapshot={snapshot} snapshotUrl={snapshotUrl} commercialInsights={insights} /> : <Card><CardHeader><CardTitle>Assessment submitted</CardTitle></CardHeader><CardContent>Reference: {props.assessmentReference}</CardContent></Card>;
  }

  return (
    <div className="mx-auto max-w-6xl" data-assessment-native="true">
      <div className="mb-5 rounded-2xl border border-mk-line bg-white p-4 shadow-sm" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <div><p className="font-semibold text-mk-ink">{activeDomain ? `Domain ${domainNumber} of ${props.domains.length}` : 'Exposure profile'} · {progress.overallPct}% complete</p><p className="mt-1 text-xs text-mk-muted">{progress.answeredQuestions}/{progress.totalQuestions} questions · {progress.answeredExposureFactors}/{progress.totalExposureFactors} exposure factors</p></div>
          <div className="text-right text-xs text-mk-muted"><p>{saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : saveState === 'offline' ? 'Offline · not saved' : saveState === 'error' ? 'Save failed' : 'Ready'}</p>{savedAt ? <p>Last saved {new Date(savedAt).toLocaleTimeString('en-ZA')}</p> : null}</div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-mk-line" role="progressbar" aria-label="Assessment completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.overallPct}><div className="h-full bg-mk-charcoal transition-[width] motion-reduce:transition-none" style={{ width: `${progress.overallPct}%` }} /></div>
      </div>

      <label className="mb-5 block sm:hidden">
        <span className="mb-2 block text-sm font-semibold text-mk-ink">Jump to a section</span>
        <select value={activeStep} disabled={interactionBlocked} onChange={(event) => setActiveStep(event.target.value)} className="min-h-12 w-full rounded-xl border border-mk-line bg-white px-4 text-sm font-semibold text-mk-ink">
          <option value="exposure">Exposure profile</option>
          {props.domains.map((domain, index) => <option key={domain.id} value={domain.id}>Domain {index + 1}: {publicLabel(domain.name)}</option>)}
        </select>
      </label>
      <nav aria-label="Assessment domains" className="mb-5 hidden flex-wrap gap-2 sm:flex">
        <button type="button" disabled={interactionBlocked} onClick={() => setActiveStep('exposure')} className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${activeStep === 'exposure' ? 'border-mk-charcoal bg-mk-charcoal text-white' : 'border-mk-line bg-white text-mk-muted'}`}>Exposure {Math.round((progress.answeredExposureFactors / Math.max(1, progress.totalExposureFactors)) * 100)}%</button>
        {props.domains.map((domain, index) => {
          const complete = domain.questions.every((question) => isAnswered(answers[question.id]));
          return <button key={domain.id} type="button" disabled={interactionBlocked} onClick={() => { setActiveStep(domain.id); const first = domain.questions.find((question) => !isAnswered(answers[question.id])) ?? domain.questions[0]; if (first) scrollToItem(`question-${first.id}`); }} className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${activeStep === domain.id ? 'border-mk-charcoal bg-mk-charcoal text-white' : 'border-mk-line bg-white text-mk-muted'}`}>Domain {index + 1}{complete ? ' ✓' : ''}</button>;
        })}
      </nav>

      {messages.length ? <div className="mb-5 rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-sm text-mk-danger" role="alert">{messages.map((message) => <p key={message}>{message}</p>)}<Button type="button" variant="secondary" className="mt-3" onClick={() => { if (interactionLockRef.current) return; interactionLockRef.current = true; void retryRef.current?.().finally(() => { interactionLockRef.current = false; }); }}>Retry save</Button></div> : null}

      <Card>
        <CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>{publicLabel(activeDomain?.name ?? 'Exposure profile')}</CardTitle><p className="mt-2 text-sm text-mk-muted">{publicLabel(props.organisationName)} · {props.respondentName}</p></div><Badge>{props.status === 'draft' ? 'In progress' : props.status}</Badge></div></CardHeader>
        <CardContent>
          {activeStep === 'exposure' ? (
            <div className="space-y-5">{props.exposureFactors.map((factor) => <fieldset id={`exposure-${factor.id}`} key={factor.id} className="scroll-mt-28 rounded-2xl border border-mk-line p-5"><legend className="px-1 text-base font-semibold text-mk-ink">{publicLabel(factor.name)}</legend><div className="mt-3 grid gap-2 sm:grid-cols-2">{factor.options.map((option) => <label key={option.value} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${exposureAnswers[factor.id]?.selectedValue === option.value ? 'border-mk-charcoal bg-mk-cream font-semibold' : 'border-mk-line bg-white'}`}><input type="radio" name={`exposure-${factor.id}`} value={option.value} checked={exposureAnswers[factor.id]?.selectedValue === option.value} disabled={interactionBlocked} onChange={() => void saveExposure(factor, option.value)} /><span>{publicLabel(option.label)}</span>{exposureAnswers[factor.id]?.selectedValue === option.value ? <span className="ml-auto" aria-label="Selected">✓</span> : null}</label>)}</div></fieldset>)}</div>
          ) : activeDomain ? (
            <div className="space-y-6">{activeDomain.questions.map((question, questionIndex) => {
              const answer = answers[question.id] ?? { questionId: question.id, responseValue: null, isNotApplicable: false, nAReason: '' };
              const eligibility = evaluateNAEligibility(question, exposureSelectionMap);
              return <fieldset id={`question-${question.id}`} key={question.id} className="scroll-mt-28 rounded-2xl border border-mk-line p-5"><legend className="px-1 text-base font-semibold leading-7 text-mk-ink"><span className="mr-2 text-mk-muted">{questionIndex + 1}.</span>{publicLabel(question.prompt)}</legend>{question.helpText ? <p className="mt-2 text-sm leading-6 text-mk-muted">{publicLabel(question.helpText)}</p> : null}<div className="mt-4 grid gap-2 sm:grid-cols-2">{props.responseScale.map((option) => <label key={option.responseValue} className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${!answer.isNotApplicable && answer.responseValue === option.responseValue ? 'border-mk-charcoal bg-mk-cream font-semibold' : 'border-mk-line bg-white'}`}><input type="radio" name={`question-${question.id}`} value={option.responseValue} checked={!answer.isNotApplicable && answer.responseValue === option.responseValue} disabled={interactionBlocked} onChange={() => void saveQuestion(question, option.responseValue)} /><span><span className="block">{publicLabel(option.label)}</span>{option.operationalMeaning ? <span className="mt-1 block text-xs font-normal text-mk-muted">{publicLabel(option.operationalMeaning)}</span> : null}</span>{!answer.isNotApplicable && answer.responseValue === option.responseValue ? <span className="ml-auto" aria-label="Selected">✓</span> : null}</label>)}</div>{question.nAAllowed ? <div className="mt-4"><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={answer.isNotApplicable} disabled={interactionBlocked || (!eligibility.allowed && !answer.isNotApplicable)} onChange={(event) => toggleNA(question, event.target.checked)} /><span>Not applicable</span></label>{answer.isNotApplicable ? <label className="mt-3 block text-sm"><span className="font-medium">Reason (minimum 5 characters)</span><textarea value={answer.nAReason} disabled={interactionBlocked} onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: { ...answer, nAReason: event.target.value } }))} onBlur={() => void saveNAReason(question)} className="mt-2 min-h-24 w-full rounded-xl border border-mk-line p-3 focus:border-mk-charcoal focus:outline-none" aria-describedby={`na-help-${question.id}`} /><span id={`na-help-${question.id}`} className="mt-1 block text-xs text-mk-muted">The assessment advances only after this reason saves successfully.</span></label> : null}</div> : null}</fieldset>;
            })}</div>
          ) : null}
          <div id="assessment-submit" className="mt-6 flex flex-col gap-3 border-t border-mk-line pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-mk-muted">Answers advance only after the server confirms the save. You can reopen any completed domain and amend an earlier answer.</p><div className="flex gap-3"><Button type="button" variant="secondary" disabled={interactionBlocked} onClick={() => void persist(answers, exposureAnswers, { step: activeStep, questionId: props.initialActiveQuestionId ?? null })}>Save now</Button><Button type="button" disabled={interactionBlocked} onClick={() => void submit()}>{submitState === 'saving' ? 'Saving…' : submitState === 'submitting' ? 'Submitting…' : 'Submit assessment'}</Button></div></div>
        </CardContent>
      </Card>
    </div>
  );
}
