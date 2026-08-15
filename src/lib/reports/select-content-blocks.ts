import type { EssentialProjection } from './essential-projection';
import { getMaturityBand } from '../scoring/maturity-band';
import { detectSystemicCondition } from './essential-projection';
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
    .replaceAll('{{overallScore}}', data.scoreRun.overallScore === null ? 'not issued' : String(Math.round(data.scoreRun.overallScore)))
    .replaceAll('{{calculatedMaturity}}', data.scoreRun.calculatedMaturity ?? 'not issued')
    .replaceAll('{{finalMaturity}}', data.scoreRun.finalMaturity ?? 'not issued')
    .replaceAll('{{exposureBand}}', data.scoreRun.exposureBand ?? 'not assessed');
}

function activeBlocks(blocks: ContentBlock[]) {
  return blocks.filter((block) => block.status === 'active');
}

/**
 * Deterministic block choice.
 *
 * More than one active block can match the same content type, domain and band -- D1 alone carries
 * two active Reactive domain narratives. Array.find() then returns whichever row the database
 * happened to hand back first, so the same journey could select different prose in different
 * environments, and one of the two D1 rows asserts a band its metadata does not support. Sorting
 * candidates by block_key makes the winner a property of the data rather than of row order.
 */
function firstBlock(blocks: ContentBlock[], predicate: (block: ContentBlock) => boolean) {
  const matches = activeBlocks(blocks).filter(predicate);
  if (matches.length <= 1) return matches[0];
  return [...matches].sort((a, b) => a.blockKey.localeCompare(b.blockKey))[0];
}


/**
 * Three distinct customer-facing conditions an adaptive assessment can be in. Presence of
 * adaptiveScope is NOT one of them: AdaptiveResultStatus permits NORMAL and PROVISIONAL as well as
 * INSUFFICIENT_VISIBILITY, so treating "is adaptive" as "visibility was insufficient" put false
 * statements in front of customers -- V7 reported coverage 100%, control visibility 100% and zero
 * unknown responses while the report said visibility was insufficient and explained how unknown
 * responses are treated.
 */
type AdaptiveNarrativeState = 'visibility_limited' | 'systemic' | 'adaptive_normal';

/**
 * Returns null for a non-adaptive assessment, which keeps the existing path untouched.
 * The systemic test is the authoritative one -- projection.systemic where a projection was
 * supplied, otherwise the same detectSystemicCondition() helper the projection itself uses. The
 * thresholds are never recomputed here.
 */
function adaptiveNarrativeState(
  data: AssembledReportData,
  projection?: EssentialProjection
): AdaptiveNarrativeState | null {
  const scope = data.adaptiveScope;
  if (!scope) return null;
  const visibilityLimited = scope.resultStatus === 'INSUFFICIENT_VISIBILITY'
    || scope.unknownSharePct > 0
    || scope.unansweredApplicableCount > 0;
  if (visibilityLimited) return 'visibility_limited';
  const systemic = projection?.systemic ?? detectSystemicCondition(data);
  return systemic.systemic ? 'systemic' : 'adaptive_normal';
}

