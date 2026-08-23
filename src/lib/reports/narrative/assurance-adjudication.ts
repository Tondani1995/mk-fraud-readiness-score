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

const NEGATED_DISCLAIMER_TEMPLATE = /\b(?:not|does not|do not|without)\s+(?:a\s+statement\s+that\s+)?(?:existing\s+)?(?:evidence|controls?|operating effectiveness)\s+(?:has been|was|were|is|are)\s+(?:independently\s+)?(?:validated|verified|confirmed|established|assured)\b/i;

const TIER_A_HARD_VOCABULARY: RegExp[] = [
  /\b(?:evidence-linked|evidence-based)\b.{0,100}\b(?:assurance|validation|validated|verified|confirmed|effective|operating effectiveness)\b/i,
  /\b(?:assurance|validation|validated|verified|confirmed|effective|operating effectiveness)\b.{0,100}\b(?:evidence-linked|evidence-based)\b/i,
  /\bvalidated operating effectiveness\b/i,
  /\bevidence validated\b/i,
  /\breviewer judgement\b/i,
  /\b(?:the\s+)?evidence\b.{0,40}\b(?:was|were|has been|have been)\s+validated\b/i
];

const CANDIDATE_GATE = /\bindependent(?:ly)?\s+(?:verif(?:y|ied|ication)|review(?:ed)?|assurance)\b|\b(?:MK|the assessment|this assessment|the report|this report|the findings?)\b[^.!?]{0,100}\b(?:confirmed|provides?\s+(?:independent\s+)?assurance)\b|\b(?:the\s+)?evidence\b\s+(?:(?:was|were|has been|have been)\s+)?(?:independently\s+)?confirmed\b|\boperating effectiveness\b[^.!?]{0,100}\b(?:was|were|has been|have been|is|are)\s+(?:independently\s+)?(?:verified|reviewed|validated|confirmed|established)\b/i;

const EVIDENCE_CRITERION = /\b(?:confirm\s+|determine\s+|establish\s+|verify\s+)?whether\b[^.!?]{0,260}\b(?:independent assurance|independent(?:ly)?\s+(?:verif(?:y|ied|ication)|review(?:ed)?)|operating effectiveness)\b/i;

const EXPLICIT_LIMITATION = /\b(?:does not|do not|did not|has not|have not|not|without)\b[^.!?]{0,80}\b(?:independent(?:ly)?\s+(?:verification|verify|verified|review|reviewed|assurance)|operating effectiveness)\b/i;
const RATHER_THAN_ASSURANCE_LIMITATION = /\brather than\b[^.!?]{0,80}\b(?:independent(?:ly)?\s+(?:verification|verify|verified|review|reviewed|assurance)|operating effectiveness)\b/i;
const NEITHER_ASSURANCE_LIMITATION = /\bneither\b[^.!?]{0,80}\b(?:is|are|was|were)\s+(?:an?\s+)?independent\s+assurance\b/i;
const NO_COMPLETED_ASSURANCE_LIMITATION = /\bno\b[^.!?]{0,120}\b(?:has been|have been|was|were|is|are)\s+independently\s+(?:verified|reviewed|confirmed)\b/i;

const MK_SUBJECT_ACTOR = /\bMK\b[^.!?]{0,100}\b(?:independently\s+(?:verified|reviewed)|independent\s+(?:verification|review)|reviewed evidence|tested\s+(?:the\s+)?(?:operation|operating effectiveness|controls?)|independently confirmed)\b/i;
const MK_TRAILING_ACTOR = /\b(?:by|from)\s+MK\b/i;
const COMPLETED_ASSURANCE_ACTOR = /\b(?:the assessment|this assessment|the report|this report|the findings?)\b[^.!?]{0,160}\b(?:independently\s+(?:verified|reviewed)|provides?\s+(?:independent\s+)?assurance|confirmed)\b/i;
const COMPLETED_EFFECTIVENESS = /\boperating effectiveness\b[^.!?]{0,100}\b(?:was|were|has been|have been|is|are)\s+(?:independently\s+)?(?:verified|reviewed|validated|confirmed|established)\b/i;
const REPORT_AS_VERIFIER = /\b(?:the report|this report|the assessment|this assessment|MK)\b[^.!?]{0,120}\b(?:should|must|needs? to|is required to|are required to)?\s*independently\s+(?:verify|review)\b/i;
const ASSESSMENT_DIRECTIONAL = /\b(?:the assessment|this assessment|the findings?|the report|this report)\b[^.!?]{0,120}\b(?:points?|directs?|guides?|recommends?|signals?)\b[^.!?]{0,100}\b(?:management|the organisation|the organization)\b[^.!?]{0,80}\bindependent\s+(?:verification|review)\b/i;
const VERIFICATION_CONFIRMED_EFFECTIVENESS = /\b(?:independent\s+(?:verification|review)|independently\s+(?:verified|reviewed))\b.{0,100}\b(?:confirmed|established|demonstrates?|shows?)\b.{0,100}\b(?:control|operating effectiveness|operates? effectively)\b/i;
const REVIEWER_REVIEW_CONFIRMED = /\b(?:MK(?:'s)?|the reviewer(?:'s)?)\s+review\b.{0,100}\b(?:confirmed|established|assured|operating effectiveness)\b/i;
const REPORT_PROVIDES_ASSURANCE = /\b(?:the report|this report)\b.{0,80}\bprovides?\s+(?:independent\s+)?assurance\b/i;

