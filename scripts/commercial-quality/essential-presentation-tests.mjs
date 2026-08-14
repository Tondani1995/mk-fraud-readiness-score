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
import { validateEssentialPresentation } from '../../src/lib/reports/essential/presentation-validation.ts';
import {
  exposureFamilyForScenario,
  exposureFamilyForSemantic,
  exposureFamilyForLabel
} from '../../src/lib/reports/essential/content-families.ts';

const source = process.env.ESSENTIAL_SOURCE_DIR
  ?? '/Users/tondani/Documents/Codex/outputs/report-engine-end-to-end-certification/rivonia-essential';
const factPack = JSON.parse(fs.readFileSync(`${source}/01-fact-pack.json`, 'utf8'));
const thesis = JSON.parse(fs.readFileSync(`${source}/03-report-thesis.json`, 'utf8'));

const model = buildEssentialPresentationModel({ factPack, thesis, commentary: {} });
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

// 2-4. Exposure families own the right content and are distinct.
const exposureFamilies = model.exposures.rows.map((r) => r.family);
assert.deepEqual(exposureFamilies, [
  'SUPPLIER_PAYMENT_VALUE_DIVERSION',
  'IDENTITY_TRANSACTION_SENSITIVE_CHANGE',
  'INCIDENT_CONTAINMENT_LEARNING'
], 'exposures resolve to their own families in order');
ok('exposure family ownership is correct and distinct');

// 5. The shipped defect: pairing exposures to scenarios by array index.
// Rivonia's scenario order is supplier / incident / detection while its exposure
// order is supplier / identity / containment, so index pairing crosses rows 2 and 3.
const scenarioOrder = factPack.scenarios.map((s) => exposureFamilyForScenario(s.scenarioFamily));
const positional = model.exposures.rows.map((_, i) => scenarioOrder[i]);
assert.notDeepEqual(positional, exposureFamilies, 'index pairing produces a different mapping than family ownership');
assert.equal(positional[1], 'INCIDENT_CONTAINMENT_LEARNING', 'index pairing would put incident content on the identity exposure');
assert.equal(exposureFamilies[1], 'IDENTITY_TRANSACTION_SENSITIVE_CHANGE', 'family ownership puts identity content there instead');
ok('the shipped index-pairing defect is reproduced and rejected');

// 6-8. Scenario families.
assert.equal(exposureFamilyForScenario('SUPPLIER_PAYMENT_DIVERSION'), 'SUPPLIER_PAYMENT_VALUE_DIVERSION');
assert.equal(exposureFamilyForScenario('DETECTION_EVASION'), 'IDENTITY_TRANSACTION_SENSITIVE_CHANGE');
assert.equal(exposureFamilyForScenario('INCIDENT_CONCEALMENT'), 'INCIDENT_CONTAINMENT_LEARNING');
ok('scenario families map to their owning exposure');

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
ok('roadmap stages are distinct and 30 days is a real stabilisation phase');

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
