import type { AssembledReportData, SelectedContent } from '../types';
import type { EssentialProjection } from '../essential-projection';
import { gapKey } from '../select-content-blocks';
import type { PremiumReportAiEditorialPlan, PremiumReportNarrative } from './types';
import { requiredMetricRefsFor } from './validation';

function nonEmpty(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value));
}

/**
 * The exact gap set the Essential narrative contract covers. With a bounded projection this is the
 * MFS v1 selection; without one the legacy full critical/major set is retained for legacy paths.
 */
function essentialGapTargets(data: AssembledReportData, projection?: EssentialProjection) {
  if (!projection) return data.criticalMajorGaps;
  return projection.findings.map((finding) => ({
    questionCode: finding.questionCode,
    domainCode: finding.domainCode,
    domainName: finding.domainName,
    prompt: finding.questionPrompt,
    responseValue: finding.responseValue,
    isCritical: finding.isCriticalControl,
    isHardGate: finding.isHardGate,
    isCriticalGap: finding.gapClassification === 'critical',
    isMajorGap: finding.gapClassification === 'major'
  })) as typeof data.criticalMajorGaps;
}

export function buildDeterministicNarrative(
  data: AssembledReportData,
  content: SelectedContent,
  projection?: EssentialProjection
): PremiumReportNarrative {
  const capRefs = data.maturityCapEvents.map((event) =>
    `cap:${event.ruleCode}:${event.relatedQuestionCode ?? event.relatedDomainCode ?? 'global'}`
  );
  // Every `gap:` reference this narrative emits must exist in the bounded evidence pack. Bounding
  // reduces the pack's gap items to the projection selection, so any ref derived from the full L1
  // critical/major set would be an unknown_evidence_ref. Joined by stable question code, never by
  // array position.
  const boundedGaps = essentialGapTargets(data, projection);
  const gapRefs = boundedGaps.map((gap) => `gap:${gap.questionCode}`);
  const domainRefs = data.domainResults.map((domain) => `domain:${domain.domainCode}`);
  const coreRefs = [
    'score:scale_max', 'score:overall', 'score:calculated_maturity', 'score:final_maturity',
    ...(data.adaptiveScope?.exposureAssessed === false ? [] : ['score:exposure', 'score:exposure_band']),
    'score:coverage', 'gaps:critical_count', 'gaps:major_count'
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

  const gapRefsForDomain = (domainCode: string) => boundedGaps
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
    // M2: one narrative section per BOUNDED selected finding, not one per L1 critical/major gap.
    // data.criticalMajorGaps stays complete in L1 and every unselected gap remains fail-closed in
    // L3; it simply no longer creates its own AI narrative section.
    gapCommentary: essentialGapTargets(data, projection).map((gap) => {
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
  usedFallback: boolean,
  projection?: EssentialProjection
): SelectedContent {
  const domainByCode = new Map(data.domainResults.map((domain) => [domain.domainCode, domain.domainName]));
  // Accept any section the bounded contract could legitimately have produced.
  const gapByQuestion = new Map(
    [...data.criticalMajorGaps, ...essentialGapTargets(data, projection)].map((gap) => [gap.questionCode, gap])
  );

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