export function selectContent(
  data: AssembledReportData,
  blocks: ContentBlock[],
  projection?: EssentialProjection
): SelectedContent {
  const capped = data.scoreRun.capApplied;
  const hasPriorityGaps = data.criticalMajorGaps.length > 0;

  const adaptiveState = adaptiveNarrativeState(data, projection);
  const adaptiveOverride = adaptiveState === 'visibility_limited' || adaptiveState === 'systemic';

  const executive = adaptiveOverride ? undefined : firstBlock(blocks, (block) =>
    block.blockType === 'executive_summary' && (capped ? block.severity === 'capped' : block.maturityBand === data.scoreRun.finalMaturity)
  );
  const leadership = adaptiveOverride ? undefined : firstBlock(blocks, (block) => block.blockType === 'leadership_attention' && block.maturityBand === data.scoreRun.finalMaturity);

  const domainNarratives: SelectedContent['domainNarratives'] = {};
  for (const domain of data.domainResults) {
    if (adaptiveState === 'visibility_limited') {
      domainNarratives[domain.domainName] = {
        title: 'Visibility and verification priority',
        body: 'The available response did not provide enough visibility to confirm this control position. Obtain the evidence listed in the report before treating this area as operating or as a confirmed weakness.',
        usedFallback: true
      };
      continue;
    }
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
  // D6 layer 2: commentary must exist for the exact bounded selection the validator enforces, as
  // well as for the legacy critical/major gap set. MFS v1 can select a finding that is not itself
  // a critical/major gap (for example the strongest representative of an otherwise-unrepresented
  // domain), and that finding still requires narrative in the main report.
  const commentaryTargets = [
    ...data.criticalMajorGaps,
    ...(projection?.findings ?? []).map((finding) => ({
      domainCode: finding.domainCode,
      domainName: finding.domainName,
      questionCode: finding.questionCode,
      prompt: finding.questionPrompt,
      isCriticalGap: finding.gapClassification === 'critical',
      isMajorGap: finding.gapClassification === 'major',
      isHardGate: finding.isHardGate
    }))
  ].filter((gap, index, all) =>
    all.findIndex((other) => gapKey(other.domainCode, other.questionCode) === gapKey(gap.domainCode, gap.questionCode)) === index
  );
  commentaryTargets.forEach((gap) => {
    const severity = gap.isCriticalGap ? 'critical' : 'major';
    const block = firstBlock(blocks, (item) =>
      item.blockType === 'gap_commentary' && item.domainCode === gap.domainCode && item.severity === severity
    );
    gapCommentary[gapKey(gap.domainCode, gap.questionCode)] = {
      body: applyTokens(block?.body ?? fallbackGapCommentary(gap.domainName, severity, gap.isHardGate, gap.prompt), data),
      usedFallback: !block
    };
  });

  return {
    executiveSummary: selectExecutiveSummary(data, executive, adaptiveState),
    falseComfort: selectFalseComfort(data, blocks, capped, hasPriorityGaps, adaptiveState),
    leadershipAttention: {
      body: applyTokens(leadership?.body ?? FALLBACK_LEADERSHIP_ATTENTION[data.scoreRun.finalMaturity ?? 'Reactive'], data),
      usedFallback: !leadership
    },
    domainNarratives,
    gapCommentary
  };
}

export function bandForScore(score: number | null): MaturityBand {
  // Was 40/65/80 here and 40/60/80 in the scoring engine, so a domain at 60-64
  // carried a different band depending on which module asked.
  if (score === null) return 'Reactive';
  return getMaturityBand(score);
}

export function gapKey(domainCode: string, questionCode: string) {
  return `${domainCode}::${questionCode}`;
}

function selectExecutiveSummary(data: AssembledReportData, block: ContentBlock | undefined, adaptiveState: AdaptiveNarrativeState | null): SelectedContent['executiveSummary'] {
  // Three distinct conditions, decided once in adaptiveNarrativeState(). An adaptive assessment
  // that is neither visibility-limited nor systemic falls through to the ordinary deterministic
  // diagnosis below -- it must never be labelled systemic merely because adaptiveScope exists.
  if (adaptiveState === 'visibility_limited') {
    return {
      title: 'Visibility-limited assessment',
      body: 'The submitted assessment leaves the reported readiness position provisional because the available responses do not provide enough visibility. This report identifies where the control position could not be confirmed and the evidence needed for verification.',
      usedFallback: true
    };
  }
  if (adaptiveState === 'systemic') {
    return {
      title: 'Systemic foundational control gap',
      body: 'The assessment was answered with complete visibility, and it reports that the foundational fraud-control baseline is not yet in place. This is a systemic condition rather than an uncertainty: the control position is known, and it is that the baseline controls this report sets out have not been established.',
      usedFallback: true
    };
  }
  if (block) {
    return {
      title: applyTokens(block.title ?? '', data),
      body: applyTokens(block.body ?? '', data),
      usedFallback: false
    };
  }

  const fallback = data.scoreRun.capApplied ? FALLBACK_CAPPED_DIAGNOSIS : FALLBACK_EXECUTIVE_DIAGNOSIS[data.scoreRun.finalMaturity ?? 'Reactive'];
  const body = data.scoreRun.capApplied
    ? fallback.body
    : `${data.organisationName} scored ${Math.round(data.scoreRun.overallScore ?? 0)} out of 100. ${fallback.body}`;

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
  hasPriorityGaps: boolean,
  adaptiveState: AdaptiveNarrativeState | null
): SelectedContent['falseComfort'] {
  // Only a genuine visibility limitation may say anything about unknown responses; with zero
  // unknowns this copy was simply false.
  if (adaptiveState === 'visibility_limited') {
    return {
      title: 'Visibility and verification priority',
      body: 'Unknown responses are not treated as confirmed control gaps. Obtain the evidence listed in this report before relying on a readiness conclusion.',
      usedFallback: true
    };
  }
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

function fallbackGapCommentary(domainName: string, severity: string, isHardGate: boolean, questionPrompt: string) {
  const impact = isHardGate
    ? 'This is one of the controls that can limit the overall maturity interpretation because strength elsewhere cannot fully compensate for it.'
    : 'This is a specific, addressable control weakness rather than a general judgement on the whole domain.';
  // Two different findings in the same domain and severity previously produced
  // an identical, uninformative sentence ("A control in <domain> scored low
  // enough..."), making genuinely distinct gaps look like duplicate content.
  // Naming the actual assessed control (from the question prompt) keeps each
  // gap's commentary specific to what was actually asked, even when the
  // domain/severity combination repeats.
  const trimmedPrompt = questionPrompt?.trim().replace(/\.$/, '');
  const controlReference = trimmedPrompt
    ? `the specific control on whether ${trimmedPrompt.charAt(0).toLowerCase()}${trimmedPrompt.slice(1)}`
    : `a control in ${domainName}`;
  return `Within ${domainName}, ${controlReference} scored low enough to be flagged as a ${severity} gap. ${impact}`;
}
