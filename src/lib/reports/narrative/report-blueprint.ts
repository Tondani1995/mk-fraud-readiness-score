import type { NarrativeFactPack, NarrativeProductTier } from './fact-pack';
import type { NarrativeStoryPlan } from './story-plan';

export const REPORT_BLUEPRINT_SCHEMA_VERSION = 'mk-reporting-bible-1.1-report-blueprint-v1';
export const WHOLE_MANUSCRIPT_CONTEXT_SCHEMA_VERSION = 'mk-reporting-bible-1.1-whole-manuscript-context-v1';

export type ReportBlueprintTier = NarrativeProductTier | 'snapshot';
export type BlueprintExhibitType =
  | 'score_display'
  | 'domain_profile'
  | 'theme_map'
  | 'finding_summary'
  | 'scenario_pathway'
  | 'control_response'
  | 'decision_options'
  | 'roadmap_30_60_90'
  | 'maturation_path'
  | 'sustainment_scorecard';

export interface ReportBlueprintSubsection {
  subsectionId: string;
  order: number;
  title: string;
  purpose: string;
  requiredManagementTakeaway: string;
  requiredFacts: string[];
  claimRefs: string[];
}

export interface ReportBlueprintSection {
  sectionId: string;
  order: number;
  title: string;
  purpose: string;
  requiredManagementTakeaway: string;
  requiredFacts: string[];
  claimRefs: string[];
  optionalSubsections: ReportBlueprintSubsection[];
}

export interface ReportBlueprintExhibit {
  exhibitId: string;
  type: BlueprintExhibitType;
  placement: { chapterId: string; sectionId: string };
  purpose: string;
  sourceRefs: string[];
  captionPurpose: string;
  aiInterpretationAllowed: boolean;
}

export interface FindingCluster {
  clusterId: string;
  title: string;
  whyTogether: string;
  semanticFamilies: string[];
  findingRefs: string[];
  sourceRefs: string[];
}

export interface BlueprintChapter {
  chapterId: string;
  order: number;
  title: string;
  purpose: string;
  requiredManagementTakeaway: string;
  requiredFacts: string[];
  claimRefs: string[];
  linkedFindingIds: string[];
  linkedScenarioIds: string[];
  linkedControlIds: string[];
  linkedDecisionIds: string[];
  linkedRoadmapIds: string[];
  exhibits: ReportBlueprintExhibit[];
  sections: ReportBlueprintSection[];
}

export interface BlueprintContentAssignment {
  contentType: 'theme' | 'finding' | 'scenario' | 'control' | 'decision' | 'roadmap' | 'sustainment_priority' | 'maturation_step';
  contentRef: string;
  chapterId: string;
  sectionId: string;
}

export interface ReportBlueprint {
  schemaVersion: typeof REPORT_BLUEPRINT_SCHEMA_VERSION;
  bibleVersion: '1.1';
  reportTitle: string;
  reportTier: ReportBlueprintTier;
  narrativeMode: NarrativeFactPack['narrativeMode'] | 'SNAPSHOT';
  organisation: { name: string; sectorFacts: string[] };
  assessmentPosition: {
    reference: string;
    score: number | null;
    maturity: string | null;
    exposureScore: number | null;
    exposureBand: string | null;
    summary: string;
    assuranceBoundary: string;
  };
  executiveStory: string;
  chapters: BlueprintChapter[];
  findingClusters: FindingCluster[];
  contentAssignments: BlueprintContentAssignment[];
  deterministicRules: string[];
  prohibitedClaims: string[];
}

export interface ContextTokenRange {
  minimum: number;
  maximum: number;
  basis: string;
}

export interface WholeManuscriptPartition {
  partitionId: string;
  chapterIds: string[];
  purpose: string;
  preservesSequence: boolean;
}

export interface WholeManuscriptWriterContext {
  schemaVersion: typeof WHOLE_MANUSCRIPT_CONTEXT_SCHEMA_VERSION;
  architecture: 'whole-manuscript';
  reportBlueprint: ReportBlueprint;
  permittedDeterministicFacts: NarrativeFactPack['facts'];
  boundaries: {
    assurance: string;
    customerLanguage: string[];
    prohibitedClaims: string[];
    sourceOfTruth: string;
  };
  style: {
    voice: string;
    continuity: string[];
  };
  projectedInputTokens: ContextTokenRange;
  projectedOutputTokens: ContextTokenRange;
  approvedInputTokenLimit: number;
  singleCallFeasible: boolean;
  partitionPlan: WholeManuscriptPartition[];
}

export interface BlueprintValidationResult {
  ok: boolean;
  duplicateContentRefs: string[];
  missingContentRefs: string[];
  duplicateExecutiveMovements: string[];
  duplicateRoadmapMovements: string[];
  issues: string[];
}

const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))];
const ordered = <T>(values: T[]): T[] => values.filter(Boolean);
const factIds = (pack: NarrativeFactPack, kind?: string): string[] => pack.facts.filter((fact) => !kind || fact.kind === kind).map((fact) => fact.id);
const refs = <T extends { factRef: string }>(values: T[]): string[] => values.map((value) => value.factRef);
const sourceIds = <T extends { sourceId?: string; factRef?: string }>(values: T[]): string[] => values.map((value) => value.sourceId ?? value.factRef ?? '').filter(Boolean);

function tierLabel(tier: ReportBlueprintTier): string {
  return tier === 'snapshot' ? 'Free snapshot' : tier[0].toUpperCase() + tier.slice(1);
}

function scoreSummary(pack: NarrativeFactPack): string {
  const score = pack.assessment.score === null ? 'not scored' : `${pack.assessment.score}/100`;
  const maturity = pack.assessment.maturity ?? 'not assigned';
  const exposure = pack.assessment.exposureBand ? ` Exposure is recorded as ${pack.assessment.exposureBand}.` : '';
  return `The recorded position is ${score} with ${maturity} maturity.${exposure}`;
}

function commonAssuranceBoundary(): string {
  return "The assessment is based on management's recorded self-assessment and deterministic scoring inputs. It is strategic fraud-risk analysis and control design, not independent verification of operating effectiveness.";
}

function section(
  sectionId: string,
  title: string,
  purpose: string,
  takeaway: string,
  requiredFacts: string[],
  claimRefs: string[],
  optionalSubsections: ReportBlueprintSubsection[] = []
): ReportBlueprintSection {
  const facts = unique(requiredFacts);
  const claims = unique(claimRefs);
  return {
    sectionId,
    order: 1,
    title,
    purpose,
    requiredManagementTakeaway: takeaway,
    requiredFacts: facts,
    claimRefs: claims,
    optionalSubsections: optionalSubsections.length > 0 ? optionalSubsections : [{
      subsectionId: `${sectionId}-MEANING`,
      order: 1,
      title: 'Interpretation and management implication',
      purpose: 'Connect the deterministic evidence in this section to the management meaning required by the Blueprint.',
      requiredManagementTakeaway: takeaway,
      requiredFacts: facts,
      claimRefs: claims
    }]
  };
}

