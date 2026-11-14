import type { RevisedFactPack, Product } from './fact-pack';

/**
 * Deterministic Report Story Plan (Reporting Bible v1.1, sections 8, 10 and 13; stage 4).
 *
 * FICTIONAL PROTOTYPE. The ordered movements of each product, the purpose of each, the facts it must draw on, the
 * exhibits the composer places in it, and the management takeaway it must leave. The writer may improve headings and
 * expression; it may not reorder the movements, the findings, the pathways, the priorities or the stages.
 */
export const REVISED_STORY_PLAN_VERSION = 'revised-story-plan-0.3';

export type PlanSection = {
  id: string; movement: string; title: string; purpose: string; takeaway: string; next: string | null;
  requiredFacts: string[]; exhibits: string[]; newPage: boolean; units?: { id: string; ref: string; exhibit?: string }[];
};
export type RevisedStoryPlan = { version: typeof REVISED_STORY_PLAN_VERSION; product: Product; sections: PlanSection[]; pageTarget: { default: [number, number]; acceptable: [number, number]; hardMax: number } };

/**
 * A scored report (DR-02) opens its conclusion with the agreed score conclusion, inserted by slot, and closes on the
 * responses the report sets out first. Earlier unscored packs keep their plan unchanged.
 */
function withScoredConclusion(fp: RevisedFactPack, sections: PlanSection[]): PlanSection[] {
  if (typeof fp.facts['T-CONCLUSION']?.value !== 'string') return sections;
  const outstanding = typeof fp.facts['T-CONCLUSION-OUTSTANDING']?.value === 'string';
  const opening = `Open with [[T-CONCLUSION]] as the first paragraph${outstanding ? ', with [[T-CONCLUSION-OUTSTANDING]] as the sentence after it' : ''}. `;
  return sections.map((s) => !/CONCLUSION$/.test(s.id) ? s : {
    ...s,
    purpose: opening + (fp.product === 'essential'
      ? 'Then close in narrative: the responses this report sets out first, what should be true within ninety days, and the sensible next step.'
      : 'Then close in narrative: the transition required, the responses this report sets out first, what success looks like by ninety days and by twelve months, and when Advisory would add value.'),
    requiredFacts: ['T-CONCLUSION', ...(outstanding ? ['T-CONCLUSION-OUTSTANDING'] : []), ...s.requiredFacts]
  });
}

