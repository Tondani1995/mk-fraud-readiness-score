import type { NarrativeFactPack, NarrativeProductTier } from './fact-pack';

export const NARRATIVE_STORY_PLAN_SCHEMA_VERSION = 'mk-reporting-bible-1.1-story-plan-v1';

export interface NarrativeMovement {
  id: string;
  order: number;
  title: string;
  objective: string;
  sectionIds: string[];
  transitionPurpose: string;
  requiredManagementTakeaway: string;
}

export interface NarrativeStoryPlan {
  schemaVersion: typeof NARRATIVE_STORY_PLAN_SCHEMA_VERSION;
  bibleVersion: '1.1';
  productTier: NarrativeProductTier;
  executiveStoryObjective: string;
  movements: NarrativeMovement[];
  themeOrder: string[];
  findingOrder: string[];
  scenarioOrder: string[];
  riskOrder: string[];
  controlOrder: string[];
  decisionOrder: string[];
  roadmapOrder: string[];
  maturationOrder: string[];
  standaloneFindingReasons: Record<string, string>;
  narrativeBounds: NarrativeFactPack['narrativeBounds'];
  requiredConclusion: string;
  prohibitedClaims: string[];
}

function ids<T extends { factRef: string }>(items: T[]): string[] { return items.map((item) => item.factRef); }
function maturationIds(items: NarrativeFactPack['maturationSteps']): string[] { return items.map((item) => item.maturationRef); }

