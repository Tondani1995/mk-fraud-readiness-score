import type { AssembledReportData, SelectedContent } from '../types';
import { gapKey } from '../select-content-blocks';
import type { PremiumReportAiEditorialPlan, PremiumReportNarrative } from './types';

function nonEmpty(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value));
}

export function buildDeterministicNarrative(
  data: AssembledReportData,
  content: SelectedContent
): PremiumReportNarrative {
  const capRefs = data.maturityCapEvents.map((event) =>
    `cap:${event.ruleCode}:${event.relatedQuestionCode ?? event.relatedDomainCode ?? 'global'}`
  );
  const gapRefs = data.criticalMajorGaps.map((gap) => `gap:${gap.questionCode}`);
  const domainRefs = data.domainResults.map((domain) => `domain:${domain.domainCode}`);
  const coreRefs = [
    'score:overall', 'score:calculated_maturity', 'score:final_maturity', 'score:exposure',
    'score:exposure_band', 'score:coverage', 'gaps:critical_count', 'gaps:major_count'
  ];

  return {
    executiveDiagnosis: {
      title: content.executiveSummary.title,
      body: content.executiveSummary.body,
      evidenceRefs: nonEmpty([
        ...coreRefs,
        ...gapRefs,
        ...domainRefs,
        ...capRefs
      ])
    },
    falseComfort: {
      title: content.falseComfort.title,
      body: content.falseComfort.body,
      evidenceRefs: nonEmpty([...coreRefs, ...gapRefs, ...domainRefs, ...capRefs])
    },
    leadershipAttention: {
      body: content.leadershipAttention.body,
      evidenceRefs: nonEmpty([...coreRefs, ...gapRefs, ...domainRefs, ...capRefs])
    },
    domainNarratives: data.domainResults.map((domain) => {
      const selected = content.domainNarratives[domain.domainName];
      return {
        domainCode: domain.domainCode,
        title: selected?.title ?? domain.domainName,
        body: selected?.body ?? '',
        evidenceRefs: nonEmpty([
          `domain:${domain.domainCode}`,
          ...coreRefs,
          ...capRefs
        ])
      };
    }),
    gapCommentary: data.criticalMajorGaps.map((gap) => ({
      questionCode: gap.questionCode,
      body: content.gapCommentary[gapKey(gap.domainCode, gap.questionCode)]?.body ?? gap.prompt,
      evidenceRefs: nonEmpty([
        `gap:${gap.questionCode}`,
        `domain:${gap.domainCode}`,
        ...coreRefs,
        ...capRefs
      ])
    }))
  };
}

/**
 * Assembles a candidate PremiumReportNarrative from a *validated* AI editorial plan. Titles stay
 * deterministic (MK-approved editorial voice); body text and evidenceRefs come from the AI. The
 * caller (narrative-pipeline.ts) must run validatePremiumReportNarrative on the result before
 * using it -- this function only reshapes data, it does not itself enforce grounding.
 */
export function aiPlanToNarrative(
  data: AssembledReportData,
  content: SelectedContent,
  plan: PremiumReportAiEditorialPlan
): PremiumReportNarrative {
  const domainTitles = new Map(
    data.domainResults.map((domain) => [domain.domainCode, content.domainNarratives[domain.domainName]?.title ?? domain.domainName])
  );

  return {
    executiveDiagnosis: {
      title: content.executiveSummary.title,
      body: plan.executiveBody,
      evidenceRefs: plan.executiveEvidenceRefs
    },
    falseComfort: {
      title: content.falseComfort.title,
      body: plan.falseComfortBody,
      evidenceRefs: plan.falseComfortEvidenceRefs
    },
    leadershipAttention: {
      body: plan.leadershipBody,
      evidenceRefs: plan.leadershipEvidenceRefs
    },
    domainNarratives: plan.domainEvidence.map((entry) => ({
      domainCode: entry.domainCode,
      title: domainTitles.get(entry.domainCode) ?? entry.domainCode,
      body: entry.body,
      evidenceRefs: entry.evidenceRefs
    })),
    gapCommentary: plan.gapEvidence.map((entry) => ({
      questionCode: entry.questionCode,
      body: entry.body,
      evidenceRefs: entry.evidenceRefs
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
