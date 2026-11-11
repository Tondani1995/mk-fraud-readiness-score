import type { AdvisoryEvidenceModel } from '@/lib/reports/evidence-model/types';
import type { RevisedAnalysis } from './evidence-model';

/**
 * FICTIONAL INTEGRATION PROTOTYPE. The scenario facts the existing Comprehensive assembly reads, built from the draft
 * method's own schemes instead of the Essential Fact Pack's family pathways. The assembly, management model and
 * renderer are unchanged; they read the same fields they read today.
 *
 * Every field comes from the revised evidence model, which takes it from the staged answers and the bank's scheme
 * content (how it happens, why it matters, the controls that stop it and the risks the method names). Linked finding,
 * risk and control identifiers are the evidence model's own, so the Comprehensive scenario register can be followed
 * through to the blueprint that interrupts each scheme.
 */
export function revisedComprehensiveScenarioFacts(evidence: AdvisoryEvidenceModel, analysis: RevisedAnalysis, limit = 12) {
  const order = new Map(evidence.materialFindings.map((f, i) => [f.id, i]));
  const byScheme = new Map(analysis.scenarios.map((s) => [s.id, s]));
  return [...evidence.scenarios]
    .sort((a, b) => (order.get(a.linkedFindingIds[0]) ?? 999) - (order.get(b.linkedFindingIds[0]) ?? 999))
    .slice(0, limit)
    .map((sc) => {
      const s = byScheme.get(sc.scenarioType);
      const finding = evidence.materialFindings.find((f) => f.id === sc.linkedFindingIds[0]);
      const functions = [...new Set((s?.members ?? []).map((m) => (m.c.answer?.by && m.c.answer.by !== 'Respondent' ? m.c.answer.by : null)).filter(Boolean))];
      return {
        factRef: sc.id,
        title: sc.title,
        scenarioFamily: finding?.fraudPathwayFamilies[0] ?? 'DETECTION_EVASION',
        actorClass: s?.kind === 'false-comfort' ? 'An insider or outsider relying on a control that is reported but not supported' : 'An insider, supplier or outsider who finds the step unguarded',
        opportunity: sc.whyControlsMayNotCatchIt,
        entryPoint: sc.entryPoint,
        // The entry point already states how the scheme starts; the mechanism adds why it works and what the answers show.
        mechanism: `${s?.why ? `${s.why.replace(/\.?$/, '.')} ` : ''}What the answers show: ${sc.whyControlsMayNotCatchIt}`,
        concealment: sc.concealmentMechanism,
        consequence: `${sc.financialImpact} ${sc.operationalImpact}`,
        warningIndicators: sc.earlyWarningIndicators,
        currentControlWeakness: sc.linkedControlWeaknesses.join('; '),
        requiredControlResponse: sc.controlsExpected.join(' '),
        immediateContainment: sc.immediateContainment,
        longTermResponse: sc.longerTermResponse,
        linkedRiskRefs: sc.linkedRiskIds,
        linkedFindingRefs: sc.linkedFindingIds,
        answeredBy: functions
      };
    });
}
