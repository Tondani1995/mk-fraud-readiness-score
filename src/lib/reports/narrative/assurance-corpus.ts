/**
 * Canonical MUST_ALLOW / MUST_REPAIR / MUST_REJECT corpus for assurance-language adjudication.
 *
 * This is the single permanent regression fixture for "does this sentence assert that MK, the
 * assessment or the report has already independently verified or provided assurance over
 * something the self-assessment evidence cannot establish" -- as opposed to a legitimate customer
 * recommendation, an explicit assurance-boundary limitation, an evidence-table proof criterion, or
 * a control-design/governance reference to independent review.
 *
 * Owner decision 1 (bounded architecture correction, 2026-08): "consolidate every current
 * MUST_ALLOW/MUST_REPAIR/MUST_REJECT and cascade regression example into one shared corpus and
 * prove both current engines against it. Then implement the shared core and prove the new core
 * against the full combined corpus before retiring duplication." This file is that consolidation.
 * Every entry was collected from a real, currently-committed regression assertion -- not invented
 * to pad coverage -- in one of:
 *   - scripts/commercial-quality/essential-false-positive-safety-net-tests.mjs
 *   - scripts/commercial-quality/narrative-presentation-hygiene-tests.mjs
 *   - scripts/commercial-quality/narrative-assurance-semantics-tests.mjs
 *   - scripts/commercial-quality/essential-assurance-boundary-tests.mjs
 *   - scripts/commercial-quality/whole-manuscript-recovery-tests.mjs
 *   - scripts/commercial-quality/essential-validation-cascade-regression.mjs
 * A handful of entries add the false-positive examples from the Bokamoso order
 * MKORD-2026-4790A29D incident and owner-supplied examples that were not yet in any committed
 * test, and one entry exercises existing dead-in-practice engine coverage (reviewer judgement)
 * that no committed test currently reaches. Each is tagged with its real source below.
 *
 * Before this file existed, two independently-authored pattern sets each carried their own partial
 * example list (narrative/validation.ts's classifyAssuranceLanguage and essential-validation-
 * cascade.ts's adjudicateAssuranceSentence). A fix proven against one list had no guarantee of
 * being true of the other -- which is how the Bokamoso final-HTML failure on
 * `assurance_language_final` shipped after the manuscript-stage equivalent had already been
 * hardened against a similar (but not identical) example set. Consolidating both lists plus the
 * incident examples surfaced four real, previously-invisible divergences between the two engines,
 * fixed once in narrative/assurance-adjudication.ts rather than twice and inconsistently:
 *
 *   - classifyAssuranceLanguage incorrectly rejected active-voice negated limitations such as
 *     "This assessment does not independently verify operating effectiveness." -- its
 *     NEGATED_ASSURANCE_DISCLAIMER strip only matched a rigid negator-noun-copula-verb order and
 *     PROHIBITED_ASSURANCE_SUBJECT's actor+verb test never checked for an intervening negator.
 *   - Both engines incorrectly rejected present-perfect negated limitations such as "This
 *     assessment has not independently verified operating effectiveness." -- COMPLETED_ASSURANCE-
 *     style patterns matched the actor+"...verified" span before any negation check ran.
 *   - adjudicateAssuranceSentence incorrectly allowed "The evidence must be independently verified
 *     by MK before closure." -- its normative-verification allow rule matched on subject+modal
 *     shape alone and never checked for a trailing "by/from MK" actor the way classifyAssurance-
 *     Language's MK_ASSURANCE_ACTOR already did.
 *   - adjudicateAssuranceSentence's candidate gate treats bare "operating effectiveness" (with no
 *     nearby assurance verb) as a candidate with almost no allow-context escape route, which would
 *     have driven the deterministic repaired text "operating effectiveness remains subject to
 *     evidence validation before closure" (assurance-boundary-normalisation.ts's own rewrite
 *     output) to AMBIGUOUS if it had ever reached that engine -- a validator flagging its own
 *     certified repair output. classifyAssuranceLanguage's narrower candidate gate does not have
 *     this problem. The unified core adopts the narrower gate.
 */

export interface AssuranceCorpusEntry {
  id: string;
  text: string;
  source: string;
  /**
   * Only set on MUST_ALLOW entries that a currently-committed test asserts must resolve to a
   * strict `null` under classifyAssuranceLanguage's contract -- i.e. the text must not even read as
   * an assurance candidate, not merely as a cleared one. Used for the deterministic repair-output
   * regression: engine-authored replacement prose must not itself look like a fresh assurance
   * claim requiring adjudication.
   */
  expectNoCandidate?: boolean;
  /**
   * Only set on MUST_ALLOW entries that a currently-committed test asserts must resolve to a
   * cleared candidate (customer_control_activity), not a bare non-candidate. Distinguishes "this
   * text was never assurance-flavoured" from "this text was assurance-flavoured and context
   * cleared it," which two existing tests observe directly.
   */
  expectCandidate?: boolean;
}

