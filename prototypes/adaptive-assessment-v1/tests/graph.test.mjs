/**
 * Prototype-only test suite for the adaptive assessment engine.
 * Pure Node, zero dependencies:  node --test prototypes/adaptive-assessment-v1/tests/
 *
 * Covers: six synthetic journeys, deterministic branching, reachability,
 * loop-freedom, skip reasons, downstream invalidation, dynamic progress,
 * time recalculation, scoring integrity, and the no-production-endpoint guarantee.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { AssessmentGraph, evaluateCondition, conditionDependencies, SCORING_STATUS } from '../src/engine.js';
import { JOURNEYS, J7_FULL_SCOPE, RESPONDERS, runJourney } from '../src/journeys.js';
import {
  buildAssessment, classifyResponse, FINDING_CLASS, RECOMMENDATION_CLASS, REPORT_STATUS
} from '../src/assessment-model.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const graphJson = JSON.parse(readFileSync(join(root, 'data', 'question-graph.json'), 'utf8'));

const newGraph = () => new AssessmentGraph(graphJson);

const conditionDeps = (node) => [...conditionDependencies(node)];

/** Run a journey to completion and build the full assessment result. */
function buildFor(journey, options = {}) {
  const graph = newGraph();
  const { answers, auditHistory } = runJourney(graph, journey);
  return buildAssessment(graph, answers, auditHistory, options);
}

/** Build an assessment from an explicit partial answer set (no auto-completion). */
function buildPartial(gateways, answerOverrides = {}) {
  const graph = newGraph();
  const answers = {};
  Object.entries(gateways).forEach(([k, v]) => { answers[k] = { value: v }; });
  let guard = 0;
  for (;;) {
    guard += 1;
    if (guard > 500) throw new Error('loop');
    const next = graph.nextUnanswered(answers);
    if (!next) break;
    if (next.node.gateway_status === 'gateway') { answers[next.id] = { value: 'unknown' }; continue; }
    if (Object.prototype.hasOwnProperty.call(answerOverrides, next.id)) {
      const v = answerOverrides[next.id];
      if (v === '__LEAVE_UNANSWERED__') break;
      answers[next.id] = { value: v };
    } else {
      answers[next.id] = { value: 3 };
    }
  }
  Object.entries(answerOverrides).forEach(([k, v]) => {
    if (v === '__LEAVE_UNANSWERED__') delete answers[k];
    else if (answers[k]) answers[k] = { value: v };
  });
  return { graph, answers, result: buildAssessment(graph, answers, []) };
}

/* ---------------------------------------------------------------- structure */

test('graph reproduces the approved MFRS-V1.0 methodology exactly', () => {
  assert.equal(graphJson.methodology_version, 'MFRS-V1.0');
  assert.equal(graphJson.questions.length, 68, 'must carry all 68 approved questions');
  assert.equal(graphJson.domains.length, 10);
  assert.equal(graphJson.response_scale.length, 6);

  const criticals = graphJson.questions.filter((q) => q.is_critical).length;
  const hardGates = graphJson.questions.filter((q) => q.is_hard_gate).length;
  assert.equal(criticals, 19, 'critical control count must match the seed');
  assert.equal(hardGates, 17, 'hard-gate control count must match the seed');

  const totalWeight = graphJson.domains.reduce((s, d) => s + d.weightPct, 0);
  assert.equal(Math.round(totalWeight), 100, 'domain weights must total 100%');
});

test('every prototype-authored node is explicitly labelled as a placeholder', () => {
  for (const g of graphJson.gateways) {
    assert.equal(g.methodology_version, 'PROTOTYPE_PLACEHOLDER', `${g.question_id} must be labelled`);
  }
  for (const v of graphJson.oversight_variants) {
    assert.equal(v.methodology_version, 'PROTOTYPE_PLACEHOLDER', `${v.question_id} must be labelled`);
  }
  // Approved methodology questions must NOT be relabelled.
  for (const q of graphJson.questions) {
    assert.notEqual(q.methodology_version, 'PROTOTYPE_PLACEHOLDER');
  }
});

test('every redirect target and condition dependency resolves', () => {
  const graph = newGraph();
  const ids = new Set([...graphJson.gateways, ...graphJson.questions, ...graphJson.oversight_variants].map((q) => q.question_id));
  for (const q of [...graphJson.questions, ...graphJson.oversight_variants]) {
    if (q.redirect_when) {
      assert.ok(ids.has(q.redirect_when.redirect_to), `${q.question_id} redirects to a missing node`);
    }
  }
  // Conditions may only reference gateway ids.
  const gatewayIds = new Set(graphJson.gateways.map((g) => g.question_id));
  const walk = (node, owner) => {
    if (!node) return;
    if (node.all) node.all.forEach((c) => walk(c, owner));
    if (node.any) node.any.forEach((c) => walk(c, owner));
    if (node.not) walk(node.not, owner);
    if (node.question_id) {
      assert.ok(gatewayIds.has(node.question_id), `${owner} depends on non-gateway ${node.question_id}`);
    }
  };
  for (const q of [...graphJson.questions, ...graphJson.oversight_variants, ...graphJson.gateways]) {
    walk(q.applicability_condition, q.question_id);
    if (q.redirect_when) walk(q.redirect_when.condition, q.question_id);
  }
  assert.ok(graph);
});

