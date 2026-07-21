import type { AssembledReportData } from '../types';
import { getDomainPlaybook, hasDomainPlaybook } from './domain-playbooks';
import type { MaterialFinding } from './types';

/**
 * Response-value banding. Assessment questions are scored on a 0-4 scale (0 = not in place,
 * 4 = fully in place and consistently operating) -- inferred from the cap-rule naming convention
 * (any_hard_gate_critical_control_lte_1 / _eq_2 imply distinct rules at exactly 1 and exactly 2,
 * which only makes sense on a 0-4 scale) and confirmed against real trace values (1, 2) on the
 * MK Assist reference assessment. TODO: confirm the exact scale definition against
 * methodology_versions / question scoring documentation before shipping -- flagged as a limitation
 * in the self-assessment-limitation field below rather than silently assumed.
 */
function responseMeaning(value: number | null): string {
  if (value === null) return 'Not answered / not applicable';
  if (value <= 0) return 'Not in place';
  if (value === 1) return 'Minimal or ad hoc -- exists informally, not consistently applied';
  if (value === 2) return 'Partially in place -- some structure exists but with material gaps';
  if (value === 3) return 'Largely in place -- operating, with room for consistency improvement';
  return 'Fully in place and consistently operating';
}

function exposureLinksForDomain(data: AssembledReportData, domainCode: string): string[] {
  // Deterministic, generic domain->exposure-factor associations. Not MK-Assist-specific: any
  // organisation's exposure answers get matched the same way, so this generalises across orgs.
  const associations: Record<string, string[]> = {
    D3: ['EXP-01', 'EXP-07'],
    D4: ['EXP-01', 'EXP-07'],
    D5: ['EXP-01', 'EXP-08'],
    D6: ['EXP-08'],
    D7: ['EXP-02'],
    D8: ['EXP-03', 'EXP-04'],
    D9: ['EXP-04'],
    D10: []
  };
  const relevant = associations[domainCode] ?? [];
  return data.exposureAnswers
    .filter((answer) => relevant.includes(answer.factorCode) && answer.pointsAwarded / Math.max(answer.maxPoints, 1) >= 0.5)
    .map((answer) => answer.factorCode);
}

function impactCategoriesFor(domainCode: string, isCriticalControl: boolean): { financial: string; operational: string } {
  const base: Record<string, { financial: string; operational: string }> = {
    D1: { financial: 'Indirect -- weak oversight increases the chance other financial controls fail undetected', operational: 'Slower or absent escalation of fraud concerns to leadership' },
    D2: { financial: 'Indirect -- unidentified risks receive no control investment until a loss occurs', operational: 'Blind spots in newer or changed parts of the business' },
    D3: { financial: 'Direct -- excess or stale access enables unauthorised transactions or record manipulation', operational: 'Manual processes and access rights outpace what current roles require' },
    D4: { financial: 'Direct -- fraud that evades prevention controls goes undetected for longer, compounding loss', operational: 'Exceptions accumulate without independent review' },
    D5: { financial: 'Indirect -- mishandled incidents raise investigation, legal and remediation costs', operational: 'Evidence may be lost or contaminated, weakening any recovery or legal action' },
    D6: { financial: 'Indirect -- fraud that would have been reported early continues undetected', operational: 'Staff withhold concerns, reducing early-warning visibility' },
    D7: { financial: 'Direct -- fraudulent or manipulated supplier payments are a common, high-value loss vector', operational: 'Supplier relationships and payment runs are exposed to impersonation or manipulation' },
    D8: { financial: 'Direct -- privileged digital access can be used to manipulate records or payments directly', operational: 'Digital and identity controls lag behind how fast this risk area changes' },
    D9: { financial: 'Indirect -- staff less likely to recognise or resist social-engineering and fraud attempts', operational: 'Awareness gaps concentrate risk in newer or less-supervised staff' },
    D10: { financial: 'Indirect -- control decay goes unnoticed between incidents', operational: 'The control environment quietly drifts out of date with the business' }
  };
  const entry = base[domainCode] ?? { financial: 'To be assessed with the business', operational: 'To be assessed with the business' };
  return isCriticalControl
    ? entry
    : { financial: entry.financial, operational: entry.operational };
}

