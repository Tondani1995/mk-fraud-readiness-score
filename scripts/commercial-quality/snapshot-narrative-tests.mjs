#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSnapshotNarrativeInput, deterministicSnapshotNarrative, SNAPSHOT_NARRATIVE_MAX_WORDS, validateSnapshotNarrative } from '../../src/lib/snapshot/narrative.ts';
import { selectSnapshotModel } from '../../src/lib/reports/ai-model-policy.ts';
import { buildCommercialSnapshotInsights } from '../../src/lib/snapshot/commercial-insights.ts';

const snapshot = {
  assessmentReference: 'TEST-SNAPSHOT',
  organisationName: 'Example Health Logistics (Pty) Ltd',
  respondentName: null,
  respondentEmail: null,
  scoreRunId: 'score-run',
  runNumber: 1,
  overallScore: 35.55,
  calculatedMaturity: 'Reactive',
  finalMaturity: 'Reactive',
  exposureScore: 60,
  exposureBand: 'High',
  coveragePct: 100,
  nARatePct: 0,
  criticalGapCount: 2,
  majorGapCount: 4,
  capApplied: false,
  capReason: null,
  scoredAt: null,
  domains: [
    { domainId: 'd1', domainCode: 'D1', domainName: 'Fraud Leadership and Governance', weightPct: 10, rawScore: 20, weightedContribution: 2, coveragePct: 100, criticalGapCount: 1 },
    { domainId: 'd2', domainCode: 'D2', domainName: 'Fraud Risk Identification', weightPct: 10, rawScore: 25, weightedContribution: 2.5, coveragePct: 100, criticalGapCount: 0 }
  ]
};
const insights = buildCommercialSnapshotInsights(snapshot);
const input = buildSnapshotNarrativeInput(snapshot, insights);

test('Snapshot narrative input is bounded to approved deterministic facts', () => {
  assert.deepEqual(Object.keys(input).sort(), ['assuranceBoundary', 'attentionAreas', 'maturity', 'nextStepDirection', 'organisationName', 'overallScore', 'strongestAreas'].sort());
  assert.equal(JSON.stringify(input).includes('D1'), false);
  assert.equal(JSON.stringify(input).includes('roadmap'), false);
});

test('deterministic Snapshot fallback does not change authoritative facts', () => {
  const fallback = deterministicSnapshotNarrative(insights);
  assert.equal(fallback.mode, 'deterministic_fallback');
  assert.equal(fallback.aiCallCount, 0);
  assert.equal(fallback.model, 'openai/gpt-5-mini');
  assert.equal(fallback.interpretation, insights.conciseInterpretation);
  assert.equal(fallback.nextStep, insights.leadershipPriority);
});

test('Snapshot validation rejects invented numbers and paid-tier leakage', () => {
  const issues = validateSnapshotNarrative({ interpretation: 'The score is 99 and the 30/60/90-day roadmap is ready.', nextStep: 'Use the detailed report blueprint.' }, input);
  assert.ok(issues.includes('invented_number'));
  assert.ok(issues.includes('paid_tier_detail_leakage'));
});

test('Snapshot validation accepts a concise grounded narrative', () => {
  const value = { interpretation: 'The recorded result points to a reactive position, with the strongest areas offering a base for focused improvement.', nextStep: 'Leadership should clarify ownership and prioritise the recorded attention areas.' };
  const issues = validateSnapshotNarrative(value, input);
  assert.deepEqual(issues, []);
  assert.ok((value.interpretation + value.nextStep).split(/\s+/).length < SNAPSHOT_NARRATIVE_MAX_WORDS);
});

test('Snapshot policy is Mini-first with no paid-model fallback', () => {
  const policy = selectSnapshotModel();
  assert.equal(policy.primaryModel, 'openai/gpt-5-mini');
  assert.equal(policy.maxAiCalls, 1);
  assert.equal(policy.technicalFallback, 'deterministic_fallback');
});

console.log(JSON.stringify({ passed: true, checks: ['bounded Snapshot input', 'authoritative deterministic fallback', 'invented number rejection', 'paid-tier leakage rejection', 'concise grounded narrative', 'Mini-only one-call Snapshot policy'] }, null, 2));
