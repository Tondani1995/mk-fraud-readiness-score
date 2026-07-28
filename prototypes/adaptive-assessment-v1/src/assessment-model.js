/**
 * MK Adaptive Fraud Readiness Assessment — assessment model.
 *
 * PROTOTYPE ONLY. Demonstrates the measures, report statuses, recommendation
 * classification and integrity signals that production will need. It does NOT
 * replace the live scoring engine.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE SCORING AND COMPARABILITY CONTRACT
 *
 *   Exclusion creates no control credit and no control penalty, but it changes
 *   the assessed scope. The resulting Fraud Readiness Score is valid only for the
 *   organisation's declared applicability profile and should not be compared
 *   directly with an organisation whose fraud exposures or applicable control
 *   areas differ materially.
 *
 * A 47-control result is NOT directly comparable with a 68-control result.
 * Every consumer of these numbers must carry the applicability profile with them.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * All thresholds in this file are PROPOSALS.
 *   METHODOLOGY DECISION REQUIRED — NOT APPROVED FOR PRODUCTION
 */

/** The five response states the product must keep distinct. */
export const FINDING_CLASS = {
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  OUTSOURCED_OR_SHARED: 'OUTSOURCED_OR_SHARED',
  UNKNOWN_OR_UNCONFIRMED: 'UNKNOWN_OR_UNCONFIRMED',
  UNANSWERED: 'UNANSWERED',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  PARTIALLY_IMPLEMENTED: 'PARTIALLY_IMPLEMENTED',
  IMPLEMENTED: 'IMPLEMENTED',
  INVALIDATED: 'INVALIDATED'
};

export const RECOMMENDATION_CLASS = {
  NONE_SCOPE_EXCLUSION: 'NONE_SCOPE_EXCLUSION',
  PROVIDER_GOVERNANCE: 'PROVIDER_GOVERNANCE',
  EVIDENCE_VERIFICATION: 'EVIDENCE_VERIFICATION',
  COMPLETION_REQUIRED: 'COMPLETION_REQUIRED',
  CONTROL_DESIGN: 'CONTROL_DESIGN',
  CONTROL_STRENGTHENING: 'CONTROL_STRENGTHENING',
  NONE_MAINTAIN: 'NONE_MAINTAIN'
};

export const REPORT_STATUS = {
  NORMAL: 'NORMAL',
  PROVISIONAL: 'PROVISIONAL',
  INSUFFICIENT_VISIBILITY: 'INSUFFICIENT_VISIBILITY'
};

/**
 * Proposed thresholds.
 * METHODOLOGY DECISION REQUIRED — NOT APPROVED FOR PRODUCTION
 */
export const THRESHOLDS = {
  coverage: { insufficient: 80, provisional: 90 },
  controlVisibility: { insufficient: 60, provisional: 85 },
  materialExclusionShare: 25,
  materialDomainExclusionShare: 50,
  highUnknownWeightShare: 15,
  repeatedGatewayToggling: 3,
  limitedDomainApplicabilityShare: 50
};

/**
 * Classify a single assessed control into a finding class and the recommendation
 * class it may produce. This is the contract that stops the report inventing findings.
 */