export function buildMaterialFindings(data: AssembledReportData): MaterialFinding[] {
  const cappingQuestionCodes = new Set(
    data.maturityCapEvents.map((event) => event.relatedQuestionCode).filter((code): code is string => Boolean(code))
  );
  const cappingRuleByQuestion = new Map(
    data.maturityCapEvents
      .filter((event) => event.relatedQuestionCode)
      .map((event) => [event.relatedQuestionCode as string, event.ruleCode])
  );

  return data.criticalMajorGaps
    .filter((gap) => hasDomainPlaybook(gap.domainCode))
    .map((gap, index) => {
      const playbook = getDomainPlaybook(gap.domainCode);
      const domainResult = data.domainResults.find((domain) => domain.domainCode === gap.domainCode);
      const isCapping = cappingQuestionCodes.has(gap.questionCode);
      const exposureLinks = exposureLinksForDomain(data, gap.domainCode);
      const impact = impactCategoriesFor(gap.domainCode, gap.isCritical);
      const meaning = responseMeaning(gap.responseValue);

      const diagnosis = `${gap.domainName}: the response to "${gap.prompt}" was assessed as "${meaning}" (recorded value ${gap.responseValue ?? 'n/a'}). This was flagged as a ${gap.isCriticalGap ? 'critical' : 'major'} gap${gap.isHardGate ? ' on a hard-gate critical control' : gap.isCritical ? ' on a critical control' : ''}.`;

      const whyItMatters = gap.isHardGate
        ? 'This control is treated as non-negotiable in this methodology: a serious gap here limits how the overall readiness result can be interpreted, regardless of strength elsewhere.'
        : gap.isCritical
          ? 'This control is weighted as critical: weakness here carries more consequence than an equivalent gap in a non-critical control.'
          : 'This is a specific, addressable control weakness rather than a judgement on the whole domain.';

      const fraudMechanism = `A gap of this kind in ${gap.domainName.toLowerCase()} creates room for fraud to occur, go undetected, or be harder to act on once suspected -- the specific pathway depends on how this control interacts with the rest of the organisation's process (see the plausible scenarios section for concrete pathways linked to this finding).`;

      return {
        id: `MF-${gap.domainCode}-${String(index + 1).padStart(2, '0')}`,
        title: `${gap.domainName}: ${gap.prompt}`,
        domainCode: gap.domainCode,
        domainName: gap.domainName,
        questionCode: gap.questionCode,
        questionPrompt: gap.prompt,
        responseValue: gap.responseValue,
        responseMeaning: meaning,
        isCriticalControl: gap.isCritical,
        isHardGate: gap.isHardGate,
        gapClassification: gap.isCriticalGap ? 'critical' : 'major',
        maturityCapStatus: isCapping ? 'capping' : 'not_capping',
        relatedCapRuleCode: isCapping ? cappingRuleByQuestion.get(gap.questionCode) ?? null : null,
        linkedExposureFactorCodes: exposureLinks,
        diagnosis,
        whyItMatters,
        fraudMechanism,
        likelyFinancialImpact: impact.financial,
        likelyOperationalImpact: impact.operational,
        expectedControlStandard: playbook.expectedControlStandard,
        evidenceToRequest: playbook.evidenceItems.map((item) => item.artefact),
        recommendedControl: playbook.recommendedControl,
        accountableOwner: playbook.accountableOwner,
        oversightFunction: playbook.oversightFunction,
        operatingFrequency: playbook.operatingFrequency,
        implementationDifficulty: playbook.implementationDifficulty,
        targetPeriod: gap.isHardGate ? '30 days' : gap.isCritical ? '60 days' : '90 days',
        effectivenessMeasure: playbook.effectivenessMeasure,
        selfAssessmentLimitation:
          'Based on self-reported response only. No document, interview or system evidence has been reviewed to confirm this control operates as described; see the evidence checklist for what should be requested before relying on this finding operationally.' +
          (domainResult?.rawScore == null ? ' Domain score unavailable for this assessment run.' : '')
      } satisfies MaterialFinding;
    });
}
