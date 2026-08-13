#!/usr/bin/env node
import assert from 'node:assert/strict';
import { NarrativeAiCallAccounting } from '../../src/lib/reports/narrative/call-accounting.ts';

const announcements = [];
const accounting = new NarrativeAiCallAccounting({ onAnnouncement: (message) => announcements.push(message) });
accounting.announceBeforeLiveCall({ movements: [{ order: 1, sectionIds: ['EXECUTIVE-ASSESSMENT', 'READINESS-PROFILE'] }, { order: 2, sectionIds: ['CONCLUSION'] }] });
const phases = [['spine'], ['section', 'EXECUTIVE-ASSESSMENT'], ['section', 'READINESS-PROFILE'], ['section', 'CONCLUSION'], ['coherence']];
for (const [phase, sectionId] of phases) {
  const call = accounting.start(phase, sectionId);
  accounting.complete(call, { generationId: `generation-${call.sequence}`, responseId: `response-${call.sequence}`, inputTokens: 10, outputTokens: 20, totalTokens: 30, providerCostMicros: 4 });
}
const snapshot = accounting.snapshot();
assert.match(announcements[0], /3 Story Plan sections \/ 5 expected normal calls/);
assert.equal(snapshot.expectedNormalCalls, 5);
assert.equal(snapshot.records.length, 5);
assert.equal(snapshot.records.filter((record) => record.status === 'completed').length, 5);
assert.equal(snapshot.records.reduce((sum, record) => sum + (record.totalTokens ?? 0), 0), 150);
assert.equal(snapshot.records.reduce((sum, record) => sum + (record.providerCostMicros ?? 0), 0), 20);
assert.equal(snapshot.records.some((record) => record.phase === 'repair'), false);
console.log(JSON.stringify({ passed: true, expectedNormalCalls: snapshot.expectedNormalCalls, actualCalls: snapshot.records.length, repairs: snapshot.records.filter((record) => record.phase === 'repair').length, totalTokens: 150, providerCostMicros: 20 }, null, 2));
