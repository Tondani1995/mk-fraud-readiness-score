/**
 * FICTIONAL INTEGRATION PROTOTYPE. Candidate information-sufficiency and paid-report-release rules (R-2), for MK's
 * approval. Not connected to any order, entitlement, payment or fulfilment path; nothing here releases a report.
 *
 * Four separate statements, so that none implies another:
 *
 *   1. Stages        whether the respondent's core stage and the breadth stage are complete (a fact of the session)
 *   2. Outstanding   what was asked and not answered, by reason; a declined question is never an answer
 *   3. Analytical    whether the answers given are enough to analyse each applicable scheme (candidate rule A)
 *   4. Release       whether a paid report could be issued under candidate rules E and C (MK's commercial decision)
 *
 * Candidate rule A (analysable scheme): every confirmation of the scheme has an answer that is not declined, not
 * "I don't know" and not waiting. A scheme with some but not all is partly analysable; the report states which
 * controls are missing and concludes nothing about them.
 *
 * Candidate rule E (Essential release): core stage complete; at least 90% of applicable tier 1 schemes analysable;
 * no area in scope with every tier 1 confirmation outstanding; every outstanding item disclosed in the report.
 * Candidate rule C (Comprehensive release): rule E, and the breadth stage complete with at least 85% of applicable
 * schemes analysable. Thresholds are proposals; DECISION-READY in INFORMATION-SUFFICIENCY-AND-RELEASE.md.
 */
export const SUFFICIENCY_RULE_VERSION = 'information-sufficiency-candidate-0.1';
export const CANDIDATE_THRESHOLDS = { essentialTier1Analysable: 0.9, comprehensiveAllAnalysable: 0.85 } as const;

export type SchemeInfo = { id: string; tier: number; area: string; confirmations: { id: string; outstanding: boolean; answered: boolean }[] };
export type OutstandingInfo = { id: string; reason: 'declined' | 'not-known-by-function' | 'not-known-by-respondent' | 'waiting'; role: string | null };
export type StageInfo = { core: { complete: boolean; applicableSoFar: number; answered: number }; breadth: { complete: boolean; applicableSoFar: number; answered: number } };

export type SufficiencyResult = {
  rule: string;
  stages: { core: 'complete' | 'incomplete'; breadth: 'complete' | 'incomplete' };
  outstanding: { total: number; declined: number; notKnown: number; waiting: number; onConfirmations: number };
  analytical: {
    schemes: { applicable: number; analysable: number; partly: number; notAnalysable: number };
    tier1: { applicable: number; analysable: number; share: number };
    /** Schemes whose confirmations the method does not ask of an organisation of this size; outside the shares. */
    notExpectedBySize: number;
    areasWithNoTier1Answer: string[];
    perScheme: { id: string; state: 'analysable' | 'partly' | 'not-analysable'; missing: string[] }[];
  };
  release: {
    status: 'candidate-rules-not-approved';
    essential: { meets: boolean; reasons: string[] };
    comprehensive: { meets: boolean; reasons: string[] };
  };
};

export function evaluateInformationSufficiency(input: { stages: StageInfo; schemes: SchemeInfo[]; outstanding: OutstandingInfo[]; notExpected?: number }): SufficiencyResult {
  const { stages, schemes, outstanding } = input;
  const perScheme = schemes.map((s) => {
    // A confirmation counts only when it has a real answer: declined, "I don't know" and waiting all stay missing.
    const missing = s.confirmations.filter((c) => c.outstanding || !c.answered).map((c) => c.id);
    const state = !missing.length ? 'analysable' as const : missing.length < s.confirmations.length ? 'partly' as const : 'not-analysable' as const;
    return { id: s.id, tier: s.tier, area: s.area, state, missing };
  });
  const t1 = perScheme.filter((s) => s.tier === 1);
  const t1Analysable = t1.filter((s) => s.state === 'analysable').length;
  const share = (n: number, d: number) => (d ? n / d : 1);
  const areas = [...new Set(t1.map((s) => s.area))];
  const areasWithNoTier1Answer = areas.filter((a) => t1.filter((s) => s.area === a).every((s) => s.state === 'not-analysable'));
  const analysable = perScheme.filter((s) => s.state === 'analysable').length;

  const eReasons: string[] = [];
  if (!stages.core.complete) eReasons.push('The core stage is not complete.');
  if (share(t1Analysable, t1.length) < CANDIDATE_THRESHOLDS.essentialTier1Analysable) eReasons.push(`Fewer than ${CANDIDATE_THRESHOLDS.essentialTier1Analysable * 100}% of applicable tier 1 schemes can be analysed (${t1Analysable} of ${t1.length}).`);
  if (areasWithNoTier1Answer.length) eReasons.push(`No tier 1 confirmation is answered in ${areasWithNoTier1Answer.length} area${areasWithNoTier1Answer.length > 1 ? 's' : ''}.`);
  const cReasons = [...eReasons];
  if (!stages.breadth.complete) cReasons.push('The breadth stage is not complete.');
  if (share(analysable, perScheme.length) < CANDIDATE_THRESHOLDS.comprehensiveAllAnalysable) cReasons.push(`Fewer than ${CANDIDATE_THRESHOLDS.comprehensiveAllAnalysable * 100}% of applicable schemes can be analysed (${analysable} of ${perScheme.length}).`);

  return {
    rule: SUFFICIENCY_RULE_VERSION,
    stages: { core: stages.core.complete ? 'complete' : 'incomplete', breadth: stages.breadth.complete ? 'complete' : 'incomplete' },
    outstanding: {
      total: outstanding.length,
      declined: outstanding.filter((o) => o.reason === 'declined').length,
      notKnown: outstanding.filter((o) => o.reason.startsWith('not-known')).length,
      waiting: outstanding.filter((o) => o.reason === 'waiting').length,
      onConfirmations: outstanding.filter((o) => o.role === 'confirm').length
    },
    analytical: {
      schemes: { applicable: perScheme.length, analysable, partly: perScheme.filter((s) => s.state === 'partly').length, notAnalysable: perScheme.filter((s) => s.state === 'not-analysable').length },
      tier1: { applicable: t1.length, analysable: t1Analysable, share: Math.round(share(t1Analysable, t1.length) * 1000) / 1000 },
      areasWithNoTier1Answer,
      notExpectedBySize: input.notExpected ?? 0,
      perScheme: perScheme.map(({ id, state, missing }) => ({ id, state, missing }))
    },
    release: { status: 'candidate-rules-not-approved', essential: { meets: !eReasons.length, reasons: eReasons }, comprehensive: { meets: !cReasons.length, reasons: cReasons } }
  };
}