export const ASSURANCE_MUST_ALLOW: AssuranceCorpusEntry[] = [
  { id: 'allow-normative-01', text: 'Operating effectiveness should then be independently verified before management closes the action.', source: 'essential-false-positive-safety-net-tests + essential-assurance-boundary-tests' },
  { id: 'allow-normative-02', text: 'Operating effectiveness should be independently verified before closure.', source: 'essential-validation-cascade-regression' },
  { id: 'allow-normative-03', text: 'The control evidence must be independently reviewed before reliance.', source: 'essential-false-positive-safety-net-tests + essential-assurance-boundary-tests' },
  { id: 'allow-normative-04', text: 'Control effectiveness can be independently verified once the evidence pack is complete.', source: 'essential-false-positive-safety-net-tests + essential-assurance-boundary-tests' },
  { id: 'allow-normative-05', text: 'Management should independently review whether activation occurred only after verification and whether exceptions were approved.', source: 'essential-false-positive-safety-net-tests', expectCandidate: true },
  { id: 'allow-control-objective-01', text: 'The intended measure is a complete custody trail; this is a management control objective, not a statement that evidence has been validated.', source: 'essential-false-positive-safety-net-tests + narrative-assurance-semantics (ambiguous disclaimer)', expectNoCandidate: true },
  { id: 'allow-directional-01', text: 'The assessment points management toward independent verification.', source: 'essential-false-positive-safety-net-tests' },
  { id: 'allow-directional-02', text: 'This assessment directs management towards independent review before closure.', source: 'essential-false-positive-safety-net-tests' },
  { id: 'allow-directional-03', text: 'The report guides the organisation toward independent verification of operating effectiveness.', source: 'essential-false-positive-safety-net-tests' },
  { id: 'allow-limitation-01', text: 'This assessment does not independently verify operating effectiveness.', source: 'bokamoso-incident' },
  { id: 'allow-limitation-02', text: 'This assessment does not independently verify operating effectiveness before closure.', source: 'consolidation-gap-engine1' },
  { id: 'allow-limitation-03', text: 'The assessment does not independently verify operating effectiveness.', source: 'consolidation-gap-engine1' },
  { id: 'allow-limitation-04', text: 'This report does not independently verify operating effectiveness.', source: 'consolidation-gap-engine1' },
  { id: 'allow-limitation-05', text: 'This assessment has not independently verified operating effectiveness.', source: 'consolidation-gap-both' },
  { id: 'allow-limitation-06', text: 'This report has not independently verified control effectiveness.', source: 'consolidation-gap-both' },
  { id: 'allow-limitation-07', text: 'The assessment does not independently verify operating effectiveness, evidence or every in-scope control.', source: 'whole-manuscript-recovery-tests (blueprint assuranceBoundary)' },
  { id: 'allow-limitation-08', text: 'Neither measure is independent assurance.', source: 'vhutshilo-customer-1-final-template-incident-2026-08-20', expectCandidate: true },
  { id: 'allow-limitation-09', text: 'This remains a self-assessment: no document, interview, transaction sample or system evidence has been independently verified for any item.', source: 'vhutshilo-customer-1-final-template-incident-2026-08-20', expectCandidate: true },
  { id: 'allow-limitation-10', text: 'The assessment reflects management’s own responses and the MK scoring method rather than independent verification of operating effectiveness.', source: 'siyakhula-v1.2-final-html-incident-2026-08-23', expectCandidate: true },
  { id: 'allow-evidence-criterion-01', text: 'Whether supplier legal identity and bank-account ownership were independently verified before activation or payment.', source: 'bokamoso-incident + essential-validation-cascade-regression' },
  { id: 'allow-evidence-criterion-02', text: 'Confirm whether supplier legal identity and bank-account ownership were independently verified before activation or payment.', source: 'bokamoso-incident + essential-validation-cascade-regression' },
  { id: 'allow-evidence-criterion-03', text: 'Whether supplier identity was independently verified before onboarding remains to be confirmed.', source: 'owner-request' },
  { id: 'allow-evidence-criterion-04', text: 'Confirm whether the bank-detail change was independently verified before release.', source: 'owner-request' },
  { id: 'allow-governance-01', text: 'Whether fraud-risk matters and independent assurance are reported through the approved governance route.', source: 'bokamoso-incident + essential-validation-cascade-regression' },
  { id: 'allow-governance-02', text: 'Independent review responsibilities sit with internal audit, separate from control operation.', source: 'owner-request' },
  { id: 'allow-governance-03', text: 'The independent review function reports through the approved governance route, separate from management control ownership.', source: 'owner-request' },
  { id: 'allow-governance-04', text: 'The organisation should establish independent review of high-risk changes.', source: 'consolidation-addition' },
  { id: 'allow-customer-control-01', text: 'Supplier bank-detail changes should be independently verified through a trusted channel before release.', source: 'narrative-presentation-hygiene-tests + narrative-assurance-semantics-tests' },
  { id: 'allow-customer-control-02', text: 'Sensitive profile changes require independent verification before approval.', source: 'narrative-presentation-hygiene-tests + narrative-assurance-semantics-tests' },
  { id: 'allow-customer-control-03', text: 'Privileged-access recertification should include independent review.', source: 'narrative-presentation-hygiene-tests + narrative-assurance-semantics-tests' },
  { id: 'allow-customer-control-04', text: 'Management should retain proof that the independent verification step was completed.', source: 'narrative-presentation-hygiene-tests + narrative-assurance-semantics-tests' },
  { id: 'allow-customer-control-05', text: 'The control design is evidence-based and should be retained for implementation.', source: 'narrative-assurance-semantics-tests' },
  { id: 'allow-customer-control-06', text: 'The accountable owner should independently review exception approvals before closure.', source: 'narrative-assurance-semantics-tests' },
  { id: 'allow-customer-control-07', text: 'Independently review exception approvals every quarter and retain evidence of completion.', source: 'narrative-assurance-semantics-tests' },
  { id: 'allow-customer-control-08', text: 'the recorded control position should be reviewed by management before reliance', source: 'whole-manuscript-recovery-tests', expectNoCandidate: true },
  { id: 'allow-customer-control-09', text: 'Trust in a reporting channel is fragile and easily lost after a single mishandled case, which makes consistent independent review the single most important thing to protect here.', source: 'vhutshilo-customer-1-final-output-incident-2026-08-20', expectCandidate: true },
  { id: 'allow-disclaimer-template-01', text: 'This is a target control design, not a statement that existing evidence has been validated.', source: 'narrative-assurance-semantics-tests (negatedDisclaimer)', expectNoCandidate: true },
  { id: 'allow-governance-role-separation-01', text: 'Fraud-risk ownership, structured assessment and periodic review are recorded as initial or ad hoc. Management owns fraud risk, while independent review responsibilities should remain separate where an internal audit or equivalent assurance function exists. The CEO / Managing Director should approve the accountability RACI and establish a scheduled review.', source: 'narrative-assurance-semantics-tests (customer control)', expectCandidate: true },
  { id: 'allow-repaired-limitation-01', text: 'The MK scoring method is strategic fraud-risk analysis and control design, without verification of operating effectiveness by this review.', source: 'essential-assurance-boundary-tests (post-normalisation repaired text)', expectNoCandidate: true },
  { id: 'allow-repaired-target-01', text: 'the self-assessment responses indicate that evidence exists.', source: 'essential-assurance-boundary-tests (post-normalisation repaired text)', expectNoCandidate: true },
  { id: 'allow-repaired-passive-01', text: 'operating effectiveness remains subject to evidence validation before closure.', source: 'essential-assurance-boundary-tests (post-normalisation repaired text)', expectNoCandidate: true },
  { id: 'allow-vhutshilo-confirmed-outcomes-01', text: 'evidence, and rules should be tuned monthly from confirmed', source: 'vhutshilo-customer-1-acceptance-incident-2026-08-19 (runtime validator matched span)', expectNoCandidate: true }
];

