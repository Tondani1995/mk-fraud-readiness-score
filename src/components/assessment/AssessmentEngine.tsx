'use client';

import { useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { FreeSnapshotCard } from '@/components/assessment/FreeSnapshot';
import { evaluateNAEligibility, type ExposureSelectionMap } from '@/lib/respondent/na-rules';
import type { FreeSnapshot } from '@/lib/snapshot/free-snapshot';
import type {
  AssessmentProgress,
  ExposureFactor,
  MethodologyDomain,
  ResponseScaleOption,
  SavedAssessmentAnswer,
  SavedExposureAnswer
} from '@/lib/types/domain';

const SCORE_BASE_PATH = '/score';

type DraftAnswer = {
  questionId: string;
  responseValue: number | null;
  isNotApplicable: boolean;
  nAReason: string;
};

type DraftExposureAnswer = {
  exposureFactorId: string;
  selectedValue: string;
  selectedLabel: string;
  pointsAwarded: number;
};

type AssessmentEngineProps = {
  assessmentReference: string;
  token: string;
  organisationName: string;
  respondentName: string;
  status: string;
  domains: MethodologyDomain[];
  responseScale: ResponseScaleOption[];
  exposureFactors: ExposureFactor[];
  savedAnswers: SavedAssessmentAnswer[];
  savedExposureAnswers: SavedExposureAnswer[];
  initialProgress: AssessmentProgress;
};

type StepKey = 'exposure' | string;
type SubmitState = 'idle' | 'saving' | 'submitting' | 'submitted';

function scorePath(path: string) {
  return `${SCORE_BASE_PATH}${path.startsWith('/') ? path : `/${path}`}`;
}

function saveStatusLabel(saveState: 'idle' | 'saving' | 'saved' | 'error') {
  if (saveState === 'saving') return 'Saving draft';
  if (saveState === 'saved') return 'Draft saved';
  if (saveState === 'error') return 'Draft save issue';
  return 'Not saved yet';
}

function buildAnswerMap(savedAnswers: SavedAssessmentAnswer[]): Record<string, DraftAnswer> {
  return Object.fromEntries(
    savedAnswers.map((answer) => [
      answer.questionId,
      {
        questionId: answer.questionId,
        responseValue: answer.responseValue,
        isNotApplicable: answer.isNotApplicable,
        nAReason: answer.nAReason ?? ''
      }
    ])
  );
}

function buildExposureMap(savedExposureAnswers: SavedExposureAnswer[]): Record<string, DraftExposureAnswer> {
  return Object.fromEntries(
    savedExposureAnswers.map((answer) => [
      answer.exposureFactorId,
      {
        exposureFactorId: answer.exposureFactorId,
        selectedValue: answer.selectedValue ?? '',
        selectedLabel: answer.selectedLabel ?? '',
        pointsAwarded: answer.pointsAwarded
      }
    ])
  );
}

function embeddedMode() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('embed') === '1';
}

