#!/usr/bin/env node
/**
 * Provider-free static routing gate for the Comprehensive production boundary.
 * The executable behavioural cases live in comprehensive-recovery-behaviour-tests.mjs.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = (file) => fs.readFile(file, 'utf8');
const [generation, manual, coordinator, writer, sharedRecovery, comprehensiveRecovery, service] = await Promise.all([
  read('src/lib/reports/comprehensive/narrative-generation.ts'),
  read('src/lib/reports/comprehensive/manual-generation.ts'),
  read('src/lib/reports/comprehensive/manuscript-coordinator.ts'),
  read('src/lib/reports/narrative/whole-manuscript-writer.ts'),
  read('src/lib/reports/narrative/recovery-policy.ts'),
  read('src/lib/reports/comprehensive/recovery-policy.ts'),
  read('src/lib/comprehensive/generation-service.ts')
]);

assert.match(manual, /generateComprehensiveNarrativeReport/);
assert.match(generation, /composeComprehensiveManuscript/);
assert.match(generation, /ComprehensiveProviderCallLedger/);
assert.match(generation, /providerCallLedger:\s*ledger/);
assert.doesNotMatch(generation, /composeEssentialManuscript|generateComprehensiveInterpretation|maxRepairsPerSlot/);
assert.match(coordinator, /strictHardTruth:\s*true/);
assert.match(coordinator, /recoverWholeManuscript/);
assert.match(coordinator, /assertComprehensiveRecoveryBudget/);
assert.match(writer, /providerCallLedger\?\.claim/);
assert.match(writer, /repairBlock\(/);
assert.match(writer, /coherencePass\(/);
assert.match(sharedRecovery, /MAX_TARGETED_REPAIRS\s*=\s*4/);
assert.match(sharedRecovery, /MAX_FULL_REGENERATIONS\s*=\s*1/);
assert.match(sharedRecovery, /MAX_QUALITY_ESCALATIONS\s*=\s*1/);
assert.match(sharedRecovery, /MAX_COHERENCE_PASSES\s*=\s*1/);
assert.match(comprehensiveRecovery, /COMPREHENSIVE_MAX_TOTAL_PROVIDER_CALLS\s*=\s*10/);
assert.match(comprehensiveRecovery, /technicalFallbackCount\s*>\s*1/);
assert.match(service, /renderComprehensiveReportPdf/);
assert.doesNotMatch(service, /renderComprehensiveReportHtml/);

console.log(JSON.stringify({
  status: 'PASS',
  gate: 'comprehensive-recovery-routing',
  providerCalls: 0,
  assertions: [
    'customer PDF routes through the Comprehensive whole-manuscript coordinator',
    'shared provider-call ledger spans the primary writer and fallback rungs',
    'hard-truth validation is strict and fails closed',
    'targeted repair, regeneration, quality and coherence seams remain bounded',
    'production generation service does not invoke the retired interpretation renderer'
  ]
}, null, 2));