export function buildNarrativeStoryPlan(pack: NarrativeFactPack): NarrativeStoryPlan {
  const essential = pack.productTier === 'essential';
  const movements: NarrativeMovement[] = essential
    ? [
      { id: 'diagnosis', order: 1, title: 'Executive diagnosis', objective: 'Explain where the organisation stands and what the recorded result means.', sectionIds: ['EXECUTIVE-DIAGNOSIS', 'READINESS-PROFILE'], transitionPurpose: 'Show why the score requires a closer look at the few patterns driving it.', requiredManagementTakeaway: 'Management should understand the result, its uncertainty and immediate priority.' },
      { id: 'drivers', order: 2, title: 'What is driving the result', objective: 'Synthesise deterministic finding clusters into management themes.', sectionIds: ['SYSTEMIC-THEMES'], transitionPurpose: 'Move from broad pattern to the findings that matter most.', requiredManagementTakeaway: 'Leadership should focus on the small number of patterns with the greatest fraud-risk consequence.' },
      { id: 'findings', order: 3, title: 'The findings that matter most', objective: 'Explain priority weaknesses as advisory observations.', sectionIds: ['PRIORITY-FINDINGS'], transitionPurpose: 'Show how linked weaknesses could become plausible fraud pathways.', requiredManagementTakeaway: 'Each priority weakness needs an owned treatment, not only a description.' },
      { id: 'exposure', order: 4, title: 'How exposure could materialise', objective: 'Narrate the approved conditional fraud pathways.', sectionIds: ['FRAUD-SCENARIOS'], transitionPurpose: 'Translate plausible pathways into the first control responses.', requiredManagementTakeaway: 'Scenarios are conditional pathways that help management test prevention, detection and containment.' },
      { id: 'response', order: 5, title: 'What management should do first', objective: 'Set first-priority controls and a readable 30/60/90 response.', sectionIds: ['MANAGEMENT-PRIORITIES', 'RESPONSE-30-60-90'], transitionPurpose: 'Close by defining what success should look like after the first response period.', requiredManagementTakeaway: 'Management should know the first controls, owners, timing and success measures.' },
      { id: 'conclusion', order: 6, title: 'Management conclusion', objective: 'Close the diagnosis with a practical next step.', sectionIds: ['CONCLUSION'], transitionPurpose: 'End with the management implication and route forward.', requiredManagementTakeaway: 'Within 90 days the organisation should have accountable ownership, priority controls and a repeatable first operating cycle.' }
    ]
    : [
      { id: 'diagnosis', order: 1, title: 'Executive diagnosis', objective: 'State what MK concluded from the recorded assessment.', sectionIds: ['EXECUTIVE-DIAGNOSIS'], transitionPurpose: 'Clarify the analytical basis and boundary before interpretation.', requiredManagementTakeaway: 'Management should understand the current position, its pattern and the leadership priorities.' },
      { id: 'basis', order: 2, title: 'Analytical basis', objective: 'Explain the self-assessment basis and assurance boundary once.', sectionIds: ['ANALYTICAL-BASIS', 'READINESS-PROFILE'], transitionPurpose: 'Move from score shape to the themes that explain concentration.', requiredManagementTakeaway: 'The result is strategic analysis and control design, not independent operating verification.' },
      { id: 'themes', order: 3, title: 'Systemic themes', objective: 'Explain the cross-cutting patterns and interactions supplied by the deterministic layer.', sectionIds: ['SYSTEMIC-THEMES'], transitionPurpose: 'Move from patterns to the material findings supporting them.', requiredManagementTakeaway: 'The material story is created by linked conditions, not isolated question scores.' },
      { id: 'findings', order: 4, title: 'Material findings', objective: 'Interpret the material findings in their broader control-system context.', sectionIds: ['MATERIAL-FINDINGS'], transitionPurpose: 'Show how these conditions create plausible pathways to manage.', requiredManagementTakeaway: 'The findings require connected treatment across owners, controls and oversight.' },
      { id: 'exposure', order: 5, title: 'Fraud exposure and scenarios', objective: 'Narrate approved fraud pathways without making allegations.', sectionIds: ['FRAUD-SCENARIOS'], transitionPurpose: 'Use the pathways to explain why the target control environment matters.', requiredManagementTakeaway: 'Scenario logic should inform prevention, monitoring, containment and response design.' },
      { id: 'design', order: 6, title: 'Target fraud-control environment', objective: 'Explain the target-state control blueprints and connected operating design.', sectionIds: ['CONTROL-BLUEPRINTS', 'OPERATING-MODEL'], transitionPurpose: 'Move from target design to the decisions required to make it real.', requiredManagementTakeaway: 'Controls become useful when objective, ownership, proof, challenge and effectiveness are explicit.' },
      { id: 'decisions', order: 7, title: 'Leadership decisions', objective: 'Explain the genuine executive choices, approved options and trade-offs.', sectionIds: ['LEADERSHIP-DECISIONS'], transitionPurpose: 'Sequence the selected direction through the twelve-month blueprint.', requiredManagementTakeaway: 'Leadership must choose a route, owner and target date with the consequence of delay visible.' },
      { id: 'roadmap', order: 8, title: 'Twelve-month transformation blueprint', objective: 'Show progression from Stabilise through Mature.', sectionIds: ['TRANSFORMATION-BLUEPRINT', 'SCORECARD'], transitionPurpose: 'Close with the future state and the next management checkpoint.', requiredManagementTakeaway: 'Progress should move from urgent ownership and foundations to repeatability, measurement and oversight.' },
      { id: 'conclusion', order: 9, title: 'Management conclusion', objective: 'Close with the transition required and route to Advisory where appropriate.', sectionIds: ['CONCLUSION'], transitionPurpose: 'End with a useful narrative management close.', requiredManagementTakeaway: 'Success is a control environment management understands, owns, monitors and improves deliberately.' }
    ];

  return {
    schemaVersion: NARRATIVE_STORY_PLAN_SCHEMA_VERSION,
    bibleVersion: '1.1',
    productTier: pack.productTier,
    executiveStoryObjective: essential
      ? 'Diagnose the self-assessed fraud-control environment, explain its most material patterns and set the first 90-day response.'
      : 'Diagnose the self-assessed environment, interpret linked exposure pathways and design the target fraud-control response over 12 months.',
    movements,
    themeOrder: ids(pack.systemicThemeInputs),
    findingOrder: ids(pack.findings.slice(0, essential ? 8 : 8)),
    scenarioOrder: ids(pack.scenarios),
    riskOrder: ids(pack.risks.filter((risk) => risk.linkedFindingRefs.some((findingRef) => ids(pack.findings.slice(0, essential ? 8 : 8)).includes(findingRef)))),
    controlOrder: ids(pack.controls.slice(0, essential ? 6 : 6)),
    decisionOrder: ids(pack.decisions.slice(0, essential ? 6 : 5)),
    roadmapOrder: ids(pack.roadmap.slice(0, essential ? 6 : 12)),
    maturationOrder: maturationIds(pack.maturationSteps),
    standaloneFindingReasons: pack.standaloneFindingReasons,
    narrativeBounds: {
      ...pack.narrativeBounds,
      findingCount: Math.min(pack.findings.length, 8),
      controlCount: Math.min(pack.controls.length, essential ? 6 : 6),
      decisionCount: Math.min(pack.decisions.length, essential ? 6 : 5),
      managementResponseCount: Math.min(pack.roadmap.length, essential ? 6 : 12),
      maturationCount: pack.maturationSteps.length
    },
    requiredConclusion: essential
      ? 'Explain what management should recognise, which few changes matter most, what should be true within 90 days and the sensible next step.'
      : 'Explain the current environment, transition required, critical foundations, success at 90 days and 12 months, and when Advisory adds value.',
    prohibitedClaims: pack.prohibitedClaims
  };
}