export function AssessmentEngine({
  assessmentReference,
  token,
  organisationName,
  respondentName,
  status,
  domains,
  responseScale,
  exposureFactors,
  savedAnswers,
  savedExposureAnswers,
  initialProgress
}: AssessmentEngineProps) {
  const [activeStep, setActiveStep] = useState<StepKey>('exposure');
  const [answers, setAnswers] = useState<Record<string, DraftAnswer>>(() => buildAnswerMap(savedAnswers));
  const [exposureAnswers, setExposureAnswers] = useState<Record<string, DraftExposureAnswer>>(() => buildExposureMap(savedExposureAnswers));
  const [progress, setProgress] = useState<AssessmentProgress>(initialProgress);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [messages, setMessages] = useState<string[]>([]);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [snapshot, setSnapshot] = useState<FreeSnapshot | null>(null);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeDomain = domains.find((domain) => domain.domainCode === activeStep);
  const isLocked = submitState !== 'idle';
  const exposureSelectionMap = useMemo<ExposureSelectionMap>(() => {
    const factorCodeById = new Map(exposureFactors.map((factor) => [factor.id, factor.factorCode]));
    return Object.fromEntries(
      Object.values(exposureAnswers).map((answer) => [factorCodeById.get(answer.exposureFactorId) ?? answer.exposureFactorId, answer.selectedValue])
    );
  }, [exposureAnswers, exposureFactors]);

  const steps = useMemo<Array<{ key: StepKey; label: string; pct: number }>>(() => [
    { key: 'exposure', label: 'Exposure profile', pct: exposureProgressPct(exposureFactors, exposureAnswers) },
    ...domains.map((domain) => {
      const domainProgress = progress.domainProgress.find((item) => item.domainCode === domain.domainCode);
      return { key: domain.domainCode, label: domain.name, pct: domainProgress?.pct ?? 0 };
    })
  ], [domains, exposureAnswers, exposureFactors, progress.domainProgress]);

  function scheduleAutosave(nextAnswers = answers, nextExposureAnswers = exposureAnswers) {
    if (isLocked) return;
    setSaveState('saving');
    setMessages([]);
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void saveDraft(nextAnswers, nextExposureAnswers);
    }, 650);
  }

  async function saveDraft(nextAnswers = answers, nextExposureAnswers = exposureAnswers): Promise<boolean> {
    if (submitState === 'submitted') return false;
    setSaveState('saving');
    setMessages([]);

    const response = await fetch(scorePath(`/api/assessments/${assessmentReference}/answers`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        answers: Object.values(nextAnswers),
        exposureAnswers: Object.values(nextExposureAnswers).filter((answer) => answer.selectedValue)
      })
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok || !body.ok) {
      setSaveState('error');
      setMessages(body.errors ?? ['Draft could not be saved.']);
      return false;
    }

    setProgress(body.progress);
    setSaveState('saved');
    return true;
  }

  function setQuestionResponse(questionId: string, responseValue: number) {
    if (isLocked) return;
    const next = {
      ...answers,
      [questionId]: {
        questionId,
        responseValue,
        isNotApplicable: false,
        nAReason: ''
      }
    };
    setAnswers(next);
    scheduleAutosave(next, exposureAnswers);
  }

  function setQuestionNA(questionId: string, checked: boolean) {
    if (isLocked) return;
    const next = {
      ...answers,
      [questionId]: {
        questionId,
        responseValue: checked ? null : answers[questionId]?.responseValue ?? null,
        isNotApplicable: checked,
        nAReason: checked ? answers[questionId]?.nAReason ?? '' : ''
      }
    };
    setAnswers(next);
    scheduleAutosave(next, exposureAnswers);
  }

  function setQuestionNAReason(questionId: string, reason: string) {
    if (isLocked) return;
    const next = {
      ...answers,
      [questionId]: {
        questionId,
        responseValue: null,
        isNotApplicable: true,
        nAReason: reason
      }
    };
    setAnswers(next);
    scheduleAutosave(next, exposureAnswers);
  }

  function setExposureResponse(factor: ExposureFactor, selectedValue: string) {
    if (isLocked) return;
    const option = factor.options.find((item) => item.value === selectedValue);
    const next = {
      ...exposureAnswers,
      [factor.id]: {
        exposureFactorId: factor.id,
        selectedValue,
        selectedLabel: option?.label ?? '',
        pointsAwarded: option?.points ?? 0
      }
    };
    setExposureAnswers(next);
    scheduleAutosave(answers, next);
  }

  async function submit() {
    if (submitState !== 'idle') return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);

    setSubmitState('saving');
    const saved = await saveDraft(answers, exposureAnswers);
    if (!saved) {
      setSubmitState('idle');
      return;
    }

    setSubmitState('submitting');
    setMessages([]);
    const response = await fetch(scorePath(`/api/assessments/${assessmentReference}/submit`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, embed: embeddedMode() ? '1' : undefined })
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok || !body.ok) {
      setSubmitState('idle');
      setMessages(body.errors ?? ['Assessment could not be submitted.']);
      if (body.progress) setProgress(body.progress);
      return;
    }

    setProgress(body.progress);
    setSnapshot(body.snapshot ?? null);
    setSnapshotUrl(body.snapshotUrl ?? null);
    setSubmitState('submitted');
    setSaveState('saved');
  }

  if (submitState === 'submitted') {
    return snapshot ? (
      <FreeSnapshotCard snapshot={snapshot} snapshotUrl={snapshotUrl} />
    ) : (
      <Card>
        <CardHeader>
          <CardTitle>Assessment submitted</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-mk-muted">
          <p>Your assessment has been received and locked. MK will review the submission before any full report is released.</p>
          <p className="font-semibold text-mk-ink">Reference: {assessmentReference}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <aside className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Assessment progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-mk-ink">{progress.overallPct}% complete</span>
                <span className="text-mk-muted">{progress.answeredQuestions}/{progress.totalQuestions} questions</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-mk-line">
                <div className="h-full rounded-full bg-mk-charcoal" style={{ width: `${progress.overallPct}%` }} />
              </div>
              <p className="mt-2 text-xs text-mk-muted">{progress.answeredExposureFactors}/{progress.totalExposureFactors} exposure areas captured</p>
            </div>

            <div className="grid gap-2">
              {steps.map((step) => (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => setActiveStep(step.key)}
                  className={`rounded-xl border px-3 py-3 text-left text-sm transition ${activeStep === step.key ? 'border-mk-charcoal bg-mk-cream text-mk-ink' : 'border-mk-line bg-mk-paper text-mk-muted hover:border-mk-charcoal'}`}
                >
                  <span className="block font-semibold">{step.label}</span>
                  <span className="mt-1 block text-xs">{step.pct}% complete</span>
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-mk-line bg-mk-cream/50 p-3 text-xs leading-5 text-mk-muted">
              <p><strong className="text-mk-ink">Draft status:</strong> {saveStatusLabel(saveState)}</p>
              <p><strong className="text-mk-ink">Reference:</strong> {assessmentReference}</p>
            </div>
          </CardContent>
        </Card>
      </aside>

      <main className="space-y-5">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>{organisationName}</CardTitle>
                <p className="mt-1 text-sm text-mk-muted">Respondent: {respondentName}</p>
              </div>
              <Badge>Self-assessment</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {messages.length ? (
              <div className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-sm text-mk-danger">
                {messages.map((message) => <p key={message}>{message}</p>)}
              </div>
            ) : null}

            {activeStep === 'exposure' ? (
              <ExposureStep exposureFactors={exposureFactors} exposureAnswers={exposureAnswers} onChange={setExposureResponse} />
            ) : activeDomain ? (
              <DomainStep
                domain={activeDomain}
                responseScale={responseScale}
                answers={answers}
                onSetResponse={setQuestionResponse}
                onSetNA={setQuestionNA}
                onSetNAReason={setQuestionNAReason}
                exposureSelectionMap={exposureSelectionMap}
              />
            ) : null}

            <div className="flex flex-col gap-3 border-t border-mk-line pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-mk-muted">Your answers are saved securely as you move through the assessment. Submitting locks the assessment and generates the free readiness snapshot.</p>
              <div className="flex gap-3">
                <Button type="button" variant="secondary" onClick={() => void saveDraft()} disabled={saveState === 'saving' || isLocked}>
                  {saveState === 'saving' ? 'Saving…' : 'Save now'}
                </Button>
                <Button type="button" onClick={() => void submit()} disabled={submitState !== 'idle'}>
                  {submitState === 'saving' ? 'Saving…' : submitState === 'submitting' ? 'Submitting…' : 'Submit assessment'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function ExposureStep({ exposureFactors, exposureAnswers, onChange }: { exposureFactors: ExposureFactor[]; exposureAnswers: Record<string, DraftExposureAnswer>; onChange: (factor: ExposureFactor, selectedValue: string) => void }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-mk-ink">Exposure profile</h2>
        <p className="mt-2 text-sm leading-6 text-mk-muted">This captures where fraud opportunity may exist so readiness can be interpreted against the organisation’s real operating environment.</p>
      </div>
      <div className="grid gap-4">
        {exposureFactors.map((factor) => (
          <label key={factor.id} className="rounded-xl border border-mk-line bg-mk-cream/30 p-4">
            <span className="block text-sm font-semibold text-mk-ink">{factor.name}</span>
            <select
              value={exposureAnswers[factor.id]?.selectedValue ?? ''}
              onChange={(event) => onChange(factor, event.target.value)}
              className="mt-3 w-full rounded-xl border border-mk-line bg-mk-paper px-4 py-3 text-sm text-mk-ink outline-none focus:border-mk-charcoal"
            >
              <option value="">Select exposure level</option>
              {factor.options.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
    </div>
  );
}

function DomainStep({
  domain,
  responseScale,
  answers,
  onSetResponse,
  onSetNA,
  onSetNAReason,
  exposureSelectionMap
}: {
  domain: MethodologyDomain;
  responseScale: ResponseScaleOption[];
  answers: Record<string, DraftAnswer>;
  onSetResponse: (questionId: string, responseValue: number) => void;
  onSetNA: (questionId: string, checked: boolean) => void;
  onSetNAReason: (questionId: string, reason: string) => void;
  exposureSelectionMap: ExposureSelectionMap;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-mk-ink">{domain.name}</h2>
        <p className="mt-2 text-sm leading-6 text-mk-muted">Select the option that best reflects current practice. Use Not Applicable only where the area genuinely does not apply to the organisation.</p>
      </div>

      {domain.questions.map((question) => {
        const answer = answers[question.id] ?? { questionId: question.id, responseValue: null, isNotApplicable: false, nAReason: '' };
        const nAEligibility = evaluateNAEligibility(question, exposureSelectionMap);
        const disableNACheckbox = question.nAAllowed && !nAEligibility.allowed && !answer.isNotApplicable;

        return (
          <div key={question.id} className="rounded-2xl border border-mk-line bg-mk-paper p-5">
            <div>
              <h3 className="text-base font-semibold leading-7 text-mk-ink">{question.prompt}</h3>
              {question.helpText ? <p className="mt-2 text-sm leading-6 text-mk-muted">{question.helpText}</p> : null}
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {responseScale.map((option) => (
                <label key={option.responseValue} className={`rounded-xl border p-3 text-sm ${answer.responseValue === option.responseValue && !answer.isNotApplicable ? 'border-mk-charcoal bg-mk-cream' : 'border-mk-line bg-mk-cream/20'}`}>
                  <input
                    type="radio"
                    name={question.id}
                    className="mr-2"
                    checked={answer.responseValue === option.responseValue && !answer.isNotApplicable}
                    onChange={() => onSetResponse(question.id, option.responseValue)}
                  />
                  <span className="font-semibold text-mk-ink">{option.responseValue} · {option.label}</span>
                  <span className="mt-1 block text-xs leading-5 text-mk-muted">{option.operationalMeaning}</span>
                </label>
              ))}
            </div>

            {question.nAAllowed ? (
              <div className="mt-4 rounded-xl border border-mk-line bg-mk-cream/40 p-4">
                <label className={`flex items-start gap-3 text-sm ${disableNACheckbox ? 'text-mk-muted/60' : 'text-mk-muted'}`}>
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={answer.isNotApplicable}
                    disabled={disableNACheckbox}
                    onChange={(event) => onSetNA(question.id, event.target.checked)}
                  />
                  <span>
                    Mark as Not Applicable only where this area genuinely does not apply to your organisation. A short reason is required before submission.
                  </span>
                </label>
                <p className="mt-2 text-xs leading-5 text-mk-muted">Applicability note: {nAEligibility.reason}</p>
                {answer.isNotApplicable ? (
                  <textarea
                    value={answer.nAReason}
                    onChange={(event) => onSetNAReason(question.id, event.target.value)}
                    placeholder="Briefly explain why this question is not applicable to the organisation."
                    className="mt-3 min-h-24 w-full rounded-xl border border-mk-line bg-mk-paper px-4 py-3 text-sm text-mk-ink outline-none focus:border-mk-charcoal"
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function exposureProgressPct(exposureFactors: ExposureFactor[], exposureAnswers: Record<string, DraftExposureAnswer>) {
  if (!exposureFactors.length) return 0;
  const answered = exposureFactors.filter((factor) => Boolean(exposureAnswers[factor.id]?.selectedValue)).length;
  return Math.round((answered / exposureFactors.length) * 100);
}
