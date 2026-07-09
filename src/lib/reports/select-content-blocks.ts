import type { AssembledReportData, ContentBlock, SelectedContent } from './types';

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
  const executive = firstBlock(blocks, (block) =>
    block.blockType === 'executive_summary' && (capped ? block.severity === 'capped' : block.maturityBand === data.scoreRun.finalMaturity)
  );
  const falseComfort = firstBlock(blocks, (block) => block.blockType === 'false_comfort' && (capped ? block.severity === 'capped' : block.severity !== 'capped'));
  const leadership = firstBlock(blocks, (block) => block.blockType === 'leadership_attention' && block.maturityBand === data.scoreRun.finalMaturity);

  const domainNarratives: SelectedContent['domainNarratives'] = {};
  for (const domain of data.domainResults) {
    const band = bandForScore(domain.rawScore);
    const block = firstBlock(blocks, (item) =>
      item.blockType === 'domain_narrative' && item.domainCode === domain.domainName && item.maturityBand === band
    );
    domainNarratives[domain.domainName] = {
      title: block?.title ?? domainTitle(domain.domainName, domain.rawScore),
      body: applyTokens(block?.body ?? fallbackDomainNarrative(domain.domainName, domain.rawScore), data),
      usedFallback: !block
    };
  }

  const gapCommentary: SelectedContent['gapCommentary'] = {};
  data.criticalMajorGaps.forEach((gap, index) => {
    const block = firstBlock(blocks, (item) =>
      item.blockType === 'gap_commentary' && item.domainCode === gap.domainName && (gap.isCriticalGap ? item.severity === 'critical' : item.severity === 'major')
    );
    gapCommentary[`gap-${index}`] = {
      body: applyTokens(block?.body ?? `${gap.prompt} is a priority control gap because it weakens the organisation's ability to prevent, detect or respond to fraud in ${gap.domainName}.`, data),
      usedFallback: !block
    };
  });

  return {
    executiveSummary: {
      title: executive?.title ?? (capped ? 'A specific control gap is holding back the overall readiness story' : `The organisation is currently assessed as ${data.scoreRun.finalMaturity}`),
      body: applyTokens(executive?.body ?? fallbackExecutive(data), data),
      usedFallback: !executive
    },
    falseComfort: {
      title: falseComfort?.title ?? (capped ? 'Where this organisation may look stronger than it really is' : 'Where a strong average can still hide a real gap'),
      body: applyTokens(falseComfort?.body ?? fallbackFalseComfort(data), data),
      usedFallback: !falseComfort
    },
    leadershipAttention: {
      body: applyTokens(leadership?.body ?? fallbackLeadership(data), data),
      usedFallback: !leadership
    },
    domainNarratives,
    gapCommentary
  };
}

export function bandForScore(score: number | null) {
  if (score === null) return 'Reactive';
  if (score < 40) return 'Reactive';
  if (score < 65) return 'Developing';
  if (score < 80) return 'Structured';
  return 'Strategic';
}

function fallbackExecutive(data: AssembledReportData) {
  if (data.scoreRun.capApplied) {
    return `${data.organisationName} scored ${Math.round(data.scoreRun.overallScore)} out of 100, which would ordinarily place the organisation in the ${data.scoreRun.calculatedMaturity} readiness band. A non-negotiable control gap caps the final reading to ${data.scoreRun.finalMaturity}, because some weaknesses change what the rest of the score is allowed to mean.`;
  }
  return `${data.organisationName} scored ${Math.round(data.scoreRun.overallScore)} out of 100 and is assessed as ${data.scoreRun.finalMaturity}. The score should be read together with the exposure profile, domain heatmap and priority gaps, not as a standalone rating.`;
}

function fallbackFalseComfort(data: AssembledReportData) {
  if (data.scoreRun.capApplied) return 'The main false-comfort risk is that a strong-looking average may hide one control that matters enough to change the whole readiness conclusion.';
  return 'The main false-comfort risk is assuming that an overall score means every underlying control is equally mature. The domain view below is designed to surface the unevenness that averages can hide.';
}

function fallbackLeadership(data: AssembledReportData) {
  return `Leadership should focus on the few controls that most affect fraud resilience at the current ${data.scoreRun.finalMaturity} stage, rather than treating every gap as equally urgent.`;
}

function fallbackDomainNarrative(domainName: string, score: number | null) {
  const scoreText = score === null ? 'not scored' : `${Math.round(score)} out of 100`;
  return `${domainName} scored ${scoreText}. The practical question is whether this area is supported by repeatable controls that will still work when the organisation is busy, under pressure or facing a new fraud method.`;
}

function domainTitle(domainName: string, score: number | null) {
  if (score === null || score < 40) return `${domainName} needs foundational attention`;
  if (score < 65) return `${domainName} exists in parts, but not yet as a system`;
  if (score < 80) return `${domainName} is credible, but consistency is the next test`;
  return `${domainName} is mature, but should still be stress-tested`;
}
