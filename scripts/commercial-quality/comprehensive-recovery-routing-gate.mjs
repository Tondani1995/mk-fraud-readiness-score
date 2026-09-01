#!/usr/bin/env node
/**
 * Provider-free Comprehensive recovery-routing gate.
 *
 * Comprehensive must use the same whole-manuscript and semantic-safety
 * architecture as Essential, not a private one-call or six-slot recovery path.
 */
import fs from 'node:fs';

const manual = fs.readFileSync('src/lib/reports/comprehensive/manual-generation.ts', 'utf8');
const generation = fs.readFileSync('src/lib/reports/comprehensive/narrative-generation.ts', 'utf8');
const coordinator = fs.readFileSync('src/lib/reports/narrative/essential-manuscript-coordinator.ts', 'utf8');
const writer = fs.readFileSync('src/lib/reports/narrative/whole-manuscript-writer.ts', 'utf8');
const sharedRecovery = fs.readFileSync('src/lib/reports/narrative/recovery-policy.ts', 'utf8');

const failures = [];
const check = (code, ok, detail) => { if (!ok) failures.push({ code, detail }); };

check(
  'FULFILMENT_DELEGATES_MANUSCRIPT',
  /generateComprehensiveNarrativeReport\(input\)/.test(manual),
  'manual fulfilment must delegate to the manuscript-first Comprehensive generator'
);
check(
  'WHOLE_MANUSCRIPT_ARCHITECTURE',
  /composeEssentialManuscript as composeReportingManuscript/.test(generation)
    && /createV11WholeManuscriptWriter\(COMPREHENSIVE_INTERPRETATION_MODEL, \{ providerCallBudget: 1 \}\)/.test(generation),
  'Comprehensive must use the same whole-manuscript writer architecture as Essential'
);
check(
  'NO_RETIRED_SIX_SLOT_PATH',
  !/generateComprehensiveInterpretation|buildInterpretationBrief|maxRepairsPerSlot/.test(manual + generation),
  'customer fulfilment must not route through the retired six-slot interpretation path'
);
check(
  'SEMANTIC_SAFETY_CASCADE',
  /runSemanticSafetyCascade/.test(coordinator)
    && /SemanticCallLedger/.test(coordinator)
    && /semanticSafety: true/.test(coordinator),
  'whole-manuscript output must pass the shared semantic safety cascade'
);
check(
  'ESSENTIAL_SHARED_LIMITS',
  /MAX_TARGETED_REPAIRS\s*=\s*4/.test(sharedRecovery)
    && /MAX_FULL_REGENERATIONS\s*=\s*1/.test(sharedRecovery)
    && /MAX_QUALITY_ESCALATIONS\s*=\s*1/.test(sharedRecovery)
    && /MAX_COHERENCE_PASSES\s*=\s*1/.test(sharedRecovery),
  'Comprehensive recovery authority must remain the shared reporting policy'
);
check(
  'HARD_TRUTH_FAIL_CLOSED',
  /issueSeverity === 'HARD_TRUTH_FAILURE'[\s\S]*?action: 'HUMAN_REVIEW_REQUIRED'/.test(sharedRecovery),
  'hard-truth failures must not be auto-rewritten'
);
check(
  'BOUNDED_REPAIR_AND_COHERENCE',
  /repairBlock\(/.test(writer)
    && /coherencePass\(/.test(writer)
    && /targetedRepairCount:\s*1/.test(writer)
    && /coherenceCount:\s*1/.test(writer),
  'whole-manuscript writer must expose bounded repair and coherence safety nets'
);
check(
  'PROVEN_WRITER_MODEL',
  /COMPREHENSIVE_INTERPRETATION_MODEL/.test(generation)
    && /openai\/gpt-5\.6-luna/.test(fs.readFileSync('src/lib/reports/comprehensive/interpretation.ts', 'utf8')),
  'Comprehensive must explicitly pin the proven Luna writer model'
);

console.log(JSON.stringify({ gate: 'comprehensive-recovery-routing', checks: 8, failures: failures.length, failureDetail: failures }, null, 2));
if (failures.length) process.exit(1);
console.log('PASS: Comprehensive uses Essential-aligned whole-manuscript semantic safety and bounded recovery.');