function chapter(
  chapterId: string,
  order: number,
  title: string,
  purpose: string,
  takeaway: string,
  input: Partial<Omit<BlueprintChapter, 'chapterId' | 'order' | 'title' | 'purpose' | 'requiredManagementTakeaway'>> & { section: ReportBlueprintSection }
): BlueprintChapter {
  const linkedFindingIds = unique(input.linkedFindingIds ?? []);
  const linkedScenarioIds = unique(input.linkedScenarioIds ?? []);
  const linkedControlIds = unique(input.linkedControlIds ?? []);
  const linkedDecisionIds = unique(input.linkedDecisionIds ?? []);
  const linkedRoadmapIds = unique(input.linkedRoadmapIds ?? []);
  return {
    chapterId,
    order,
    title,
    purpose,
    requiredManagementTakeaway: takeaway,
    requiredFacts: unique(input.requiredFacts ?? []),
    claimRefs: unique(input.claimRefs ?? []),
    linkedFindingIds,
    linkedScenarioIds,
    linkedControlIds,
    linkedDecisionIds,
    linkedRoadmapIds,
    exhibits: input.exhibits ?? [],
    sections: [{ ...input.section, order: 1 }]
  };
}

function exhibit(
  exhibitId: string,
  type: BlueprintExhibitType,
  chapterId: string,
  sectionId: string,
  purpose: string,
  sourceRefs: string[],
  captionPurpose: string,
  aiInterpretationAllowed = true
): ReportBlueprintExhibit {
  return { exhibitId, type, placement: { chapterId, sectionId }, purpose, sourceRefs: unique(sourceRefs), captionPurpose, aiInterpretationAllowed };
}

function clusterFindings(pack: NarrativeFactPack): FindingCluster[] {
  if (pack.narrativeMode === 'SUSTAINMENT') return [];
  const findingsByRef = new Map(pack.findings.map((finding) => [finding.factRef, finding]));
  const assigned = new Set<string>();
  const clusters: FindingCluster[] = [];
  for (const theme of pack.systemicThemeInputs) {
    const findingRefs = theme.findingRefs.filter((ref) => findingsByRef.has(ref));
    if (!findingRefs.length) continue;
    findingRefs.forEach((ref) => assigned.add(ref));
    clusters.push({
      clusterId: `CLUSTER-${theme.themeFamily}`,
      title: theme.title,
      whyTogether: theme.whyTogether,
      semanticFamilies: [...theme.semanticFamilies],
      findingRefs,
      sourceRefs: unique([theme.factRef, ...findingRefs])
    });
  }
  const remaining = pack.findings.filter((finding) => !assigned.has(finding.factRef));
  if (remaining.length) {
    clusters.push({
      clusterId: 'CLUSTER-ADDITIONAL-MATERIAL-PATTERN',
      title: 'Additional material control pattern',
      whyTogether: 'These material observations are retained as a distinct deterministic group because the available semantic graph does not support combining them with another theme.',
      semanticFamilies: unique(remaining.flatMap((finding) => [finding.primarySemanticFamily, ...finding.secondarySemanticFamilies])),
      findingRefs: remaining.map((finding) => finding.factRef),
      sourceRefs: remaining.map((finding) => finding.factRef)
    });
  }
  return clusters;
}

function assignmentsFor(pack: NarrativeFactPack, chapters: BlueprintChapter[]): BlueprintContentAssignment[] {
  const all: BlueprintContentAssignment[] = [];
  const add = (contentType: BlueprintContentAssignment['contentType'], contentRefs: string[], chapterId: string, sectionId: string) => contentRefs.forEach((contentRef) => all.push({ contentType, contentRef, chapterId, sectionId }));
  const byId = (id: string) => chapters.find((item) => item.chapterId === id)?.sections[0]?.sectionId ?? '';
  const sustainment = pack.narrativeMode === 'SUSTAINMENT';
  const comprehensive = pack.productTier === 'comprehensive';
  const themeChapter = sustainment ? 'READINESS-SUPPORTING-STANDARDS' : comprehensive ? 'SYSTEMIC-FRAUD-READINESS-DIAGNOSIS' : 'WHAT-HOLDS-READINESS-BACK';
  const findingChapter = comprehensive ? 'MATERIAL-FRAUD-RISK-THEMES' : 'PRIORITY-FRAUD-EXPOSURES';
  const scenarioChapter = comprehensive ? 'HOW-EXPOSURE-COULD-MATERIALISE' : 'EXPOSURE-COULD-MATERIALISE';
  add('theme', refs(pack.systemicThemeInputs), themeChapter, byId(themeChapter));
  add('finding', refs(pack.findings), findingChapter, byId(findingChapter));
  add('scenario', refs(pack.scenarios), scenarioChapter, byId(scenarioChapter));
  const controlChapter = sustainment ? (comprehensive ? 'TARGET-RESILIENT-CONTROL-ENVIRONMENT' : 'SUSTAINMENT-BLUEPRINT') : 'TARGET-CONTROL-ENVIRONMENT';
  add('control', refs(pack.controls), controlChapter, byId(controlChapter));
  const decisionChapter = sustainment ? (comprehensive ? 'LEADERSHIP-DECISIONS-TO-PRESERVE' : 'SUSTAINMENT-BLUEPRINT') : comprehensive ? 'MANAGEMENT-DECISIONS-REQUIRED' : 'TARGET-CONTROL-ENVIRONMENT';
  const roadmapChapter = sustainment ? (comprehensive ? 'SUSTAINMENT-OPTIMISATION' : 'SUSTAINMENT-BLUEPRINT') : comprehensive ? 'IMPLEMENTATION-BLUEPRINT' : 'FIRST-90-DAYS-CONCLUSION';
  add('decision', refs(pack.decisions), decisionChapter, byId(decisionChapter));
  add('roadmap', refs(pack.roadmap), roadmapChapter, byId(roadmapChapter));
  add('sustainment_priority', refs(pack.sustainmentPriorities), sustainment ? 'SUSTAINMENT-PRIORITIES' : 'TARGET-CONTROL-ENVIRONMENT', byId(sustainment ? 'SUSTAINMENT-PRIORITIES' : 'TARGET-CONTROL-ENVIRONMENT'));
  const maturationChapter = sustainment ? 'SUSTAINMENT-OPTIMISATION' : 'TWELVE-MONTH-MATURATION';
  add('maturation_step', pack.maturationSteps.map((step) => step.maturationRef), maturationChapter, byId(maturationChapter));
  return all.filter((item) => item.chapterId && item.sectionId);
}

