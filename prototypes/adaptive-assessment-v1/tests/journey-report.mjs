/**
 * Generates the synthetic journey test matrix.
 * Usage: node prototypes/adaptive-assessment-v1/tests/journey-report.mjs [--json]
 * PROTOTYPE ONLY — synthetic data, no production access.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { AssessmentGraph } from '../src/engine.js';
import { JOURNEYS, runJourney } from '../src/journeys.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const graphJson = JSON.parse(readFileSync(join(root, 'data', 'question-graph.json'), 'utf8'));

const results = JOURNEYS.map((journey) => {
  const graph = new AssessmentGraph(graphJson);
  const { answers } = runJourney(graph, journey);
  const { active, excluded, redirected } = graph.resolvePath(answers);
  const progress = graph.progress({});                 // estimate before any answers
  const finalProgress = graph.progress(answers);
  const profile = graph.applicabilityProfile(answers);

  const scoredActive = active.filter((n) => n.node.gateway_status !== 'gateway');
  const scoredExcluded = excluded.filter((e) => e.node.gateway_status !== 'gateway');

  // Estimate the journey duration from the gateway answers alone (what the
  // respondent would have been shown once the profile was complete).
  const gatewayOnly = {};
  Object.entries(journey.gateways).forEach(([k, v]) => { gatewayOnly[k] = { value: v }; });
  const midEstimate = graph.progress(gatewayOnly);

  const unknownCount = Object.entries(answers)
    .filter(([, a]) => a.value === 'unknown').length;

  const bySkipReason = {};
  for (const e of scoredExcluded) {
    bySkipReason[e.skip_reason_code] = (bySkipReason[e.skip_reason_code] || 0) + 1;
  }

  const invalidationProbe = graph.invalidationPreview(answers, 'G03', 'none');

  return {
    id: journey.id,
    name: journey.name,
    organisation: journey.organisationName,
    presented: scoredActive.length,
    excluded: scoredExcluded.length,
    redirected: redirected.length,
    unknownResponses: unknownCount,
    estMinutesAtStart: progress.minutesRemaining,
    estMinutesAfterProfile: midEstimate.minutesRemaining,
    areasAssessed: finalProgress.areasTotal,
    coveragePct: profile.coveragePct,
    provisionalScore: profile.provisionalScore,
    unknownWeightShare: profile.unknownWeightShare,
    denominator: profile.denominator,
    skipReasons: bySkipReason,
    excludedIds: scoredExcluded.map((e) => e.id),
    redirectedPairs: redirected.map((r) => `${r.from} -> ${r.to}`),
    invalidatedIfSuppliersRemoved: invalidationProbe.invalidatedCount
  };
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(results, null, 2));
} else {
  const pad = (s, n) => String(s).padEnd(n);
  console.log('\nMK ADAPTIVE ASSESSMENT — SYNTHETIC JOURNEY MATRIX (prototype)\n');
  console.log(pad('ID', 4), pad('Journey', 34), pad('Asked', 7), pad('Skip', 6), pad('Redir', 7), pad('Unk', 5), pad('Est(min)', 10), pad('Score', 7), 'Unk%');
  console.log('-'.repeat(104));
  for (const r of results) {
    console.log(
      pad(r.id, 4), pad(r.name, 34), pad(r.presented, 7), pad(r.excluded, 6),
      pad(r.redirected, 7), pad(r.unknownResponses, 5),
      pad(`${r.estMinutesAfterProfile}`, 10), pad(r.provisionalScore, 7), r.unknownWeightShare
    );
  }
  console.log('\nSkip reasons per journey:');
  for (const r of results) {
    const reasons = Object.entries(r.skipReasons).map(([k, v]) => `${k} x${v}`).join(', ') || 'none';
    console.log(`  ${r.id}: ${reasons}`);
  }
  console.log('\nOutsourcing redirects:');
  for (const r of results) {
    console.log(`  ${r.id}: ${r.redirectedPairs.join(', ') || 'none'}`);
  }
  console.log('');
}