export function buildRevisedStoryPlan(fp: RevisedFactPack): RevisedStoryPlan {
  const themeIds = fp.themes.map((t) => t.ref);
  const findingIds = fp.findings.map((f) => f.ref);
  const pathwayIds = fp.pathways.map((p) => p.ref);
  if (fp.product === 'essential') {
    const sections: PlanSection[] = [
      { id: 'ESS-ORIENT', movement: 'Orientation', title: 'About this report', purpose: 'One short paragraph explaining the journey of the report, set above the contents list.', takeaway: 'The reader knows what the report will tell them and in what order.', next: 'ESS-EXEC', requiredFacts: [], exhibits: ['contents'], newPage: true },
      { id: 'ESS-EXEC', movement: '1. Executive diagnosis', title: 'Executive summary', purpose: 'Where the organisation stands and what the position means: whether the environment is even or uneven, where it is strongest, the two to four patterns that matter, why they matter in fraud terms, what management should do first, and any uncertainty that genuinely limits the reading. Must stand alone as an executive briefing.', takeaway: 'An executive who reads only these pages understands the position and the first decisions.', next: 'ESS-PROFILE', requiredFacts: ['N-APPLY', 'N-REPORTED-HELD', 'N-GAP', 'N-SETTLE', ...themeIds, 'POSITION-1', 'POSITION-4'], exhibits: ['position'], newPage: true },
      { id: 'ESS-PROFILE', movement: '1. Executive diagnosis', title: 'Readiness profile', purpose: 'Interpret the shape of the environment across the ten areas in two or three paragraphs, around one exhibit.', takeaway: 'The pattern beneath the counts.', next: 'ESS-THEMES', requiredFacts: fp.areas.map((a) => `${a.ref}-GAP`), exhibits: ['profile'], newPage: true },
      { id: 'ESS-THEMES', movement: '2. What is driving the position', title: 'What is driving the position', purpose: 'The management-level patterns, each synthesising several answers, explaining why the pattern matters for prevention, detection or response, and closing with a leadership implication.', takeaway: 'The few patterns that explain most of the position.', next: 'ESS-FINDINGS', requiredFacts: themeIds, exhibits: [], newPage: false, units: fp.themes.map((t) => ({ id: `ESS-THEME-${t.ref}`, ref: t.ref })) },
      { id: 'ESS-FINDINGS', movement: '3. The findings that matter', title: 'The findings this report develops', purpose: 'Advisory observations: claim heading, the recorded position in one sentence, interpretation, fraud implication and management implication, with a compact factual strip. State the selection rule once.', takeaway: 'Which weaknesses deserve leadership attention and why.', next: 'ESS-PATHWAYS', requiredFacts: findingIds, exhibits: [], newPage: true, units: fp.findings.map((f) => ({ id: `ESS-${f.ref}`, ref: f.ref, exhibit: `finding:${f.ref}` })) },
      { id: 'ESS-PATHWAYS', movement: '4. How fraud exposure could materialise', title: 'How fraud exposure could materialise', purpose: 'Plausible fraud pathways in connected prose: actor, opportunity, entry point, mechanism, the weakness relied on, concealment and consequence, with warning signs and containment in a panel.', takeaway: 'How the weaknesses translate into loss.', next: 'ESS-PRIORITIES', requiredFacts: pathwayIds, exhibits: [], newPage: true, units: fp.pathways.map((p) => ({ id: `ESS-${p.ref}`, ref: p.ref, exhibit: `pathway:${p.ref}` })) },
      { id: 'ESS-PRIORITIES', movement: '5. What management should do first', title: 'What management should do first', purpose: 'The responses management should address first: why each comes first, what to establish, the accountable executive, the practical owner, the proposed stage and one success measure.', takeaway: 'A short, owned list of first responses.', next: 'ESS-ROADMAP', requiredFacts: fp.priorities.map((p) => p.ref), exhibits: ['priorities'], newPage: true },
      { id: 'ESS-ROADMAP', movement: '5. What management should do first', title: 'A 30, 60 and 90 day response', purpose: 'The first ninety days as proposed stages with owners, deliverables and outcomes, stating that the windows are proposals, not deadlines.', takeaway: 'What will be true at each point.', next: 'ESS-BASIS', requiredFacts: fp.roadmap.map((s) => s.ref), exhibits: ['roadmap-90'], newPage: false },
      { id: 'ESS-BASIS', movement: 'Basis', title: 'Basis of this report', purpose: 'One concise page: self-reported basis, how unknowns are treated, no independent validation, what is pending MK\'s approval.', takeaway: 'The boundary, stated once.', next: 'ESS-CONCLUSION', requiredFacts: ['N-PAIRS'], exhibits: [], newPage: false },
      { id: 'ESS-CONCLUSION', movement: '6. Management conclusion', title: 'Management conclusion', purpose: 'Close in narrative: what the organisation should recognise, which few changes matter most, what should be true within ninety days, and the sensible next step.', takeaway: 'A useful close, not a list.', next: null, requiredFacts: [], exhibits: [], newPage: true }
    ];
    return { version: REVISED_STORY_PLAN_VERSION, product: 'essential', sections: withScoredConclusion(fp, sections), pageTarget: { default: [18, 22], acceptable: [16, 24], hardMax: 26 } };
  }
  const blueprintIds = fp.blueprints.map((b) => b.ref);
  const decisionIds = fp.decisions.map((d) => d.ref);
  const sections: PlanSection[] = [
    { id: 'COMP-EXEC', movement: 'Diagnosis', title: 'Executive diagnosis', purpose: 'Start with what MK concluded: the position, the pattern beneath it, the strengths, the exposure themes and the leadership priorities. By the end of this section an executive understands the full management story.', takeaway: 'The whole management story in three pages.', next: 'COMP-SCOPE', requiredFacts: ['N-APPLY', 'N-REPORTED-HELD', 'N-GAP', 'N-SETTLE', ...themeIds, 'POSITION-1', 'POSITION-4'], exhibits: ['position'], newPage: true },
    { id: 'COMP-SCOPE', movement: 'Diagnosis', title: 'Scope and analytical basis', purpose: 'One concise page: the self-assessment basis and the boundary, strategic analysis and control design, not independent verification.', takeaway: 'What the report can and cannot say.', next: 'COMP-PROFILE', requiredFacts: ['N-PAIRS'], exhibits: [], newPage: true },
    { id: 'COMP-PROFILE', movement: 'Diagnosis', title: 'Readiness profile', purpose: 'The ten areas, interpreted: the shape of the environment, not a list of figures.', takeaway: 'Where the environment holds and where it is open.', next: 'COMP-THEMES', requiredFacts: fp.areas.map((a) => `${a.ref}-GAP`), exhibits: ['profile'], newPage: false },
    { id: 'COMP-THEMES', movement: 'Interpretation', title: 'Systemic themes', purpose: 'The cross-cutting themes and how they interact: which weakness provides opportunity and which delays detection or response.', takeaway: 'Why the themes must be treated together.', next: 'COMP-FINDINGS', requiredFacts: themeIds, exhibits: ['theme-map'], newPage: true, units: fp.themes.map((t) => ({ id: `COMP-THEME-${t.ref}`, ref: t.ref })) },
    { id: 'COMP-FINDINGS', movement: 'Interpretation', title: 'Findings', purpose: 'Deeper advisory findings: the recorded condition, the control-system context, interaction with other controls, the plausible pathway, the management consequence and why the target design matters.', takeaway: 'What each weakness means in this organisation.', next: 'COMP-PATHWAYS', requiredFacts: findingIds, exhibits: [], newPage: true, units: fp.findings.map((f) => ({ id: `COMP-${f.ref}`, ref: f.ref, exhibit: `finding:${f.ref}` })) },
    { id: 'COMP-PATHWAYS', movement: 'Interpretation', title: 'Fraud exposure and pathways', purpose: 'Organisation-relevant fraud pathways and the exposure themes they demonstrate.', takeaway: 'How the weaknesses combine into loss.', next: 'COMP-TARGET', requiredFacts: pathwayIds, exhibits: [], newPage: true, units: fp.pathways.map((p) => ({ id: `COMP-${p.ref}`, ref: p.ref, exhibit: `pathway:${p.ref}` })) },
    { id: 'COMP-TARGET', movement: 'Design', title: 'Target fraud-control environment', purpose: 'The priority control blueprints: current state, target state, how each should operate, what it connects to and how effectiveness is measured, in prose with a compact specification panel.', takeaway: 'What the organisation should build.', next: 'COMP-OPMODEL', requiredFacts: blueprintIds, exhibits: [], newPage: true, units: fp.blueprints.map((b) => ({ id: `COMP-${b.ref}`, ref: b.ref, exhibit: `blueprint:${b.ref}` })) },
    { id: 'COMP-OPMODEL', movement: 'Design', title: 'Target fraud-risk operating model', purpose: 'Who owns fraud risk, who operates the controls, who monitors, who investigates, who escalates and who oversees, proportionate to the organisation.', takeaway: 'Accountability that holds across areas.', next: 'COMP-DECISIONS', requiredFacts: fp.operatingModel.map((r) => r.ref), exhibits: ['operating-model'], newPage: false },
    { id: 'COMP-DECISIONS', movement: 'Design', title: 'Leadership decisions', purpose: 'The real decisions executives must take, explaining the approved options, trade-offs and MK\'s recommended route without adding options.', takeaway: 'The choices only leadership can make.', next: 'COMP-PROGRAMME', requiredFacts: decisionIds, exhibits: [], newPage: false, units: fp.decisions.map((d) => ({ id: `COMP-${d.ref}`, ref: d.ref, exhibit: `decision:${d.ref}` })) },
    { id: 'COMP-PROGRAMME', movement: 'Design', title: 'Twelve-month implementation blueprint', purpose: 'Stabilise, Establish, Embed and Mature as proposed stages: outcomes, owners and dependencies, not walls of control text, and not deadlines.', takeaway: 'How the organisation gets from here to there.', next: 'COMP-SCORECARD', requiredFacts: fp.roadmap.map((s) => s.ref), exhibits: ['roadmap-12'], newPage: true },
    { id: 'COMP-SCORECARD', movement: 'Design', title: 'Management fraud-readiness scorecard', purpose: 'Practical measures with owners, frequency and escalation thresholds.', takeaway: 'How management will know it is working.', next: 'COMP-BASIS', requiredFacts: fp.scorecard.map((m) => m.ref), exhibits: ['scorecard'], newPage: false },
    { id: 'COMP-BASIS', movement: 'Basis', title: 'Methodology and limitations', purpose: 'Concise product boundary and how the position is read, including what awaits MK\'s approval.', takeaway: 'The boundary, stated once.', next: 'COMP-CONCLUSION', requiredFacts: [], exhibits: [], newPage: false },
    { id: 'COMP-CONCLUSION', movement: 'Conclusion', title: 'Management conclusion', purpose: 'Where the organisation is, the transition required, the foundations that matter most, what success looks like by ninety days and by twelve months, and when Advisory would add value.', takeaway: 'A useful close.', next: null, requiredFacts: [], exhibits: [], newPage: true }
  ];
  return { version: REVISED_STORY_PLAN_VERSION, product: 'comprehensive', sections: withScoredConclusion(fp, sections), pageTarget: { default: [28, 34], acceptable: [26, 36], hardMax: 38 } };
}