/**
 * Confirmed prohibited assurance language that is nonetheless deterministically repairable --
 * a known-safe rewrite exists (see assurance-boundary-normalisation.ts) that removes the
 * unsupported completed-assurance assertion without changing any score, finding, owner or date.
 */
export const ASSURANCE_MUST_REPAIR: AssuranceCorpusEntry[] = [
  { id: 'repair-01', text: 'This assessment has independently verified that evidence exists.', source: 'essential-false-positive-safety-net-tests' },
  { id: 'repair-02', text: 'Operating effectiveness has been independently verified before closure.', source: 'essential-false-positive-safety-net-tests' }
];

/**
 * Genuine prohibited assurance claims. Must always be classified as prohibited under
 * classifyAssuranceLanguage's contract, remain release-blocking, and never be cleared by
 * contextual adjudication, evidence comparison, or a secondary classifier. Some of these resolve
 * internally to the shared core's AMBIGUOUS verdict rather than REJECT (see
 * narrative/assurance-adjudication.ts's module doc comment on the three-way outcome) -- both
 * wrapper wrap AMBIGUOUS into the same fail-safe/blocking treatment as REJECT, so the distinction
 * is invisible to every test in this corpus and only observable to the Essential cascade's own
 * HELD_FOR_REVIEW-vs-REJECT handling.
 */
