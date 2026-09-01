import type { NarrativeFactPack } from '../narrative/fact-pack';
import type { BlueprintChapter, NarrativeRole, ReportBlueprint, ReportBlueprintExhibit } from '../narrative/report-blueprint';
import type { NarrativeParagraphProvenance, ParsedBlueprintMarkdown } from '../narrative/blueprint-text';

export type ComprehensiveSemanticTone = 'positive' | 'neutral' | 'watch' | 'critical';

export interface ComprehensiveNarrativeBlock {
  blockId: string;
  title: string;
  narrativeRole: NarrativeRole;
  paragraphs: string[];
  managementTakeaway: string;
  claimRefs?: string[];
  provenance?: NarrativeParagraphProvenance[];
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
  themes: NarrativeFactPack['systemicThemeInputs'];
  sustainmentPriorities: NarrativeFactPack['sustainmentPriorities'];
  findings: NarrativeFactPack['findings'];
  scenarios: NarrativeFactPack['scenarios'];
  controls: NarrativeFactPack['controls'];
  decisions: NarrativeFactPack['decisions'];
  roadmap: NarrativeFactPack['roadmap'];
  maturationSteps: NarrativeFactPack['maturationSteps'];
  exhibits: ReportBlueprintExhibit[];
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
  if (mode === 'SUSTAINMENT') return role === 'EXPOSURE' ? 'watch' : 'positive';
  if (role === 'EXPOSURE' || role === 'EXPOSURE_ILLUSTRATION') return 'watch';
  return 'neutral';
}

function overallTone(mode: NarrativeFactPack['narrativeMode'], score: number): ComprehensiveSemanticTone {
  if (mode === 'SUSTAINMENT' || score >= 65) return 'positive';
  if (score < 35) return 'critical';
  if (score < 55) return 'watch';
  return 'neutral';
}

function blocksForChapter(chapter: BlueprintChapter, narrative: ParsedBlueprintMarkdown): ComprehensiveNarrativeBlock[] {
  const parsedChapter = narrative.chapters.find((item) => item.chapterId === chapter.chapterId);
  if (!parsedChapter) throw new Error(`Validated manuscript is missing chapter ${chapter.chapterId}.`);
  const blocks: ComprehensiveNarrativeBlock[] = [];
  for (const section of parsedChapter.sections) {
    const contractSection = chapter.sections.find((item) => item.sectionId === section.sectionId);
    if (!contractSection) throw new Error(`Validated manuscript section ${section.sectionId} is not in the Blueprint.`);
    if (section.paragraphs.length) {
      blocks.push({
        blockId: section.sectionId,
        title: section.title,
        narrativeRole: contractSection.narrativeRole,
        paragraphs: section.paragraphs.map((paragraph) => paragraph.text.trim()).filter(Boolean),
        managementTakeaway: contractSection.requiredManagementTakeaway,
        claimRefs: [...new Set(section.paragraphs.flatMap((paragraph) => paragraph.permittedClaimRefs))],
        provenance: section.paragraphs.map((paragraph) => paragraph.provenance).filter((item): item is NarrativeParagraphProvenance => Boolean(item))
      });
    }
    for (const subsection of section.subsections) {
      const contractSubsection = contractSection.optionalSubsections.find((item) => item.subsectionId === subsection.subsectionId);
      if (!contractSubsection) throw new Error(`Validated manuscript subsection ${subsection.subsectionId} is not in the Blueprint.`);
      blocks.push({
        blockId: subsection.subsectionId,
        title: subsection.title,
        narrativeRole: contractSubsection.narrativeRole,
        paragraphs: subsection.paragraphs.map((paragraph) => paragraph.text.trim()).filter(Boolean),
        managementTakeaway: contractSubsection.requiredManagementTakeaway,
        claimRefs: [...new Set(subsection.paragraphs.flatMap((paragraph) => paragraph.permittedClaimRefs))],
        provenance: subsection.paragraphs.map((paragraph) => paragraph.provenance).filter((item): item is NarrativeParagraphProvenance => Boolean(item))
      });
    }
  }
  return blocks;
}

export function buildComprehensiveNarrativePresentationModel(input: {
  factPack: NarrativeFactPack;
  blueprint: ReportBlueprint;
  narrative: ParsedBlueprintMarkdown;
}): ComprehensiveNarrativePresentationModel {
  const { factPack, blueprint, narrative } = input;
  if (factPack.productTier !== 'comprehensive' || blueprint.reportTier !== 'comprehensive') {
    throw new Error('Comprehensive narrative presentation requires the Comprehensive Fact Pack and Blueprint.');
  }
  if (!narrative.ok) throw new Error('Comprehensive narrative presentation requires an accepted whole manuscript.');
  if (typeof factPack.assessment.score !== 'number' || !factPack.assessment.maturity) {
    throw new Error('Comprehensive narrative presentation requires a scored assessment.');
  }
  if (factPack.narrativeMode === 'SUSTAINMENT'
    && (factPack.findings.length || factPack.risks.length || factPack.scenarios.length || factPack.systemicThemeInputs.length)) {
    throw new Error('Sustainment presentation cannot contain customer-facing findings, risks, scenarios or weakness themes.');
  }

  const chapters = [...blueprint.chapters].sort((a, b) => a.order - b.order).map((chapter) => {
    const refs = chapterRefs(chapter);
    const include = (ref: string): boolean => refs.has(ref);
    const isExecutive = chapter.narrativeRole === 'JUDGEMENT' || chapter.chapterId === 'ANALYTICAL-BASIS';
    return {
      chapterId: chapter.chapterId,
      order: chapter.order,
      title: chapter.title,
      purpose: chapter.purpose,
      narrativeRole: chapter.narrativeRole,
      tone: roleTone(factPack.narrativeMode, chapter.narrativeRole),
      blocks: blocksForChapter(chapter, narrative),
      domainProfile: isExecutive ? factPack.domains : [],
      strengths: factPack.relativeStrengths.filter((item) => include(item.factRef)),
      themes: factPack.systemicThemeInputs.filter((item) => include(item.factRef)),
      sustainmentPriorities: factPack.sustainmentPriorities.filter((item) => include(item.factRef)),
      findings: factPack.findings.filter((item) => include(item.factRef)),
      scenarios: factPack.scenarios.filter((item) => include(item.factRef)),
      controls: factPack.controls.filter((item) => include(item.factRef)),
      decisions: factPack.decisions.filter((item) => include(item.factRef)),
      roadmap: factPack.roadmap.filter((item) => include(item.factRef)),
      maturationSteps: factPack.maturationSteps.filter((item) => include(item.maturationRef)),
      exhibits: chapter.exhibits.map((item) => ({ ...item, sourceRefs: [...item.sourceRefs] }))
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
      sheets: ['Read me', 'Summary', 'Material Findings', 'Risk Register', 'Control Blueprints', 'Implementation Blueprint', 'Management Decisions', 'Question Traceability']
    }
  };
}
