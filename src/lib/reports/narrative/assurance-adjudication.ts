/**
 * Canonical shared assurance/context adjudication core.
 *
 * Owner decision 1 (bounded architecture correction, 2026-08): "There must ultimately be one
 * source of truth for assurance-language classification." Before this module existed, two
 * independently-authored pattern sets answered the same question -- "does this proposition assert
 * that MK, the assessment or the report has already independently verified or provided assurance
 * over something the self-assessment evidence cannot establish" -- with different regexes and
 * different example corpora:
 *
 *   - narrative/validation.ts's classifyAssuranceLanguage (manuscript-stage v1.1 pathway and the
 *     v1.1 whole-manuscript recovery/repair pathway).
 *   - essential-validation-cascade.ts's adjudicateAssuranceSentence (the Essential text-first
 *     manuscript cascade and the Essential final-HTML cascade).
 *
 * A fix proven against one engine's examples had no guarantee of being true of the other. That is
 * how the Bokamoso order MKORD-2026-4790A29D final-HTML failure on `assurance_language_final`
 * shipped after the manuscript-stage equivalent had already been hardened against a similar (but
 * not identical) example set. Both call sites now delegate here; see narrative/validation.ts and
 * essential-validation-cascade.ts for the thin, contract-preserving wrappers, and
 * narrative/assurance-corpus.ts for the consolidated MUST_ALLOW / MUST_REPAIR / MUST_REJECT
 * regression fixture this module is proven against.
 *
 * Three-way outcome. Two prior engines each answered a binary question (their own binary, not the
 * same one -- see below) which forced every proposition this module could not confidently place
 * into a customer-safe context to be silently folded into one bucket or the other. Owner decision 6
 * requires AMBIGUOUS to be a real, distinct outcome from REJECT: a proposition this module cannot
 * confidently clear AND cannot confidently confirm as a violation is reported as genuinely
 * unresolved, not quietly treated as either safe or a confirmed violation. Callers remain
 * responsible for staying fail-safe on AMBIGUOUS -- this module only reports the honest verdict.
 *
 * Ordering is the load-bearing property of this function, not merely the individual patterns.
 * Every historical false positive this consolidation fixes was a false positive because a completed
 * assertion or invalid-actor check ran BEFORE the text was checked for an explicit negated
 * limitation or an evidence/epistemic criterion clause -- never because the underlying pattern was
 * wrong in isolation. Do not reorder the tiers below without re-running the full corpus.
 */

export type AssuranceAdjudicationDisposition = 'ALLOW' | 'REJECT' | 'AMBIGUOUS';

export interface AssuranceAdjudication {
  disposition: AssuranceAdjudicationDisposition;
  /**
   * Whether the text even resembled an assurance proposition. A caller whose own contract has no
   * third state (customer_control_activity vs. no issue at all) needs this to decide whether to
   * report "no candidate here" rather than "candidate, but cleared" -- the two are observably
   * different to some callers (see narrative/validation.ts's null vs. customer_control_activity).
   */
  isCandidate: boolean;
  reasonCode: string;
  /** The specific matched span, for diagnostics. Null only when isCandidate is false. */
  matched: string | null;
}

function allow(reasonCode: string, matched: string | null = null): AssuranceAdjudication {
  return { disposition: 'ALLOW', isCandidate: matched !== null, reasonCode, matched };
}
function reject(reasonCode: string, matched: string): AssuranceAdjudication {
  return { disposition: 'REJECT', isCandidate: true, reasonCode, matched };
}
function ambiguous(reasonCode: string, matched: string): AssuranceAdjudication {
  return { disposition: 'AMBIGUOUS', isCandidate: true, reasonCode, matched };
}

