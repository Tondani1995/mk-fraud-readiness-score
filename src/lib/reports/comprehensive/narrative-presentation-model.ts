import type { NarrativeFactPack } from '../narrative/fact-pack';
import type { BlueprintChapter, NarrativeRole, ReportBlueprint } from '../narrative/report-blueprint';
import type { BoundedCompiledManuscript, NarrativeSlotPlan } from '../narrative/bounded-section-engine';

export type ComprehensiveSemanticTone = 'positive' | 'neutral' | 'watch' | 'critical';

export interface ComprehensiveNarrativeBlock {
  slotId: string;
  title: string;
  narrativeRole: NarrativeRole;
  narrative: string;
  managementImplication: string;
}

export interface ComprehensiveNarrativeChapter {
  chapterId: string;
  order: number;
  title: string;
  purpose: string;
  narrativeRole: NarrativeRole;
  tone: ComprehensiveSemanticTone;
  blocks: ComprehensiveNarrativeBlock[];
  domainProfile: NarrativeFactPack['domains'];
  strengths: NarrativeFactPack['relativeStrengths'];
  sustainmentPriorities: NarrativeFactPack['sustainmentPriorities'];
  findings: NarrativeFactPack['findings'];
  scenarios: NarrativeFactPack['scenarios'];
  controls: NarrativeFactPack['controls'];
  decisions: NarrativeFactPack['decisions'];
  roadmap: NarrativeFactPack['roadmap'];
  maturationSteps: NarrativeFactPack['maturationSteps'];
}

export interface ComprehensiveNarrativePresentationModel {
  product: 'Comprehensive';
  title: 'Fraud Readiness Strategy and Control Blueprint';
  organisationName: string;
  assessmentReference: string;
  score: number;
  maturity: string;
  narrativeMode: NarrativeFactPack['narrativeMode'];
  tone: ComprehensiveSemanticTone;
  assuranceBoundary: string;
  chapters: ComprehensiveNarrativeChapter[];
  transformationSequence: ReportBlueprint['transformationSequence'];
  companionWorkbook: {
    title: string;
    purpose: string;
    sheets: string[];
  };
}

const unique = <T>(values: T[]): T[] => [...new Set(values)];

function chapterRefs(chapter: BlueprintChapter): Set<string> {
  return new Set([
    ...chapter.requiredFacts,
    ...chapter.claimRefs,
    ...chapter.linkedFindingIds,
    ...chapter.linkedScenarioIds,
    ...chapter.linkedControlIds,
    ...chapter.linkedDecisionIds,
    ...chapter.linkedRoadmapIds,
    ...chapter.sections.flatMap((section) => [
      ...section.requiredFacts,
      ...section.claimRefs,
      ...section.optionalSubsections.flatMap((subsection) => [...subsection.requiredFacts, ...subsection.claimRefs])
    ])
  ]);
}

function roleTone(mode: NarrativeFactPack['narrativeMode'], role: NarrativeRole): ComprehensiveSemanticTone {
  if (mode === 'SUSTAINMENT') {
    return role === 'EXPOSURE' ? 'watch' : 'positive';
  }
  if (role === 'EXPOSURE' || role === 'EXPOSURE_ILLUSTRATION') return 'watch';
  if (role === 'EVIDENCE') return 'neutral';
  return 'neutral';
}

function overallTone(mode: NarrativeFactPack['narrativeMode'], score: number): ComprehensiveSemanticTone {
  if (mode === 'SUSTAINMENT' || score >= 65) return 'positive';
  if (score < 35) return 'critical';
  if (score < 55) return 'watch';
  return 'neutral';
}

