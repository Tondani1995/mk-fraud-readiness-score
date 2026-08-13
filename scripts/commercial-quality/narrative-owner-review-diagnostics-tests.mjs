import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createNarrativeOwnerReviewDiagnosticsSink } from '../../src/lib/reports/narrative/owner-review-diagnostics.ts';
import { NarrativeAiCallAccounting } from '../../src/lib/reports/narrative/call-accounting.ts';

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

console.log('Narrative owner-review diagnostics tests: PASS');

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