function remediationEssential(pack: NarrativeFactPack): BlueprintChapter[] {
  const scoreFacts = [...factIds(pack, 'score'), ...factIds(pack, 'maturity'), ...factIds(pack, 'domain'), ...factIds(pack, 'relative_strength')];
  const themes = refs(pack.systemicThemeInputs);
  const findings = refs(pack.findings);
  const scenarios = refs(pack.scenarios);
  const controls = refs(pack.controls);
  const decisions = refs(pack.decisions);
  const roadmap = refs(pack.roadmap);
  return [
    chapter('EXECUTIVE-ASSESSMENT', 1, 'Executive assessment', 'Give one opening assessment of the recorded position, what it means and the assurance boundary.', 'Management should understand the recorded position, its concentration and the immediate management implication.', { requiredFacts: scoreFacts, claimRefs: scoreFacts, section: section('EXECUTIVE-ASSESSMENT-OPENING', 'Executive assessment', 'State the conclusion once, before interpretation.', 'The recorded result points to a focused management response rather than a recital of domain scores.', scoreFacts, scoreFacts), exhibits: [exhibit('EXH-SCORE-001', 'score_display', 'EXECUTIVE-ASSESSMENT', 'EXECUTIVE-ASSESSMENT-OPENING', 'Show the recorded score, maturity and exposure position.', scoreFacts, 'Orient the reader to the recorded position.')]}),
    chapter('WHAT-HOLDS-READINESS-BACK', 2, 'What is holding readiness back', 'Connect deterministic themes into a small number of management patterns.', 'Leadership should focus on the connected patterns that create the greatest fraud-risk consequence.', { requiredFacts: themes, claimRefs: themes, section: section('WHAT-HOLDS-READINESS-BACK-SECTION', 'What is holding readiness back', 'Explain the relationships beneath the score, without repeating the executive assessment.', 'The material story is created by linked conditions, not isolated question scores.', themes, themes), exhibits: [exhibit('EXH-THEME-MAP', 'theme_map', 'WHAT-HOLDS-READINESS-BACK', 'WHAT-HOLDS-READINESS-BACK-SECTION', 'Display deterministic finding clusters and their management questions.', themes, 'Explain why the linked themes belong together.')]}),
    chapter('PRIORITY-FRAUD-EXPOSURES', 3, 'Priority fraud exposures', 'Explain the selected material findings and their practical meaning.', 'Each priority exposure needs an owned treatment, not only a description.', { requiredFacts: findings, claimRefs: findings, linkedFindingIds: findings, section: section('PRIORITY-FRAUD-EXPOSURES-SECTION', 'Priority fraud exposures', 'Interpret clustered findings as advisory observations.', 'The priority set identifies where preventive, detective or response discipline needs attention.', findings, findings), exhibits: [exhibit('EXH-FINDING-SUMMARY', 'finding_summary', 'PRIORITY-FRAUD-EXPOSURES', 'PRIORITY-FRAUD-EXPOSURES-SECTION', 'Summarise the selected findings and their linked meaning.', findings, 'Keep the table subordinate to the connected explanation.')] }),
    chapter('EXPOSURE-COULD-MATERIALISE', 4, 'How the exposure could materialise', 'Narrate deterministic conditional scenarios without alleging an event.', 'Scenarios are conditional pathways that help management test prevention, detection and containment.', { requiredFacts: scenarios, claimRefs: scenarios, linkedScenarioIds: scenarios, section: section('EXPOSURE-COULD-MATERIALISE-SECTION', 'How the exposure could materialise', 'Translate linked findings into supported conditional pathways.', 'The pathways are plausible conditions for management testing, not allegations of fraud.', scenarios, scenarios), exhibits: [exhibit('EXH-SCENARIO-PATHWAYS', 'scenario_pathway', 'EXPOSURE-COULD-MATERIALISE', 'EXPOSURE-COULD-MATERIALISE-SECTION', 'Show actor, opportunity, entry point, mechanism, warning and response links.', scenarios, 'Help management see where the control response must interrupt the pathway.')] }),
    chapter('TARGET-CONTROL-ENVIRONMENT', 5, 'What management should change', 'Describe the target control responses, ownership and decisions needed for the priority set.', 'Controls become useful when objective, ownership, proof, challenge and effectiveness are explicit.', { requiredFacts: [...controls, ...decisions], claimRefs: [...controls, ...decisions], linkedControlIds: controls, linkedDecisionIds: decisions, section: section('TARGET-CONTROL-ENVIRONMENT-SECTION', 'What management should change', 'Connect target controls to the exposure they address and the management choice required.', 'Management should select the route, owner, proof and effectiveness measure for each priority response.', [...controls, ...decisions], [...controls, ...decisions]), exhibits: [exhibit('EXH-CONTROL-RESPONSE', 'control_response', 'TARGET-CONTROL-ENVIRONMENT', 'TARGET-CONTROL-ENVIRONMENT-SECTION', 'Summarise target-state controls without dumping the register.', controls, 'Make ownership and operating expectations visible.')] }),
    chapter('FIRST-90-DAYS-CONCLUSION', 6, 'First 90 days and management conclusion', 'Sequence the first response and close with one useful management conclusion.', 'Within 90 days the organisation should have accountable ownership, priority controls and a repeatable first operating cycle.', { requiredFacts: roadmap, claimRefs: roadmap, linkedRoadmapIds: roadmap, section: section('FIRST-90-DAYS-CONCLUSION-SECTION', 'First 90 days and management conclusion', 'Present one 30/60/90 route and a clear close; do not create a duplicate roadmap chapter.', 'The first operating cycle should make ownership, evidence of completion and management review visible.', roadmap, roadmap), exhibits: [exhibit('EXH-ROADMAP-30-60-90', 'roadmap_30_60_90', 'FIRST-90-DAYS-CONCLUSION', 'FIRST-90-DAYS-CONCLUSION-SECTION', 'Show the deterministic 30/60/90 sequence.', roadmap, 'Translate the response into a manageable first operating cycle.')] })
  ];
}

