#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DEFAULT_PREMIUM_REPORT_AUTOMATION_FLAGS, parsePremiumReportAutomationFlags } from '../../src/lib/reports/automation/feature-flags.ts';
import { PRIMARY_NARRATIVE_MODEL, SNAPSHOT_PRIMARY_MODEL, SNAPSHOT_MAX_SUCCESSFUL_GENERATIONS, SNAPSHOT_TECHNICAL_FALLBACK, NARRATIVE_FALLBACK_MODELS, assertTechnicalFallback, isQualityFailureFallbackReason, selectNarrativeModel, selectSnapshotModel } from '../../src/lib/reports/ai-model-policy.ts';

assert.equal(selectNarrativeModel({}).requestedModel, 'openai/gpt-5-mini');
assert.equal(SNAPSHOT_PRIMARY_MODEL, 'openai/gpt-5-mini');
assert.equal(selectSnapshotModel().requestedModel, 'openai/gpt-5-mini');
assert.equal(selectSnapshotModel().maxSuccessfulGenerations, 1);
assert.equal(SNAPSHOT_MAX_SUCCESSFUL_GENERATIONS, 1);
assert.deepEqual(SNAPSHOT_TECHNICAL_FALLBACK, NARRATIVE_FALLBACK_MODELS);
assert.deepEqual(selectSnapshotModel().fallbackModels, NARRATIVE_FALLBACK_MODELS);
assert.equal(selectNarrativeModel({}).overrideUsed, false);
assert.deepEqual(NARRATIVE_FALLBACK_MODELS, ['openai/gpt-5.6-luna', 'openai/gpt-5.6-terra', 'openai/gpt-5.6-sol']);
assert.equal(selectNarrativeModel({ MK_REPORT_AI_MODEL: 'openai/gpt-5.6-sol' }).requestedModel, 'openai/gpt-5.6-sol');
assert.equal(selectNarrativeModel({ MK_REPORT_AI_MODEL: 'openai/gpt-5.6-sol' }).overrideUsed, true);
assert.equal(parsePremiumReportAutomationFlags({}).model, PRIMARY_NARRATIVE_MODEL);
assert.equal(parsePremiumReportAutomationFlags({ premium_report_ai_model: 'openai/gpt-5.6-luna' }).model, 'openai/gpt-5.6-luna');
assert.equal(DEFAULT_PREMIUM_REPORT_AUTOMATION_FLAGS.model, PRIMARY_NARRATIVE_MODEL);

assert.doesNotThrow(() => assertTechnicalFallback({ fallbackUsed: true, fallbackFrom: PRIMARY_NARRATIVE_MODEL, fallbackTo: 'openai/gpt-5.6-luna', fallbackReason: 'model_unavailable' }));
assert.doesNotThrow(() => assertTechnicalFallback({ fallbackUsed: true, fallbackFrom: 'openai/gpt-5.6-luna', fallbackTo: 'openai/gpt-5.6-terra', fallbackReason: 'provider_outage' }));
assert.throws(() => assertTechnicalFallback({ fallbackUsed: true, fallbackFrom: PRIMARY_NARRATIVE_MODEL, fallbackTo: 'openai/gpt-5.6-sol', fallbackReason: 'model_unavailable' }), /exact Mini, Luna, Terra, Sol order/);
assert.throws(() => assertTechnicalFallback({ fallbackUsed: true, fallbackFrom: PRIMARY_NARRATIVE_MODEL, fallbackTo: 'openai/gpt-5.6-luna' }), /requires from, to and reason/);
assert.equal(isQualityFailureFallbackReason('editorial validation failed'), true);
assert.throws(() => assertTechnicalFallback({ fallbackUsed: true, fallbackFrom: PRIMARY_NARRATIVE_MODEL, fallbackTo: 'openai/gpt-5.6-luna', fallbackReason: 'editorial validation failed' }), /cannot trigger/);

const snapshotSource = fs.readFileSync(new URL('../../src/lib/snapshot/commercial-insights.ts', import.meta.url), 'utf8');
assert.doesNotMatch(snapshotSource, /generateText|generateObject|@ai-sdk|ai-writer/);

console.log(JSON.stringify({ passed: true, checks: ['Mini global default', 'Mini Snapshot default', 'Snapshot one-successful-generation ceiling', 'Snapshot Mini-Luna-Terra-Sol technical fallback', 'Mini legacy default', 'explicit override', 'exact technical fallback order', 'fallback metadata required', 'quality failure cannot escalate'], primary: PRIMARY_NARRATIVE_MODEL, snapshotPrimary: SNAPSHOT_PRIMARY_MODEL, fallbacks: NARRATIVE_FALLBACK_MODELS }, null, 2));