export function assertNarrativeStoryPlan(plan: NarrativeStoryPlan, pack: NarrativeFactPack): void {
  if (plan.bibleVersion !== '1.1' || pack.bibleVersion !== '1.1') throw new Error('Story Plan and Fact Pack must use Reporting Bible 1.1.');
  if (plan.productTier !== pack.productTier) throw new Error('Story Plan product tier does not match Fact Pack.');
  if (plan.movements.length < 6) throw new Error('Story Plan requires connected product movements.');
  for (const [name, expected, actual] of [
    ['themes', ids(pack.systemicThemeInputs), plan.themeOrder],
    ['findings', ids(pack.findings.slice(0, pack.productTier === 'essential' ? 8 : 8)), plan.findingOrder],
    ['scenarios', ids(pack.scenarios), plan.scenarioOrder],
    ['risks', ids(pack.risks.filter((risk) => risk.linkedFindingRefs.some((findingRef) => plan.findingOrder.includes(findingRef)))), plan.riskOrder],
    ['controls', ids(pack.controls.slice(0, pack.productTier === 'essential' ? 6 : 6)), plan.controlOrder],
    ['decisions', ids(pack.decisions.slice(0, pack.productTier === 'essential' ? 6 : 5)), plan.decisionOrder],
    ['roadmap', ids(pack.roadmap.slice(0, pack.productTier === 'essential' ? 6 : 12)), plan.roadmapOrder]
  ] as const) {
    if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error(`Story Plan ${name} order does not match deterministic Fact Pack order.`);
  }
  if (JSON.stringify(maturationIds(pack.maturationSteps)) !== JSON.stringify(plan.maturationOrder)) throw new Error('Story Plan maturation order does not match deterministic Fact Pack order.');
  if (!plan.requiredConclusion.trim()) throw new Error('Story Plan must define a required conclusion.');
  if ((!pack.highReadinessSparseNarrativeReason && (plan.narrativeBounds.findingCount < 5 || plan.narrativeBounds.findingCount > 8)) || (pack.highReadinessSparseNarrativeReason && (plan.narrativeBounds.findingCount < 1 || plan.narrativeBounds.findingCount > 8))) throw new Error('Story Plan finding narrative core is outside the permitted profile bounds.');
  if (plan.productTier === 'essential' && ((!pack.highReadinessSparseNarrativeReason && (plan.narrativeBounds.scenarioCount < 2 || plan.narrativeBounds.scenarioCount > 3)) || (pack.highReadinessSparseNarrativeReason && (plan.narrativeBounds.scenarioCount < 0 || plan.narrativeBounds.scenarioCount > 3)))) throw new Error('Essential Story Plan contains an invalid scenario count for the recorded readiness profile.');
  if (plan.productTier === 'comprehensive' && ((!pack.highReadinessSparseNarrativeReason && (plan.narrativeBounds.scenarioCount < 2 || plan.narrativeBounds.scenarioCount > 4)) || (pack.highReadinessSparseNarrativeReason && (plan.narrativeBounds.scenarioCount < 0 || plan.narrativeBounds.scenarioCount > 4)))) throw new Error('Comprehensive Story Plan contains an invalid scenario count for the recorded readiness profile.');
}