test('every skip_reason_code used is defined', () => {
  const defined = new Set(Object.keys(graphJson.skip_reason_codes));
  for (const q of graphJson.questions) {
    if (q.skip_reason_code) {
      assert.ok(defined.has(q.skip_reason_code), `undefined skip reason ${q.skip_reason_code} on ${q.question_id}`);
    }
  }
});

/* --------------------------------------------------------------- determinism */

test('branching is deterministic across repeated evaluations', () => {
  const graph = newGraph();
  for (const journey of JOURNEYS) {
    const a = runJourney(newGraph(), journey);
    const b = runJourney(newGraph(), journey);
    assert.deepEqual(Object.keys(a.answers).sort(), Object.keys(b.answers).sort(), `${journey.id} not deterministic`);

    const pathA = graph.resolvePath(a.answers).active.map((n) => n.id);
    const pathB = graph.resolvePath(b.answers).active.map((n) => n.id);
    assert.deepEqual(pathA, pathB, `${journey.id} path not stable`);
  }
});

test('condition grammar evaluates predictably', () => {
  const answers = { G03: { value: 'none' }, G08: { value: 'yes' } };
  assert.equal(evaluateCondition(null, answers), true);
  assert.equal(evaluateCondition({ question_id: 'G03', in: ['none'] }, answers), true);
  assert.equal(evaluateCondition({ question_id: 'G03', in: ['internal'] }, answers), false);
  assert.equal(evaluateCondition({ any: [{ question_id: 'G03', in: ['internal'] }, { question_id: 'G08', in: ['yes'] }] }, answers), true);
  assert.equal(evaluateCondition({ all: [{ question_id: 'G03', in: ['none'] }, { question_id: 'G08', in: ['yes'] }] }, answers), true);
  assert.equal(evaluateCondition({ not: { question_id: 'G03', in: ['none'] } }, answers), false);
  // Unanswered gateway must not silently satisfy a condition.
  assert.equal(evaluateCondition({ question_id: 'G99', in: ['yes'] }, answers), false);
});

/* ---------------------------------------------------------- journey coverage */

test('all six synthetic journeys terminate without loops', () => {
  for (const journey of JOURNEYS) {
    const graph = newGraph();
    const result = runJourney(graph, journey);
    assert.ok(result.iterations < 500, `${journey.id} hit the loop guard`);
    assert.equal(graph.nextUnanswered(result.answers), null, `${journey.id} left an unanswered active node`);
  }
});

test('no unreachable required question: every question is active in at least one journey', () => {
  const reached = new Set();
  for (const journey of JOURNEYS) {
    const graph = newGraph();
    const { answers } = runJourney(graph, journey);
    graph.resolvePath(answers).active.forEach((n) => {
      reached.add(n.id);
      if (n.replaces) reached.add(n.replaces);
    });
  }
  const unreached = graphJson.questions.map((q) => q.question_id).filter((id) => !reached.has(id));
  assert.deepEqual(unreached, [], `questions never reachable: ${unreached.join(', ')}`);
});

test('journeys shrink for simpler organisations but never to nothing', () => {
  const sizes = {};
  for (const journey of JOURNEYS) {
    const graph = newGraph();
    const { answers } = runJourney(graph, journey);
    const scored = graph.resolvePath(answers).active.filter((n) => n.node.gateway_status !== 'gateway');
    sizes[journey.id] = scored.length;
  }
  // J5 (micro, no suppliers, no digital) must be materially shorter than J2 (full retail).
  assert.ok(sizes.J5 < sizes.J2, `expected J5 (${sizes.J5}) < J2 (${sizes.J2})`);
  // But a floor of core governance questions must always survive.
  assert.ok(sizes.J5 >= 30, `J5 collapsed too far (${sizes.J5}); core coverage must survive`);
});

/* ------------------------------------------------------------ skip integrity */

test('skipping requires an explicit gateway statement of fact and carries a reason', () => {
  const graph = newGraph();
  const journey = JOURNEYS.find((j) => j.id === 'J5');
  const { answers } = runJourney(graph, journey);
  const { excluded } = graph.resolvePath(answers);

  assert.ok(excluded.length > 0, 'J5 should exclude some areas');
  for (const e of excluded) {
    assert.ok(e.skip_reason_code, `${e.id} excluded without a reason code`);
    assert.ok(e.reason && e.reason.length > 10, `${e.id} excluded without a human-readable reason`);
  }
});

test('"I do not know" never excludes a question', () => {
  const graph = newGraph();
  const journey = JOURNEYS.find((j) => j.id === 'J6');
  const { answers } = runJourney(graph, journey);
  const { active, excluded } = graph.resolvePath(answers);

  // Every gateway in J6 is "unknown"; nothing may be skipped as a result.
  assert.equal(excluded.filter((e) => e.node.gateway_status !== 'gateway').length, 0,
    'uncertainty must not shorten the assessment');

  const scored = active.filter((n) => n.node.gateway_status !== 'gateway');
  assert.equal(scored.length, 68 - 0, 'an all-unknown respondent must still face the full question set');
});

