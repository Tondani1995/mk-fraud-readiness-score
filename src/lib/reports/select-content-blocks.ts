import type { AssembledReportData, ContentBlock, MaturityBand, SelectedContent } from './types';
import {
  FALLBACK_CAPPED_DIAGNOSIS,
  FALLBACK_EXECUTIVE_DIAGNOSIS,
  FALLBACK_FALSE_COMFORT_CAPPED,
  FALLBACK_FALSE_COMFORT_CLEAN,
  FALLBACK_FALSE_COMFORT_GENERAL,
  FALLBACK_LEADERSHIP_ATTENTION,
  getDomainFallback
} from './fallback-content';

function applyTokens(text: string, data: AssembledReportData) {
  return text
    .replaceAll('{{organisationName}}', data.organisationName)
    .replaceAll('{{overallScore}}', String(Math.round(data.scoreRun.overallScore)))
    .replaceAll('{{calculatedMaturity}}', data.scoreRun.calculatedMaturity)
    .replaceAll('{{finalMaturity}}', data.scoreRun.finalMaturity)
    .replaceAll('{{exposureBand}}', data.scoreRun.exposureBand);
}

function activeBlocks(blocks: ContentBlock[]) {
  return blocks.filter((block) => block.status === 'active');
}

function firstBlock(blocks: ContentBlock[], predicate: (block: ContentBlock) => boolean) {
  return activeBlocks(blocks).find(predicate);
}

export function selectContent(data: AssembledReportData, blocks: ContentBlock[]): SelectedContent {
  const capped = data.scoreRun.capApplied;
  const hasPriorityGaps = data.criticalMajorGaps.length > 0;

  const executive = firstBlock(blocks, (block) =>
    block.blockType === 'executive_summary' && (capped ? block.severity === 'capped' : block.maturityBand === data.scoreRun.finalMaturity)
  );
  const leadership = firstBlock(blocks, (block) => block.blockType === 'leadership_attention' && block.maturityBand === data.scoreRun.finalMaturity);

  const domainNarratives: SelectedContent['domainNarratives'] = {};
  for (const domain of data.domainResults) {
    const band = bandForScore(domain.rawScore);
    const block = firstBlock(blocks, (item) =>
      item.blockType === 'domain_narrative' && item.domainCode === domain.domainCode && item.maturityBand === band
    );
    const fallback = getDomainFallback(domain.domainName, band);
    domainNarratives[domain.domainName] = {
      title: applyTokens(block?.title ?? fallback.headline, data),
      body: applyTokens(block?.body ?? fallback.body, data),
      usedFallback: !block
    };
  }

  const gapCommentary: SelectedContent['gapCommentary'] = {};
  data.criticalMajorGaps.forEach((gap) => {
    const severity = gap.isCriticalGap ? 'critical' : 'major';
    const block = firstBlock(blocks, (item) =>
      item.blockType === 'gap_commentary' && item.domainCode === gap.domainCode && item.severity === severity
    );
    gapCommentary[gapKey(gap.domainCode, gap.questionCode)] = {
      body: applyTokens(block?.body ?? fallbackGapCommentary(gap.domainName, severity, gap.isHardGate), data),
      usedFallback: !block
    };
  });

  return {
    executiveSummary: selectExecutiveSummary(data, executive),
    falseComfort: selectFalseComfort(data, blocks, capped, hasPriorityGaps),
    leadershipAttention: {
      body: applyTokens(leadership?.body ?? FALLBACK_LEADERSHIP_ATTENTION[data.scoreRun.finalMaturity], data),
      usedFallback: !leadership
    },
    domainNarratives,
    gapCommentary
  };
}

export function bandForScore(score: number | null): MaturityBand {
  if (score === null) return 'Reactive';
  if (score < 40) return 'Reactive';
  if (score < 65) return 'Developing';
  if (score < 80) return 'Structured';
  return 'Strategic';
}

export function gapKey(domainCode: string, questionCode: string) {
  return `${domainCode}::${questionCode}`;
}

function selectExecutiveSummary(data: AssembledReportData, block: ContentBlock | undefined): SelectedContent['executiveSummary'] {
  if (block) {
    return {
      title: applyTokens(block.title ?? '', data),
      body: applyTokens(block.body ?? '', data),
      usedFallback: false
    };
  }

  const fallback = data.scoreRun.capApplied ? FALLBACK_CAPPED_DIAGNOSIS : FALLBACK_EXECUTIVE_DIAGNOSIS[data.scoreRun.finalMaturity];
  const body = data.scoreRun.capApplied
    ? fallback.body
    : `${data.organisationName} scored ${Math.round(data.scoreRun.overallScore)} out of 100. ${fallback.body}`;

  return {
    title: applyTokens(fallback.headline, data),
    body: applyTokens(body, data),
    usedFallback: true
  };
}

function selectFalseComfort(
  data: AssembledReportData,
  blocks: ContentBlock[],
  capped: boolean,
  hasPriorityGaps: boolean
): SelectedContent['falseComfort'] {
  const severity = capped ? 'capped' : hasPriorityGaps ? 'not_capped' : 'clean';
  const block = firstBlock(blocks, (item) => item.blockType === 'false_comfort' && item.severity === severity);
  const fallback = capped
    ? FALLBACK_FALSE_COMFORT_CAPPED
    : hasPriorityGaps
      ? FALLBACK_FALSE_COMFORT_GENERAL
      : FALLBACK_FALSE_COMFORT_CLEAN;

  return {
    title: applyTokens(block?.title ?? fallback.headline, data),
    body: applyTokens(block?.body ?? fallback.body, data),
    usedFallback: !block
  };
}

function fallbackGapCommentary(domainName: string, severity: string, isHardGate: boolean) {
  const impact = isHardGate
    ? 'This is one of the controls that can limit the overall maturity interpretation because strength elsewhere cannot fully compensate for it.'
    : 'This is a specific, addressable control weakness rather than a general judgement on the whole domain.';
  return `A control in ${domainName} scored low enough to be flagged as a ${severity} gap. ${impact}`;
}
