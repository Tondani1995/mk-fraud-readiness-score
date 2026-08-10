import type { ComprehensiveDeliveryModel } from './types';

export interface ExecutiveSlideContent {
  number: number;
  title: string;
  objective: string;
  keyMessage: string;
  evidenceRefs: string[];
  suggestedVisual: 'headline' | 'score-position' | 'validation-ledger' | 'scenario-pathway' | 'decision-table' | 'roadmap' | 'oversight-metrics' | 'closing';
  speakerPrompt: string;
}

export interface WorkshopAgendaItem {
  order: number;
  title: string;
  purpose: string;
  output: string;
  durationMinutes: number;
  linkedRefs: string[];
}

export interface ExecutivePresentationModel {
  title: string;
  audience: string;
  slides: ExecutiveSlideContent[];
  workshop: {
    title: string;
    outcome: string;
    agenda: WorkshopAgendaItem[];
    workingRules: string[];
  };
}

export function buildExecutivePresentationModel(model: ComprehensiveDeliveryModel): ExecutivePresentationModel {
  const score = model.analytical.score;
  const scoreRefs = ['score-run'];
  const evidenceRefs = model.evidenceRequestPack.slice(0, 5).map((item) => item.evidenceRef);
  const findingRefs = model.findings.slice(0, 5).map((finding) => finding.id);
  const riskRefs = model.riskRegister.slice(0, 4).map((risk) => risk.id);
  const actionRefs = model.managementDecisions.map((decision) => decision.id);
  const readiness = score.overallScore === null ? 'not scored' : `${Math.round(score.overallScore)}/100`;
  const exposure = score.exposureScore === null ? 'not scored' : `${Math.round(score.exposureScore)}/100`;
  const slides: ExecutiveSlideContent[] = [
    { number: 1, title: 'Why we assessed', objective: 'Set the decision context and scope.', keyMessage: 'This review moves from a recorded diagnostic to evidence-bounded decisions.', evidenceRefs: [], suggestedVisual: 'headline', speakerPrompt: 'Confirm the decisions this session must enable.' },
    { number: 2, title: 'Current readiness', objective: 'Show the deterministic position without overstating assurance.', keyMessage: `Readiness is ${readiness} at ${score.finalMaturity ?? 'not scored'}, with ${exposure} exposure.`, evidenceRefs: scoreRefs, suggestedVisual: 'score-position', speakerPrompt: 'Separate score movement from assurance movement.' },
    { number: 3, title: 'Evidence reviewed', objective: 'Show what was examined and how it was classified.', keyMessage: `${model.validationSummary.validatedSupported} of ${model.validationSummary.totalEvidenceItems} evidence items are validated / supported; ${model.validationSummary.unresolved} remain unresolved.`, evidenceRefs, suggestedVisual: 'validation-ledger', speakerPrompt: 'Challenge scope, completeness and limitations.' },
    { number: 4, title: 'What changed through validation', objective: 'Make reviewer interpretation visible beside self-report.', keyMessage: model.changesAfterEvidenceReview[0]?.after ?? 'No adjusted interpretation has been recorded yet.', evidenceRefs, suggestedVisual: 'validation-ledger', speakerPrompt: 'Resolve disagreements without rewriting the recorded answer.' },
    { number: 5, title: 'Priority risks and scenarios', objective: 'Connect control conditions to plausible consequences.', keyMessage: 'Scenarios are plausible pathways linked to evidence, not allegations or evidence that an event occurred.', evidenceRefs: [...findingRefs, ...riskRefs], suggestedVisual: 'scenario-pathway', speakerPrompt: 'Test whether the scenario is plausible for this operating model.' },
    { number: 6, title: 'Critical control decisions', objective: 'Choose design, ownership and risk-treatment decisions.', keyMessage: model.managementDecisions[0]?.decision ?? 'Confirm the priority control and evidence decisions.', evidenceRefs: [...findingRefs, ...riskRefs, ...actionRefs], suggestedVisual: 'decision-table', speakerPrompt: 'Record the decision, owner, due date and acceptance boundary.' },
    { number: 7, title: 'Implementation priorities', objective: 'Sequence action across 30/60/90 days and the following year.', keyMessage: 'Completion requires operating evidence and an effectiveness measure.', evidenceRefs: actionRefs, suggestedVisual: 'roadmap', speakerPrompt: 'Confirm dependencies and escalation thresholds.' },
    { number: 8, title: 'Ownership and decisions required', objective: 'Make management accountability explicit.', keyMessage: 'Every priority item needs a named owner, target date and traceable evidence reference.', evidenceRefs: actionRefs, suggestedVisual: 'decision-table', speakerPrompt: 'Confirm who owns delivery and who provides oversight.' },
    { number: 9, title: 'Next 90 days', objective: 'Close with near-term execution.', keyMessage: 'Close priority evidence gaps, validate the highest-risk controls and report exceptions.', evidenceRefs: model.roadmapActions.filter((action) => ['30 days', '60 days', '90 days'].includes(action.period)).flatMap((action) => action.evidenceRefs), suggestedVisual: 'roadmap', speakerPrompt: 'Agree the next checkpoint and the evidence pack required.' },
    { number: 10, title: 'Closing / next steps', objective: 'Confirm the follow-through mechanism.', keyMessage: 'The board-ready output is a decision record plus a maintained evidence-backed register.', evidenceRefs: [...actionRefs, ...evidenceRefs], suggestedVisual: 'closing', speakerPrompt: 'Read back decisions, owners, dates and oversight metrics.' }
  ];
  return {
    title: `Executive fraud-readiness review · ${model.analytical.organisationName}`,
    audience: 'Executive management, board or board committee, control owners and named reviewer',
    slides,
    workshop: {
      title: 'Comprehensive management workshop',
      outcome: 'A challenged, owned and sequenced action set with explicit evidence closure and board decisions.',
      agenda: [
        { order: 1, title: 'Findings challenge', purpose: 'Test whether the recorded findings reflect the operating reality.', output: 'Agreed or challenged finding statements', durationMinutes: 25, linkedRefs: findingRefs },
        { order: 2, title: 'Evidence disagreements', purpose: 'Surface gaps between self-report, artefacts examined and reviewer judgement.', output: 'Evidence status and limitation decisions', durationMinutes: 25, linkedRefs: evidenceRefs },
        { order: 3, title: 'Ownership', purpose: 'Confirm accountable executive, process owner and oversight function.', output: 'Named owner map', durationMinutes: 20, linkedRefs: [...findingRefs, ...actionRefs] },
        { order: 4, title: 'Action prioritisation', purpose: 'Sequence actions by materiality, dependency and implementation capacity.', output: '30/60/90 priority sequence', durationMinutes: 25, linkedRefs: actionRefs },
        { order: 5, title: 'Board decisions', purpose: 'Confirm risk treatment, funding, acceptance and reporting cadence.', output: 'Decision log with due dates', durationMinutes: 20, linkedRefs: [...riskRefs, ...actionRefs] },
        { order: 6, title: 'Implementation sequencing', purpose: 'Define first deliverables, evidence of completion and escalation thresholds.', output: 'Next-90-day delivery plan', durationMinutes: 25, linkedRefs: model.roadmapActions.flatMap((action) => action.evidenceRefs) }
      ],
      workingRules: [
        'Challenge the evidence and interpretation, not the person.',
        'Do not change a recorded assessment answer through narrative alone.',
        'Use validated / supported only for the stated scope and evidence examined.',
        'Leave every decision with an owner, date, status and traceable reference.'
      ]
    }
  };
}
