import type { AssembledReportData, SelectedContent } from '../types';
import { gapKey } from '../select-content-blocks';
import type { PremiumReportAiEditorialPlan, PremiumReportNarrative } from './types';
import { requiredMetricRefsFor } from './validation';

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

  // A domain section may only cite its own evidence. Attaching coreRefs here would have the
  // section claim the overall maturity band as its own, which validatePremiumReportNarrative
  // correctly rejects as domain_maturity_contradiction whenever a domain sits in a different band
  // from the report overall; attaching every cap event would have D2 cite D1's cap rules. Global
  // maturity and exposure context belongs to executiveDiagnosis, which still carries it.
  const capRefsForDomain = (domainCode: string) => data.maturityCapEvents
    .filter((event) => event.relatedDomainCode === domainCode
      || (event.relatedQuestionCode ?? '').startsWith(`${domainCode}-`))
    .map((event) => `cap:${event.ruleCode}:${event.relatedQuestionCode ?? event.relatedDomainCode ?? 'global'}`);

  const gapRefsForDomain = (domainCode: string) => data.criticalMajorGaps
    .filter((gap) => gap.domainCode === domainCode)
    .map((gap) => `gap:${gap.questionCode}`);

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
      const title = selected?.title ?? domain.domainName;
      const body = selected?.body ?? '';
      return {
        domainCode: domain.domainCode,
        title,
        body,
        evidenceRefs: nonEmpty([
          `domain:${domain.domainCode}`,
          ...gapRefsForDomain(domain.domainCode),
          ...capRefsForDomain(domain.domainCode),
          // Only the metric evidence this section's own wording obliges it to cite.
          ...requiredMetricRefsFor(`${title} ${body}`)
        ])
      };
    }),
    gapCommentary: data.criticalMajorGaps.map((gap) => {
      const body = content.gapCommentary[gapKey(gap.domainCode, gap.questionCode)]?.body ?? gap.prompt;
      return {
        questionCode: gap.questionCode,
        body,
        evidenceRefs: nonEmpty([
          `gap:${gap.questionCode}`,
          `domain:${gap.domainCode}`,
          ...capRefsForDomain(gap.domainCode),
          // Gap commentary routinely says "critical gap" / "major gap", which obliges the matching
          // count evidence. Stripping these in c4b5550 is what produced the 14 metric mismatches.
          ...requiredMetricRefsFor(body)
        ])
      };
    })
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