test('uncertainty is not treated as a control, and is retained in the denominator', () => {
  const graph = newGraph();
  const journey = JOURNEYS.find((j) => j.id === 'J6');
  const { answers } = runJourney(graph, journey);
  const profile = graph.applicabilityProfile(answers);

  const unknownRows = profile.rows.filter((r) => r.response_status === SCORING_STATUS.UNKNOWN);
  assert.ok(unknownRows.length > 0, 'J6 must produce unknown responses');
  for (const row of unknownRows) {
    assert.equal(row.in_denominator, true, `${row.question_id}: unknown must stay in the denominator`);
    assert.equal(row.uncertainty, true);
  }
  assert.ok(profile.unknownWeightShare > 40, 'J6 should flag a high uncertainty share');
  // A heavily-unknown respondent must not score well.
  assert.ok(profile.provisionalScore < 40, `unknown-heavy score too generous: ${profile.provisionalScore}`);
});

/* ------------------------------------------- mixed-score exclusion regression */

/*
 * These tests replace an earlier test that scored every control 0 and claimed this
 * proved "exclusion cannot improve the score". That test proved nothing: with a
 * uniform 0 the percentage is 0 either way, so it was insensitive to the very
 * effect it claimed to rule out.
 *
 * The honest contract is: exclusion creates no control credit and no control
 * penalty, but it CHANGES THE ASSESSED SCOPE, and the percentage can move as a
 * result. These tests assert that, and assert the safeguards around it.
 */

test('excluding a weak domain CHANGES the percentage score — the score is scope-specific', () => {
  const fullScope = buildFor(J7_FULL_SCOPE);
  const excludedScope = buildFor(JOURNEYS.find((j) => j.id === 'J7'));

  // The organisation is identical apart from declaring it has no suppliers.
  // D7 is its weakest domain, so removing it MOVES the percentage upward.
  assert.ok(excludedScope.fraudReadinessScore > fullScope.fraudReadinessScore,
    `expected exclusion to raise the percentage (full ${fullScope.fraudReadinessScore}, excluded ${excludedScope.fraudReadinessScore})`);

  // This is exactly why the score must never be presented as comparable.
  assert.ok(excludedScope.signals.some((s) => s.id === 'profile_specific_comparability_warning'),
    'a scope-specific result must raise the comparability warning');
});

test('exclusion creates no control credit and no control penalty', () => {
  const excludedScope = buildFor(JOURNEYS.find((j) => j.id === 'J7'));

  // No excluded control contributes weight to either side of the ratio.
  for (const c of excludedScope.excludedControls) {
    assert.equal(c.finding_class, FINDING_CLASS.NOT_APPLICABLE);
    assert.equal(c.control_absence_confirmed, false,
      `${c.question_id}: an absent ACTIVITY must never be recorded as an absent CONTROL`);
    assert.equal(c.recommendation_class, RECOMMENDATION_CLASS.NONE_SCOPE_EXCLUSION);
  }
  // The applicable denominator genuinely shrank.
  const fullScope = buildFor(J7_FULL_SCOPE);
  assert.ok(excludedScope.weights.applicable < fullScope.weights.applicable,
    'the applicable denominator must decrease when scope is excluded');
  assert.ok(excludedScope.weights.excluded > 0, 'excluded weight must be recorded, not discarded');
});

test('material exclusions are visible, counted and raise an integrity signal', () => {
  const excludedScope = buildFor(JOURNEYS.find((j) => j.id === 'J7'));

  assert.ok(excludedScope.counts.excluded >= 7, 'the whole third-party domain should be excluded');
  assert.ok(excludedScope.materialExclusionShare > 0);

  const ids = excludedScope.signals.map((s) => s.id);
  assert.ok(ids.includes('material_domain_exclusion') || ids.includes('material_exclusion_share'),
    `expected a material-exclusion signal, got: ${ids.join(', ')}`);
  assert.ok(ids.includes('high_impact_gateway_exclusion'),
    'excluding critical/hard-gate controls must raise a signal');

  // D7 must appear in the domain schedule as fully excluded, not silently vanish.
  const d7 = excludedScope.domains.find((d) => d.domainCode === 'D7');
  assert.equal(d7.fullyExcluded, true);
  assert.ok(d7.excludedCount > 0);
});

test('no excluded control silently disappears from the review profile', () => {
  for (const journey of JOURNEYS) {
    const result = buildFor(journey);
    const seen = new Set(result.controls.map((c) => c.replaces || c.question_id));
    const missing = graphJson.questions.map((q) => q.question_id).filter((id) => !seen.has(id));
    assert.deepEqual(missing, [], `${journey.id} lost: ${missing.join(', ')}`);
  }
});

test('a false factual declaration cannot be fully prevented — but it is recorded', () => {
  // This documents an accepted limit of self-assessment. An organisation that
  // falsely declares "no suppliers" gets a smaller scope. The prototype cannot
  // detect the lie; it CAN make the consequence inspectable.
  const excludedScope = buildFor(JOURNEYS.find((j) => j.id === 'J7'));
  const gatewayAnswer = excludedScope.controls.length > 0;
  assert.ok(gatewayAnswer);

  // The declaration that caused it is preserved and the affected controls are listed.
  const causedByG03 = excludedScope.excludedControls.filter((c) => c.skip_reason_code === 'gateway_no_third_parties');
  assert.ok(causedByG03.length > 0, 'the exclusions must be attributable to the gateway that caused them');
  for (const c of causedByG03) {
    assert.ok(c.skip_reason && c.skip_reason.length > 10, 'each exclusion carries a customer-facing reason');
  }
});

