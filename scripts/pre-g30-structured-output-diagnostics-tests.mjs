import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NoObjectGeneratedError, NoOutputGeneratedError, Output } from 'ai';
import { makeStructuredOutputDiagnostics } from '../src/lib/reports/automation/structured-output-diagnostics.ts';
import { premiumReportNarrativeSchema } from '../src/lib/reports/automation/ai-sdk-generator.ts';

const adapter = await readFile(new URL('../src/lib/reports/automation/ai-sdk-generator.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20260806143000_pre_g30_structured_output_release_gate.sql', import.meta.url), 'utf8');

// Verify the installed ai 6.0.83 structured-output contract without a provider call.
const schemaOutput = Output.object({ schema: premiumReportNarrativeSchema });
assert.ok(schemaOutput);
const providerError = new NoObjectGeneratedError({
  message: 'synthetic schema failure',
  response: { id: 'response-1', modelId: 'openai/gpt-5.5', headers: {} },
  usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  finishReason: 'length',
  text: 'synthetic provider narrative must never be persisted'
});
const providerDiagnostics = makeStructuredOutputDiagnostics({
  error: providerError,
  response: providerError.response,
  providerMetadata: { gateway: { routing: {} } },
  finishReason: providerError.finishReason,
  rawFinishReason: 'length'
});
assert.equal(providerDiagnostics.status, 'structured_output_truncated');
assert.equal(providerDiagnostics.responseId, 'response-1');
assert.equal(providerDiagnostics.rawTextLength, 52);
assert.match(providerDiagnostics.rawTextSha256, /^[0-9a-f]{64}$/);
assert.equal('text' in providerDiagnostics, false);

const getterError = new NoOutputGeneratedError({ message: 'synthetic getter failure' });
const getterDiagnostics = makeStructuredOutputDiagnostics({
  error: getterError,
  response: { id: 'response-2', modelId: 'openai/gpt-5.5', headers: {} },
  providerMetadata: { gateway: { routing: {} } },
  finishReason: 'stop'
});
assert.equal(getterDiagnostics.status, 'structured_output_invalid');
assert.equal(getterDiagnostics.sdkErrorName, 'AI_NoOutputGeneratedError');
assert.equal(getterDiagnostics.responseId, 'response-2');
assert.equal(getterDiagnostics.rawTextLength, undefined);

// The adapter's ordering is the defect fix: identity/evidence capture precedes output access.
const identityCapture = adapter.indexOf('const response = result.response;');
const outputAccess = adapter.indexOf('output = result.output');
assert.ok(identityCapture >= 0 && outputAccess > identityCapture);
assert.match(adapter, /StructuredOutputGenerationError/);
assert.match(adapter, /result\.providerMetadata/);
assert.match(adapter, /result\.finishReason/);

// Release gating is narrow, exact-product and fail-closed.
assert.match(migration, /structured_output_diagnostics/);
assert.match(migration, /structured_output_truncated/);
assert.match(migration, /product_code <> 'essential_self_assessment'/);
assert.match(migration, /v_attempt\.generation_mode in \('ai', 'ai_repair'\)/);
assert.match(migration, /a\.accounting_status = 'verified'/);
assert.match(migration, /generationId/);
assert.match(migration, /pre_g30_contain_uncertified_premium_report/);
assert.match(migration, /MKORD-2026-RHFC6DYH/);
assert.match(migration, /RPT-MKFRS-2026-ACACD50A9F-V1/);
assert.match(migration, /historical_delivery_rows_preserved/);
assert.doesNotMatch(migration, /delete from public\.(email_events|report_delivery_finalizations|reports)/i);

console.log(JSON.stringify({
  ok: true,
  sdk: 'ai 6.0.83',
  schemaOutput: 'constructed',
  providerError: 'metadata captured before output extraction',
  rawProviderTextPersisted: false,
  releaseGate: 'AI-certified Essential reports only',
  journey5Containment: 'exact-scope control present'
}));