export function classifyResponse({ node, value, isExcluded, isRedirected, isInvalidated }) {
  if (isInvalidated) {
    return {
      finding_class: FINDING_CLASS.INVALIDATED,
      recommendation_class: RECOMMENDATION_CLASS.NONE_SCOPE_EXCLUSION,
      evidence_required: false,
      conclusion_confidence: 'none',
      control_absence_confirmed: false,
      control_visibility_status: 'not_assessed'
    };
  }
  if (isExcluded) {
    return {
      finding_class: FINDING_CLASS.NOT_APPLICABLE,
      recommendation_class: RECOMMENDATION_CLASS.NONE_SCOPE_EXCLUSION,
      evidence_required: false,
      conclusion_confidence: 'not_applicable',
      control_absence_confirmed: false,   // absent ACTIVITY, not an absent CONTROL
      control_visibility_status: 'not_assessed'
    };
  }
  if (value === undefined || value === null) {
    return {
      finding_class: FINDING_CLASS.UNANSWERED,
      recommendation_class: RECOMMENDATION_CLASS.COMPLETION_REQUIRED,
      evidence_required: false,
      conclusion_confidence: 'none',
      control_absence_confirmed: false,
      control_visibility_status: 'not_assessed'
    };
  }
  if (value === 'unknown') {
    return {
      finding_class: FINDING_CLASS.UNKNOWN_OR_UNCONFIRMED,
      recommendation_class: RECOMMENDATION_CLASS.EVIDENCE_VERIFICATION,
      evidence_required: true,
      conclusion_confidence: 'unconfirmed',
      control_absence_confirmed: false,   // uncertainty is NEVER absence
      control_visibility_status: 'not_visible'
    };
  }

  const outsourced = isRedirected || node.gateway_status === 'oversight_variant';

  if (value === 0) {
    return {
      finding_class: FINDING_CLASS.NOT_IMPLEMENTED,
      recommendation_class: outsourced ? RECOMMENDATION_CLASS.PROVIDER_GOVERNANCE : RECOMMENDATION_CLASS.CONTROL_DESIGN,
      evidence_required: false,
      conclusion_confidence: 'confirmed',
      control_absence_confirmed: true,
      control_visibility_status: 'visible'
    };
  }
  if (value === 1 || value === 2) {
    return {
      finding_class: FINDING_CLASS.PARTIALLY_IMPLEMENTED,
      recommendation_class: outsourced ? RECOMMENDATION_CLASS.PROVIDER_GOVERNANCE : RECOMMENDATION_CLASS.CONTROL_STRENGTHENING,
      evidence_required: false,
      conclusion_confidence: 'confirmed',
      control_absence_confirmed: false,
      control_visibility_status: 'visible'
    };
  }
  return {
    finding_class: outsourced ? FINDING_CLASS.OUTSOURCED_OR_SHARED : FINDING_CLASS.IMPLEMENTED,
    recommendation_class: RECOMMENDATION_CLASS.NONE_MAINTAIN,
    evidence_required: false,
    conclusion_confidence: 'confirmed',
    control_absence_confirmed: false,
    control_visibility_status: 'visible'
  };
}

/** Recommendation text templates. CONTENT DECISION REQUIRED — NOT APPROVED. */
const TEMPLATES = {
  [RECOMMENDATION_CLASS.EVIDENCE_VERIFICATION]: (n) =>
    `The respondent could not confirm how this control operates. MK could therefore not establish whether an effective control is in place. Management should identify the process owner and obtain evidence of the current procedure for: ${lower(n.prompt)}`,
  [RECOMMENDATION_CLASS.CONTROL_DESIGN]: (n) =>
    `The organisation confirmed this control is not in place. Design and implement a control covering: ${lower(n.prompt)}`,
  [RECOMMENDATION_CLASS.CONTROL_STRENGTHENING]: (n) =>
    `This control exists but is not operating consistently or is not evidenced. Strengthen its design, ownership and evidence for: ${lower(n.prompt)}`,
  [RECOMMENDATION_CLASS.PROVIDER_GOVERNANCE]: (n) =>
    `Oversight of the external provider is not adequate for this activity. Define, contract for and monitor the standard the provider must meet for: ${lower(n.prompt)}`,
  [RECOMMENDATION_CLASS.COMPLETION_REQUIRED]: (n) =>
    `This question was not answered. Complete it so the assessment can reach a conclusion on: ${lower(n.prompt)}`,
  [RECOMMENDATION_CLASS.NONE_MAINTAIN]: () => null,
  [RECOMMENDATION_CLASS.NONE_SCOPE_EXCLUSION]: () => null
};