/* ------------------------------------------------------------- outsourcing */

test('outsourcing redirects to third-party governance rather than removing risk', () => {
  const graph = newGraph();
  const answers = { G03: { value: 'outsourced' }, G04: { value: 'outsourced' }, G07: { value: 'outsourced' },
    G08: { value: 'yes' }, G09: { value: 'yes' }, G02: { value: 'small' } };
  const { active, redirected } = graph.resolvePath(answers);
  const activeIds = new Set(active.map((n) => n.id));

  assert.ok(redirected.length >= 3, 'outsourced answers must trigger redirects');
  // Base questions gone, oversight variants present.
  assert.ok(!activeIds.has('D7-Q04'), 'base supplier-payment question should be replaced');
  assert.ok(activeIds.has('OV-D7-Q04'), 'oversight variant must be asked instead');
  assert.ok(activeIds.has('OV-D3-Q03'));
  assert.ok(activeIds.has('OV-G07'), 'outsourced payroll must add provider oversight');

  // The variants must still be scored, and must retain critical/hard-gate status.
  const ov = graph.get('OV-D7-Q04');
  assert.equal(ov.is_hard_gate, true, 'outsourcing must not downgrade a hard gate');
  assert.equal(ov.scoring_status, SCORING_STATUS.THIRD_PARTY_GOVERNANCE);
});

test('outsourced organisations are not scored more leniently than in-house ones', () => {
  const mk = (g03) => {
    const g = newGraph();
    const answers = { G01: { value: 'online' }, G02: { value: 'small' }, G03: { value: g03 },
      G04: { value: g03 === 'none' ? undefined : 'owner_led' }, G05: { value: 'none' }, G06: { value: 'no' },
      G07: { value: 'internal' }, G08: { value: 'yes' }, G09: { value: 'yes' }, G10: { value: 'no' },
      G11: { value: 'no' }, G12: { value: 'no' }, G13: { value: 'yes' }, G14: { value: 'owner_led' } };
    Object.keys(answers).forEach((k) => { if (answers[k].value === undefined) delete answers[k]; });
    let guard = 0;
    for (;;) {
      guard += 1; if (guard > 500) throw new Error('loop');
      const next = g.nextUnanswered(answers);
      if (!next) break;
      answers[next.id] = { value: next.node.gateway_status === 'gateway' ? 'unknown' : 0 };
    }
    return g.applicabilityProfile(answers);
  };
  const inhouse = mk('internal');
  const outsourced = mk('outsourced');
  assert.ok(outsourced.provisionalScore <= inhouse.provisionalScore + 0.01,
    'outsourcing must not yield a better score for the same control quality');
  assert.ok(outsourced.redirectedCount > 0);
});

/* ------------------------------------------------------------ invalidation */

test('changing a gateway invalidates downstream answers and reports the count', () => {
  const graph = newGraph();
  const journey = JOURNEYS.find((j) => j.id === 'J2');
  const { answers } = runJourney(graph, journey);

  const preview = graph.invalidationPreview(answers, 'G03', 'none');
  assert.ok(preview.invalidatedCount >= 4, `expected several invalidations, got ${preview.invalidatedCount}`);
  for (const id of preview.invalidatedIds) {
    assert.ok(answers[id] !== undefined, 'only previously-answered questions may be reported as invalidated');
  }
});

test('invalidated answers leave the active path but survive in audit history', () => {
  const graph = newGraph();
  const journey = JOURNEYS.find((j) => j.id === 'J2');
  const { answers } = runJourney(graph, journey);

  const preview = graph.invalidationPreview(answers, 'G03', 'none');
  const auditHistory = preview.invalidatedIds.map((id) => ({
    event: 'invalidated', question_id: id, previous_value: answers[id].value, cause: 'G03'
  }));

  const next = { ...answers, G03: { value: 'none' } };
  preview.invalidatedIds.forEach((id) => delete next[id]);

  const activeIds = new Set(graph.resolvePath(next).active.map((n) => n.id));
  for (const id of preview.invalidatedIds) {
    assert.ok(!activeIds.has(id), `${id} should have left the active path`);
  }

  const profile = graph.applicabilityProfile(next, auditHistory);
  assert.equal(profile.invalidatedCount, auditHistory.length);
  const invalidatedRows = profile.rows.filter((r) => r.scoring_status === SCORING_STATUS.INVALIDATED);
  assert.equal(invalidatedRows.length, auditHistory.length);
  for (const row of invalidatedRows) {
    assert.equal(row.in_denominator, false, 'invalidated answers must not score');
    assert.equal(row.retained_in_audit_history, true);
  }
});

