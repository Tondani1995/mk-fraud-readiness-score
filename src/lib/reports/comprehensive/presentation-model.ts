import type { ComprehensiveDeliveryModel } from './types';

export interface ExecutiveSlideContent {
  number: number;
  title: string;
  objective: string;
  keyMessage: string;
  evidenceRefs: string[];
  suggestedVisual: 'headline' | 'score-position' | 'diagnosis' | 'scenario-pathway' | 'decision-table' | 'roadmap' | 'oversight-metrics' | 'closing';
  speakerPrompt: string;
}

export interface WorkshopAgendaItem { order: number; title: string; purpose: string; output: string; durationMinutes: number; linkedRefs: string[]; }
export interface ExecutivePresentationModel { title: string; audience: string; slides: ExecutiveSlideContent[]; workshop: { title: string; outcome: string; agenda: WorkshopAgendaItem[]; workingRules: string[]; }; }

export function buildExecutivePresentationModel(model: ComprehensiveDeliveryModel): ExecutivePresentationModel {
  const score = model.analytical.score;
  const readiness = score.overallScore === null ? 'not scored' : `${Math.round(score.overallScore)}/100`;
  const exposure = score.exposureScore === null ? 'not scored' : `${Math.round(score.exposureScore)}/100`;
  const slides: ExecutiveSlideContent[] = [
    { number: 1, title: 'Why this blueprint exists', objective: 'Set the proposition and boundary.', keyMessage: 'Move from a recorded Fraud Readiness assessment to a strategy and control blueprint that management can decide, build and monitor.', evidenceRefs: [], suggestedVisual: 'headline', speakerPrompt: 'Confirm the management decisions this session must enable.' },
    { number: 2, title: 'Recorded readiness position', objective: 'Show the deterministic position.', keyMessage: `Readiness is ${readiness} at ${score.finalMaturity ?? 'not scored'}, with ${exposure} exposure.`, evidenceRefs: ['score-run'], suggestedVisual: 'score-position', speakerPrompt: 'Keep the score and target-state design distinct.' },
    { number: 3, title: 'Diagnosis and exposure themes', objective: 'Explain where exposure concentrates.', keyMessage: `${model.findings.length} material findings and ${model.riskRegister.length} risks define the priority diagnosis.`, evidenceRefs: model.findings.slice(0, 5).map((finding) => finding.id), suggestedVisual: 'diagnosis', speakerPrompt: 'Focus the conversation on concentration and interaction.' },
    { number: 4, title: 'How scenarios may develop', objective: 'Make conditional pathways tangible.', keyMessage: `${model.scenarios.length} organisation-specific scenarios connect entry point, mechanism, bypassed control, warning indicators and response.`, evidenceRefs: model.scenarios.slice(0, 5).map((scenario) => scenario.id), suggestedVisual: 'scenario-pathway', speakerPrompt: 'Use scenario logic to test target-state design; do not treat it as an allegation.' },
    { number: 5, title: 'Target-state control blueprint', objective: 'Show what management should build.', keyMessage: `${model.controlImprovements.length} control blueprints define objective, owner, population, frequency, proof, escalation and effectiveness.`, evidenceRefs: model.controlImprovements.slice(0, 5).map((control) => control.id), suggestedVisual: 'diagnosis', speakerPrompt: 'Ask whether each blueprint is operable and measurable.' },
    { number: 6, title: 'Decisions and trade-offs', objective: 'Make leadership choices explicit.', keyMessage: `${model.leadershipDecisions.length} decisions carry three viable deterministic options and a recommendation for management to confirm.`, evidenceRefs: model.leadershipDecisions.slice(0, 5).map((decision) => decision.id), suggestedVisual: 'decision-table', speakerPrompt: 'Capture selected option, owner, target period and consequence of delay.' },
    { number: 7, title: 'Roadmap to the target state', objective: 'Sequence implementation.', keyMessage: 'First 30 days establish ownership and foundations; days 31–90 build the cycle; months 4–12 embed and mature it.', evidenceRefs: model.roadmapActions.slice(0, 6).map((action) => action.id), suggestedVisual: 'roadmap', speakerPrompt: 'Check dependencies and failure responses before confirming dates.' },
    { number: 8, title: 'Operating model and governance', objective: 'Define who monitors what.', keyMessage: 'Accountable executives, process owners and oversight functions need a shared management-information rhythm.', evidenceRefs: [], suggestedVisual: 'oversight-metrics', speakerPrompt: 'Confirm monthly, quarterly and board-level outputs.' },
    { number: 9, title: 'Management scorecard', objective: 'Make progress visible.', keyMessage: 'Track readiness, exposure, control completion, action ageing, population completeness, effectiveness and decision status.', evidenceRefs: [], suggestedVisual: 'oversight-metrics', speakerPrompt: 'Agree the next checkpoint and escalation thresholds.' },
    { number: 10, title: 'Route forward', objective: 'Close with accountable action.', keyMessage: 'Decide, assign, build, retain proof, measure effectiveness and return to the scorecard.', evidenceRefs: [], suggestedVisual: 'closing', speakerPrompt: 'Read back the owners, target periods and immediate deliverables.' }
  ];
  const agenda: WorkshopAgendaItem[] = [
    { order: 1, title: 'Diagnosis readout', purpose: 'Create a shared view of the recorded position and exposure concentration.', output: 'Confirmed priority themes', durationMinutes: 15, linkedRefs: model.findings.slice(0, 3).map((finding) => finding.id) },
    { order: 2, title: 'Theme and scenario interpretation', purpose: 'Test how linked conditions could create exposure.', output: 'Agreed interpretation and scenario priorities', durationMinutes: 20, linkedRefs: model.scenarios.slice(0, 3).map((scenario) => scenario.id) },
    { order: 3, title: 'Target-state control design', purpose: 'Work through objective, owner, population, frequency, proof, escalation and measure.', output: 'Control blueprint adjustments', durationMinutes: 25, linkedRefs: model.controlImprovements.slice(0, 4).map((control) => control.id) },
    { order: 4, title: 'Decisions and trade-offs', purpose: 'Choose the route, owner and target period for priority decisions.', output: 'Decision record', durationMinutes: 20, linkedRefs: model.leadershipDecisions.slice(0, 4).map((decision) => decision.id) },
    { order: 5, title: 'Sequencing and scorecard', purpose: 'Confirm dependencies, management information and the next checkpoint.', output: 'Roadmap and scorecard', durationMinutes: 15, linkedRefs: model.roadmapActions.slice(0, 4).map((action) => action.id) }
  ];
  return { title: 'Fraud Readiness Strategy and Control Blueprint', audience: 'Executive management and board decision-makers', slides, workshop: { title: 'Target-state design workshop', outcome: 'A confirmed set of decisions, owners, sequence, proof requirements and management scorecard measures.', agenda, workingRules: ['Use the recorded assessment as the diagnosis baseline.', 'Challenge interpretation and design assumptions in plain language.', 'Do not convert discussion into an assurance conclusion.', 'Make every action specific about owner, target period, dependency, proof and failure response.', 'Capture unresolved choices as decisions with a next checkpoint.'] } };
}