export function buildComprehensiveNarrativePresentationModel(input: {
  factPack: NarrativeFactPack;
  blueprint: ReportBlueprint;
  plan: NarrativeSlotPlan;
  manuscript: BoundedCompiledManuscript;
}): ComprehensiveNarrativePresentationModel {
  const { factPack, blueprint, plan, manuscript } = input;
  if (factPack.productTier !== 'comprehensive' || blueprint.reportTier !== 'comprehensive') {
    throw new Error('Comprehensive narrative presentation requires the Comprehensive Fact Pack and Blueprint.');
  }
  if (!manuscript.validation.ok) {
    throw new Error(`Comprehensive manuscript is not publishable: ${manuscript.validation.issues.join(' | ')}`);
  }
  if (typeof factPack.assessment.score !== 'number' || !factPack.assessment.maturity) {
    throw new Error('Comprehensive narrative presentation requires a scored assessment.');
  }
  if (factPack.narrativeMode === 'SUSTAINMENT'
    && (factPack.findings.length || factPack.risks.length || factPack.scenarios.length || factPack.systemicThemeInputs.length)) {
    throw new Error('Sustainment presentation cannot contain customer-facing findings, risks, scenarios or weakness themes.');
  }

  const approved = new Map(manuscript.approvedSlots.map((slot) => [slot.contract.slotId, slot]));
  const chapters = [...blueprint.chapters].sort((a, b) => a.order - b.order).map((chapter) => {
    const refs = chapterRefs(chapter);
    const slots = plan.slots.filter((slot) => slot.chapterId === chapter.chapterId);
    const blocks = slots.map((slot) => {
      const accepted = approved.get(slot.slotId);
      if (!accepted) throw new Error(`Missing approved Comprehensive narrative slot ${slot.slotId}.`);
      return {
        slotId: slot.slotId,
        title: slot.title,
        narrativeRole: slot.narrativeRole,
        narrative: accepted.result.narrative.trim(),
        managementImplication: accepted.result.managementImplication.trim()
      };
    });

    const include = (ref: string): boolean => refs.has(ref);
    const isExecutive = chapter.narrativeRole === 'JUDGEMENT' || chapter.chapterId === 'ANALYTICAL-BASIS';

    return {
      chapterId: chapter.chapterId,
      order: chapter.order,
      title: chapter.title,
      purpose: chapter.purpose,
      narrativeRole: chapter.narrativeRole,
      tone: roleTone(factPack.narrativeMode, chapter.narrativeRole),
      blocks,
      domainProfile: isExecutive ? factPack.domains : [],
      strengths: factPack.relativeStrengths.filter((item) => include(item.factRef)),
      sustainmentPriorities: factPack.sustainmentPriorities.filter((item) => include(item.factRef)),
      findings: factPack.findings.filter((item) => include(item.factRef)),
      scenarios: factPack.scenarios.filter((item) => include(item.factRef)),
      controls: factPack.controls.filter((item) => include(item.factRef)),
      decisions: factPack.decisions.filter((item) => include(item.factRef)),
      roadmap: factPack.roadmap.filter((item) => include(item.factRef)),
      maturationSteps: factPack.maturationSteps.filter((item) => include(item.maturationRef))
    } satisfies ComprehensiveNarrativeChapter;
  });

  return {
    product: 'Comprehensive',
    title: 'Fraud Readiness Strategy and Control Blueprint',
    organisationName: factPack.organisation.name,
    assessmentReference: factPack.assessment.reference,
    score: factPack.assessment.score,
    maturity: factPack.assessment.maturity,
    narrativeMode: factPack.narrativeMode,
    tone: overallTone(factPack.narrativeMode, factPack.assessment.score),
    assuranceBoundary: blueprint.assessmentPosition.assuranceBoundary,
    chapters,
    transformationSequence: blueprint.transformationSequence,
    companionWorkbook: {
      title: 'MK Fraud Readiness Comprehensive Workbook',
      purpose: 'The companion workbook carries the detailed analytical and implementation record so the management report can remain narrative-led.',
      sheets: unique([
        'Read me',
        'Summary',
        'Material Findings',
        'Risk Register',
        'Control Blueprints',
        'Implementation Blueprint',
        'Management Decisions',
        'Question Traceability'
      ])
    }
  };
}