const CUSTOMER_NORMATIVE_VERIFICATION = /\b(?:management|the organisation|the organization|control owner|process owner|internal audit|assurance function|supplier|bank[- ]detail|payment|identity|access|control(?:s)?|operating effectiveness|evidence)\b[^.!?]{0,180}\b(?:should|must|needs? to|is required to|are required to|before|prior to)\b[^.!?]{0,100}\bindependent(?:ly)?\s+(?:verif(?:y|ied)|verification|review(?:ed)?)\b/i;
const PASSIVE_NORMATIVE_VERIFICATION = /\b(?:operating effectiveness|control effectiveness|controls?|evidence|implementation|remediation|closure)\b[^.!?]{0,120}\b(?:should|must|needs? to|is required to|are required to)\s+be\s+independently\s+(?:verified|reviewed)\b/i;
const CONTROL_DESIGN_INDEPENDENT_REVIEW = /(?:\b(?:separation|segregation|oversight|challenge|route|function|responsibilit(?:y|ies)|role|approval)\b[^.!?]{0,180}\bindependent review\b|\bindependent review\b[^.!?]{0,180}\b(?:role|function|responsibilit(?:y|ies)|route|requirement|separation|oversight|challenge)\b)/i;
// V1.2 Bokamoso runtime incident (2026-08-23): deterministic customer control wording such as
// refunds/credits/overrides receiving independent review and cash counts performed with independent
// review is a control requirement, not a claim that MK/the report performed assurance. Tier E actor
// checks run first, so report/MK-as-verifier claims remain rejected before this narrow allow rule.
const CUSTOMER_CONTROL_REVIEW_ACTIVITY = /\b(?:refunds?|credits?|write-?offs?|stock adjustments?|manual journals?|overrides?|cash|cash custodians?|counts?|reconciliations?|bankings?|payments?|supplier|bank[- ]detail|profile|access|recertification|activation|changes?|approvals?|exceptions?|reported concerns?|cases?)\b[^.!?]{0,220}\bindependent review\b/i;
const CONTROL_ACTIVITY_SUBJECT = /\b(?:supplier|bank[- ]detail|payment|profile|identity|privileged(?:[- ]access)?|access|recertification|activation|change(?:s)?|approval|callback|verification step|control(?:s)? activity|control design|payment release|release|reporting channel|whistleblowing channel|reported concern|case(?:s)?)\b/i;
const CONTROL_ACTIVITY_ACTION = /\b(?:should|must|require(?:s|d)?|need(?:s)?\s+to|include(?:s)?|involve(?:s)?|subject to|through|before|after|during|retain\s+(?:proof|evidence)|record|complete(?:d)?|is|are)\b/i;
const DIRECT_CONTROL_ACTIVITY = /\bindependent(?:ly)?\s+(?:verif(?:y|ied)|review(?:ed)?)\s+(?:supplier|bank[- ]detail|payment|profile|identity|privileged(?:[- ]access)?|access|recertification|changes?)\b/i;
const CUSTOMER_RECOMMENDED_INDEPENDENT_REVIEW = /(?:^|[.!?]\s+)\s*independently\s+(?:review|verify)\b|\b(?:should|must|need(?:s)?\s+to|is required to|are required to)\s+independently\s+(?:review|verify)\b/i;
const CUSTOMER_PASSIVE_CONTROL_VERIFICATION = /\b(?:operating effectiveness|control effectiveness|controls?|control environment|control design|control operation|implementation|remediation|evidence(?: package)?|closure)\b.{0,180}\b(?:(?:should|must|can|could)\s+(?:then\s+)?be|(?:need(?:s)?\s+to|is required to|are required to)\s+be)\s+independently\s+(?:verified|reviewed)\b/i;
const CUSTOMER_GOVERNANCE_ROLE_SEPARATION = /\b(?:management|internal audit|equivalent assurance function|assurance function)\b.{0,180}\bindependent review(?: responsibilities)?\b|\bindependent review(?: responsibilities)?\b.{0,180}\b(?:management|internal audit|equivalent assurance function|assurance function)\b/i;

export function adjudicateAssuranceProposition(text: string): AssuranceAdjudication {
  const value = text.trim().replace(NEGATED_DISCLAIMER_TEMPLATE, '');

  for (const pattern of TIER_A_HARD_VOCABULARY) {
    const match = value.match(pattern);
    if (match) return reject('hard_assurance_vocabulary', match[0]);
  }

  const candidate = value.match(CANDIDATE_GATE);
  if (!candidate) return allow('no_assurance_candidate');

  const criterion = value.match(EVIDENCE_CRITERION);
  if (criterion) return allow('evidence_assurance_criterion_not_completed_assurance', criterion[0]);

  const limitation = value.match(EXPLICIT_LIMITATION)
    ?? value.match(RATHER_THAN_ASSURANCE_LIMITATION)
    ?? value.match(NEITHER_ASSURANCE_LIMITATION)
    ?? value.match(NO_COMPLETED_ASSURANCE_LIMITATION);
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
    CUSTOMER_CONTROL_REVIEW_ACTIVITY,
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

export function isAssuranceCandidate(text: string): boolean {
  const stripped = text.trim().replace(NEGATED_DISCLAIMER_TEMPLATE, '');
  return TIER_A_HARD_VOCABULARY.some((pattern) => pattern.test(stripped)) || CANDIDATE_GATE.test(stripped);
}