// ---------------------------------------------------------------------------------------------
// Tier 0 -- narrow disclaimer-template strip. Must run before Tier A: "not a statement that
// existing evidence has been validated" (a hedge-clause template naming a target control design,
// not an assurance claim) would otherwise satisfy Tier A's context-free "evidence ... has been ...
// validated" vocabulary check on its own literal words, negation notwithstanding. Tier A is
// intentionally unconditional for everything else, so the one shape that has a legitimate negated
// form has to be removed before Tier A ever looks at the text -- exactly mirroring
// narrative/validation.ts's original NEGATED_ASSURANCE_DISCLAIMER strip, which ran before its own
// absolute-vocabulary checks for the same reason.
// ---------------------------------------------------------------------------------------------
const NEGATED_DISCLAIMER_TEMPLATE = /\b(?:not|does not|do not|without)\s+(?:a\s+statement\s+that\s+)?(?:existing\s+)?(?:evidence|controls?|operating effectiveness)\s+(?:has been|was|were|is|are)\s+(?:independently\s+)?(?:validated|verified|confirmed|established|assured)\b/i;

// ---------------------------------------------------------------------------------------------
// Tier A -- absolute, context-free hard vocabulary. No actor, no negation-clearing applies: none
// of these phrasings has a legitimate negated or normative form anywhere in the consolidated
// corpus (once the Tier 0 disclaimer-template strip above has run), and each fires regardless of
// whether the narrower Tier B candidate gate below would otherwise have let the text through
// untouched. This mirrors narrative/validation.ts's original ABSOLUTELY_PROHIBITED_ASSURANCE,
// minus the actor-bearing patterns (moved to Tier E -- see the module doc comment on ordering).
// ---------------------------------------------------------------------------------------------
const TIER_A_HARD_VOCABULARY: RegExp[] = [
  /\b(?:evidence-linked|evidence-based)\b.{0,100}\b(?:assurance|validation|validated|verified|confirmed|effective|operating effectiveness)\b/i,
  /\b(?:assurance|validation|validated|verified|confirmed|effective|operating effectiveness)\b.{0,100}\b(?:evidence-linked|evidence-based)\b/i,
  /\bvalidated operating effectiveness\b/i,
  /\bevidence validated\b/i,
  /\breviewer judgement\b/i,
  /\b(?:the\s+)?evidence\b.{0,40}\b(?:was|were|has been|have been)\s+validated\b/i
];

// ---------------------------------------------------------------------------------------------
// Tier B -- candidate gate. Deliberately narrower than a bare "operating effectiveness" or bare
// "confirmed" scan: the deterministic evidence-proof-purpose table and its own repaired output
// (assurance-boundary-normalisation.ts) both contain "operating effectiveness" and "evidence" as
// ordinary domain vocabulary with no nearby assurance verb at all, and must not become candidates
// merely for containing those words. A text that fails this gate is not an assurance proposition;
// it never reaches Tier C onward.
// ---------------------------------------------------------------------------------------------
const CANDIDATE_GATE = /\bindependent(?:ly)?\s+(?:verif(?:y|ied|ication)|review(?:ed)?|assurance)\b|\b(?:MK|the assessment|this assessment|the report|this report|the findings?|the evidence|evidence)\b[^.!?]{0,100}\b(?:confirmed|provides?\s+(?:independent\s+)?assurance)\b|\boperating effectiveness\b[^.!?]{0,100}\b(?:was|were|has been|have been|is|are)\s+(?:independently\s+)?(?:verified|reviewed|validated|confirmed|established)\b/i;

// ---------------------------------------------------------------------------------------------
// Tier C -- evidence/epistemic criterion. Evidence tables and recommended-next-step prose
// deliberately use epistemic criteria such as "Whether X was independently verified" and "Confirm
// whether X was independently verified" -- see essential-commercial-output-closure.ts's
// essentialEvidenceProofPurpose(). Those clauses describe what evidence must establish; they do not
// assert that verification was completed. This is the exact pattern family the Bokamoso incident
// was missing (commit d2a83c6). Checked before completed-assertion and negation tiers because its
// "whether" framing is unambiguous regardless of what surrounds it.
// ---------------------------------------------------------------------------------------------
const EVIDENCE_CRITERION = /\b(?:confirm\s+|determine\s+|establish\s+|verify\s+)?whether\b[^.!?]{0,260}\b(?:independent assurance|independent(?:ly)?\s+(?:verif(?:y|ied|ication)|review(?:ed)?)|operating effectiveness)\b/i;

