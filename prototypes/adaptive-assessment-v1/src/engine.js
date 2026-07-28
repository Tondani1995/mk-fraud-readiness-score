/**
 * MK Adaptive Fraud Readiness Assessment — deterministic branching engine.
 *
 * PROTOTYPE ONLY. Not wired to production routes, Supabase or the live scoring engine.
 *
 * Design contract:
 *  - No AI at runtime. Every branching decision is a pure function of
 *    (question-graph JSON, answer state). Same inputs => same outputs, always.
 *  - Applicability is a SEPARATE axis from maturity score.
 *  - Exclusion creates no control credit and no control penalty, but it CHANGES
 *    THE ASSESSED SCOPE. Because excluded controls leave the denominator, removing
 *    a weakly-controlled area can and often does change the remaining percentage.
 *    The resulting score is valid only for the declared applicability profile and
 *    must never be compared directly against an organisation with materially
 *    different exposures. See docs/adaptive-assessment/05.
 *  - "I do not know" keeps the control applicable. It is never read as the control
 *    being absent and never as the control being present; it reduces Control
 *    Visibility and drives evidence-verification recommendations.
 *  - Unanswered reduces Assessment Coverage. It is never a finding.
 *  - Outsourcing redirects to a third-party governance question; it never removes risk.
 */

export const APPLICABILITY = {
  INTERNAL: 'activity_exists_internal',
  OUTSOURCED: 'activity_outsourced',
  SHARED: 'activity_shared_service',
  ABSENT: 'activity_absent',
  UNKNOWN: 'unknown'
};

export const SCORING_STATUS = {
  NOT_APPLICABLE: 'not_applicable',
  OUTSOURCED: 'outsourced',
  UNKNOWN: 'unknown',
  NOT_IMPLEMENTED: 'not_implemented',
  PARTIALLY_IMPLEMENTED: 'partially_implemented',
  IMPLEMENTED: 'implemented',
  INVALIDATED: 'invalidated_by_upstream',
  PROFILE_ONLY: 'profile_only',
  THIRD_PARTY_GOVERNANCE: 'scored_as_third_party_governance'
};

/** Maturity value -> scoring status. Deliberately explicit rather than numeric ranges. */
export function maturityStatus(value) {
  if (value === 'unknown') return SCORING_STATUS.UNKNOWN;
  if (value === 0) return SCORING_STATUS.NOT_IMPLEMENTED;
  if (value === 1 || value === 2) return SCORING_STATUS.PARTIALLY_IMPLEMENTED;
  if (value === 3 || value === 4 || value === 5) return SCORING_STATUS.IMPLEMENTED;
  return null;
}

/**
 * Evaluate a condition node against gateway answers.
 * Grammar (intentionally tiny, inspectable and serialisable):
 *   { question_id, in: [values] }
 *   { all: [node, ...] }
 *   { any: [node, ...] }
 *   { not: node }
 *   null / undefined  => always true
 */
export function evaluateCondition(node, answers) {
  if (node === null || node === undefined) return true;
  if (Array.isArray(node.all)) return node.all.every((child) => evaluateCondition(child, answers));
  if (Array.isArray(node.any)) return node.any.some((child) => evaluateCondition(child, answers));
  if (node.not) return !evaluateCondition(node.not, answers);
  if (node.question_id && Array.isArray(node.in)) {
    const answer = answers[node.question_id];
    const value = answer && answer.value !== undefined ? answer.value : undefined;
    return node.in.includes(value);
  }
  throw new Error(`Unrecognised condition node: ${JSON.stringify(node)}`);
}

/** Collect every question_id referenced by a condition tree (used for invalidation). */
export function conditionDependencies(node, acc = new Set()) {
  if (!node) return acc;
  if (Array.isArray(node.all)) node.all.forEach((c) => conditionDependencies(c, acc));
  if (Array.isArray(node.any)) node.any.forEach((c) => conditionDependencies(c, acc));
  if (node.not) conditionDependencies(node.not, acc);
  if (node.question_id) acc.add(node.question_id);
  return acc;
}