function sustainmentEssential(pack: NarrativeFactPack): BlueprintChapter[] {
  const scoreFacts = [...factIds(pack, 'score'), ...factIds(pack, 'maturity'), ...factIds(pack, 'domain'), ...factIds(pack, 'relative_strength')];
  const priorities = refs(pack.sustainmentPriorities);
  const controls = refs(pack.controls);
  const decisions = refs(pack.decisions);
  const roadmap = refs(pack.roadmap);
  return [
    chapter('EXECUTIVE-ASSESSMENT', 1, 'Executive assessment', 'State the strong recorded position and what management must preserve.', 'The recorded position is strong; the management question is how to preserve it and detect deterioration early.', { requiredFacts: scoreFacts, claimRefs: scoreFacts, section: section('EXECUTIVE-ASSESSMENT-OPENING', 'Executive assessment', 'State the recorded position and assurance boundary once.', 'No material weaknesses are promoted from this recorded sustainment profile.', scoreFacts, scoreFacts), exhibits: [exhibit('EXH-SUSTAINMENT-SCORE', 'score_display', 'EXECUTIVE-ASSESSMENT', 'EXECUTIVE-ASSESSMENT-OPENING', 'Show the recorded readiness position.', scoreFacts, 'Orient the reader to the strong recorded position.')] }),
    chapter('READINESS-SUPPORTING-STANDARDS', 2, 'What is supporting the result', 'Explain the recorded standards and strengths that support resilience.', 'Current strengths remain valuable when ownership, review and proof are retained.', { requiredFacts: [...factIds(pack, 'relative_strength'), ...factIds(pack, 'domain')], claimRefs: [...factIds(pack, 'relative_strength'), ...factIds(pack, 'domain')], section: section('READINESS-SUPPORTING-STANDARDS-SECTION', 'What is supporting the result', 'Connect recorded standards to a management sustainment rhythm.', 'The result is supported by standards that require continued ownership and review.', [...factIds(pack, 'relative_strength'), ...factIds(pack, 'domain')], [...factIds(pack, 'relative_strength'), ...factIds(pack, 'domain')]), exhibits: [exhibit('EXH-SUPPORTING-STANDARDS', 'domain_profile', 'READINESS-SUPPORTING-STANDARDS', 'READINESS-SUPPORTING-STANDARDS-SECTION', 'Show the deterministic strengths and domain pattern.', [...factIds(pack, 'relative_strength'), ...factIds(pack, 'domain')], 'Make resilience drivers visible without inventing weaknesses.')] }),
    chapter('SUSTAINMENT-PRIORITIES', 3, 'Priorities to sustain readiness', 'Set the small number of resilience priorities that protect the recorded standard.', 'Sustainment priorities preserve readiness through ownership, review and early detection.', { requiredFacts: priorities, claimRefs: priorities, section: section('SUSTAINMENT-PRIORITIES-SECTION', 'Priorities to sustain readiness', 'Explain the healthy priorities as operating disciplines.', 'Management should preserve the practices that support the strong recorded standard.', priorities, priorities), exhibits: [exhibit('EXH-SUSTAINMENT-SCORECARD', 'sustainment_scorecard', 'SUSTAINMENT-PRIORITIES', 'SUSTAINMENT-PRIORITIES-SECTION', 'Summarise current strong standards, owners, proof and indicators.', priorities, 'Keep sustainment practical and measurable.')] }),
    chapter('DETERIORATION-WATCHPOINTS', 4, 'Where deterioration could emerge', 'Identify only supported change or drift watchpoints.', 'Management should monitor for change-triggered deterioration through the normal review route.', { requiredFacts: [...controls, ...roadmap], claimRefs: [...controls, ...roadmap], linkedControlIds: controls, linkedRoadmapIds: roadmap, section: section('DETERIORATION-WATCHPOINTS-SECTION', 'Where deterioration could emerge', 'Describe supported triggers for early management attention.', 'Early deterioration should be visible through management information and change-triggered review.', [...controls, ...roadmap], [...controls, ...roadmap]) }),
    chapter('SUSTAINMENT-BLUEPRINT', 5, 'What management should protect and strengthen', 'Set the first 90-day sustainment actions, owners, records and indicators.', 'Within 90 days, ownership, review cadence and deterioration information should be current.', { requiredFacts: [...controls, ...decisions, ...roadmap], claimRefs: [...controls, ...decisions, ...roadmap], linkedControlIds: controls, linkedDecisionIds: decisions, linkedRoadmapIds: roadmap, section: section('SUSTAINMENT-BLUEPRINT-SECTION', 'What management should protect and strengthen', 'Sequence the sustainment route without converting strengths into weakness language.', 'A strong control environment stays strong when operating discipline and deterioration signals are explicit.', [...controls, ...decisions, ...roadmap], [...controls, ...decisions, ...roadmap]), exhibits: [exhibit('EXH-SUSTAINMENT-90-DAY', 'roadmap_30_60_90', 'SUSTAINMENT-BLUEPRINT', 'SUSTAINMENT-BLUEPRINT-SECTION', 'Show the deterministic first 90-day sustainment route.', roadmap, 'Make continuity and early drift detection actionable.')] }),
    chapter('MANAGEMENT-CONCLUSION', 6, 'Management conclusion', 'Close with the value of preserving readiness and detecting early drift.', 'Management should preserve the strong recorded standard and refresh it when material change occurs.', { requiredFacts: [...priorities, ...roadmap], claimRefs: [...priorities, ...roadmap], linkedRoadmapIds: roadmap, section: section('MANAGEMENT-CONCLUSION-SECTION', 'Management conclusion', 'End with one durable sustainment commitment.', 'The value is sustained readiness and early detection of drift, not a price-based assurance claim.', [...priorities, ...roadmap], [...priorities, ...roadmap]) })
  ];
}