test('re-selecting the original gateway value restores applicability', () => {
  const graph = newGraph();
  const journey = JOURNEYS.find((j) => j.id === 'J2');
  const { answers } = runJourney(graph, journey);
  const originalPath = graph.resolvePath(answers).active.map((n) => n.id);

  const changed = { ...answers, G03: { value: 'none' } };
  const restored = { ...changed, G03: { value: 'internal' } };
  const restoredPath = graph.resolvePath(restored).active.map((n) => n.id);
  assert.deepEqual(restoredPath, originalPath, 'restoring the gateway must restore the path shape');
});

/* --------------------------------------------------------- dynamic progress */

test('progress never presents a misleading fixed denominator', () => {
  const graph = newGraph();
  const journey = JOURNEYS.find((j) => j.id === 'J2');
  const { answers } = runJourney(graph, journey);

  const empty = graph.progress({});
  const partial = graph.progress({ G01: answers.G01, G02: answers.G02, G03: answers.G03 });
  const full = graph.progress(answers);

  assert.equal(full.overallPct, 100);
  assert.ok(empty.activeTotal !== partial.activeTotal || empty.minutesRemaining !== partial.minutesRemaining,
    'the active total or estimate must react to gateway answers');
  assert.ok(full.areasTotal > 1 && full.areasComplete === full.areasTotal);
});

test('estimated time recalculates as branches open and close', () => {
  const graph = newGraph();
  const wide = { G03: { value: 'internal' }, G04: { value: 'internal_department' }, G08: { value: 'yes' },
    G09: { value: 'yes' }, G10: { value: 'yes' }, G02: { value: 'large' }, G13: { value: 'yes' } };
  const narrow = { G03: { value: 'none' }, G08: { value: 'no' }, G09: { value: 'no' }, G10: { value: 'no' },
    G02: { value: 'micro' }, G13: { value: 'no' }, G05: { value: 'none' }, G06: { value: 'no' }, G12: { value: 'no' } };

  const wideEstimate = graph.progress(wide).minutesRemaining;
  const narrowEstimate = graph.progress(narrow).minutesRemaining;
  assert.ok(narrowEstimate < wideEstimate,
    `narrow profile should estimate less time (${narrowEstimate} vs ${wideEstimate})`);
  assert.ok(narrowEstimate >= 1, 'estimate must never reach zero while questions remain');
});

/* ------------------------------------------------------ applicability profile */

test('applicability profile separates every required state', () => {
  const graph = newGraph();
  // Hand-built state that exercises all states at once:
  //  - G03 none      -> supplier questions genuinely excluded (not_applicable)
  //  - G07 outsourced-> payroll oversight variant added (third-party governance)
  //  - mixed answers -> maturity states
  //  - audit history -> invalidated
  const answers = {
    G01: { value: 'professional_services' }, G02: { value: 'small' }, G03: { value: 'none' },
    G05: { value: 'none' }, G06: { value: 'no' }, G07: { value: 'outsourced' },
    G08: { value: 'no' }, G09: { value: 'yes' }, G10: { value: 'no' },
    G11: { value: 'no' }, G12: { value: 'no' }, G13: { value: 'no' }, G14: { value: 'owner_led' }
  };
  let guard = 0;
  for (;;) {
    guard += 1;
    if (guard > 500) throw new Error('loop');
    const next = graph.nextUnanswered(answers);
    if (!next) break;
    answers[next.id] = { value: next.node.gateway_status === 'gateway' ? 'unknown' : (guard % 6) };
  }
  const auditHistory = [{ event: 'invalidated', question_id: 'D3-Q05', previous_value: 2, cause: 'G10' }];
  const profile = graph.applicabilityProfile(answers, auditHistory);

  const statuses = new Set(profile.rows.map((r) => r.scoring_status));
  assert.ok(statuses.has(SCORING_STATUS.NOT_APPLICABLE), 'must express not applicable');
  assert.ok(statuses.has(SCORING_STATUS.THIRD_PARTY_GOVERNANCE), 'must express outsourced governance');
  assert.ok(statuses.has(SCORING_STATUS.INVALIDATED), 'must express upstream invalidation');
  assert.ok(
    statuses.has(SCORING_STATUS.NOT_IMPLEMENTED) ||
    statuses.has(SCORING_STATUS.PARTIALLY_IMPLEMENTED) ||
    statuses.has(SCORING_STATUS.IMPLEMENTED),
    'must express maturity states'
  );

  // Excluded and invalidated rows must never contribute to the denominator.
  for (const row of profile.rows) {
    if (row.scoring_status === SCORING_STATUS.NOT_APPLICABLE || row.scoring_status === SCORING_STATUS.INVALIDATED) {
      assert.equal(row.in_denominator, false);
    }
  }
});

test('every journey produces a complete, inspectable applicability profile', () => {
  for (const journey of JOURNEYS) {
    const graph = newGraph();
    const { answers } = runJourney(graph, journey);
    const profile = graph.applicabilityProfile(answers);
    assert.equal(profile.coveragePct, 100, `${journey.id} should be fully answered`);
    assert.ok(profile.denominator > 0, `${journey.id} produced an empty denominator`);
    assert.ok(profile.provisionalScore !== null);

    // Accounting identity: every one of the 68 approved questions must be accounted
    // for exactly once — either asked, replaced by an oversight variant, or excluded
    // with a reason. Nothing may silently vanish.
    const graph2 = newGraph();
    const { active, excluded, redirected } = graph2.resolvePath(answers);
    const accountedFor = new Set();
    active.filter((n) => n.node.gateway_status !== 'gateway')
      .forEach((n) => accountedFor.add(n.replaces || n.id));
    excluded.filter((e) => e.node.gateway_status !== 'gateway')
      .forEach((e) => accountedFor.add(e.id));
    redirected.forEach((r) => accountedFor.add(r.from));

    const missing = graphJson.questions
      .map((q) => q.question_id)
      .filter((id) => !accountedFor.has(id));
    assert.deepEqual(missing, [], `${journey.id} lost track of: ${missing.join(', ')}`);
  }
});

