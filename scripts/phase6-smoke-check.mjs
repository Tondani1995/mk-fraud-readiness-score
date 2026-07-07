import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function assertIncludes(file, pattern, label) {
  const content = read(file);
  if (!content.includes(pattern)) throw new Error(`${label} missing in ${file}`);
}
function assertNotIncludes(file, pattern, label) {
  const content = read(file);
  if (content.includes(pattern)) throw new Error(`${label} unexpectedly present in ${file}`);
}
function assertFile(rel) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error(`Missing required file: ${rel}`);
}

const required = [
  'src/lib/scoring/scoring-engine.ts',
  'src/lib/scoring/score-assessment.ts',
  'src/app/api/admin/assessments/[assessmentRef]/score/route.ts',
  'supabase/migrations/0006_phase6_scoring_guards.sql',
  'supabase/migrations/0007_phase6_v1_1_atomic_scoring.sql',
  'scripts/phase6-scenario-tests.mjs',
  'scripts/phase6-engine-direct-tests.mjs',
  'docs/PHASE_6_SCORING_CONTRACT.md',
  'docs/PHASE_6_TEST_PLAN.md',
  'docs/PHASE_6_EXIT_CARD.md',
  'docs/PHASE_6_V1_1_REPAIR_LOG.md'
];
required.forEach(assertFile);

assertIncludes('src/lib/scoring/scoring-engine.ts', 'calculateFraudReadinessScore', 'deterministic scoring function');
assertIncludes('src/lib/scoring/scoring-engine.ts', 'normaliseResponse', '0-5 normalisation');
assertIncludes('src/lib/scoring/scoring-engine.ts', 'any_hard_gate_critical_control_lte_1', 'hard-gate <=1 cap rule');
assertIncludes('src/lib/scoring/scoring-engine.ts', 'any_hard_gate_critical_control_eq_2', 'hard-gate =2 cap rule');
assertIncludes('src/lib/scoring/scoring-engine.ts', 'valid_not_applicable_excluded_from_score', 'N/A score exclusion');

assertIncludes('src/lib/scoring/score-assessment.ts', 'stableHash', 'input hash contract');
assertIncludes('src/lib/scoring/score-assessment.ts', "rpc('complete_score_run_atomic'", 'atomic scoring RPC usage');
assertNotIncludes('src/lib/scoring/score-assessment.ts', ".from('score_domain_results').insert", 'non-atomic domain trace insert');
assertNotIncludes('src/lib/scoring/score-assessment.ts', ".from('score_question_traces').insert", 'non-atomic question trace insert');
assertNotIncludes('src/lib/scoring/score-assessment.ts', ".from('maturity_cap_events').insert", 'non-atomic cap event insert');
assertIncludes('src/app/api/admin/assessments/[assessmentRef]/score/route.ts', 'requireAdmin', 'admin-before-scoring protection');

assertIncludes('supabase/migrations/0006_phase6_scoring_guards.sql', 'Completed score runs are immutable', 'score-run immutability guard');
assertIncludes('supabase/migrations/0006_phase6_scoring_guards.sql', 'Current score run must be completed', 'current-score guard');
assertIncludes('supabase/migrations/0007_phase6_v1_1_atomic_scoring.sql', 'complete_score_run_atomic', 'atomic score persistence RPC');
assertIncludes('supabase/migrations/0007_phase6_v1_1_atomic_scoring.sql', 'guard_score_trace_identity', 'score trace identity guard');
assertIncludes('supabase/migrations/0007_phase6_v1_1_atomic_scoring.sql', 'Question trace count mismatch', 'trace count verification');
assertIncludes('supabase/migrations/0007_phase6_v1_1_atomic_scoring.sql', 'Domain result count mismatch', 'domain count verification');
assertIncludes('supabase/migrations/0007_phase6_v1_1_atomic_scoring.sql', 'phase6_v1_1_atomic_score_run_completed', 'atomic audit event');
assertIncludes('supabase/migrations/0007_phase6_v1_1_atomic_scoring.sql', 'Completed atomic score traces require an answer_id', 'completed-trace answer binding');

const scoringEngine = read('src/lib/scoring/scoring-engine.ts');
if (/openai|anthropic|generative|llm|chatgpt/i.test(scoringEngine)) {
  throw new Error('Scoring engine contains AI-related language. Phase 6 scoring must be deterministic only.');
}

execFileSync('node', ['scripts/phase6-scenario-tests.mjs'], { stdio: 'inherit', cwd: root });
execFileSync('node', ['scripts/phase6-engine-direct-tests.mjs'], { stdio: 'inherit', cwd: root });
console.log('Phase 6 v1.1 smoke check passed. Actual scoring engine tests, deterministic repeatability, atomic RPC persistence contract, trace integrity guards and no-AI scoring guardrails are present.');