function comprehensiveChapters(pack: NarrativeFactPack): BlueprintChapter[] {
  const sustainment = pack.narrativeMode === 'SUSTAINMENT';
  const scoreFacts = [...factIds(pack, 'score'), ...factIds(pack, 'maturity'), ...factIds(pack, 'domain'), ...factIds(pack, 'relative_strength')];
  const themes = refs(pack.systemicThemeInputs);
  const findings = refs(pack.findings);
  const scenarios = refs(pack.scenarios);
  const controls = refs(pack.controls);
  const decisions = refs(pack.decisions);
  const roadmap = refs(pack.roadmap);
  const maturation = pack.maturationSteps.map((step) => step.maturationRef);
  if (sustainment) {
    return [
      chapter('EXECUTIVE-ASSESSMENT', 1, 'Executive assessment', 'State the strong recorded environment and the assurance boundary.', 'No material weaknesses were identified from the recorded assessment responses; the management task is to preserve the strong profile.', { requiredFacts: scoreFacts, claimRefs: scoreFacts, section: section('EXECUTIVE-ASSESSMENT-SECTION', 'Executive assessment', 'State the result once.', 'The recorded result is strong and should be read as a sustainment position, not as independent assurance.', scoreFacts, scoreFacts) }),
      chapter('ANALYTICAL-BASIS', 2, 'Analytical basis', 'Explain the deterministic score shape and recorded standards supporting readiness.', 'The conclusion follows from recorded responses and deterministic scoring, not independent assurance.', { requiredFacts: scoreFacts, claimRefs: scoreFacts, section: section('ANALYTICAL-BASIS-SECTION', 'Analytical basis', 'Explain the basis once without repeating the executive assessment.', 'The analytical basis is transparent and bounded.', scoreFacts, scoreFacts), exhibits: [exhibit('EXH-SUSTAINMENT-PROFILE', 'domain_profile', 'ANALYTICAL-BASIS', 'ANALYTICAL-BASIS-SECTION', 'Show deterministic readiness strengths and domain pattern.', scoreFacts, 'Make the recorded basis legible.')] }),
      chapter('READINESS-SUPPORTING-STANDARDS', 3, 'Strengths supporting readiness', 'Connect recorded standards to the resilience disciplines management should protect.', 'Current strengths remain valuable when ownership, review and proof are retained.', { requiredFacts: [...factIds(pack, 'relative_strength'), ...factIds(pack, 'domain')], claimRefs: [...factIds(pack, 'relative_strength'), ...factIds(pack, 'domain')], section: section('READINESS-SUPPORTING-STANDARDS-SECTION', 'Strengths supporting readiness', 'Explain the connected standards behind the strong result.', 'Strength is durable when its operating rhythm remains visible.', [...factIds(pack, 'relative_strength'), ...factIds(pack, 'domain')], [...factIds(pack, 'relative_strength'), ...factIds(pack, 'domain')]) }),
      chapter('SUSTAINMENT-PRIORITIES', 4, 'Sustainment and resilience priorities', 'Set management priorities for continuity, review and early detection of drift.', 'Priorities preserve readiness through continuity, review and early detection.', { requiredFacts: refs(pack.sustainmentPriorities), claimRefs: refs(pack.sustainmentPriorities), section: section('SUSTAINMENT-PRIORITIES-SECTION', 'Sustainment and resilience priorities', 'Translate strong standards into named management disciplines.', 'Sustainment is an operating rhythm, not a deficiency list.', refs(pack.sustainmentPriorities), refs(pack.sustainmentPriorities)), exhibits: [exhibit('EXH-RESILIENCE-SCORECARD', 'sustainment_scorecard', 'SUSTAINMENT-PRIORITIES', 'SUSTAINMENT-PRIORITIES-SECTION', 'Summarise the resilience priorities.', refs(pack.sustainmentPriorities), 'Show the disciplines that protect readiness.')] }),
      chapter('DETERIORATION-WATCHPOINTS', 5, 'Emerging or deterioration watchpoints', 'Describe only supported conditions that could erode the recorded position after change.', 'Early deterioration should be visible through management information and change-triggered review.', { requiredFacts: [...refs(pack.controls), ...refs(pack.roadmap)], claimRefs: [...refs(pack.controls), ...refs(pack.roadmap)], linkedControlIds: refs(pack.controls), linkedRoadmapIds: refs(pack.roadmap), section: section('DETERIORATION-WATCHPOINTS-SECTION', 'Emerging or deterioration watchpoints', 'Describe supported change-triggered attention points.', 'Watchpoints make the strong position maintainable.', [...refs(pack.controls), ...refs(pack.roadmap)], [...refs(pack.controls), ...refs(pack.roadmap)]) }),
      chapter('TARGET-RESILIENT-CONTROL-ENVIRONMENT', 6, 'Target resilient control environment', 'Describe the strong standard, ownership, proof, trigger and effectiveness indicator.', 'A strong control environment stays strong when operating discipline and deterioration signals are explicit.', { requiredFacts: refs(pack.controls), claimRefs: refs(pack.controls), linkedControlIds: refs(pack.controls), section: section('TARGET-RESILIENT-CONTROL-ENVIRONMENT-SECTION', 'Target resilient control environment', 'Set the resilient control design that preserves current maturity.', 'The target state protects what is already working and makes deterioration visible.', refs(pack.controls), refs(pack.controls)), exhibits: [exhibit('EXH-RESILIENT-CONTROL', 'control_response', 'TARGET-RESILIENT-CONTROL-ENVIRONMENT', 'TARGET-RESILIENT-CONTROL-ENVIRONMENT-SECTION', 'Show owners, proof and effectiveness indicators.', refs(pack.controls), 'Keep the target environment operational.')] }),
      chapter('LEADERSHIP-DECISIONS-TO-PRESERVE', 7, 'Leadership decisions to preserve maturity', 'Set governance, monitoring, ownership and change-trigger decisions with clear trade-offs.', 'Leadership should protect cadence, ownership continuity and management information.', { requiredFacts: refs(pack.decisions), claimRefs: refs(pack.decisions), linkedDecisionIds: refs(pack.decisions), section: section('LEADERSHIP-DECISIONS-TO-PRESERVE-SECTION', 'Leadership decisions to preserve maturity', 'Explain the decisions required to preserve the strong standard.', 'The decisions keep ownership and review routes current.', refs(pack.decisions), refs(pack.decisions)), exhibits: [exhibit('EXH-PRESERVE-DECISIONS', 'decision_options', 'LEADERSHIP-DECISIONS-TO-PRESERVE', 'LEADERSHIP-DECISIONS-TO-PRESERVE-SECTION', 'Show deterministic options and trade-offs.', refs(pack.decisions), 'Make the preservation choices explicit.')] }),
      chapter('SUSTAINMENT-OPTIMISATION', 8, 'Twelve-month sustainment and optimisation blueprint', 'Show progression from PRESERVE through EMBED, MEASURE and OPTIMISE.', 'Progress should preserve the current standard, embed the rhythm, measure drift and optimise after change.', { requiredFacts: [...refs(pack.roadmap), ...maturation], claimRefs: [...refs(pack.roadmap), ...maturation], linkedRoadmapIds: refs(pack.roadmap), section: section('SUSTAINMENT-OPTIMISATION-SECTION', 'Twelve-month sustainment and optimisation blueprint', 'Sequence the four sustainment horizons.', 'The twelve-month route protects resilience while creating room for deliberate optimisation.', [...refs(pack.roadmap), ...maturation], [...refs(pack.roadmap), ...maturation]), exhibits: [exhibit('EXH-MATURATION-PATH', 'maturation_path', 'SUSTAINMENT-OPTIMISATION', 'SUSTAINMENT-OPTIMISATION-SECTION', 'Show the deterministic PRESERVE → EMBED → MEASURE → OPTIMISE route.', [...refs(pack.roadmap), ...maturation], 'Make the future-state sustainment rhythm visible.')] }),
      chapter('MANAGEMENT-CONCLUSION', 9, 'Management conclusion', 'Close with the route for preserving readiness and detecting early deterioration.', 'The value is sustained readiness and early detection of drift, not a price-based assurance claim.', { requiredFacts: [...refs(pack.sustainmentPriorities), ...refs(pack.roadmap)], claimRefs: [...refs(pack.sustainmentPriorities), ...refs(pack.roadmap)], linkedRoadmapIds: refs(pack.roadmap), section: section('MANAGEMENT-CONCLUSION-SECTION', 'Management conclusion', 'End with one durable management commitment.', 'Management should preserve readiness and revisit it after material change.', [...refs(pack.sustainmentPriorities), ...refs(pack.roadmap)], [...refs(pack.sustainmentPriorities), ...refs(pack.roadmap)]) })
    ];
  }
  return [
    chapter('EXECUTIVE-ASSESSMENT', 1, 'Executive assessment', 'State what the deterministic assessment says and what leadership should care about.', 'Management should understand the current position, its pattern and the leadership priorities.', { requiredFacts: scoreFacts, claimRefs: scoreFacts, section: section('EXECUTIVE-ASSESSMENT-SECTION', 'Executive assessment', 'State the conclusion and boundary once.', 'The score is the starting point for a connected management story.', scoreFacts, scoreFacts), exhibits: [exhibit('EXH-SCORE-POSITION', 'score_display', 'EXECUTIVE-ASSESSMENT', 'EXECUTIVE-ASSESSMENT-SECTION', 'Show the recorded score, maturity and exposure position.', scoreFacts, 'Orient the reader to the recorded position.')] }),
    chapter('SYSTEMIC-FRAUD-READINESS-DIAGNOSIS', 2, 'Systemic fraud-readiness diagnosis', 'Explain the cross-cutting patterns supplied by the deterministic layer.', 'The material story is created by linked conditions, not isolated question scores.', { requiredFacts: themes, claimRefs: themes, section: section('SYSTEMIC-FRAUD-READINESS-DIAGNOSIS-SECTION', 'Systemic fraud-readiness diagnosis', 'Connect the themes and management questions.', 'The themes explain concentration and interaction.', themes, themes), exhibits: [exhibit('EXH-SYSTEMIC-THEME-MAP', 'theme_map', 'SYSTEMIC-FRAUD-READINESS-DIAGNOSIS', 'SYSTEMIC-FRAUD-READINESS-DIAGNOSIS-SECTION', 'Display deterministic themes and finding clusters.', themes, 'Show why the themes belong together.')] }),
    chapter('MATERIAL-FRAUD-RISK-THEMES', 3, 'Material fraud-risk themes and findings', 'Interpret material findings in their broader control-system context.', 'The findings require connected treatment across owners, controls and oversight.', { requiredFacts: findings, claimRefs: findings, linkedFindingIds: findings, section: section('MATERIAL-FRAUD-RISK-THEMES-SECTION', 'Material fraud-risk themes and findings', 'Explain the selected findings as advisory observations.', 'The priority set identifies the conditions that deserve management attention.', findings, findings), exhibits: [exhibit('EXH-MATERIAL-FINDINGS', 'finding_summary', 'MATERIAL-FRAUD-RISK-THEMES', 'MATERIAL-FRAUD-RISK-THEMES-SECTION', 'Summarise findings and their deterministic links.', findings, 'Keep register detail subordinate to meaning.')] }),
    chapter('HOW-EXPOSURE-COULD-MATERIALISE', 4, 'How exposure could materialise', 'Narrate approved conditional fraud pathways.', 'Scenario logic should inform prevention, monitoring, containment and response design.', { requiredFacts: scenarios, claimRefs: scenarios, linkedScenarioIds: scenarios, section: section('HOW-EXPOSURE-COULD-MATERIALISE-SECTION', 'How exposure could materialise', 'Explain actor, opportunity, mechanism, warning and consequence.', 'The pathways are conditional management tests, not allegations.', scenarios, scenarios), exhibits: [exhibit('EXH-CONSIDERED-PATHWAYS', 'scenario_pathway', 'HOW-EXPOSURE-COULD-MATERIALISE', 'HOW-EXPOSURE-COULD-MATERIALISE-SECTION', 'Show the deterministic pathways.', scenarios, 'Connect exposure to the target response.')] }),
    chapter('TARGET-CONTROL-ENVIRONMENT', 5, 'Target control environment', 'Explain target-state control blueprints and connected operating design.', 'Controls become useful when objective, ownership, proof, challenge and effectiveness are explicit.', { requiredFacts: controls, claimRefs: controls, linkedControlIds: controls, section: section('TARGET-CONTROL-ENVIRONMENT-SECTION', 'Target control environment', 'Describe target controls without reproducing the full register.', 'The control design should interrupt the linked exposure pathway.', controls, controls), exhibits: [exhibit('EXH-TARGET-CONTROLS', 'control_response', 'TARGET-CONTROL-ENVIRONMENT', 'TARGET-CONTROL-ENVIRONMENT-SECTION', 'Show target control objectives, owners and operating measures.', controls, 'Make the target environment usable.')] }),
    chapter('MANAGEMENT-DECISIONS-REQUIRED', 6, 'Management decisions required', 'Explain the genuine executive choices, options and trade-offs.', 'Leadership must choose a route, owner and target date with the consequence of delay visible.', { requiredFacts: decisions, claimRefs: decisions, linkedDecisionIds: decisions, section: section('MANAGEMENT-DECISIONS-REQUIRED-SECTION', 'Management decisions required', 'Present deterministic options and the decision question.', 'The decision record should be human-readable and tied to the exposure.', decisions, decisions), exhibits: [exhibit('EXH-DECISION-OPTIONS', 'decision_options', 'MANAGEMENT-DECISIONS-REQUIRED', 'MANAGEMENT-DECISIONS-REQUIRED-SECTION', 'Show viable options, benefits and trade-offs.', decisions, 'Support a real management choice.')] }),
    chapter('IMPLEMENTATION-BLUEPRINT', 7, 'Implementation blueprint', 'Sequence the first response and the owners, dependencies and measures.', 'The implementation route must move from ownership and foundations to repeatability and oversight.', { requiredFacts: roadmap, claimRefs: roadmap, linkedRoadmapIds: roadmap, section: section('IMPLEMENTATION-BLUEPRINT-SECTION', 'Implementation blueprint', 'Show the deterministic implementation route.', 'The first operating cycle should make completion and accountability visible.', roadmap, roadmap), exhibits: [exhibit('EXH-IMPLEMENTATION-ROADMAP', 'roadmap_30_60_90', 'IMPLEMENTATION-BLUEPRINT', 'IMPLEMENTATION-BLUEPRINT-SECTION', 'Show 30/60/90 and later phases.', roadmap, 'Translate the response into sequence.')] }),
    chapter('TWELVE-MONTH-MATURATION', 8, 'Twelve-month maturation and optimisation path', 'Show progression through the deterministic maturation steps.', 'Progress should become repeatable, measured and subject to deliberate oversight.', { requiredFacts: maturation, claimRefs: maturation, linkedRoadmapIds: roadmap, section: section('TWELVE-MONTH-MATURATION-SECTION', 'Twelve-month maturation and optimisation path', 'Describe the four implementation horizons without claiming completed remediation.', 'The future state is a managed operating rhythm, not a promise of already-established effectiveness.', maturation, maturation), exhibits: [exhibit('EXH-MATURATION', 'maturation_path', 'TWELVE-MONTH-MATURATION', 'TWELVE-MONTH-MATURATION-SECTION', 'Show the deterministic maturation sequence.', maturation, 'Make 12-month progress measurable.')] }),
    chapter('MANAGEMENT-CONCLUSION', 9, 'Management conclusion', 'Close with the transition required and the next management checkpoint.', 'Success is a control environment management understands, owns, monitors and improves deliberately.', { requiredFacts: [...roadmap, ...maturation], claimRefs: [...roadmap, ...maturation], linkedRoadmapIds: roadmap, section: section('MANAGEMENT-CONCLUSION-SECTION', 'Management conclusion', 'End with a useful management close.', 'The conclusion should identify the next deliberate checkpoint and the route to further support.', [...roadmap, ...maturation], [...roadmap, ...maturation]) })
  ];
}