export class AssessmentGraph {
  constructor(graph) {
    this.graph = graph;
    this.gateways = graph.gateways;
    this.questions = graph.questions;
    this.variants = graph.oversight_variants;
    this.domains = graph.domains;

    this.byId = new Map();
    [...this.gateways, ...this.questions, ...this.variants].forEach((q) => this.byId.set(q.question_id, q));

    this.domainByCode = new Map(this.domains.map((d) => [d.domainCode, d]));

    // Reverse index: gateway question_id -> [dependent question ids]
    this.dependents = new Map();
    const register = (dependentId, node) => {
      conditionDependencies(node).forEach((gid) => {
        if (!this.dependents.has(gid)) this.dependents.set(gid, new Set());
        this.dependents.get(gid).add(dependentId);
      });
    };
    [...this.gateways, ...this.questions, ...this.variants].forEach((q) => {
      register(q.question_id, q.applicability_condition);
      if (q.redirect_when) register(q.question_id, q.redirect_when.condition);
    });
  }

  get(id) {
    return this.byId.get(id);
  }

  estMinutes(q) {
    if (q.estMinutes) return q.estMinutes;
    const domain = this.domainByCode.get(q.domain);
    return domain ? domain.estMinutesPerQuestion : 0.6;
  }

  /**
   * Resolve the active pathway for a given answer state.
   * Returns an ordered list of node descriptors plus exclusion records.
   * Pure: no mutation of `answers`.
   *
   * PROGRESSIVE PROFILING: gateways are interleaved with the domains they serve.
   * Five broad profile questions come first; every other gateway is emitted in the
   * block immediately before the earliest domain that depends on it. The resulting
   * APPLICABILITY PROFILE is identical to the previous all-gateways-first ordering,
   * because a gateway is always emitted before any question whose condition reads it.
   * That equivalence is asserted by a test.
   */
  resolvePath(answers) {
    const active = [];
    const excluded = [];
    const redirected = [];

    const pushGateway = (g) => {
      if (evaluateCondition(g.applicability_condition, answers)) {
        active.push({ id: g.question_id, kind: 'gateway', node: g, phase: g.phase });
      } else {
        excluded.push({
          id: g.question_id,
          kind: 'gateway',
          node: g,
          skip_reason_code: g.skip_reason_code || 'gateway_condition_not_met',
          reason: this.graph.skip_reason_codes[g.skip_reason_code] || 'A previous answer made this question unnecessary.'
        });
      }
    };

    // Phase 1: the five broad organisation-profile gateways.
    for (const g of this.gateways.filter((x) => x.phase === 'profile')) pushGateway(g);

    // Phase 2: for each domain in order — its gateway block, then its questions.
    const ordered = [...this.questions].sort((a, b) => {
      const da = this.domainByCode.get(a.domain);
      const db = this.domainByCode.get(b.domain);
      if (da.sortOrder !== db.sortOrder) return da.sortOrder - db.sortOrder;
      return a.question_id.localeCompare(b.question_id, 'en');
    });

    let currentDomain = null;
    for (const q of ordered) {
      if (q.domain !== currentDomain) {
        currentDomain = q.domain;
        for (const g of this.gateways.filter((x) => x.phase === `domain:${currentDomain}`)) pushGateway(g);
      }
      // Redirect takes precedence: outsourced activity switches to the oversight variant.
      if (q.redirect_when && evaluateCondition(q.redirect_when.condition, answers)) {
        const variant = this.get(q.redirect_when.redirect_to);
        if (!variant) throw new Error(`Missing oversight variant ${q.redirect_when.redirect_to} for ${q.question_id}`);
        active.push({ id: variant.question_id, kind: 'oversight_variant', node: variant, replaces: q.question_id });
        redirected.push({
          from: q.question_id,
          to: variant.question_id,
          skip_reason_code: 'redirected_to_oversight_variant',
          reason: this.graph.skip_reason_codes.redirected_to_oversight_variant
        });
        continue;
      }

      if (evaluateCondition(q.applicability_condition, answers)) {
        active.push({ id: q.question_id, kind: 'question', node: q });
      } else {
        excluded.push({
          id: q.question_id,
          kind: 'question',
          node: q,
          skip_reason_code: q.skip_reason_code || 'gateway_condition_not_met',
          reason: this.graph.skip_reason_codes[q.skip_reason_code] || 'A previous answer made this question unnecessary.'
        });
      }
    }

    // Phase 3: standalone oversight variants (those that do not replace a base question).
    for (const v of this.variants) {
      if (v.replaces !== null && v.replaces !== undefined) continue;
      if (evaluateCondition(v.applicability_condition, answers)) {
        active.push({ id: v.question_id, kind: 'oversight_variant', node: v, replaces: null });
      }
    }

    return { active, excluded, redirected };
  }

