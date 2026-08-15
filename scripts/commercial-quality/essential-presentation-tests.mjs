#!/usr/bin/env node
/**
 * Essential presentation regression tests.
 *
 * Several of these reproduce defects that shipped in the previous owner
 * candidate and passed every gate at the time. They must fail now.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildEssentialPresentationModel } from '../../src/lib/reports/essential/presentation-model.ts';
import { validateEssentialPresentation, sustainmentClaims } from '../../src/lib/reports/essential/presentation-validation.ts';
import { evidenceSupport, positionAssertion, FOUNDATION_SCORE_FLOOR } from '../../src/lib/reports/essential/evidence-support.ts';
import { getMaturityBand } from '../../src/lib/scoring/maturity-band.ts';
import { bandFor } from '../../src/lib/reports/essential/presentation-model.ts';
import { bandForScore } from '../../src/lib/reports/select-content-blocks.ts';
import {
  exposureClusters,
  clusterForScenario,
  clusterForSemanticFamily
} from '../../src/lib/reports/essential/content-families.ts';

const source = process.env.ESSENTIAL_SOURCE_DIR
  ?? '/Users/tondani/Documents/Codex/outputs/report-engine-end-to-end-certification/rivonia-essential';
const factPack = JSON.parse(fs.readFileSync(`${source}/01-fact-pack.json`, 'utf8'));
const thesis = JSON.parse(fs.readFileSync(`${source}/03-report-thesis.json`, 'utf8'));

const blueprint = JSON.parse(fs.readFileSync(`${source}/02-report-blueprint.json`, 'utf8'));
const clusters = exposureClusters(blueprint);
const model = buildEssentialPresentationModel({ factPack, thesis, blueprint, commentary: {} });
const validation = validateEssentialPresentation(model);
const checks = [];
const ok = (label) => checks.push(label);

// 1. Every diagnostic row explains something, on more than one signal.
assert.ok(model.diagnosis.rows.length >= 3, 'at least three diagnostic patterns resolve');
for (const row of model.diagnosis.rows) {
  assert.ok(row.pattern, 'diagnostic row has a pattern');
  assert.ok(row.signals.length >= 2, `pattern "${row.pattern}" is supported by at least two signals`);
  assert.ok(row.whyItMatters.length > 30, `pattern "${row.pattern}" explains why it matters`);
}
ok('every diagnostic row has a pattern, multiple signals and an explanation');

// 2-4. Exposure identity comes from the deterministic cluster, never from label
// text or array position.
const exposureFamilies = model.exposures.rows.map((r) => r.family);
assert.equal(new Set(exposureFamilies).size, exposureFamilies.length, 'no two exposures claim the same cluster');
assert.ok(exposureFamilies.every(Boolean), 'every exposure resolves to a cluster');
assert.ok(exposureFamilies.every((f) => clusters.some((c) => c.clusterId === f)), 'every exposure identity is a real blueprint cluster');
// Renaming a customer label must not alter analytical identity.
const renamed = exposureClusters({ findingClusters: blueprint.findingClusters.map((c) => ({ ...c, title: 'A completely different customer heading' })) });
assert.deepEqual(renamed.map((c) => c.clusterId), clusters.map((c) => c.clusterId), 'renaming a label leaves identity unchanged');
// A cluster without families cannot own content.
assert.equal(exposureClusters({ findingClusters: [{ clusterId: 'X', title: 'x', semanticFamilies: [] }] }).length, 0, 'a cluster with no families is dropped');
// Scenarios reach their exposure through shared semantic family.
for (const scenario of factPack.scenarios) {
  const owner = clusterForScenario(clusters, scenario.scenarioFamily);
  if (owner) assert.ok(clusters.some((c) => c.clusterId === owner.clusterId), 'scenario resolves to a real cluster');
}
ok('exposure identity is the deterministic cluster, not a label or a position');

// Ranking is evidenced by the weakest supporting signal, not asserted by order.
const weakestPerRow = model.exposures.rows.map((r) => Math.min(...r.assessmentBasis.map((b) => b.score)));
assert.deepEqual(weakestPerRow, [...weakestPerRow].sort((a, b) => a - b), 'exposures are ranked by weakest supporting signal');
for (const row of model.exposures.rows) {
  assert.match(row.priority, /^Priority \d+$/, `exposure ${row.rank} uses an ordinal priority, not a band`);
  assert.ok(/scores \d/.test(row.priorityBasis), `exposure ${row.rank} explains its priority from a signal`);
  assert.ok(row.potentialConsequence.length > 25, `exposure ${row.rank} states a potential consequence`);
}
ok('prioritisation is ordinal and evidenced');

// Scenario narrative must describe the same mechanic as its nodes.
const contaminated = JSON.parse(JSON.stringify(model));
contaminated.scenarios.scenarios[0].howItUnfolds = 'An actor splits, disguises or times activity so that it remains below available thresholds.';
assert.ok(validateEssentialPresentation(contaminated).issues.some((i) => i.code === 'SCENARIO_MECHANIC_CONTAMINATION'),
  'a supplier scenario explained with detection-evasion mechanics is rejected');
ok('scenario mechanic contamination is blocked');

// Baselines are the assessed condition, not one repeated phrase.
const baselines = model.dashboard.rows.map((r) => r.current);
assert.ok(new Set(baselines).size > 1, `dashboard baselines are differentiated (${new Set(baselines).size} distinct)`);
assert.ok(!baselines.every((b) => b === 'Not consistently established'), 'baselines are not a uniform placeholder');
ok('management baselines use the assessed condition');

// Roadmap actions carry a deliverable and a completion test.
for (const stage of model.roadmap.stages) {
  for (const action of stage.actions) {
    assert.ok(action.owner, 'every action has an owner');
    assert.ok(action.deliverable.length > 20, 'every action has a deliverable');
    assert.ok(action.completionTest.length > 10, 'every action has a completion test');
  }
}
ok('roadmap actions carry owner, deliverable and completion test');

// 9. Scenario bleed fixture must fail.
const bled = JSON.parse(JSON.stringify(model));
bled.scenarios.scenarios[1].family = bled.scenarios.scenarios[0].family;
assert.ok(validateEssentialPresentation(bled).issues.some((i) => i.code === 'SCENARIO_FAMILY_OWNERSHIP'),
  'two scenarios claiming one family is rejected');
ok('scenario bleed fixture fails');

// 10-11. No clipped specification, no ellipsis.
for (const s of model.scenarios.scenarios) {
  for (const [field, value] of Object.entries({ entry: s.entryPointShort, brk: s.controlBreakShort, exp: s.exposureShort })) {
    assert.ok(value.length <= 90, `scenario ${field} node is a label, not a specification`);
    assert.ok(!/…|\.\.\./.test(value), `scenario ${field} node is not truncated`);
  }
}
const ellipsis = JSON.parse(JSON.stringify(model));
ellipsis.priorities.rows[0].outcome = 'Procurement performs a pre-activation checklist across every proposed supplier…';
assert.ok(validateEssentialPresentation(ellipsis).issues.some((i) => i.code === 'NO_CUSTOMER_TRUNCATION_ELLIPSIS'),
  'a truncation ellipsis in customer content is rejected');
ok('no clipped control specifications and no truncation ellipsis');

// 12-13. Target state, not evidence artefact.
for (const row of model.priorities.rows) {
  assert.ok(!/\bRACI\b|\bchecklist\b|coverage report|screening/i.test(row.betterLooksLike),
    `priority ${row.rank} states a target state rather than an artefact`);
  assert.ok(row.betterLooksLike.length > 40, `priority ${row.rank} target state is substantive`);
}
assert.ok(model.priorities.rows.some((r) => r.evidenceArtefact), 'the proving artefact is retained for the supporting register');
const artefactModel = JSON.parse(JSON.stringify(model));
artefactModel.priorities.rows[0].betterLooksLike = 'Approved fraud-risk RACI';
assert.ok(validateEssentialPresentation(artefactModel).issues.some((i) => i.code === 'TARGET_STATE_NOT_EVIDENCE'),
  'an evidence artefact presented as a target state is rejected');
ok('target state and evidence artefact are separated');

// 14-15. Roadmap staging.
const stages = model.roadmap.stages;
assert.ok(stages.length === 3, 'three roadmap stages render');
assert.ok(stages[0].actions.length >= 2, `30-day stage carries real stabilisation content (${stages[0].actions.length} actions)`);
const allActions = stages.flatMap((s) => s.actions.map((a) => a.action));
assert.equal(new Set(allActions).size, allActions.length, 'no action appears in more than one stage');
// A material incident/evidence exposure with no first-window action gets an
// interim route, rather than waiting for the fuller design.
const hasIncidentExposure = model.exposures.rows.some((r) => r.family === 'INCIDENT_CONTAINMENT_LEARNING');
if (hasIncidentExposure) {
  const firstStage = stages[0].actions.map((a) => `${a.action} ${a.deliverable}`).join(' ').toLowerCase();
  assert.ok(/intake|preserv|evidence|incident/.test(firstStage),
    'stabilisation includes an interim incident and evidence route where that exposure is material');
}
ok('roadmap stages are distinct, 30 days stabilises, and incident intake is staged where material');

// 15b. Roadmap completeness is proved here, against the exhibit the customer
// reads, because this is the layer that builds it. The manuscript layer no
// longer polices day markers in prose it does not turn into the roadmap.
assert.ok(!validation.issues.some((i) => i.code === 'ROADMAP_SEQUENCE_COMPLETENESS'),
  `a complete roadmap passes sequence validation: ${JSON.stringify(validation.issues)}`);

const missingStage = JSON.parse(JSON.stringify(model));
missingStage.roadmap.stages = missingStage.roadmap.stages.filter((s) => !/^60\b/.test(s.stage));
assert.ok(validateEssentialPresentation(missingStage).issues.some((i) => i.code === 'ROADMAP_SEQUENCE_COMPLETENESS'),
  'a roadmap missing the 60-day stage is rejected');

const outOfOrder = JSON.parse(JSON.stringify(model));
outOfOrder.roadmap.stages = [outOfOrder.roadmap.stages[2], outOfOrder.roadmap.stages[1], outOfOrder.roadmap.stages[0]];
assert.ok(validateEssentialPresentation(outOfOrder).issues.some((i) => i.code === 'ROADMAP_SEQUENCE_COMPLETENESS'),
  'a roadmap whose stages run backwards is rejected');

const duplicatedAction = JSON.parse(JSON.stringify(model));
duplicatedAction.roadmap.stages[1].actions.push(JSON.parse(JSON.stringify(duplicatedAction.roadmap.stages[0].actions[0])));
assert.ok(validateEssentialPresentation(duplicatedAction).issues.some((i) => i.code === 'ROADMAP_SEQUENCE_COMPLETENESS'),
  'the same action sequenced in two windows is rejected');

for (const field of ['action', 'owner', 'deliverable', 'completionTest']) {
  const incomplete = JSON.parse(JSON.stringify(model));
  incomplete.roadmap.stages[0].actions[0][field] = '';
  assert.ok(validateEssentialPresentation(incomplete).issues.some((i) => i.code === 'ROADMAP_STAGE_COMPLETENESS'),
    `a roadmap action with no ${field} is rejected`);
}
ok('roadmap completeness, sequencing and per-action fields are validated in the presentation model');

// 15c. Sustainment prose: a supported observation is not a manufactured weakness.
//
// The live portfolio rejected a high-readiness report for the sentence "no
// critical gap identified in this domain" — a statement that the organisation is
// sound. A keyword scan cannot tell a denial, a conditional or a comparison from
// an assertion, so the classifier reads what the sentence does with the term.
const SUSTAINMENT_ALLOWED = [
  ['a strength with a denied gap', 'Fraud Leadership and Governance is a relative strength in the assessed profile. The assessed domain position is 100 out of 100, with full assessed coverage and no critical gap identified in this domain.'],
  ['an explicit denial', 'No material weakness was identified in the assessed profile.'],
  ['a deterioration risk', 'If the review rhythm lapses, detection coverage could deteriorate and become inadequate within a single cycle.'],
  ['a relative limitation', 'Fraud awareness is less mature than governance and is the weakest of the assessed capabilities.'],
  ['a supported watchpoint', 'This strength depends on continued senior ownership; management should monitor it as an early warning of drift.']
];
const SUSTAINMENT_REJECTED = [
  ['a present inadequacy', 'Fraud detection is currently inadequate and leaves the organisation exposed.'],
  ['an absence of oversight', 'There is no effective oversight of supplier payment changes.'],
  ['a material weakness', 'This is a material weakness in the control environment.'],
  ['a critical gap', 'The organisation faces a critical gap in fraud governance.'],
  ['a control failure', 'A control failure in evidence handling has been identified.'],
  ['a control that fails to operate', 'Monitoring fails to detect unusual supplier activity.'],
  ['a crisis claim', 'The position is severe and demands immediate attention.']
];
for (const [label, text] of SUSTAINMENT_ALLOWED) {
  assert.ok(!sustainmentClaims(text).some((c) => c.classification === 'MATERIAL_WEAKNESS_CLAIM'),
    `${label} is not a manufactured weakness: ${JSON.stringify(sustainmentClaims(text))}`);
}
for (const [label, text] of SUSTAINMENT_REJECTED) {
  assert.ok(sustainmentClaims(text).some((c) => c.classification === 'MATERIAL_WEAKNESS_CLAIM'),
    `${label} is rejected as a manufactured weakness: ${JSON.stringify(sustainmentClaims(text))}`);
}
// End to end through the validator, on a sustainment model.
const sustainmentModel = JSON.parse(JSON.stringify(model));
sustainmentModel.narrativeMode = 'SUSTAINMENT';
sustainmentModel.exposures = undefined;
sustainmentModel.scenarios = undefined;
sustainmentModel.diagnosis.interpretation = SUSTAINMENT_ALLOWED[0][1];
assert.ok(!validateEssentialPresentation(sustainmentModel).issues.some((i) => i.code === 'NO_MANUFACTURED_WEAKNESS'),
  'a sustainment report stating a strength with no critical gap passes');
sustainmentModel.diagnosis.interpretation = SUSTAINMENT_REJECTED[0][1];
assert.ok(validateEssentialPresentation(sustainmentModel).issues.some((i) => i.code === 'NO_MANUFACTURED_WEAKNESS'),
  'a sustainment report asserting a present inadequacy is rejected');
ok('sustainment watchpoints and deterioration risks are separated from manufactured weakness');

// 15d. Internal-language validation is sense-aware.
//
// CASE-10 was rejected for "capable of prompt response as the business changes"
// — prompt the adjective. A flat token list cannot tell a leak from ordinary
// advisory English, so context-dependent words are matched by construction.
const LANGUAGE_ALLOWED = [
  'The organisation is capable of prompt response as the business changes.',
  'Prompt escalation of suspected matters is the management expectation.',
  'A prompt investigation limits how far value can move.',
  'The production facility operates three shifts with segregated approval.',
  'Deployment of additional review capacity is the accountable manager\u2019s decision.',
  'The review is bounded by the responses given.',
  'AI-enabled invoice fraud is an emerging pathway for this sector.',
  'A time slot is reserved each month for the control review.'
];
const LANGUAGE_REJECTED = [
  'The system prompt instructs the writer to summarise.',
  'The prompt template was updated for this section.',
  'Narrative slot SLOT-06 covers incident response.',
  'This report was checked against the production environment.',
  'The bounded generation engine produced this section.',
  'AI generation completed without a repair attempt.',
  'The deterministic fact pack supplied every claim reference.'
];
for (const text of LANGUAGE_ALLOWED) {
  const probe = JSON.parse(JSON.stringify(model));
  probe.diagnosis.interpretation = text;
  assert.ok(!validateEssentialPresentation(probe).issues.some((i) => i.code === 'NO_INTERNAL_LANGUAGE'),
    `ordinary advisory English is not engineering language: "${text}"`);
}
for (const text of LANGUAGE_REJECTED) {
  const probe = JSON.parse(JSON.stringify(model));
  probe.diagnosis.interpretation = text;
  assert.ok(validateEssentialPresentation(probe).issues.some((i) => i.code === 'NO_INTERNAL_LANGUAGE'),
    `engineering language is rejected: "${text}"`);
}
ok('internal-language validation distinguishes engineering sense from advisory English');

// 15e. Positive capability language is conditioned on evidence.
//
// CASE-01 scored 0.00 on all ten domains and the report still claimed the
// assessment showed foundations in three named capabilities.
const domainsOf = (scores) => scores.map((score, index) => ({ factRef: `DOMAIN-D${index + 1}`, code: `D${index + 1}`, name: `Domain ${index + 1}`, score }));

const allZero = evidenceSupport(domainsOf([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
assert.equal(allZero.supported.FOUNDATION, false, 'an all-zero profile supports no foundation claim');
assert.equal(allZero.supported.NOT_STARTING_FROM_ZERO, false, 'an all-zero profile is a zero-base condition');
assert.equal(allZero.supported.RELATIVE_STRENGTH, false, 'an all-zero profile has no relative strength');
assert.match(positionAssertion(domainsOf([0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).takeaway, /does not yet show an established capability/i);
assert.ok(!/not a zero-base|foundation/i.test(positionAssertion(domainsOf(Array(10).fill(0))).takeaway),
  'the all-zero takeaway never claims a foundation');

// Rivonia: low overall, but reporting culture at 73.57 is a genuine foundation.
const rivoniaProfile = domainsOf([42, 25.64, 50.97, 20, 40, 73.57, 20.59, 31.89, 40, 24]);
const rivoniaSupport = evidenceSupport(rivoniaProfile);
assert.equal(rivoniaSupport.supported.FOUNDATION, true, 'a low overall score does not erase a genuinely strong domain');
assert.equal(rivoniaSupport.supported.RELATIVE_STRENGTH, true, 'a varied profile with an established domain supports a relative strength');
assert.equal(rivoniaSupport.strongest.score, 73.57, 'the strongest domain is identified from the profile');
assert.match(positionAssertion(rivoniaProfile).takeaway, /not a zero-base condition/i);

// Broad low readiness with nothing above the Reactive band.
const lowNoFoundation = evidenceSupport(domainsOf([12, 20, 8, 30, 25, 18, 22, 10, 35, 28]));
assert.equal(lowNoFoundation.supported.FOUNDATION, false, 'a profile entirely inside the Reactive band supports no foundation');
assert.equal(lowNoFoundation.supported.RELATIVE_STRENGTH, false,
  'the least weak capability in a weak profile is not a strength');

// Flat profiles: consistent capability, but nothing is relatively stronger.
for (const level of [60, 100]) {
  const flat = evidenceSupport(domainsOf(Array(10).fill(level)));
  assert.equal(flat.flat, true, `a profile flat at ${level} is detected as flat`);
  assert.equal(flat.spread, 0, `a profile flat at ${level} has zero spread`);
  assert.equal(flat.supported.RELATIVE_STRENGTH, false, `nothing is relatively stronger in a profile flat at ${level}`);
  assert.equal(flat.supported.FOUNDATION, true, `a profile flat at ${level} still has established capability`);
  assert.match(positionAssertion(domainsOf(Array(10).fill(level))).takeaway, /consistent capability level/i);
}
assert.equal(FOUNDATION_SCORE_FLOOR, 40, 'the foundation floor is the product\u2019s own Reactive/Developing boundary');
ok('positive capability language is conditioned on deterministic evidence');

// 15f. One maturity scale for the whole product.
//
// Pass 3 found three incompatible definitions, so a report printed maturity
// "Structured" for 60 while labelling every 60.00 domain "Developing".
const MATURITY_BOUNDARIES = [
  [0, 'Reactive'], [20, 'Reactive'], [35.55, 'Reactive'], [39.99, 'Reactive'],
  [40, 'Developing'], [45, 'Developing'], [59.99, 'Developing'],
  [60, 'Structured'], [65, 'Structured'], [73.57, 'Structured'], [79.99, 'Structured'],
  [80, 'Strategic'], [85, 'Strategic'], [100, 'Strategic']
];
for (const [score, expected] of MATURITY_BOUNDARIES) {
  assert.equal(getMaturityBand(score), expected, `central scale: ${score} is ${expected}`);
  assert.equal(bandFor(score), expected, `presentation layer agrees at ${score}`);
  assert.equal(bandForScore(score), expected, `content-block selection agrees at ${score}`);
}
// The retired presentation-only labels must not be reachable.
for (const score of [0, 10, 25, 50, 70, 90, 100]) {
  assert.ok(!['Initial', 'Defined', 'Managed'].includes(bandFor(score)),
    `retired band label is not produced at ${score}`);
}
// Every domain row in the reference model agrees with its own score.
for (const row of model.domainProfile.rows) {
  assert.equal(row.band, getMaturityBand(row.score), `domain "${row.title}" at ${row.score} carries the right band`);
}
assert.equal(model.readinessScore.maturity, getMaturityBand(model.readinessScore.score),
  'overall maturity agrees with the overall score');
ok('one maturity scale across scoring, presentation and content selection');

// 16. Conclusion does not replay the roadmap.
assert.ok(!/\b(?:first\s+)?(?:30|60|90)\s*(?:days|-day)\b/i.test(model.conclusion.replace(/next 90-day checkpoint/i, '')),
  'the conclusion does not replay roadmap stages');
assert.ok(model.conclusion.split(/\s+/).length >= 40, 'the conclusion closes the argument');
ok('conclusion closes the argument rather than replaying implementation');

// 17. Contrasts remain distinct.
const contrasts = model.materialContrasts?.contrasts ?? [];
if (contrasts.length > 1) {
  const capabilities = contrasts.flatMap((c) => [c.strongerTitle, c.weakerTitle]);
  assert.equal(new Set(capabilities).size, capabilities.length, 'contrasts introduce distinct capabilities');
}
ok('material contrasts remain analytically distinct');

// 18-19. No internal identifiers or engineering language.
assert.ok(!validation.issues.some((i) => i.code === 'NO_RAW_INTERNAL_IDS'), 'no raw internal identifiers');
assert.ok(!validation.issues.some((i) => i.code === 'NO_INTERNAL_LANGUAGE'), 'no engineering language');
ok('no raw identifiers and no engineering language');

assert.ok(validation.ok, `presentation validation passes: ${JSON.stringify(validation.issues)}`);

console.log(JSON.stringify({
  passed: true,
  customerWords: validation.customerWordCount,
  pages: validation.pageCount,
  diagnosticPatterns: model.diagnosis.rows.length,
  exposures: model.exposures.rows.length,
  scenarios: model.scenarios.scenarios.length,
  priorities: model.priorities.rows.length,
  roadmapStages: stages.map((s) => `${s.stage}: ${s.actions.length}`),
  checks
}, null, 2));