/* -------------------------------------------------------------- safety rails */

test('prototype contains no production endpoints, credentials or customer data', () => {
  const forbidden = [
    /supabase\.co/i,
    /https?:\/\/(?!localhost|127\.0\.0\.1)[a-z0-9.-]*mkfraud/i,
    /\/score\/api\//,
    /SUPABASE_[A-Z_]*KEY/,
    /service_role/i,
    /sk_live/i,
    /Bearer\s+[A-Za-z0-9._-]{20,}/
  ];
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'screenshots') continue;
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      // This file is skipped because it necessarily contains the forbidden
      // patterns themselves as literals; scanning it would always self-match.
      else if (/\.(js|mjs|json|html|css|md)$/.test(entry) && entry !== 'graph.test.mjs') files.push(p);
    }
  };
  walk(root);
  assert.ok(files.length > 0);

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const pattern of forbidden) {
      assert.equal(pattern.test(content), false, `${file} matches forbidden pattern ${pattern}`);
    }
  }
});

test('no runtime AI branching: the engine performs no network calls', () => {
  const engineSource = readFileSync(join(root, 'src', 'engine.js'), 'utf8');
  for (const pattern of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /import\s*\(/, /eval\s*\(/, /new\s+Function/]) {
    assert.equal(pattern.test(engineSource), false, `engine must not use ${pattern}`);
  }
});

/* ------------------------------------- recommendation-generation contract */

test('1. not applicable creates no control-improvement recommendation', () => {
  const result = buildFor(JOURNEYS.find((j) => j.id === 'J5'));
  const excludedIds = new Set(result.excludedControls.map((c) => c.question_id));
  assert.ok(excludedIds.size > 0);
  for (const rec of result.recommendations) {
    assert.ok(!excludedIds.has(rec.question_id),
      `${rec.question_id} is excluded but produced a recommendation: ${rec.recommendation_class}`);
  }
});

test('2. unknown creates a verification recommendation, never an implementation one', () => {
  const result = buildFor(JOURNEYS.find((j) => j.id === 'J6'));
  const unknowns = result.controls.filter((c) => c.finding_class === FINDING_CLASS.UNKNOWN_OR_UNCONFIRMED);
  assert.ok(unknowns.length > 0);

  for (const c of unknowns) {
    assert.equal(c.recommendation_class, RECOMMENDATION_CLASS.EVIDENCE_VERIFICATION);
    assert.equal(c.control_absence_confirmed, false, 'uncertainty must never confirm absence');
    assert.equal(c.evidence_required, true);
    assert.equal(c.control_visibility_status, 'not_visible');
  }
  const unknownRecs = result.recommendations.filter((r) => unknowns.some((u) => u.question_id === r.question_id));
  for (const rec of unknownRecs) {
    assert.match(rec.body, /could not confirm|obtain evidence/i);
    assert.doesNotMatch(rec.body, /Design and implement/i,
      'an unknown answer must not produce an implementation recommendation');
  }
});

test('3. unanswered creates no substantive fraud-control recommendation', () => {
  const { result } = buildPartial(
    { G01: 'retail', G02: 'small', G03: 'internal', G08: 'yes', G09: 'yes' },
    { 'D1-Q01': '__LEAVE_UNANSWERED__' }
  );
  const unanswered = result.controls.filter((c) => c.finding_class === FINDING_CLASS.UNANSWERED);
  assert.ok(unanswered.length > 0, 'fixture should leave controls unanswered');

  for (const c of unanswered) {
    assert.equal(c.recommendation_class, RECOMMENDATION_CLASS.COMPLETION_REQUIRED);
    assert.equal(c.control_absence_confirmed, false, 'silence must never become a finding');
  }
  const recs = result.recommendations.filter((r) => unanswered.some((u) => u.question_id === r.question_id));
  for (const rec of recs) {
    assert.match(rec.body, /was not answered|Complete it/i);
    assert.doesNotMatch(rec.body, /Design and implement|Strengthen its design/i);
  }
});

test('4. not implemented creates a control-design recommendation', () => {
  const { result } = buildPartial(
    { G01: 'retail', G02: 'small', G03: 'internal', G08: 'yes', G09: 'yes' },
    { 'D1-Q01': 0 }
  );
  const c = result.controls.find((x) => x.question_id === 'D1-Q01');
  assert.equal(c.finding_class, FINDING_CLASS.NOT_IMPLEMENTED);
  assert.equal(c.recommendation_class, RECOMMENDATION_CLASS.CONTROL_DESIGN);
  assert.equal(c.control_absence_confirmed, true, 'a substantive 0 DOES confirm absence');

  const rec = result.recommendations.find((r) => r.question_id === 'D1-Q01');
  assert.match(rec.body, /Design and implement/i);
});

test('5. partially implemented creates a strengthening recommendation', () => {
  const { result } = buildPartial(
    { G01: 'retail', G02: 'small', G03: 'internal', G08: 'yes', G09: 'yes' },
    { 'D1-Q02': 2 }
  );
  const c = result.controls.find((x) => x.question_id === 'D1-Q02');
  assert.equal(c.finding_class, FINDING_CLASS.PARTIALLY_IMPLEMENTED);
  assert.equal(c.recommendation_class, RECOMMENDATION_CLASS.CONTROL_STRENGTHENING);
  assert.equal(c.control_absence_confirmed, false);

  const rec = result.recommendations.find((r) => r.question_id === 'D1-Q02');
  assert.match(rec.body, /Strengthen/i);
});

test('6. outsourced routes to oversight recommendations, not in-house ones', () => {
  const { result } = buildPartial(
    { G01: 'online', G02: 'small', G03: 'outsourced', G08: 'yes', G09: 'yes' },
    { 'OV-D7-Q04': 1 }
  );
  const ov = result.controls.find((c) => c.question_id === 'OV-D7-Q04');
  assert.ok(ov, 'the oversight variant must be assessed');
  assert.equal(ov.recommendation_class, RECOMMENDATION_CLASS.PROVIDER_GOVERNANCE);

  const rec = result.recommendations.find((r) => r.question_id === 'OV-D7-Q04');
  assert.match(rec.body, /external provider/i);

  // The in-house question it replaced must not appear as an active control.
  assert.ok(!result.controls.some((c) => c.question_id === 'D7-Q04' && c.value !== undefined));
});

test('7. excessive uncertainty prevents a definitive conclusion', () => {
  const result = buildFor(JOURNEYS.find((j) => j.id === 'J8'));
  assert.ok(result.controlVisibility < 60,
    `J8 visibility should be low, got ${result.controlVisibility}`);
  assert.equal(result.reportStatus, REPORT_STATUS.INSUFFICIENT_VISIBILITY);
  assert.ok(result.signals.some((s) => s.id === 'insufficient_visibility' && s.blocking));
  assert.ok(result.reportLimitationReasons.length > 0);

  // Crucially: no false "control absent" findings anywhere.
  const falseAbsence = result.controls.filter(
    (c) => c.finding_class === FINDING_CLASS.UNKNOWN_OR_UNCONFIRMED && c.control_absence_confirmed);
  assert.deepEqual(falseAbsence, []);
});

test('8. low coverage prevents definitive report issuance', () => {
  const graph = newGraph();
  const answers = {};
  ['G01', 'G02', 'G03', 'G08', 'G09'].forEach((g) => { answers[g] = { value: 'unknown' }; });
  // Answer only a handful of controls; leave the rest blank.
  let count = 0;
  for (const node of graph.resolvePath(answers).active) {
    if (node.node.gateway_status === 'gateway') continue;
    if (count >= 5) break;
    answers[node.id] = { value: 4 };
    count += 1;
  }
  const result = buildAssessment(graph, answers, []);
  assert.ok(result.assessmentCoverage < 80, `coverage should be low, got ${result.assessmentCoverage}`);
  assert.equal(result.reportStatus, REPORT_STATUS.INSUFFICIENT_VISIBILITY);
  assert.ok(result.signals.some((s) => s.id === 'low_assessment_coverage'));
});

test('9. material exclusions trigger a comparability statement', () => {
  const result = buildFor(JOURNEYS.find((j) => j.id === 'J7'));
  assert.ok(result.signals.some((s) => s.id === 'profile_specific_comparability_warning'));
  assert.match(result.comparabilityStatement, /should not be compared directly/i);
});

test('10. every finding class maps to exactly one recommendation class', () => {
  const node = graphJson.questions[0];
  const cases = [
    [{ node, value: undefined, isExcluded: true }, FINDING_CLASS.NOT_APPLICABLE, RECOMMENDATION_CLASS.NONE_SCOPE_EXCLUSION],
    [{ node, value: undefined }, FINDING_CLASS.UNANSWERED, RECOMMENDATION_CLASS.COMPLETION_REQUIRED],
    [{ node, value: 'unknown' }, FINDING_CLASS.UNKNOWN_OR_UNCONFIRMED, RECOMMENDATION_CLASS.EVIDENCE_VERIFICATION],
    [{ node, value: 0 }, FINDING_CLASS.NOT_IMPLEMENTED, RECOMMENDATION_CLASS.CONTROL_DESIGN],
    [{ node, value: 2 }, FINDING_CLASS.PARTIALLY_IMPLEMENTED, RECOMMENDATION_CLASS.CONTROL_STRENGTHENING],
    [{ node, value: 5 }, FINDING_CLASS.IMPLEMENTED, RECOMMENDATION_CLASS.NONE_MAINTAIN],
    [{ node, value: 0, isRedirected: true }, FINDING_CLASS.NOT_IMPLEMENTED, RECOMMENDATION_CLASS.PROVIDER_GOVERNANCE],
    [{ node, value: undefined, isInvalidated: true }, FINDING_CLASS.INVALIDATED, RECOMMENDATION_CLASS.NONE_SCOPE_EXCLUSION]
  ];
  for (const [input, findingClass, recClass] of cases) {
    const out = classifyResponse(input);
    assert.equal(out.finding_class, findingClass, JSON.stringify(input));
    assert.equal(out.recommendation_class, recClass, JSON.stringify(input));
  }
});

/* ------------------------------------------------- measures and statuses */

test('three measures are distinct and behave correctly', () => {
  const result = buildFor(JOURNEYS.find((j) => j.id === 'J6'));
  // J6 answers everything "I do not know": full coverage, near-zero visibility.
  assert.equal(result.assessmentCoverage, 100, 'an unknown IS a valid response for coverage');
  assert.ok(result.controlVisibility < 40, 'but it does NOT count towards visibility');
  assert.notEqual(result.assessmentCoverage, result.controlVisibility);
});

test('both score models are computed and Option B is the more generous of the two', () => {
  const result = buildFor(JOURNEYS.find((j) => j.id === 'J8'));
  assert.ok(result.scoreOptionA !== null && result.scoreOptionB !== null);
  // Option A retains unknown at zero credit; Option B removes it entirely.
  assert.ok(result.scoreOptionB >= result.scoreOptionA,
    `Option B (${result.scoreOptionB}) should be >= Option A (${result.scoreOptionA})`);
  // Which is precisely why Option B needs the visibility gate to be safe.
  assert.equal(result.reportStatus, REPORT_STATUS.INSUFFICIENT_VISIBILITY);
});

test('progressive profiling asks at most five questions before the assessment begins', () => {
  const profileGateways = graphJson.gateways.filter((g) => g.phase === 'profile');
  assert.ok(profileGateways.length <= 5, `${profileGateways.length} profile gateways, maximum is 5`);
  for (const g of graphJson.gateways) {
    assert.ok(g.phase, `${g.question_id} has no phase`);
    assert.match(g.phase, /^(profile|domain:D\d{1,2})$/);
  }
});

test('every gateway is asked before the first question that depends on it', () => {
  const graph = newGraph();
  // Use a fully-answering state so the whole path is realised.
  const { answers } = runJourney(newGraph(), JOURNEYS.find((j) => j.id === 'J2'));
  const order = graph.resolvePath(answers).active.map((n) => n.id);
  const position = new Map(order.map((id, i) => [id, i]));

  for (const q of [...graphJson.questions, ...graphJson.oversight_variants]) {
    const qPos = position.get(q.question_id);
    if (qPos === undefined) continue;
    for (const gid of conditionDeps(q.applicability_condition)) {
      const gPos = position.get(gid);
      assert.ok(gPos !== undefined && gPos < qPos,
        `${gid} must be asked before ${q.question_id} (gateway ${gPos}, question ${qPos})`);
    }
  }
});

test('progressive ordering yields the SAME applicability profile as gateways-first', () => {
  // Simulate the previous ordering by answering every gateway up front, then
  // compare the resolved applicability profile with the progressive walk.
  for (const journey of JOURNEYS) {
    const progressive = buildFor(journey);

    const graph = newGraph();
    const upfront = {};
    Object.entries(journey.gateways).forEach(([k, v]) => { upfront[k] = { value: v }; });

    // Legacy ordering: answer every APPLICABLE gateway before any methodology
    // question. Gateways that are themselves excluded (for example G04 when the
    // organisation has no suppliers) must stay unanswered — force-answering them
    // would fabricate an applicability state the respondent never declared.
    for (;;) {
      const pending = graph.resolvePath(upfront).active
        .find((n) => n.node.gateway_status === 'gateway' && upfront[n.id] === undefined);
      if (!pending) break;
      upfront[pending.id] = { value: 'unknown' };
    }

    let guard = 0;
    for (;;) {
      guard += 1;
      if (guard > 500) throw new Error('loop');
      const next = graph.nextUnanswered(upfront);
      if (!next) break;
      upfront[next.id] = { value: RESPONDERS[journey.responder](next.id) };
    }
    const legacy = buildAssessment(graph, upfront, []);

    assert.deepEqual(
      progressive.excludedControls.map((c) => c.question_id).sort(),
      legacy.excludedControls.map((c) => c.question_id).sort(),
      `${journey.id}: exclusion set differs between orderings`
    );
    assert.deepEqual(
      progressive.redirected.map((r) => `${r.from}->${r.to}`).sort(),
      legacy.redirected.map((r) => `${r.from}->${r.to}`).sort(),
      `${journey.id}: redirect set differs between orderings`
    );
    assert.equal(progressive.weights.applicable, legacy.weights.applicable,
      `${journey.id}: applicable weight differs between orderings`);
  }
});

test('graph JSON is the single source of branching truth', () => {
  const engineSource = readFileSync(join(root, 'src', 'engine.js'), 'utf8');
  // No hard-coded question ids in the engine: all logic is data-driven.
  const hardcoded = engineSource.match(/["'](?:D\d{1,2}-Q\d{2}|G\d{2})["']/g) || [];
  assert.deepEqual(hardcoded, [], `engine hard-codes question ids: ${hardcoded.join(', ')}`);
});