  /** Dynamic progress + time estimate. Never a fixed "X of Y". */
  progress(answers) {
    const { active, excluded } = this.resolvePath(answers);
    const answeredIds = new Set(
      active.filter((n) => answers[n.id] && answers[n.id].value !== undefined).map((n) => n.id)
    );

    const remaining = active.filter((n) => !answeredIds.has(n.id));
    const minutesRemaining = remaining.reduce((sum, n) => sum + this.estMinutes(n.node), 0);

    // Area-level completion, counted only over active nodes.
    const areas = new Map();
    for (const n of active) {
      const code = n.node.domain === 'PROFILE' ? 'PROFILE' : n.node.domain;
      if (!areas.has(code)) areas.set(code, { code, total: 0, answered: 0 });
      const a = areas.get(code);
      a.total += 1;
      if (answeredIds.has(n.id)) a.answered += 1;
    }
    const areaList = [...areas.values()].map((a) => ({
      ...a,
      name: a.code === 'PROFILE' ? 'Organisation profile' : this.domainByCode.get(a.code).name,
      complete: a.total > 0 && a.answered === a.total
    }));

    return {
      activeTotal: active.length,
      answered: answeredIds.size,
      remaining: remaining.length,
      excludedTotal: excluded.length,
      overallPct: active.length ? Math.round((answeredIds.size / active.length) * 100) : 0,
      minutesRemaining: Math.max(1, Math.round(minutesRemaining)),
      areas: areaList,
      areasComplete: areaList.filter((a) => a.complete).length,
      areasTotal: areaList.length
    };
  }

  /** The next unanswered node on the active path, or null when the path is complete. */
  nextUnanswered(answers, afterId = null) {
    const { active } = this.resolvePath(answers);
    const startIndex = afterId ? active.findIndex((n) => n.id === afterId) + 1 : 0;
    for (let i = startIndex; i < active.length; i += 1) {
      const node = active[i];
      if (!answers[node.id] || answers[node.id].value === undefined) return node;
    }
    // Wrap: catch anything left earlier in the path (e.g. after a back-edit).
    for (let i = 0; i < Math.min(startIndex, active.length); i += 1) {
      const node = active[i];
      if (!answers[node.id] || answers[node.id].value === undefined) return node;
    }
    return null;
  }

  /**
   * Which currently-answered questions would leave the active path if `gatewayId`
   * were changed to `newValue`? Used to drive the invalidation warning.
   */
  invalidationPreview(answers, gatewayId, newValue) {
    const before = this.resolvePath(answers);
    const beforeActive = new Set(before.active.map((n) => n.id));

    const hypothetical = { ...answers, [gatewayId]: { ...(answers[gatewayId] || {}), value: newValue } };
    const after = this.resolvePath(hypothetical);
    const afterActive = new Set(after.active.map((n) => n.id));

    const losing = [...beforeActive].filter(
      (id) => !afterActive.has(id) && answers[id] && answers[id].value !== undefined
    );
    const gaining = [...afterActive].filter((id) => !beforeActive.has(id));

    return {
      invalidatedIds: losing,
      invalidatedCount: losing.length,
      newlyApplicableIds: gaining,
      newlyApplicableCount: gaining.length
    };
  }

