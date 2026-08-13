#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildSnapshotNarrativeInput, unavailableSnapshotNarrative, SNAPSHOT_NARRATIVE_MAX_WORDS, validateSnapshotNarrative } from '../../src/lib/snapshot/narrative.ts';
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

test('Snapshot technical exhaustion fails closed without mechanical narrative', () => {
  const unavailable = unavailableSnapshotNarrative({ aiCallCount: 4, attemptedModels: ['openai/gpt-5-mini', 'openai/gpt-5.6-luna', 'openai/gpt-5.6-terra', 'openai/gpt-5.6-sol'] });
  assert.equal(unavailable.mode, 'unavailable');
  assert.equal(unavailable.aiCallCount, 4);
  assert.equal(unavailable.interpretation, '');
  assert.equal(unavailable.nextStep, '');
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

test('Snapshot policy is Mini-first with technical fallback and one successful generation', () => {
  const policy = selectSnapshotModel();
  assert.equal(policy.primaryModel, 'openai/gpt-5-mini');
  assert.deepEqual(policy.fallbackModels, ['openai/gpt-5.6-luna', 'openai/gpt-5.6-terra', 'openai/gpt-5.6-sol']);
  assert.equal(policy.maxSuccessfulGenerations, 1);
});

console.log(JSON.stringify({ passed: true, checks: ['bounded Snapshot input', 'closed safe handling after technical exhaustion', 'invented number rejection', 'paid-tier leakage rejection', 'concise grounded narrative', 'Mini-Luna-Terra-Sol technical fallback', 'one successful Snapshot generation'] }, null, 2));
