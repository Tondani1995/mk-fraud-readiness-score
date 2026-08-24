#!/usr/bin/env node
/**
 * The frozen Vhutshilo V1.2 regression.
 *
 * Every increment on this branch is certified against this. It runs offline against the
 * compiled candidate graph: no database, no network, no provider call.
 *
 * What it proves today: the frozen 17-gateway option map is valid against the compiled
 * graph, and reproduces the owner's applicability signature exactly (60/8/4/0) including
 * which controls are excluded and which are redirected to oversight variants.
 *
 * What it cannot prove yet: the score. See the note on VHUTSHILO_V12_EXPECTED_RESULT — the
 * 60 in-scope control responses are not derivable from the V1.1 assessment because the
 * crosswalk merges several controls with no combination rule. The score assertions are
 * reported as UNPROVEN rather than skipped, so the gap stays visible in every run.
 *
 *   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs \
 *     scripts/v12-closure/vhutshilo-v12-regression.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveAdaptivePath } from '../../src/lib/adaptive/engine.ts';
import {
  VHUTSHILO_V12_GRAPH_VERSION, VHUTSHILO_V12_GRAPH_FINGERPRINT, VHUTSHILO_V12_METHODOLOGY_VERSION,
  VHUTSHILO_V12_GATEWAY_ANSWERS, VHUTSHILO_V12_GATEWAY_MAP, VHUTSHILO_V12_EXPECTED_SCOPE,
  VHUTSHILO_V12_EXPECTED_RESULT, VHUTSHILO_V11_HISTORICAL
} from '../../src/lib/adaptive/fixtures/vhutshilo-v12.ts';

const graph = JSON.parse(readFileSync(resolve(process.cwd(), 'src/lib/adaptive/candidates/adaptive-graph-v1-2-candidate.json'), 'utf8'));
const checks = [];
const check = (name, fn) => {
  try { fn(); checks.push({ name, status: 'PASS' }); }
  catch (error) { checks.push({ name, status: 'FAIL', detail: error.message.split('\n')[0] }); }
};

check('graph version matches the frozen fixture', () => {
  assert.equal(graph.graphVersion, VHUTSHILO_V12_GRAPH_VERSION);
});
check('graph fingerprint matches the frozen fixture', () => {
  assert.equal(graph.graphFingerprint, VHUTSHILO_V12_GRAPH_FINGERPRINT);
});
check('methodology version matches the frozen fixture', () => {
  assert.equal(graph.methodologyVersion, VHUTSHILO_V12_METHODOLOGY_VERSION);
});

check('every frozen answer resolves to exactly one compiled option', () => {
  assert.equal(VHUTSHILO_V12_GATEWAY_ANSWERS.length, graph.gateways.length,
    `fixture covers ${VHUTSHILO_V12_GATEWAY_ANSWERS.length} gateways, graph defines ${graph.gateways.length}`);
  for (const answer of VHUTSHILO_V12_GATEWAY_ANSWERS) {
    const gateway = graph.gateways.find((item) => item.questionId === answer.questionId);
    assert.ok(gateway, `${answer.gatewayCode}: not defined in the compiled graph`);
    const matches = gateway.responseOptions.filter((option) => option.value === answer.optionValue);
    assert.equal(matches.length, 1, `${answer.gatewayCode}: "${answer.optionValue}" matched ${matches.length} options, expected exactly 1`);
    assert.equal(matches[0].label, answer.optionLabel, `${answer.gatewayCode}: frozen label drifted from the compiled option label`);
    assert.equal(gateway.prompt, answer.prompt, `${answer.gatewayCode}: frozen prompt drifted from the compiled prompt`);
  }
});

const path = resolveAdaptivePath({ graph, gatewayAnswers: VHUTSHILO_V12_GATEWAY_MAP });
const active = path.activeNodes.filter((node) => node.kind !== 'gateway');

check('applicable control count is 60', () => {
  assert.equal(path.activePathCount, VHUTSHILO_V12_EXPECTED_SCOPE.applicable);
  assert.equal(active.length, VHUTSHILO_V12_EXPECTED_SCOPE.applicable);
});
check('excluded control count is 8', () => {
  assert.equal(path.excludedCount, VHUTSHILO_V12_EXPECTED_SCOPE.excluded);
});
check('redirected control count is 4', () => {
  assert.equal(path.redirectedCount, VHUTSHILO_V12_EXPECTED_SCOPE.redirected);
});
check('no gateway answer leaves a control in unknown scope', () => {
  assert.equal(path.unansweredApplicableCount, VHUTSHILO_V12_EXPECTED_SCOPE.applicable,
    'every applicable control is awaiting a response; none is scoped unknown');
});
check('the redirected controls are the expected oversight variants', () => {
  const redirected = active.filter((node) => node.kind === 'oversight').map((node) => node.replacementFor).sort();
  assert.deepEqual(redirected, [...VHUTSHILO_V12_EXPECTED_SCOPE.redirectedQuestionIds].sort());
});
check('the excluded controls are the expected set', () => {
  const activeIds = new Set(active.map((node) => node.nodeId));
  const redirectedSources = new Set(active.filter((node) => node.kind === 'oversight').map((node) => node.replacementFor));
  const excluded = graph.questions
    .map((question) => question.questionId)
    .filter((id) => !activeIds.has(id) && !redirectedSources.has(id))
    .sort();
  assert.deepEqual(excluded, [...VHUTSHILO_V12_EXPECTED_SCOPE.excludedQuestionIds].sort());
});

check('V1.1 is recorded as history only, never as a target', () => {
  assert.notEqual(VHUTSHILO_V11_HISTORICAL.graphVersion, VHUTSHILO_V12_GRAPH_VERSION);
  assert.notEqual(VHUTSHILO_V11_HISTORICAL.overallScore, VHUTSHILO_V12_EXPECTED_RESULT.overallScore);
});

/**
 * The score is stated, asserted against nothing, and reported as unproven. This is the
 * honest state: the expected values are frozen and will be enforced the moment the 60 V1.2
 * control responses arrive, and until then no run may claim the fixture is certified.
 */
const unproven = [{
  name: 'deterministic score and domain scores',
  status: 'UNPROVEN',
  detail: 'Requires the 60 in-scope V1.2 control responses. Not derivable from V1.1: the crosswalk merges D5-Q02/D6-Q02/D6-Q06 into D6-Q02, and pairs into D2-Q03, D2-Q06, D9-Q03 and D10-Q03, with no response-combination rule defined in the graph, crosswalk or engine.',
  expected: { overallScore: VHUTSHILO_V12_EXPECTED_RESULT.overallScore, maturity: VHUTSHILO_V12_EXPECTED_RESULT.maturity, domains: VHUTSHILO_V12_EXPECTED_RESULT.domains }
}];

const failed = checks.filter((entry) => entry.status === 'FAIL');
console.log(JSON.stringify({
  fixture: 'VHUTSHILO-V12',
  graphVersion: graph.graphVersion,
  graphFingerprint: graph.graphFingerprint,
  scopeProven: { applicable: path.activePathCount, excluded: path.excludedCount, redirected: path.redirectedCount, unknown: 0 },
  checks,
  unproven,
  status: failed.length ? 'FAIL' : 'PASS_SCOPE_ONLY'
}, null, 2));
process.exit(failed.length ? 1 : 0);