export function buildReportBlueprint(pack: NarrativeFactPack, plan: NarrativeStoryPlan): ReportBlueprint {
  const chapters = pack.productTier === 'essential'
    ? (pack.narrativeMode === 'SUSTAINMENT' ? sustainmentEssential(pack) : remediationEssential(pack))
    : comprehensiveChapters(pack);
  const findingClusters = clusterFindings(pack);
  const contentAssignments = assignmentsFor(pack, chapters);
  const blueprint: ReportBlueprint = {
    schemaVersion: REPORT_BLUEPRINT_SCHEMA_VERSION,
    bibleVersion: '1.1',
    reportTitle: `${pack.organisation.name} — ${tierLabel(pack.productTier)} Fraud Readiness Report`,
    reportTier: pack.productTier,
    narrativeMode: pack.narrativeMode,
    organisation: pack.organisation,
    assessmentPosition: {
      reference: pack.assessment.reference,
      score: pack.assessment.score,
      maturity: pack.assessment.maturity,
      exposureScore: pack.assessment.exposureScore,
      exposureBand: pack.assessment.exposureBand,
      summary: scoreSummary(pack),
      assuranceBoundary: commonAssuranceBoundary()
    },
    executiveStory: pack.narrativeMode === 'SUSTAINMENT'
      ? `Explain the strong recorded position, the standards supporting it, the supported deterioration watchpoints and the sustainment route. ${commonAssuranceBoundary()}`
      : `Explain the recorded position, the connected themes beneath it, the conditional exposure pathways and the management response. ${commonAssuranceBoundary()}`,
    chapters,
    findingClusters,
    contentAssignments,
    deterministicRules: [
      'Chapter titles, order, section identity and management meaning are deterministic and may not be changed by the writer.',
      'The Fact Pack and semantic graph are the only source of material claims, numbers, findings, scenarios, controls, decisions and roadmap actions.',
      'Exhibits are built from deterministic source references; AI may provide bounded interpretation or captions only where permitted.',
      'The writer must produce one complete manuscript voice with no duplicate executive diagnosis, conclusion, roadmap or stitched next-section language.',
      pack.narrativeMode === 'SUSTAINMENT' ? 'Sustainment mode contains no customer-facing findings, risks or automated fraud scenarios.' : 'Remediation and mixed modes retain supported findings and conditional scenarios only.'
    ],
    prohibitedClaims: unique([...pack.prohibitedClaims, 'independent operating effectiveness', 'confirmed fraud event', 'completed remediation'])
  };
  // The plan remains part of the upstream deterministic contract. This assertion catches a
  // future caller that accidentally builds a Blueprint for a different narrative mode/tier.
  if (plan.productTier !== pack.productTier || plan.narrativeMode !== pack.narrativeMode) throw new Error('Report Blueprint requires a matching deterministic Story Plan.');
  return blueprint;
}

