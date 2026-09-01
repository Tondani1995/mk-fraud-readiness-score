#!/usr/bin/env node
/**
 * Provider-free Comprehensive recovery-routing gate.
 *
 * Proves that the fulfilment path delegates to the bounded interpretation
 * recovery engine and cannot silently restore the retired zero-repair override.
 * No database, storage, provider or environment credential is required.
 */
import fs from 'node:fs';

const manual = fs.readFileSync('src/lib/reports/comprehensive/manual-generation.ts', 'utf8');
const interpretation = fs.readFileSync('src/lib/reports/comprehensive/interpretation.ts', 'utf8');
const recovery = fs.readFileSync('src/lib/reports/comprehensive/recovery-policy.ts', 'utf8');

const failures = [];
const check = (code, ok, detail) => { if (!ok) failures.push({ code, detail }); };

check(
  'FULFILMENT_DELEGATES_RECOVERY',
  /generateComprehensiveInterpretation\(\s*buildInterpretationBrief\(/s.test(manual),
  'manual fulfilment must call the bounded Comprehensive interpretation engine'
);
check(
  'STALE_ZERO_REPAIR_OVERRIDE',
  !/maxRepairsPerSlot|maxRepairs\s*=\s*input\./.test(manual),
  'manual fulfilment must not force repairs to zero or expose a caller-controlled repair budget'
);
check(
  'FINAL_ACCEPTANCE_REQUIRED',
  /assertComprehensiveInterpretationAccepted\(interpretationRun\)/.test(manual),
  'manual fulfilment must enforce final fail-closed acceptance before rendering'
);
check(
  'ESSENTIAL_SHARED_LIMITS',
  /MAX_TARGETED_REPAIRS/.test(recovery)
    && /MAX_FULL_REGENERATIONS/.test(recovery)
    && /MAX_QUALITY_ESCALATIONS/.test(recovery)
    && /MAX_COHERENCE_PASSES/.test(recovery),
  'Comprehensive recovery must derive its bounded ceilings from the shared reporting recovery policy'
);
check(
  'HARD_TRUTH_FAIL_CLOSED',
  /return 'HARD_TRUTH_FAILURE'/.test(recovery)
    && /HUMAN_REVIEW_REQUIRED/.test(recovery + interpretation),
  'hard-truth failures must not be routed to automatic repair'
);
check(
  'MULTI_CALL_ACCOUNTING',
  /recovery\.totalCalls \+= 1/.test(interpretation)
    && /recovery\.targetedRepairCount \+= 1/.test(interpretation)
    && /recovery\.fullRegenerationCount \+= 1/.test(interpretation)
    && /recovery\.qualityEscalationCount \+= 1/.test(interpretation)
    && /recovery\.coherenceCount \+= 1/.test(interpretation),
  'every bounded recovery phase must be explicitly counted'
);
check(
  'TECHNICAL_FALLBACK_CHAIN',
  /openai\/gpt-5\.6-luna/.test(recovery)
    && /openai\/gpt-5\.6-terra/.test(recovery)
    && /openai\/gpt-5\.6-sol/.test(recovery),
  'technical fallback chain must remain Luna -> Terra -> Sol'
);
check(
  'NO_ARBITRARY_ONE_CALL_CAP',
  !/maxCalls\s*\?\?\s*1|single-call budget|zero repair calls/.test(manual + interpretation),
  'the production Comprehensive path must not contain the retired arbitrary one-call ceiling'
);

const summary = { gate: 'comprehensive-recovery-routing', checks: 8, failures: failures.length, failureDetail: failures };
console.log(JSON.stringify(summary, null, 2));
if (failures.length) process.exit(1);
console.log('PASS: Comprehensive fulfilment uses the bounded Essential-aligned recovery safety net.');