// ---------------------------------------------------------------------------------------------
// Tier D -- explicit negated limitation. Must run BEFORE any completed-assertion or actor check.
// This is the exact ordering fix for the two highest-volume false-positive families found while
// consolidating the two engines:
//   - "This/the assessment/report does not independently verify operating effectiveness" (active
//     voice) was previously misread by narrative/validation.ts's actor+verb check, which had no
//     negation guard at all.
//   - "This assessment has not independently verified operating effectiveness" (present perfect)
//     was previously misread by BOTH engines' completed-assertion checks, which matched the
//     actor+"...verified" span without checking whether a negator sat in between.
// EXPLICIT_LIMITATION's gap-based tail already generalises across both active and present-perfect
// phrasing. The narrower disclaimer-template shape ("not a statement that existing evidence has
// been validated") is handled earlier, by the Tier 0 strip above, since it also has to run before
// Tier A.
// ---------------------------------------------------------------------------------------------
const EXPLICIT_LIMITATION = /\b(?:does not|do not|did not|has not|have not|not|without)\b[^.!?]{0,80}\b(?:independent(?:ly)?\s+(?:verification|verify|verified|review|reviewed)|operating effectiveness)\b/i;

// ---------------------------------------------------------------------------------------------
// Tier E -- actor-based completed-assertion checks. Everything here runs only after Tier D has
// already cleared genuine limitations, so an actor+verb match here is never a misread negation.
// ---------------------------------------------------------------------------------------------
/** MK named as the actor who performed or must perform the verification (any voice). */
const MK_SUBJECT_ACTOR = /\bMK\b[^.!?]{0,100}\b(?:independently\s+(?:verified|reviewed)|independent\s+(?:verification|review)|reviewed evidence|tested\s+(?:the\s+)?(?:operation|operating effectiveness|controls?)|independently confirmed)\b/i;
/**
 * MK named as the trailing actor of a passive construction -- "...must be independently verified
 * by MK before closure." Consolidation gap: essential-validation-cascade.ts's
 * CUSTOMER_NORMATIVE_VERIFICATION matched this on subject+modal shape alone and had no equivalent
 * of narrative/validation.ts's trailing-actor check, so it incorrectly allowed this sentence. Must
 * be checked as an override before Tier F's normative-verification allow rules, not folded into
 * them, or the same gap reopens.
 */
const MK_TRAILING_ACTOR = /\b(?:by|from)\s+MK\b/i;
const COMPLETED_ASSURANCE_ACTOR = /\b(?:the assessment|this assessment|the report|this report|the findings?)\b[^.!?]{0,160}\b(?:independently\s+(?:verified|reviewed)|provides?\s+(?:independent\s+)?assurance|confirmed)\b/i;
const COMPLETED_EFFECTIVENESS = /\boperating effectiveness\b[^.!?]{0,100}\b(?:was|were|has been|have been|is|are)\s+(?:independently\s+)?(?:verified|reviewed|validated|confirmed|established)\b/i;
/** Assessment/report/MK proposed as the reviewer/verifier itself, rather than directing a third party toward review. */
const REPORT_AS_VERIFIER = /\b(?:the report|this report|the assessment|this assessment|MK)\b[^.!?]{0,120}\b(?:should|must|needs? to|is required to|are required to)?\s*independently\s+(?:verify|review)\b/i;
/** The assessment/report may direct management toward future independent verification without claiming it performed that verification itself. */
const ASSESSMENT_DIRECTIONAL = /\b(?:the assessment|this assessment|the findings?|the report|this report)\b[^.!?]{0,120}\b(?:points?|directs?|guides?|recommends?|signals?)\b[^.!?]{0,100}\b(?:management|the organisation|the organization)\b[^.!?]{0,80}\bindependent\s+(?:verification|review)\b/i;
/** Independent verification/review claimed to have already confirmed/established/demonstrated/shown control effectiveness. */
const VERIFICATION_CONFIRMED_EFFECTIVENESS = /\b(?:independent\s+(?:verification|review)|independently\s+(?:verified|reviewed))\b.{0,100}\b(?:confirmed|established|demonstrates?|shows?)\b.{0,100}\b(?:control|operating effectiveness|operates? effectively)\b/i;
const REVIEWER_REVIEW_CONFIRMED = /\b(?:MK(?:'s)?|the reviewer(?:'s)?)\s+review\b.{0,100}\b(?:confirmed|established|assured|operating effectiveness)\b/i;
const REPORT_PROVIDES_ASSURANCE = /\b(?:the report|this report)\b.{0,80}\bprovides?\s+(?:independent\s+)?assurance\b/i;