export function buildSnapshotReportBlueprint(input: { organisation: { name: string; sectorFacts?: string[] }; assessmentReference: string; score?: number | null; maturity?: string | null; permittedFactRefs?: string[] }): ReportBlueprint {
  const score = input.score ?? null;
  const maturity = input.maturity ?? null;
  const facts = unique(input.permittedFactRefs ?? []);
  const chapters = [
    chapter('SNAPSHOT-POSITION', 1, 'Where the organisation stands', 'State the recorded snapshot position.', 'The reader should understand the recorded position and its boundary.', { requiredFacts: facts, claimRefs: facts, section: section('SNAPSHOT-POSITION-SECTION', 'Where the organisation stands', 'Give a concise orientation.', 'The snapshot is a limited strategic view.', facts, facts) }),
    chapter('SNAPSHOT-SHAPE', 2, 'What shapes the result', 'Explain the small number of deterministic drivers available in the snapshot.', 'The result should be read through its supported pattern.', { requiredFacts: facts, claimRefs: facts, section: section('SNAPSHOT-SHAPE-SECTION', 'What shapes the result', 'Connect the available drivers.', 'The available facts explain the result at snapshot depth.', facts, facts) }),
    chapter('SNAPSHOT-ATTENTION', 3, 'What deserves attention', 'Identify supported areas for management attention without commercial-tier leakage.', 'The reader should know the practical area to explore next.', { requiredFacts: facts, claimRefs: facts, section: section('SNAPSHOT-ATTENTION-SECTION', 'What deserves attention', 'Keep attention focused and bounded.', 'Attention is directional, not a full premium diagnosis.', facts, facts) }),
    chapter('SNAPSHOT-MEANING', 4, 'Practical meaning', 'Translate the snapshot into a concise management implication.', 'The snapshot should be useful without pretending to be a full report.', { requiredFacts: facts, claimRefs: facts, section: section('SNAPSHOT-MEANING-SECTION', 'Practical meaning', 'Provide one practical implication.', 'The implication remains within the free snapshot boundary.', facts, facts) }),
    chapter('SNAPSHOT-DEEPER-INTERPRETATION', 5, 'Why deeper interpretation is useful', 'Explain why a deeper interpretation may help without exposing premium labels, pricing or fulfilment language.', 'The reader should understand the value of deeper interpretation without commercial leakage.', { requiredFacts: facts, claimRefs: facts, section: section('SNAPSHOT-DEEPER-INTERPRETATION-SECTION', 'Why deeper interpretation is useful', 'Close with a clean next step.', 'Further interpretation can connect patterns to management action while this snapshot remains bounded.', facts, facts) })
  ];
  return {
    schemaVersion: REPORT_BLUEPRINT_SCHEMA_VERSION,
    bibleVersion: '1.1',
    reportTitle: `${input.organisation.name} — Fraud Readiness Snapshot`,
    reportTier: 'snapshot',
    narrativeMode: 'SNAPSHOT',
    organisation: { name: input.organisation.name, sectorFacts: input.organisation.sectorFacts ?? [] },
    assessmentPosition: { reference: input.assessmentReference, score, maturity, exposureScore: null, exposureBand: null, summary: score === null ? 'The snapshot position is recorded without a published score.' : `The recorded snapshot position is ${score}/100${maturity ? ` with ${maturity} maturity.` : '.'}`, assuranceBoundary: commonAssuranceBoundary() },
    executiveStory: 'Provide a concise, bounded snapshot of the recorded position and why deeper interpretation may be useful.',
    chapters,
    findingClusters: [],
    contentAssignments: [],
    deterministicRules: ['Snapshot remains compact and free of premium-tier, pricing and fulfilment language.', 'Technical fallback remains Mini → Luna → Terra → Sol when a live writer is separately authorised.'],
    prohibitedClaims: ['Essential', 'Comprehensive', 'R7,500', 'R35,000', 'paid report', 'order', 'payment']
  };
}

function expectedAssignments(pack: NarrativeFactPack): string[] {
  return [
    ...refs(pack.systemicThemeInputs), ...refs(pack.findings), ...refs(pack.scenarios), ...refs(pack.controls),
    ...refs(pack.decisions), ...refs(pack.roadmap), ...refs(pack.sustainmentPriorities), ...pack.maturationSteps.map((step) => step.maturationRef)
  ];
}