  /**
   * Applicability + scoring profile for the whole assessment.
   * This is the artefact production must be able to reproduce.
   */
  applicabilityProfile(answers, auditHistory = []) {
    const { active, excluded, redirected } = this.resolvePath(answers);

    const rows = [];
    let denominator = 0;
    let numerator = 0;
    let unknownWeight = 0;

    for (const n of active) {
      const q = n.node;
      if (q.gateway_status === 'gateway') continue; // profile_only, never scored
      const answer = answers[n.id];
      const value = answer ? answer.value : undefined;
      const weight = q.scoring_weight || 0;

      let status;
      let inDenominator = true;
      let credit = 0;

      if (value === undefined) {
        status = 'unanswered';
        inDenominator = false; // incomplete, surfaced as a coverage gap rather than a score
      } else if (value === 'unknown') {
        status = SCORING_STATUS.UNKNOWN;
        credit = 0; // uncertainty earns no credit but stays in the denominator
        unknownWeight += weight;
      } else {
        status = maturityStatus(value);
        credit = (value / 5) * 100;
      }

      if (inDenominator) {
        denominator += weight;
        numerator += (credit / 100) * weight;
      }

      rows.push({
        question_id: n.id,
        replaces: n.replaces || null,
        domain: q.domain,
        gateway_status: q.gateway_status,
        scoring_status: q.gateway_status === 'oversight_variant' ? SCORING_STATUS.THIRD_PARTY_GOVERNANCE : status,
        response_status: status,
        scoring_weight: weight,
        in_denominator: inDenominator,
        excluded_from_denominator_rule: inDenominator ? 'none' : 'unanswered_incomplete',
        uncertainty: value === 'unknown'
      });
    }

    for (const e of excluded) {
      if (e.node.gateway_status === 'gateway') continue;
      rows.push({
        question_id: e.id,
        domain: e.node.domain,
        gateway_status: e.node.gateway_status,
        scoring_status: SCORING_STATUS.NOT_APPLICABLE,
        response_status: SCORING_STATUS.NOT_APPLICABLE,
        scoring_weight: e.node.scoring_weight || 0,
        in_denominator: false,
        excluded_from_denominator_rule: 'gateway_declared_absent',
        skip_reason_code: e.skip_reason_code,
        reason: e.reason,
        uncertainty: false
      });
    }

    for (const h of auditHistory.filter((h) => h.event === 'invalidated')) {
      rows.push({
        question_id: h.question_id,
        domain: (this.get(h.question_id) || {}).domain || null,
        scoring_status: SCORING_STATUS.INVALIDATED,
        response_status: SCORING_STATUS.INVALIDATED,
        in_denominator: false,
        excluded_from_denominator_rule: 'invalidated_by_upstream',
        skip_reason_code: 'upstream_answer_changed',
        retained_in_audit_history: true,
        uncertainty: false
      });
    }

    const answeredActive = rows.filter((r) => r.in_denominator).length;
    const scoredUniverse = active.filter((n) => n.node.gateway_status !== 'gateway').length;

    return {
      rows,
      redirected,
      denominator: round(denominator, 4),
      numerator: round(numerator, 4),
      provisionalScore: denominator > 0 ? round((numerator / denominator) * 100, 2) : null,
      unknownWeightShare: denominator > 0 ? round((unknownWeight / denominator) * 100, 2) : 0,
      coveragePct: scoredUniverse > 0 ? round((answeredActive / scoredUniverse) * 100, 2) : 0,
      applicableCount: scoredUniverse,
      excludedCount: excluded.filter((e) => e.node.gateway_status !== 'gateway').length,
      redirectedCount: redirected.length,
      invalidatedCount: auditHistory.filter((h) => h.event === 'invalidated').length
    };
  }
}

function round(value, dp) {
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

/** Human-readable "why are we asking this" string. */
export function whyAsking(graph, node, answers) {
  const q = node.node || node;
  if (q.gateway_status === 'oversight_variant') {
    return 'Because you told us this activity is handled by an external provider, we are asking how you oversee that provider rather than assuming the risk has gone away.';
  }
  const deps = [...conditionDependencies(q.applicability_condition)];
  if (deps.length === 0) return null;
  const stated = deps
    .map((gid) => {
      const g = graph.get(gid);
      const a = answers[gid];
      if (!g || !a || a.value === undefined) return null;
      const opt = (g.response_options || []).find((o) => o.value === a.value);
      return opt ? `you indicated "${opt.label.toLowerCase()}"` : null;
    })
    .filter(Boolean);
  if (stated.length === 0) return null;
  return `Because ${stated.join(' and ')}, this question applies to your organisation.`;
}