export const ASSURANCE_MUST_REJECT: AssuranceCorpusEntry[] = [
  { id: 'reject-completed-01', text: 'Operating effectiveness was independently verified.', source: 'essential-false-positive-safety-net-tests + narrative-presentation-hygiene-tests' },
  { id: 'reject-completed-02', text: 'Operating effectiveness has been independently verified.', source: 'essential-assurance-boundary-tests' },
  { id: 'reject-actor-trailing-01', text: 'The evidence must be independently verified by MK before closure.', source: 'essential-false-positive-safety-net-tests + essential-assurance-boundary-tests (consolidation-gap-engine2)' },
  { id: 'reject-vague-01', text: 'Independent verification is important.', source: 'essential-false-positive-safety-net-tests + narrative-presentation-hygiene-tests + narrative-assurance-semantics-tests' },
  { id: 'reject-completed-03', text: 'The assessment independently verified control effectiveness.', source: 'essential-false-positive-safety-net-tests' },
  { id: 'reject-assurance-provided-01', text: 'This report provides independent assurance over operating effectiveness.', source: 'essential-false-positive-safety-net-tests' },
  { id: 'reject-assurance-provided-02', text: 'This report provides independent assurance that the controls are effective.', source: 'essential-validation-cascade-regression' },
  { id: 'reject-assurance-provided-03', text: 'The report provides independent assurance.', source: 'narrative-assurance-semantics-tests' },
  { id: 'reject-actor-subject-01', text: 'MK independently verified the controls.', source: 'essential-validation-cascade-regression + bokamoso-incident' },
  { id: 'reject-actor-subject-02', text: "MK independently verified the organisation's supplier controls.", source: 'narrative-presentation-hygiene-tests + narrative-assurance-semantics-tests' },
  { id: 'reject-completed-04', text: 'This assessment has independently verified that the control operates as designed.', source: 'essential-assurance-boundary-tests' },
  { id: 'reject-completed-05', text: 'The assessment provides independent verification.', source: 'narrative-presentation-hygiene-tests + narrative-assurance-semantics-tests' },
  { id: 'reject-completed-06', text: 'The findings were independently verified.', source: 'narrative-presentation-hygiene-tests + narrative-assurance-semantics-tests' },
  { id: 'reject-verification-confirmed-01', text: 'Independent verification confirmed the controls operate effectively.', source: 'narrative-presentation-hygiene-tests + narrative-assurance-semantics-tests' },
  { id: 'reject-evidence-validated-01', text: 'The evidence was validated.', source: 'narrative-presentation-hygiene-tests + narrative-assurance-semantics-tests' },
  { id: 'reject-reviewer-review-01', text: "MK's review confirmed operating effectiveness.", source: 'narrative-presentation-hygiene-tests + narrative-assurance-semantics-tests' },
  { id: 'reject-evidence-based-01', text: 'This report provides evidence-based assurance.', source: 'narrative-assurance-semantics-tests' },
  { id: 'reject-evidence-linked-01', text: 'The assessment contains evidence-linked validation.', source: 'narrative-assurance-semantics-tests' },
  { id: 'reject-actor-modal-01', text: 'MK should independently review the control and confirm effectiveness.', source: 'narrative-assurance-semantics-tests' },
  { id: 'reject-report-verifier-01', text: 'This report should independently verify whether the control is effective.', source: 'narrative-assurance-semantics-tests' },
  { id: 'reject-report-verifier-02', text: 'The report should independently verify the control before management relies on it.', source: 'essential-assurance-boundary-tests' },
  { id: 'reject-compound-negated-plus-positive-01', text: 'This is not a statement that existing evidence has been validated. MK independently verified the controls.', source: 'narrative-assurance-semantics-tests (negatedPlusPositive)' },
  { id: 'reject-reviewer-judgement-01', text: 'The finding relied on reviewer judgement.', source: 'synthetic-tier-a-coverage (exercises existing, currently-untested engine1 ABSOLUTELY_PROHIBITED_ASSURANCE pattern)' },
  { id: 'reject-evidence-confirmed-01', text: 'The evidence confirmed operating effectiveness.', source: 'vhutshilo-incident-boundary-counterexample' }
];

export const ASSURANCE_CORPUS = {
  allow: ASSURANCE_MUST_ALLOW,
  repair: ASSURANCE_MUST_REPAIR,
  reject: ASSURANCE_MUST_REJECT
};
