/**
 * Generates the synthetic journey test matrix.
 * Usage: node prototypes/adaptive-assessment-v1/tests/journey-report.mjs [--json]
 * PROTOTYPE ONLY — synthetic data, no production access.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { AssessmentGraph } from '../src/engine.js';
import { JOURNEYS, J7_FULL_SCOPE, runJourney } from '../src/journeys.js';
import { buildAssessment } from '../src/assessment-model.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const graphJson = JSON.parse(readFileSync(join(root, 'data', 'question-graph.json'), 'utf8'));

const ALL = [...JOURNEYS, J7_FULL_SCOPE];

const results = ALL.map((journey) => {
  const graph = new AssessmentGraph(graphJson);
  const { answers, auditHistory } = runJourney(graph, journey);
  const { active, redirected } = graph.resolvePath(answers);
  const result = buildAssessment(graph, answers, auditHistory);

  const startEstimate = graph.progress({}).minutesRemaining;
  const gatewayOnly = {};
  Object.entries(journey.gateways).forEach(([k, v]) => { gatewayOnly[k] = { value: v }; });
  const afterProfile = graph.progress(gatewayOnly).minutesRemaining;

  const profileFirst = active
    .filter((n) => n.node.gateway_status === 'gateway' && n.node.phase === 'profile')
    .map((n) => n.id);
  const domainGateways = active
    .filter((n) => n.node.gateway_status === 'gateway' && n.node.phase !== 'profile')
    .map((n) => `${n.id}@${n.node.phase}`);

  const bySkipReason = {};
  for (const c of result.excludedControls) {
    const k = c.skip_reason_code || 'unknown';
    bySkipReason[k] = (bySkipReason[k] || 0) + 1;
  }
  const recClasses = {};
  for (const r of result.recommendations) {
    recClasses[r.recommendation_class] = (recClasses[r.recommendation_class] || 0) + 1;
  }

  return {
    id: journey.id,
    name: journey.name,
    organisation: journey.organisationName,
    purpose: journey.purpose || null,
    profileQuestionsFirst: profileFirst,
    domainGateways,
    activeControls: result.counts.applicable,
    excludedControls: result.counts.excluded,
    redirectedControls: result.counts.redirected,
    unknownControls: result.counts.unknown,
    unansweredControls: result.counts.unanswered,
    applicableWeight: result.weights.applicable,
    excludedWeight: result.weights.excluded,
    assessmentCoverage: result.assessmentCoverage,
    controlVisibility: result.controlVisibility,
    fraudReadinessScore: result.fraudReadinessScore,
    scoreOptionA: result.scoreOptionA,
    scoreOptionB: result.scoreOptionB,
    unknownWeightShare: result.unknownWeightShare,
    materialExclusionShare: result.materialExclusionShare,
    reportStatus: result.reportStatus,
    reportLimitationReasons: result.reportLimitationReasons,
    integritySignals: result.signals.map((s) => s.id),
    recommendationClasses: recClasses,
    estMinutesAtStart: startEstimate,
    estMinutesAfterProfile: afterProfile,
    skipReasons: bySkipReason,
    excludedIds: result.excludedControls.map((c) => c.question_id),
    redirectedPairs: redirected.map((r) => `${r.from} -> ${r.to}`)
  };
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(results, null, 2));
} else {
  const pad = (s, n) => String(s).padEnd(n);
  console.log('\nMK ADAPTIVE ASSESSMENT — SYNTHETIC JOURNEY MATRIX (prototype)\n');
  console.log(pad('ID', 8), pad('Journey', 30), pad('Act', 5), pad('Exc', 5), pad('Rdr', 5),
    pad('Unk', 5), pad('Cov%', 7), pad('Vis%', 7), pad('FRS', 7), pad('Status', 24), 'Min');
  console.log('-'.repeat(126));
  for (const r of results) {
    console.log(
      pad(r.id, 8), pad(r.name.slice(0, 29), 30), pad(r.activeControls, 5), pad(r.excludedControls, 5),
      pad(r.redirectedControls, 5), pad(r.unknownControls, 5),
      pad(r.assessmentCoverage, 7), pad(r.controlVisibility, 7),
      pad(r.fraudReadinessScore === null ? '—' : r.fraudReadinessScore, 7),
      pad(r.reportStatus, 24), r.estMinutesAfterProfile);
  }
  console.log('\nProgressive profiling — questions asked before the first control:');
  for (const r of results) console.log(`  ${r.id}: ${r.profileQuestionsFirst.join(', ') || 'none'}`);
  console.log('\nDomain gateways (asked immediately before their domain):');
  for (const r of results) console.log(`  ${r.id}: ${r.domainGateways.join(', ') || 'none'}`);
  console.log('\nIntegrity signals:');
  for (const r of results) console.log(`  ${r.id}: ${r.integritySignals.join(', ') || 'none'}`);
  console.log('\nRecommendation classes:');
  for (const r of results) {
    const rc = Object.entries(r.recommendationClasses).map(([k, v]) => `${k}=${v}`).join(' ');
    console.log(`  ${r.id}: ${rc || 'none'}`);
  }
  console.log('\nReport limitations:');
  for (const r of results) {
    console.log(`  ${r.id}: ${r.reportLimitationReasons.length ? r.reportLimitationReasons[0] : 'none'}`);
  }
  console.log('\nWeights and score models:');
  for (const r of results) {
    console.log(`  ${r.id}: applicable=${r.applicableWeight} excluded=${r.excludedWeight} ` +
      `exclShare=${r.materialExclusionShare}% unkShare=${r.unknownWeightShare}% ` +
      `A=${r.scoreOptionA} B=${r.scoreOptionB}`);
  }
  console.log('');
}