export function validateReportBlueprint(blueprint: ReportBlueprint, pack?: NarrativeFactPack): BlueprintValidationResult {
  const issues: string[] = [];
  const duplicateContentRefs: string[] = [];
  const assignments = blueprint.contentAssignments;
  const byRef = new Map<string, BlueprintContentAssignment[]>();
  for (const assignment of assignments) byRef.set(assignment.contentRef, [...(byRef.get(assignment.contentRef) ?? []), assignment]);
  for (const [ref, rows] of byRef) if (rows.length > 1) duplicateContentRefs.push(ref);
  const missingContentRefs = pack ? expectedAssignments(pack).filter((ref) => !byRef.has(ref)) : [];
  if (duplicateContentRefs.length) issues.push(`Content assigned more than once: ${duplicateContentRefs.join(', ')}`);
  if (missingContentRefs.length) issues.push(`Content has no primary assignment: ${missingContentRefs.join(', ')}`);
  const executive = blueprint.chapters.filter((chapter) => /executive assessment|executive diagnosis/i.test(chapter.title)).map((chapter) => chapter.chapterId);
  const roadmap = blueprint.chapters.filter((chapter) => /roadmap|implementation blueprint|maturation|optimisation blueprint/i.test(chapter.title)).map((chapter) => chapter.chapterId);
  const duplicateExecutiveMovements = executive.length > 1 ? executive : [];
  const duplicateRoadmapMovements = roadmap.length > 1 ? roadmap : [];
  if (duplicateExecutiveMovements.length) issues.push('Blueprint contains duplicate executive movements.');
  if (duplicateRoadmapMovements.length && blueprint.reportTier === 'essential') issues.push('Essential Blueprint contains duplicate roadmap movements.');
  const chapterIds = blueprint.chapters.map((chapter) => chapter.chapterId);
  if (new Set(chapterIds).size !== chapterIds.length) issues.push('Chapter IDs must be unique.');
  if (blueprint.chapters.some((chapter, index) => chapter.order !== index + 1)) issues.push('Chapter ordering is not contiguous.');
  if (blueprint.chapters.some((chapter) => chapter.sections.length === 0 || chapter.sections.some((section) => !section.title || !section.purpose || !section.requiredManagementTakeaway))) issues.push('Every chapter requires a meaningful deterministic section contract.');
  if (blueprint.narrativeMode === 'SUSTAINMENT' && (blueprint.findingClusters.length > 0 || blueprint.chapters.some((chapter) => chapter.linkedFindingIds.length || chapter.linkedScenarioIds.length))) issues.push('Sustainment Blueprint may not contain finding or scenario content.');
  if (blueprint.reportTier === 'snapshot') {
    const customerSurface = [
      blueprint.reportTitle,
      blueprint.executiveStory,
      blueprint.assessmentPosition.summary,
      blueprint.assessmentPosition.assuranceBoundary,
      ...blueprint.chapters.flatMap((chapter) => [chapter.title, chapter.purpose, chapter.requiredManagementTakeaway, ...chapter.sections.flatMap((section) => [section.title, section.purpose, section.requiredManagementTakeaway])])
    ].join(' ');
    if (/essential|comprehensive|R\s*7,500|R\s*35,000|paid report|order|payment/i.test(customerSurface)) issues.push('Snapshot Blueprint contains paid-product leakage.');
  }
  return { ok: issues.length === 0, duplicateContentRefs, missingContentRefs, duplicateExecutiveMovements, duplicateRoadmapMovements, issues };
}

export function assertReportBlueprint(blueprint: ReportBlueprint, pack?: NarrativeFactPack): void {
  const result = validateReportBlueprint(blueprint, pack);
  if (!result.ok) throw new Error(`Report Blueprint validation failed: ${result.issues.join(' | ')}`);
}

export function estimateTokenRange(value: unknown): ContextTokenRange {
  const chars = JSON.stringify(value).length;
  return { minimum: Math.ceil(chars / 4.2), maximum: Math.ceil(chars / 3.2), basis: `JSON character count ${chars}; deterministic planning estimate only, no provider call.` };
}

function partitionFor(blueprint: ReportBlueprint): WholeManuscriptPartition[] {
  const chapters = blueprint.chapters;
  if (chapters.length <= 1) return [{ partitionId: 'PART-01', chapterIds: chapters.map((chapter) => chapter.chapterId), purpose: 'Complete report', preservesSequence: true }];
  const midpoint = Math.ceil(chapters.length / 2);
  return [
    { partitionId: 'PART-01', chapterIds: chapters.slice(0, midpoint).map((chapter) => chapter.chapterId), purpose: 'Executive assessment through interpretation', preservesSequence: true },
    { partitionId: 'PART-02', chapterIds: chapters.slice(midpoint).map((chapter) => chapter.chapterId), purpose: 'Exposure, management response and conclusion', preservesSequence: true }
  ];
}

export function buildWholeManuscriptContext(pack: NarrativeFactPack, blueprint: ReportBlueprint): WholeManuscriptWriterContext {
  assertReportBlueprint(blueprint, pack);
  const payload = { blueprint, permittedDeterministicFacts: pack.facts, boundaries: { assurance: commonAssuranceBoundary(), prohibitedClaims: blueprint.prohibitedClaims, sourceOfTruth: 'Deterministic Fact Pack and Report Blueprint only.' } };
  const projectedInputTokens = estimateTokenRange(payload);
  const outputWords = blueprint.reportTier === 'snapshot' ? { min: 700, max: 1400 } : blueprint.reportTier === 'essential' ? { min: 2200, max: 4200 } : { min: 4200, max: 7600 };
  const projectedOutputTokens: ContextTokenRange = { minimum: outputWords.min, maximum: outputWords.max, basis: 'Approved manuscript word envelope used as a conservative output-token planning range.' };
  const approvedInputTokenLimit = blueprint.reportTier === 'comprehensive' ? 24000 : 18000;
  const singleCallFeasible = projectedInputTokens.maximum <= approvedInputTokenLimit;
  return {
    schemaVersion: WHOLE_MANUSCRIPT_CONTEXT_SCHEMA_VERSION,
    architecture: 'whole-manuscript',
    reportBlueprint: blueprint,
    permittedDeterministicFacts: pack.facts,
    boundaries: { assurance: commonAssuranceBoundary(), customerLanguage: ['advisory', 'specific', 'conditional where scenario-based', 'plain-language management communication'], prohibitedClaims: blueprint.prohibitedClaims, sourceOfTruth: 'Deterministic Fact Pack and Report Blueprint only.' },
    style: { voice: 'Senior MK advisory voice: clear, commercially useful, specific, calm and connected.', continuity: ['one authorial voice', 'no repeated executive diagnosis', 'no duplicate conclusion', 'no next-section stitching', 'no register dump as narrative'] },
    projectedInputTokens,
    projectedOutputTokens,
    approvedInputTokenLimit,
    singleCallFeasible,
    partitionPlan: singleCallFeasible ? [] : partitionFor(blueprint)
  };
}
