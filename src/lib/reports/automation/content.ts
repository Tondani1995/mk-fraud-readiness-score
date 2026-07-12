import type { AssembledReportData, SelectedContent } from '../types';
import { gapKey } from '../select-content-blocks';
import type { PremiumReportNarrative } from './types';

function nonEmpty(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value));
}

export function buildDeterministicNarrative(
  data: AssembledReportData,
  content: SelectedContent
): PremiumReportNarrative {
  const capRefs = data.maturityCapEvents.map((event) => `cap:${event.ruleCode}`);
  const gapRefs = data.criticalMajorGaps.map((gap) => `gap:${gap.questionCode}`);
  const domainRefs = data.domainResults.map((domain) => `domain:${domain.domainCode}`);

  return {
    executiveDiagnosis: {
      title: content.executiveSummary.title,
      body: content.executiveSummary.body,
      evidenceRefs: nonEmpty([
        'score:overall',
        'score:final_maturity',
        'score:exposure_band',
        ...capRefs
      ])
    },
    falseComfort: {
      title: content.falseComfort.title,
      body: content.falseComfort.body,
      evidenceRefs: gapRefs.length ? gapRefs : nonEmpty(['score:final_maturity', ...domainRefs.slice(0, 3)])
    },
    leadershipAttention: {
      body: content.leadershipAttention.body,
      evidenceRefs: nonEmpty(['score:final_maturity', ...domainRefs.slice(0, 4)])
    },
    domainNarratives: data.domainResults.map((domain) => {
      const selected = content.domainNarratives[domain.domainName];
      return {
        domainCode: domain.domainCode,
        title: selected?.title ?? domain.domainName,
        body: selected?.body ?? '',
        evidenceRefs: [`domain:${domain.domainCode}`]
      };
    }),
    gapCommentary: data.criticalMajorGaps.map((gap) => ({
      questionCode: gap.questionCode,
      body: content.gapCommentary[gapKey(gap.domainCode, gap.questionCode)]?.body ?? gap.prompt,
      evidenceRefs: [`gap:${gap.questionCode}`, `domain:${gap.domainCode}`]
    }))
  };
}

export function narrativeToSelectedContent(
  data: AssembledReportData,
  narrative: PremiumReportNarrative,
  usedFallback: boolean
): SelectedContent {
  const domainByCode = new Map(data.domainResults.map((domain) => [domain.domainCode, domain.domainName]));
  const gapByQuestion = new Map(data.criticalMajorGaps.map((gap) => [gap.questionCode, gap]));

  const domainNarratives: SelectedContent['domainNarratives'] = {};
  for (const section of narrative.domainNarratives) {
    const domainName = domainByCode.get(section.domainCode);
    if (!domainName) continue;
    domainNarratives[domainName] = {
      title: section.title,
      body: section.body,
      usedFallback
    };
  }

  const gapCommentary: SelectedContent['gapCommentary'] = {};
  for (const section of narrative.gapCommentary) {
    const gap = gapByQuestion.get(section.questionCode);
    if (!gap) continue;
    gapCommentary[gapKey(gap.domainCode, gap.questionCode)] = {
      body: section.body,
      usedFallback
    };
  }

  return {
    executiveSummary: {
      title: narrative.executiveDiagnosis.title,
      body: narrative.executiveDiagnosis.body,
      usedFallback
    },
    falseComfort: {
      title: narrative.falseComfort.title,
      body: narrative.falseComfort.body,
      usedFallback
    },
    leadershipAttention: {
      body: narrative.leadershipAttention.body,
      usedFallback
    },
    domainNarratives,
    gapCommentary
  };
}
