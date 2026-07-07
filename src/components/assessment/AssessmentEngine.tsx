'use client';

import { useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { evaluateNAEligibility, type ExposureSelectionMap } from '@/lib/respondent/na-rules';
import type {
  AssessmentProgress,
  ExposureFactor,
  ExposureFactorOption,
  MethodologyDomain,
  ResponseScaleOption,
  SavedAssessmentAnswer,
  SavedExposureAnswer
} from '@/lib/types/domain';

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
  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'submitted'>('idle');
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeDomain = domains.find((domain) => domain.domainCode === activeStep);
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
      return { key: domain.domainCode, label: `${domain.domainCode} · ${domain.name}`, pct: domainProgress?.pct ?? 0 };
    })
  ], [domains, exposureAnswers, exposureFactors, progress.domainProgress]);

  function scheduleAutosave(nextAnswers = answers, nextExposureAnswers = exposureAnswers) {
    setSaveState('saving');
    setMessages([]);
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      void saveDraft(nextAnswers, nextExposureAnswers);
    }, 650);
  }

  async function saveDraft(nextAnswers = answers, nextExposureAnswers = exposureAnswers) {
    setSaveState('saving');
    setMessages([]);

    const response = await fetch(`/api/assessments/${assessmentReference}/answers`, {
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
      return;
    }

    setProgress(body.progress);
    setSaveState('saved');
  }

  function setQuestionResponse(questionId: string, responseValue: number) {
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
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    await saveDraft(answers, exposureAnswers);

    setSubmitState('submitting');
    setMessages([]);
    const response = await fetch(`/api/assessments/${assessmentReference}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok || !body.ok) {
      setSubmitState('idle');
      setMessages(body.errors ?? ['Assessment could not be submitted.']);
      if (body.progress) setProgress(body.progress);
      return;
    }

    setProgress(body.progress);
    setSubmitState('submitted');
    setSaveState('saved');
  }

  if (submitState === 'submitted') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Assessment submitted</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-6 text-mk-muted">
          <p>The assessment has been locked for scoring in the next phase. Phase 5 deliberately does not calculate scores or generate the Free Snapshot.</p>
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
                <div className="h-full rounded-full bg-mk-brass" style={{ width: `${progress.overallPct}%` }} />
              </div>
              <p className="mt-2 text-xs text-mk-muted">{progress.answeredExposureFactors}/{progress.totalExposureFactors} exposure factors captured</p>
            </div>

            <div className="grid gap-2">
              {steps.map((step) => (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => setActiveStep(step.key)}
                  className={`rounded-xl border px-3 py-3 text-left text-sm transition ${activeStep === step.key ? 'border-mk-brass bg-mk-cream text-mk-ink' : 'border-mk-line bg-mk-paper text-mk-muted hover:border-mk-brass'}`}
                >
                  <span className="block font-semibold">{step.label}</span>
                  <span className="mt-1 block text-xs">{step.pct}% complete</span>
                </button>
              ))}
            </div>

            <div className="rounded-xl border border-mk-line bg-mk-cream/50 p-3 text-xs leading-5 text-mk-muted">
              <p><strong className="text-mk-ink">Save status:</strong> {saveState}</p>
              <p><strong className="text-mk-ink">Assessment:</strong> {assessmentReference}</p>
              <p><strong className="text-mk-ink">Status:</strong> {status}</p>
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
              <Badge>No scoring in Phase 5</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {messages.length ? (
              <div className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-sm text-mk-danger">
                {messages.map((message) => <p key={message}>{message}</p>)}
              </div>
            ) : null}

            {activeStep === 'exposure' ? (
              <ExposureStep
                exposureFactors={exposureFactors}
                exposureAnswers={exposureAnswers}
                onChange={setExposureResponse}
              />
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
              <p className="text-xs text-mk-muted">Draft answers are autosaved against the assessment reference and resume token. Submitted assessments lock the token.</p>
              <div className="flex gap-3">
                <Button type="button" variant="secondary" onClick={() => void saveDraft()} disabled={saveState === 'saving'}>
                  {saveState === 'saving' ? 'Saving…' : 'Save now'}
                </Button>
                <Button type="button" onClick={() => void submit()} disabled={submitState === 'submitting'}>
                  {submitState === 'submitting' ? 'Submitting…' : 'Submit assessment'}
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
        <p className="mt-2 text-sm leading-6 text-mk-muted">This captures inherent fraud opportunity. It is stored for Phase 6 exposure scoring but does not create a readiness score in Phase 5.</p>
      </div>
      <div className="grid gap-4">
        {exposureFactors.map((factor) => (
          <label key={factor.id} className="rounded-xl border border-mk-line bg-mk-cream/30 p-4">
            <span className="block text-sm font-semibold text-mk-ink">{factor.factorCode} · {factor.name}</span>
            <select
              value={exposureAnswers[factor.id]?.selectedValue ?? ''}
              onChange={(event) => onChange(factor, event.target.value)}
              className="mt-3 w-full rounded-xl border border-mk-line bg-mk-paper px-4 py-3 text-sm text-mk-ink outline-none focus:border-mk-brass"
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
        <h2 className="text-xl font-semibold text-mk-ink">{domain.domainCode} · {domain.name}</h2>
        <p className="mt-2 text-sm leading-6 text-mk-muted">Answer each item using the approved 0–5 capability scale. N/A is only available where Phase 1 allowed it.</p>
      </div>

      {domain.questions.map((question) => {
        const answer = answers[question.id] ?? { questionId: question.id, responseValue: null, isNotApplicable: false, nAReason: '' };
        const nAEligibility = evaluateNAEligibility(question, exposureSelectionMap);
        const disableNACheckbox = question.nAAllowed && !nAEligibility.allowed && !answer.isNotApplicable;

        return (
          <div key={question.id} className="rounded-2xl border border-mk-line bg-mk-paper p-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-mk-brassDark">{question.questionCode}</p>
                <h3 className="mt-2 text-base font-semibold leading-7 text-mk-ink">{question.prompt}</h3>
                {question.helpText ? <p className="mt-2 text-sm leading-6 text-mk-muted">{question.helpText}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {question.isCritical ? <Badge>Critical</Badge> : null}
                {question.isHardGate ? <Badge>Hard gate</Badge> : null}
              </div>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {responseScale.map((option) => (
                <label key={option.responseValue} className={`rounded-xl border p-3 text-sm ${answer.responseValue === option.responseValue && !answer.isNotApplicable ? 'border-mk-brass bg-mk-cream' : 'border-mk-line bg-mk-cream/20'}`}>
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
                    Mark as Not Applicable. This is profile-controlled and requires a reason before submission.
                    {question.isHardGate ? ' Hard-gate N/A is only available where the exposure profile makes the control genuinely inapplicable.' : ''}
                  </span>
                </label>
                <p className="mt-2 text-xs leading-5 text-mk-muted">N/A rule: {nAEligibility.reason}</p>
                {answer.isNotApplicable ? (
                  <textarea
                    value={answer.nAReason}
                    onChange={(event) => onSetNAReason(question.id, event.target.value)}
                    placeholder="Explain why this question is genuinely not applicable to the organisation. Minimum 5 characters required before submission."
                    className="mt-3 min-h-24 w-full rounded-xl border border-mk-line bg-mk-paper px-4 py-3 text-sm text-mk-ink outline-none focus:border-mk-brass"
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
