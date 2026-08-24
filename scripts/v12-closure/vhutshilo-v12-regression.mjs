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
 * The score is recomputed, never asserted from a stated number: the responses come from the
 * fixture recovered at the commit that produced the accepted 43.33 proof, and the engine is
 * asked for the answer on every run. If the engine drifts, this fails.
 *
 *   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs \
 *     scripts/v12-closure/vhutshilo-v12-regression.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveAdaptivePath } from '../../src/lib/adaptive/engine.ts';
import { calculateAdaptiveReadinessScore } from '../../src/lib/scoring/adaptive-scoring.ts';
import {
  VHUTSHILO_V12_GRAPH_VERSION, VHUTSHILO_V12_GRAPH_FINGERPRINT, VHUTSHILO_V12_METHODOLOGY_VERSION,
  VHUTSHILO_V12_GATEWAY_ANSWERS, VHUTSHILO_V12_GATEWAY_MAP, VHUTSHILO_V12_EXPECTED_SCOPE,
  VHUTSHILO_V12_EXPECTED_RESULT, VHUTSHILO_V11_HISTORICAL,
  VHUTSHILO_V12_FIXTURE_RECOVERY, vhutshiloV12ResponseValue, vhutshiloV12Methodology
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
 * The score, recomputed rather than asserted from a stated number.
 *
 * Responses are built by the recovered mechanism: walk the resolved path, prefer the
 * oversight value, fall back to the explicit value for the canonical node, then to split
 * inheritance. No response is written by hand and no combination rule is invented.
 */
const controlResponses = {};
for (const node of active) {
  controlResponses[node.nodeId] = {
    responseState: 'maturity',
    responseValue: vhutshiloV12ResponseValue(node.nodeId, node.replacementFor, node.domainCode)
  };
}

const scored = calculateAdaptiveReadinessScore({
  graph,
  methodology: vhutshiloV12Methodology(graph),
  gatewayAnswers: VHUTSHILO_V12_GATEWAY_MAP,
  controlResponses,
  integritySignals: []
});
const domainByCode = Object.fromEntries(
  scored.domainResults.map((domain) => [domain.domainCode, Number(domain.rawScore)])
);

check('the recovered fixture yields exactly 60 responses', () => {
  assert.equal(Object.keys(controlResponses).length, VHUTSHILO_V12_EXPECTED_SCOPE.applicable);
});
check(`overall score is ${VHUTSHILO_V12_EXPECTED_RESULT.overallScore}`, () => {
  assert.equal(Number(scored.summary.overallScore), VHUTSHILO_V12_EXPECTED_RESULT.overallScore);
});
check(`final maturity is ${VHUTSHILO_V12_EXPECTED_RESULT.maturity}`, () => {
  assert.equal(scored.summary.finalMaturity, VHUTSHILO_V12_EXPECTED_RESULT.maturity);
});
check('coverage is 100%', () => {
  assert.equal(Number(scored.summary.coveragePct), VHUTSHILO_V12_EXPECTED_RESULT.coveragePct);
});
check(`critical gaps are ${VHUTSHILO_V12_EXPECTED_RESULT.criticalGaps}`, () => {
  assert.equal(Number(scored.summary.criticalGapCount), VHUTSHILO_V12_EXPECTED_RESULT.criticalGaps);
});
check(`major gaps are ${VHUTSHILO_V12_EXPECTED_RESULT.majorGaps}`, () => {
  assert.equal(Number(scored.summary.majorGapCount), VHUTSHILO_V12_EXPECTED_RESULT.majorGaps);
});
for (const [code, expected] of Object.entries(VHUTSHILO_V12_EXPECTED_RESULT.domains)) {
  check(`${code} scores ${expected}`, () => {
    assert.equal(domainByCode[code], expected);
  });
}
check('the fixture records where it was recovered from', () => {
  assert.equal(VHUTSHILO_V12_FIXTURE_RECOVERY.recoveredFromSourceSha, '25261df021df21e2b5f704f5024786abcdf8774f');
  assert.match(VHUTSHILO_V12_FIXTURE_RECOVERY.recoveredFromPath, /v12-essential-comparison/);
});

const failed = checks.filter((entry) => entry.status === 'FAIL');
console.log(JSON.stringify({
  fixture: 'VHUTSHILO-V12',
  graphVersion: graph.graphVersion,
  graphFingerprint: graph.graphFingerprint,
  scopeProven: { applicable: path.activePathCount, excluded: path.excludedCount, redirected: path.redirectedCount, unknown: 0 },
  recomputed: {
    overallScore: Number(scored.summary.overallScore),
    finalMaturity: scored.summary.finalMaturity,
    coveragePct: Number(scored.summary.coveragePct),
    criticalGaps: Number(scored.summary.criticalGapCount),
    majorGaps: Number(scored.summary.majorGapCount),
    domains: domainByCode
  },
  recoveredFrom: VHUTSHILO_V12_FIXTURE_RECOVERY,
  checks,
  status: failed.length ? 'FAIL' : 'PASS'
}, null, 2));
process.exit(failed.length ? 1 : 0);