// ---------------------------------------------------------------------------------------------
// Tier F -- customer-owned / control-design context. Checked only once Tier E has found no
// completed assertion or invalid actor. Union of both engines' allow-context pattern sets.
// ---------------------------------------------------------------------------------------------
const CUSTOMER_NORMATIVE_VERIFICATION = /\b(?:management|the organisation|the organization|control owner|process owner|internal audit|assurance function|supplier|bank[- ]detail|payment|identity|access|control(?:s)?|operating effectiveness|evidence)\b[^.!?]{0,180}\b(?:should|must|needs? to|is required to|are required to|before|prior to)\b[^.!?]{0,100}\bindependent(?:ly)?\s+(?:verif(?:y|ied)|verification|review(?:ed)?)\b/i;
const PASSIVE_NORMATIVE_VERIFICATION = /\b(?:operating effectiveness|control effectiveness|controls?|evidence|implementation|remediation|closure)\b[^.!?]{0,120}\b(?:should|must|needs? to|is required to|are required to)\s+be\s+independently\s+(?:verified|reviewed)\b/i;
const CONTROL_DESIGN_INDEPENDENT_REVIEW = /(?:\b(?:separation|segregation|oversight|challenge|route|function|responsibilit(?:y|ies)|role|approval)\b[^.!?]{0,180}\bindependent review\b|\bindependent review\b[^.!?]{0,180}\b(?:role|function|responsibilit(?:y|ies)|route|requirement|separation|oversight|challenge)\b)/i;
const CONTROL_ACTIVITY_SUBJECT = /\b(?:supplier|bank[- ]detail|payment|profile|identity|privileged(?:[- ]access)?|access|recertification|activation|change(?:s)?|approval|callback|verification step|control(?:s)? activity|control design|payment release|release)\b/i;
const CONTROL_ACTIVITY_ACTION = /\b(?:should|must|require(?:s|d)?|need(?:s)?\s+to|include(?:s)?|involve(?:s)?|subject to|through|before|after|during|retain\s+(?:proof|evidence)|record|complete(?:d)?|is|are)\b/i;
const DIRECT_CONTROL_ACTIVITY = /\bindependent(?:ly)?\s+(?:verif(?:y|ied)|review(?:ed)?)\s+(?:supplier|bank[- ]detail|payment|profile|identity|privileged(?:[- ]access)?|access|recertification|changes?)\b/i;
const CUSTOMER_RECOMMENDED_INDEPENDENT_REVIEW = /(?:^|[.!?]\s+)\s*independently\s+(?:review|verify)\b|\b(?:should|must|need(?:s)?\s+to|is required to|are required to)\s+independently\s+(?:review|verify)\b/i;
const CUSTOMER_PASSIVE_CONTROL_VERIFICATION = /\b(?:operating effectiveness|control effectiveness|controls?|control environment|control design|control operation|implementation|remediation|evidence(?: package)?|closure)\b.{0,180}\b(?:(?:should|must|can|could)\s+(?:then\s+)?be|(?:need(?:s)?\s+to|is required to|are required to)\s+be)\s+independently\s+(?:verified|reviewed)\b/i;
const CUSTOMER_GOVERNANCE_ROLE_SEPARATION = /\b(?:management|internal audit|equivalent assurance function|assurance function)\b.{0,180}\bindependent review(?: responsibilities)?\b|\bindependent review(?: responsibilities)?\b.{0,180}\b(?:management|internal audit|equivalent assurance function|assurance function)\b/i;

/**
 * Adjudicates one customer-facing text block or sentence for prohibited assurance language.
 *
 * Returns the honest three-way verdict (ALLOW / REJECT / AMBIGUOUS); it does not decide what a
 * caller does with AMBIGUOUS (that is the caller's fail-safe-vs-blocking policy, tracked separately
 * per owner decision 6 in essential-validation-cascade.ts's EssentialCandidateDisposition).
 */