function lower(text) {
  const s = String(text).trim().replace(/\.$/, '');
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export function recommendationFor(node, classification) {
  const template = TEMPLATES[classification.recommendation_class];
  const body = template ? template(node) : null;
  if (!body) return null;
  return {
    question_id: node.question_id,
    domain: node.domain,
    recommendation_class: classification.recommendation_class,
    evidence_required: classification.evidence_required,
    control_absence_confirmed: classification.control_absence_confirmed,
    body
  };
}

/** Grouping used by the review and report-preview screens. */
export const RECOMMENDATION_GROUPS = [
  { key: 'confirmed', title: 'Confirmed control improvements',
    classes: [RECOMMENDATION_CLASS.CONTROL_DESIGN, RECOMMENDATION_CLASS.CONTROL_STRENGTHENING] },
  { key: 'evidence', title: 'Evidence and control-verification actions',
    classes: [RECOMMENDATION_CLASS.EVIDENCE_VERIFICATION] },
  { key: 'provider', title: 'Third-party oversight improvements',
    classes: [RECOMMENDATION_CLASS.PROVIDER_GOVERNANCE] },
  { key: 'completion', title: 'Assessment-completion requirements',
    classes: [RECOMMENDATION_CLASS.COMPLETION_REQUIRED] }
];

/**
 * Build the full assessment result: three measures, report status, recommendations
 * and integrity signals. Pure function of (graph, answers, auditHistory).
 */
export function buildAssessment(graph, answers, auditHistory = [], options = {}) {
  const scoreModel = options.scoreModel || 'A';   // 'A' = unknown scores zero; 'B' = unknown excluded + gate
  const { active, excluded, redirected } = graph.resolvePath(answers);

  const controls = [];

  // Active, scoreable controls (gateways are profile_only and never scored).
  for (const nodeRef of active) {
    const node = nodeRef.node;
    if (node.gateway_status === 'gateway') continue;
    const value = answers[nodeRef.id] ? answers[nodeRef.id].value : undefined;
    const classification = classifyResponse({
      node, value, isExcluded: false,
      isRedirected: node.gateway_status === 'oversight_variant',
      isInvalidated: false
    });
    controls.push({
      question_id: nodeRef.id,
      replaces: nodeRef.replaces || null,
      domain: node.domain,
      weight: node.scoring_weight || 0,
      is_critical: !!node.is_critical,
      is_hard_gate: !!node.is_hard_gate,
      value,
      node,
      ...classification
    });
  }

  // Excluded controls.
  for (const ex of excluded) {
    if (ex.node.gateway_status === 'gateway') continue;
    const classification = classifyResponse({ node: ex.node, value: undefined, isExcluded: true });
    controls.push({
      question_id: ex.id,
      domain: ex.node.domain,
      weight: ex.node.scoring_weight || 0,
      is_critical: !!ex.node.is_critical,
      is_hard_gate: !!ex.node.is_hard_gate,
      value: undefined,
      node: ex.node,
      skip_reason_code: ex.skip_reason_code,
      skip_reason: ex.reason,
      ...classification
    });
  }

  // Invalidated controls (retained in audit history, outside the active pathway).
  for (const h of auditHistory.filter((x) => x.event === 'invalidated')) {
    const node = graph.get(h.question_id);
    if (!node || node.gateway_status === 'gateway') continue;
    const classification = classifyResponse({ node, value: undefined, isInvalidated: true });
    controls.push({
      question_id: h.question_id,
      domain: node.domain,
      weight: node.scoring_weight || 0,
      value: undefined,
      node,
      previous_value: h.previous_value,
      retained_in_audit_history: true,
      ...classification
    });
  }

  /* ------------------------------------------------------------ measures */

  const applicable = controls.filter((c) =>
    c.finding_class !== FINDING_CLASS.NOT_APPLICABLE && c.finding_class !== FINDING_CLASS.INVALIDATED);
  const excludedControls = controls.filter((c) => c.finding_class === FINDING_CLASS.NOT_APPLICABLE);

  const applicableWeight = sum(applicable.map((c) => c.weight));
  const excludedWeight = sum(excludedControls.map((c) => c.weight));
  const totalWeight = applicableWeight + excludedWeight;

  const answeredMaturity = applicable.filter((c) => typeof c.value === 'number');
  const unknown = applicable.filter((c) => c.value === 'unknown');
  const unanswered = applicable.filter((c) => c.value === undefined);

  const answeredMaturityWeight = sum(answeredMaturity.map((c) => c.weight));
  const unknownWeight = sum(unknown.map((c) => c.weight));

  // Assessment coverage: applicable weight that received ANY valid response.
  const respondedWeight = answeredMaturityWeight + unknownWeight;
  const assessmentCoverage = applicableWeight > 0 ? pct(respondedWeight / applicableWeight) : 0;

  // Control visibility: applicable weight where the respondent could confirm operation.
  const controlVisibility = applicableWeight > 0 ? pct(answeredMaturityWeight / applicableWeight) : 0;

  // Fraud Readiness Score — two demonstrable models.
  const credit = (c) => (typeof c.value === 'number' ? (c.value / 5) : 0);
  const numeratorA = sum(answeredMaturity.map((c) => credit(c) * c.weight));
  const denominatorA = answeredMaturityWeight + unknownWeight;   // unknown retained, zero credit
  const denominatorB = answeredMaturityWeight;                   // unknown removed entirely

  const scoreA = denominatorA > 0 ? pct(numeratorA / denominatorA) : null;
  const scoreB = denominatorB > 0 ? pct(numeratorA / denominatorB) : null;
  const fraudReadinessScore = scoreModel === 'B' ? scoreB : scoreA;

  const unknownWeightShare = applicableWeight > 0 ? pct(unknownWeight / applicableWeight) : 0;
  const materialExclusionShare = totalWeight > 0 ? pct(excludedWeight / totalWeight) : 0;

  /* --------------------------------------------------------- per domain */

  const domains = graph.domains.map((d) => {
    const inDomain = controls.filter((c) => c.domain === d.domainCode);
    const app = inDomain.filter((c) =>
      c.finding_class !== FINDING_CLASS.NOT_APPLICABLE && c.finding_class !== FINDING_CLASS.INVALIDATED);
    const exc = inDomain.filter((c) => c.finding_class === FINDING_CLASS.NOT_APPLICABLE);
    const appW = sum(app.map((c) => c.weight));
    const excW = sum(exc.map((c) => c.weight));
    const domUnknownW = sum(app.filter((c) => c.value === 'unknown').map((c) => c.weight));
    const domAnsweredW = sum(app.filter((c) => typeof c.value === 'number').map((c) => c.weight));
    return {
      domainCode: d.domainCode,
      name: d.name,
      weightPct: d.weightPct,
      applicableCount: app.length,
      excludedCount: exc.length,
      applicableWeight: round(appW, 4),
      excludedWeight: round(excW, 4),
      exclusionShare: appW + excW > 0 ? pct(excW / (appW + excW)) : 0,
      controlVisibility: appW > 0 ? pct(domAnsweredW / appW) : 0,
      unknownShare: appW > 0 ? pct(domUnknownW / appW) : 0,
      fullyExcluded: app.length === 0 && exc.length > 0
    };
  });

  /* ------------------------------------------------------- report status */

  // Computed before the status block because high-impact and whole-domain
  // exclusions now influence the status, not only the integrity signals.
  const highImpactExcluded = excludedControls.filter((c) => c.is_hard_gate || c.is_critical);
  const materialDomainExclusions = domains.filter(
    (d) => d.exclusionShare >= THRESHOLDS.materialDomainExclusionShare && d.excludedCount > 0);
  const limitedApplicability = domains.filter((d) => d.fullyExcluded);

  const limitations = [];
  let reportStatus = REPORT_STATUS.NORMAL;

  if (controlVisibility < THRESHOLDS.controlVisibility.insufficient) {
    reportStatus = REPORT_STATUS.INSUFFICIENT_VISIBILITY;
    limitations.push(`Control Visibility is ${controlVisibility}%. Too much of the applicable control environment could not be confirmed for a defensible overall maturity conclusion.`);
  } else if (assessmentCoverage < THRESHOLDS.coverage.insufficient) {
    reportStatus = REPORT_STATUS.INSUFFICIENT_VISIBILITY;
    limitations.push(`Assessment Coverage is ${assessmentCoverage}%. Too many applicable controls received no response.`);
  } else {
    if (controlVisibility < THRESHOLDS.controlVisibility.provisional) {
      reportStatus = REPORT_STATUS.PROVISIONAL;
      limitations.push(`This result is provisional because the respondent could not confirm ${unknown.length} control${unknown.length === 1 ? '' : 's'} representing ${unknownWeightShare}% of the applicable control weight.`);
    }
    if (assessmentCoverage < THRESHOLDS.coverage.provisional) {
      reportStatus = REPORT_STATUS.PROVISIONAL;
      limitations.push(`This result is provisional because ${unanswered.length} applicable control${unanswered.length === 1 ? '' : 's'} were not answered.`);
    }
    if (materialExclusionShare >= THRESHOLDS.materialExclusionShare) {
      reportStatus = reportStatus === REPORT_STATUS.NORMAL ? REPORT_STATUS.PROVISIONAL : reportStatus;
      limitations.push(`This result is provisional because ${materialExclusionShare}% of the total control weight was excluded from scope by the declared operating profile.`);
    }

    // A high-impact or whole-domain exclusion reshapes the assessment enough that a
    // "normal" conclusion is not defensible, even when coverage and visibility are
    // perfect. J7 is the case this exists for: an entire fraud-risk domain excluded,
    // seven findings removed, and the percentage rising — previously reported NORMAL.
    //
    // METHODOLOGY DECISION REQUIRED — NOT APPROVED FOR PRODUCTION.
    if (limitedApplicability.length > 0 || highImpactExcluded.length > 0) {
      reportStatus = reportStatus === REPORT_STATUS.NORMAL ? REPORT_STATUS.PROVISIONAL : reportStatus;
      limitations.push('This result is provisional because the declared operating profile excluded an entire fraud-risk domain or one or more high-impact controls. The excluded scope is listed below and may require confirmation.');
    }
  }

  /* ---------------------------------------------------- integrity signals */

  const gatewayChanges = auditHistory.filter((h) => h.event === 'invalidated');
  const causeCounts = {};
  for (const h of gatewayChanges) causeCounts[h.cause] = (causeCounts[h.cause] || 0) + 1;
  const toggles = auditHistory.filter((h) => h.event === 'gateway_changed');
  const toggleCounts = {};
  for (const t of toggles) toggleCounts[t.question_id] = (toggleCounts[t.question_id] || 0) + 1;

  const signals = [];
  const signal = (id, active, detail, blocking = false) => {
    if (active) signals.push({ id, detail, blocking });
  };

  signal('material_exclusion_share',
    materialExclusionShare >= THRESHOLDS.materialExclusionShare,
    `${materialExclusionShare}% of total control weight excluded (threshold ${THRESHOLDS.materialExclusionShare}%).`);
  signal('high_impact_gateway_exclusion',
    highImpactExcluded.length > 0,
    `${highImpactExcluded.length} critical or hard-gate control${highImpactExcluded.length === 1 ? '' : 's'} excluded by the declared profile.`);
  signal('gateway_answer_changed_after_downstream_answers',
    gatewayChanges.length > 0,
    `${gatewayChanges.length} answered control${gatewayChanges.length === 1 ? '' : 's'} invalidated by a later gateway change.`);
  signal('repeated_gateway_toggling',
    Object.values(toggleCounts).some((n) => n >= THRESHOLDS.repeatedGatewayToggling),
    `A gateway was changed ${Math.max(0, ...Object.values(toggleCounts))} times.`);
  signal('contradictory_profile_answers',
    detectContradictions(answers).length > 0,
    detectContradictions(answers).join(' '));
  signal('high_unknown_weight_share',
    unknownWeightShare >= THRESHOLDS.highUnknownWeightShare,
    `${unknownWeightShare}% of applicable control weight could not be confirmed (threshold ${THRESHOLDS.highUnknownWeightShare}%).`);
  signal('low_control_visibility',
    controlVisibility < THRESHOLDS.controlVisibility.provisional,
    `Control Visibility ${controlVisibility}% is below ${THRESHOLDS.controlVisibility.provisional}%.`);
  signal('low_assessment_coverage',
    assessmentCoverage < THRESHOLDS.coverage.provisional,
    `Assessment Coverage ${assessmentCoverage}% is below ${THRESHOLDS.coverage.provisional}%.`);
  signal('limited_domain_applicability',
    limitedApplicability.length > 0,
    `${limitedApplicability.length} domain${limitedApplicability.length === 1 ? '' : 's'} had no applicable controls: ${limitedApplicability.map((d) => d.domainCode).join(', ')}.`);
  signal('material_domain_exclusion',
    materialDomainExclusions.length > 0,
    `${materialDomainExclusions.length} domain${materialDomainExclusions.length === 1 ? '' : 's'} lost at least ${THRESHOLDS.materialDomainExclusionShare}% of weight: ${materialDomainExclusions.map((d) => d.domainCode).join(', ')}.`);
  signal('insufficient_visibility',
    reportStatus === REPORT_STATUS.INSUFFICIENT_VISIBILITY,
    'A definitive overall maturity conclusion is not defensible for this submission.', true);
  signal('profile_specific_comparability_warning',
    excludedControls.length > 0 || redirected.length > 0,
    'The assessed scope differs from the full control set, so this result is profile-specific.');

  /* ------------------------------------------------------ recommendations */

  const recommendations = controls
    .map((c) => recommendationFor(c.node, c))
    .filter(Boolean);

  const grouped = RECOMMENDATION_GROUPS.map((g) => ({
    ...g,
    items: recommendations.filter((r) => g.classes.includes(r.recommendation_class))
  })).filter((g) => g.items.length > 0);

  /* ------------------------------------------- score issuance (presentation) */

  // A score is only issued to the customer where the assessment can support one.
  // Under INSUFFICIENT_VISIBILITY the numeric score and any maturity band are
  // withheld: too much of the applicable control environment is unconfirmed for
  // the figure to mean what a reader would take it to mean.
  //
  // fraudReadinessScore, scoreOptionA and scoreOptionB remain populated for
  // methodology inspection. They are DIAGNOSTIC ONLY and must never be rendered
  // as the customer's score — use customerFacingScore, which is null when the
  // result is not issuable.
  const scoreIssued = reportStatus !== REPORT_STATUS.INSUFFICIENT_VISIBILITY;
  const customerFacingScore = scoreIssued ? fraudReadinessScore : null;
  const scoreWithheldReason = scoreIssued
    ? null
    : 'MK could not issue a defensible overall Fraud Readiness Score because too much of the applicable control environment could not be confirmed.';

  return {
    scoreModel,
    // DIAGNOSTIC ONLY — see scoreIssued / customerFacingScore before displaying.
    fraudReadinessScore,
    scoreOptionA: scoreA,
    scoreOptionB: scoreB,
    // Presentation gate: the only score values a customer-facing surface may show.
    scoreIssued,
    customerFacingScore,
    scoreWithheldReason,
    assessmentCoverage,
    controlVisibility,
    reportStatus,
    reportLimitationReasons: limitations,
    comparabilityStatement:
      'Your score reflects the controls applicable to the operating profile you declared. It should not be compared directly with an organisation whose fraud exposures and applicable control areas differ materially.',
    counts: {
      applicable: applicable.length,
      excluded: excludedControls.length,
      redirected: redirected.length,
      invalidated: gatewayChanges.length,
      unknown: unknown.length,
      unanswered: unanswered.length,
      answeredMaturity: answeredMaturity.length,
      totalApproved: graph.questions.length
    },
    weights: {
      applicable: round(applicableWeight, 4),
      excluded: round(excludedWeight, 4),
      total: round(totalWeight, 4),
      unknown: round(unknownWeight, 4),
      answeredMaturity: round(answeredMaturityWeight, 4)
    },
    unknownWeightShare,
    materialExclusionShare,
    domains,
    controls,
    excludedControls,
    redirected,
    signals,
    recommendations,
    recommendationGroups: grouped
  };
}

/** Simple, inspectable contradiction checks between gateway answers. */
export function detectContradictions(answers) {
  const v = (id) => (answers[id] ? answers[id].value : undefined);
  const out = [];
  if (v('G03') === 'none' && v('G04') && v('G04') !== 'unknown') {
    out.push('No external suppliers declared, but a procurement model was also declared.');
  }
  if (v('G08') === 'no' && v('G09') === 'yes' && v('G13') === 'yes') {
    out.push('No digital sales declared, but both personal data and platform dependency were declared.');
  }
  if (v('G02') === 'micro' && v('G12') === 'yes') {
    out.push('Owner-only size declared, but temporary or subcontracted workers were also declared.');
  }
  return out;
}

function sum(list) { return list.reduce((a, b) => a + b, 0); }
function round(v, dp) { const f = 10 ** dp; return Math.round(v * f) / f; }
function pct(ratio) { return round(ratio * 100, 2); }
