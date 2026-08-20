import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createNarrativeOwnerReviewDiagnosticsSink } from '../../src/lib/reports/narrative/owner-review-diagnostics.ts';
import { NarrativeAiCallAccounting } from '../../src/lib/reports/narrative/call-accounting.ts';
import { describeEssentialWriterFailure } from '../../src/lib/reports/narrative/essential-manuscript-coordinator.ts';

test('owner-review diagnostics persist rejected candidates without secrets', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mk-v11-diagnostics-'));
  const sink = createNarrativeOwnerReviewDiagnosticsSink({ rootDirectory: root, caseDirectory: 'rivonia-essential' });
  await sink.onRejectedCandidate({
    stage: 'coherence',
    candidate: { sections: [], writerMetadata: { presentationSanitisedProvenanceTokenCount: 2 }, text: 'AI_GATEWAY_API_KEY=secret sk-live-12345678901234567890' },
    plainText: 'A rejected draft.',
    narrativeValidation: { ok: false, stage: 'coherence', bibleVersion: '1.1', checkedHeadings: 1, checkedParagraphs: 1, checkedClaims: 1, checkedAt: new Date(0).toISOString(), issues: [{ code: 'assurance_claim', path: 'sections[0].paragraphs[0]', message: 'blocked', blocking: true }] }
  });
  const directory = path.join(root, 'failed-attempts', 'rivonia-essential-attempt-01');
  const candidate = await fs.readFile(path.join(directory, 'generated-structured-candidate.json'), 'utf8');
  const metadata = await fs.readFile(path.join(directory, 'diagnostic-metadata.json'), 'utf8');
  const failedPaths = await fs.readFile(path.join(directory, 'failed-paths.json'), 'utf8');
  assert.doesNotMatch(candidate, /secret|sk-live/);
  assert.match(metadata, /"sanitisedProvenanceTokenCount": 2/);
  assert.match(metadata, /"apiKeysPersisted": false/);
  assert.match(failedPaths, /sections\[0\]\.paragraphs\[0\]/);
});

test('call accounting announces the normal maximum and records phase metadata', () => {
  const announcements = [];
  const accounting = new NarrativeAiCallAccounting({ onAnnouncement: (message) => announcements.push(message) });
  const plan = { movements: [{ sectionIds: ['s1', 's2'] }, { sectionIds: ['s3'] }] };
  accounting.announceBeforeLiveCall(plan);
  const call = accounting.start('section', 's1');
  accounting.complete(call, { generationId: 'gen-1', responseId: 'resp-1', inputTokens: 10, outputTokens: 20, totalTokens: 30, providerCostMicros: 4 });
  const snapshot = accounting.snapshot();
  assert.match(announcements[0], /3 Story Plan sections \/ 5 expected normal calls/);
  assert.equal(snapshot.expectedNormalCalls, 5);
  assert.deepEqual(snapshot.records[0], { sequence: 1, phase: 'section', sectionId: 's1', attempt: 1, status: 'completed', startedAt: snapshot.records[0].startedAt, completedAt: snapshot.records[0].completedAt, generationId: 'gen-1', responseId: 'resp-1', inputTokens: 10, outputTokens: 20, totalTokens: 30, providerCostMicros: 4 });
});

test('Essential writer diagnostics classify timeout without leaking credentials', () => {
  const failure = describeEssentialWriterFailure({
    error: Object.assign(new Error('Request timed out with AI_GATEWAY_API_KEY=secret-value and sk-test-1234567890'), { name: 'AbortError', code: 'ETIMEDOUT' }),
    elapsedWriterMs: 98_564,
    configuredTimeoutMs: 240_000,
    maxOutputTokens: 12_000,
    dispatchOccurred: true
  });
  assert.equal(failure.errorCategory, 'timeout');
  assert.equal(failure.errorCode, 'ETIMEDOUT');
  assert.equal(failure.elapsedWriterMs, 98_564);
  assert.equal(failure.configuredTimeoutMs, 240_000);
  assert.equal(failure.maxOutputTokens, 12_000);
  assert.equal(failure.accountingStatus, 'dispatched_settlement_unknown');
  assert.doesNotMatch(failure.safeErrorMessage ?? '', /secret-value|sk-test/);
});

test('Essential writer diagnostics capture provider HTTP status and request identity only', () => {
  const failure = describeEssentialWriterFailure({
    error: {
      name: 'AI_APICallError',
      code: 'provider_error',
      message: 'Gateway returned an upstream failure.',
      statusCode: 503,
      response: { headers: { 'x-request-id': 'req-provider-123' }, body: 'customer prose must never be persisted' }
    },
    elapsedWriterMs: 4_321,
    dispatchOccurred: true,
    providerCallsRecorded: 1
  });
  assert.equal(failure.errorCategory, 'provider_http');
  assert.equal(failure.httpStatus, 503);
  assert.equal(failure.providerRequestId, 'req-provider-123');
  assert.equal(failure.accountingStatus, 'recorded');
  assert.doesNotMatch(JSON.stringify(failure), /customer prose/);
});

test('Essential writer diagnostics distinguish network failure from provider SDK failure', () => {
  const network = describeEssentialWriterFailure({
    error: { name: 'TypeError', message: 'fetch failed', cause: { code: 'ECONNRESET', message: 'socket reset' } },
    elapsedWriterMs: 1_200,
    dispatchOccurred: true
  });
  assert.equal(network.errorCategory, 'network');
  assert.equal(network.errorCode, 'ECONNRESET');

  const sdk = describeEssentialWriterFailure({
    error: { name: 'AI_APICallError', code: 'AI_SDK_ERROR', message: 'Provider rejected the request envelope' },
    elapsedWriterMs: 900,
    dispatchOccurred: true
  });
  assert.equal(sdk.errorCategory, 'provider_sdk');
});

test('Essential writer diagnostics distinguish pre-dispatch and empty-response failures', () => {
  const preflight = describeEssentialWriterFailure({
    error: Object.assign(new Error('Whole-manuscript context is over the approved limit without a coherent partition plan.'), { code: 'context_limit' }),
    elapsedWriterMs: 2,
    dispatchOccurred: false
  });
  assert.equal(preflight.errorCategory, 'writer_preflight');
  assert.equal(preflight.accountingStatus, 'not_dispatched');

  const empty = describeEssentialWriterFailure({
    error: new Error('Whole-manuscript text generation returned empty Markdown.'),
    elapsedWriterMs: 12_000,
    dispatchOccurred: true
  });
  assert.equal(empty.errorCategory, 'empty_response');
  assert.equal(empty.accountingStatus, 'dispatched_settlement_unknown');
});

console.log('Narrative owner-review and Essential provider diagnostics tests: PASS');