export function adjudicateAssuranceProposition(text: string): AssuranceAdjudication {
  // Tier 0: strip the narrow disclaimer-template shape before any other tier looks at the text
  // (see the constant's doc comment for why this specific shape cannot wait for Tier D).
  const value = text.trim().replace(NEGATED_DISCLAIMER_TEMPLATE, '');

  for (const pattern of TIER_A_HARD_VOCABULARY) {
    const match = value.match(pattern);
    if (match) return reject('hard_assurance_vocabulary', match[0]);
  }

  const candidate = value.match(CANDIDATE_GATE);
  if (!candidate) return allow('no_assurance_candidate');

  const criterion = value.match(EVIDENCE_CRITERION);
  if (criterion) return allow('evidence_assurance_criterion_not_completed_assurance', criterion[0]);

  const limitation = value.match(EXPLICIT_LIMITATION);
  if (limitation) return allow('explicit_assurance_limitation', limitation[0]);

  const trailingActor = value.match(MK_TRAILING_ACTOR);
  if (trailingActor && CANDIDATE_GATE.test(value)) return reject('mk_named_as_verifying_actor', trailingActor[0]);

  for (const [reasonCode, pattern] of [
    ['mk_performed_or_must_perform_verification', MK_SUBJECT_ACTOR],
    ['completed_assurance_not_supported', COMPLETED_ASSURANCE_ACTOR],
    ['completed_assurance_not_supported', COMPLETED_EFFECTIVENESS],
    ['verification_claimed_to_confirm_effectiveness', VERIFICATION_CONFIRMED_EFFECTIVENESS],
    ['reviewer_review_claimed_confirmed', REVIEWER_REVIEW_CONFIRMED],
    ['report_provides_assurance', REPORT_PROVIDES_ASSURANCE]
  ] as const) {
    const match = value.match(pattern);
    if (match) return reject(reasonCode, match[0]);
  }

  const invalidActor = value.match(REPORT_AS_VERIFIER);
  if (invalidActor && !ASSESSMENT_DIRECTIONAL.test(value)) return reject('invalid_assurance_actor', invalidActor[0]);

  for (const pattern of [
    CUSTOMER_NORMATIVE_VERIFICATION,
    PASSIVE_NORMATIVE_VERIFICATION,
    ASSESSMENT_DIRECTIONAL,
    CONTROL_DESIGN_INDEPENDENT_REVIEW,
    DIRECT_CONTROL_ACTIVITY,
    CUSTOMER_RECOMMENDED_INDEPENDENT_REVIEW,
    CUSTOMER_PASSIVE_CONTROL_VERIFICATION,
    CUSTOMER_GOVERNANCE_ROLE_SEPARATION
  ]) {
    const match = value.match(pattern);
    if (match) return allow('customer_owned_or_control_design_context', match[0]);
  }
  if (CONTROL_ACTIVITY_SUBJECT.test(value) && CONTROL_ACTIVITY_ACTION.test(value)) {
    return allow('customer_owned_or_control_design_context', candidate[0]);
  }

  return ambiguous('assurance_context_unresolved', candidate[0]);
}

/**
 * High-recall pre-filter: does this text even resemble an assurance proposition at all. Exported
 * so every candidate-detection call site (essential-validation-cascade.ts's CANDIDATE_SCAN layer
 * for both the manuscript and final-HTML cascades) uses the exact same gate that
 * adjudicateAssuranceProposition itself uses internally, rather than each maintaining its own
 * partial copy. Equivalent to checking `adjudicateAssuranceProposition(text).isCandidate` but
 * without computing a full disposition when the caller only needs the yes/no answer.
 */
export function isAssuranceCandidate(text: string): boolean {
  const stripped = text.trim().replace(NEGATED_DISCLAIMER_TEMPLATE, '');
  return TIER_A_HARD_VOCABULARY.some((pattern) => pattern.test(stripped)) || CANDIDATE_GATE.test(stripped);
}
