#!/usr/bin/env node
/**
 * Offline quality contract for the Essential customer presentation.
 *
 * This exercises the presentation with the frozen V1.2 operating context. It
 * does not score, call a provider, write an artefact or mutate an environment.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildEssentialPresentationModel } from '../../src/lib/reports/essential/presentation-model.ts';
import { validateEssentialPresentation } from '../../src/lib/reports/essential/presentation-validation.ts';
import { deriveOperatingContext } from '../../src/lib/reports/narrative/operating-context.ts';
import {
  VHUTSHILO_V12_GATEWAY_MAP,
  VHUTSHILO_V12_GRAPH_VERSION
} from '../../src/lib/adaptive/fixtures/vhutshilo-v12.ts';

const source = process.env.ESSENTIAL_SOURCE_DIR
  ?? '/Users/tondani/Documents/Codex/outputs/report-engine-end-to-end-certification/rivonia-essential';
const readJson = (name) => JSON.parse(fs.readFileSync(`${source}/${name}`, 'utf8'));
const factPack = readJson('01-fact-pack.json');
const thesis = readJson('03-report-thesis.json');
const blueprint = readJson('02-report-blueprint.json');
const graph = JSON.parse(fs.readFileSync('src/lib/adaptive/candidates/adaptive-graph-v1-2-candidate.json', 'utf8'));
const operatingContext = deriveOperatingContext({
  graphVersion: VHUTSHILO_V12_GRAPH_VERSION,
  graph,
  gatewayAnswers: VHUTSHILO_V12_GATEWAY_MAP
});

const contextFactPack = {
  ...factPack,
  organisation: {
    ...factPack.organisation,
    operatingContext
  }
};
const model = buildEssentialPresentationModel({ factPack: contextFactPack, thesis, blueprint, commentary: {} });
const validation = validateEssentialPresentation(model);
assert.deepEqual(validation.issues, [], `Essential validation issues: ${JSON.stringify(validation.issues)}`);

const priorities = model.priorities.rows;
const actions = model.roadmap.stages.flatMap((stage) => stage.actions);
const customerText = [
  ...model.diagnosis.rows.map((row) => row.whyItMatters),
  ...priorities.flatMap((row) => [row.outcome, row.whyNow, row.betterLooksLike]),
  ...actions.flatMap((action) => [action.action, action.deliverable, action.completionTest])
].join(' ');
const contextAnchor = /operating locations|external supplier|internal procurement|temporary|cash|stock|payroll|manufacturing|supplier relationships/i;

for (const row of priorities) {
  assert.match(row.outcome, /^(Name|Verify|Monitor|Refresh|Map|Preserve|Define|Route|Set|Run)\b/,
    `priority title should be business-quality and verb-led: ${row.outcome}`);
  assert.ok(row.outcome.length <= 72, `priority title is too long: ${row.outcome}`);
  assert.match(row.whyNow, /assessed as/i, `priority rationale lacks the assessed condition: ${row.outcome}`);
  assert.ok(contextAnchor.test(row.whyNow), `priority rationale lacks governed organisation context: ${row.outcome}`);
  assert.notEqual(row.whyNow, row.betterLooksLike, `priority rationale and target state repeat: ${row.outcome}`);
}

for (const action of actions) {
  assert.match(action.deliverable, /\b(for|across)\b/i, `deliverable lacks a scoped population: ${action.action}`);
  assert.match(action.completionTest, /Population:/, `completion test lacks a named population: ${action.action}`);
  assert.match(action.completionTest, /Retain /, `completion test lacks retained evidence: ${action.action}`);
  assert.ok(contextAnchor.test(`${action.deliverable} ${action.completionTest}`),
    `roadmap action lacks governed organisation context: ${action.action}`);
}

assert.equal(new Set(priorities.map((row) => row.outcome)).size, priorities.length, 'priority titles must be distinct');
assert.equal(new Set(priorities.map((row) => row.whyNow)).size, priorities.length, 'priority rationales must be distinct');
assert.doesNotMatch(customerText, /across\s+across|processes\s+processes/i, 'customer text contains repeated scope language');
assert.equal(model.roadmap.stages[0]?.actions.length, 3, 'the 30-day window includes governance, supplier challenge and risk mapping');
assert.match(model.roadmap.stages[0]?.actions[1]?.action ?? '', /^Verify suppliers/, 'supplier challenge is sequenced into the first window');

const metrics = {
  priorityTitlesVerbLed: `${priorities.filter((row) => /^(Name|Verify|Monitor|Refresh|Map|Preserve|Define|Route|Set|Run)\b/.test(row.outcome)).length}/${priorities.length}`,
  priorityRationalesWithAssessedCondition: `${priorities.filter((row) => /assessed as/i.test(row.whyNow)).length}/${priorities.length}`,
  priorityRationalesWithGovernedContext: `${priorities.filter((row) => contextAnchor.test(row.whyNow)).length}/${priorities.length}`,
  roadmapActionsWithPopulationAndRetainedEvidence: `${actions.filter((action) => /Population:/.test(action.completionTest) && /Retain /.test(action.completionTest)).length}/${actions.length}`,
  roadmapActionsWithGovernedContext: `${actions.filter((action) => contextAnchor.test(`${action.deliverable} ${action.completionTest}`)).length}/${actions.length}`,
  firstWindowActions: model.roadmap.stages[0]?.actions.length ?? 0,
  customerWords: validation.customerWordCount
};

console.log(JSON.stringify({ passed: true, metrics }, null, 2));
