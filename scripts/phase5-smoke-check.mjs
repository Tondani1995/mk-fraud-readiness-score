import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const exists = (file) => fs.existsSync(path.join(root, file));

const requiredFiles = [
  'src/components/assessment/AssessmentEngine.tsx',
  'src/lib/respondent/assessment-methodology.ts',
  'src/lib/respondent/assessment-save.ts',
  'src/lib/respondent/na-rules.ts',
  'src/app/score/api/assessments/[assessmentRef]/answers/route.ts',
  'src/app/score/api/assessments/[assessmentRef]/submit/route.ts',
  'supabase/migrations/0003_phase5_methodology_seed.sql',
  'supabase/migrations/0005_phase5_v1_1_guards.sql',
  'docs/PHASE_5_TEST_PLAN.md',
  'docs/PHASE_5_V1_1_TEST_MATRIX.md',
  'docs/PHASE_5_V1_1_REPAIR_LOG.md',
  'docs/SUPABASE_DEV_SETUP_PHASE5.md'
];

const failures = [];

for (const file of requiredFiles) {
  if (!exists(file)) failures.push(`Missing required Phase 5 v1.1 file: ${file}`);
}

const seed = read('supabase/migrations/0003_phase5_methodology_seed.sql');
const questionRows = [...seed.matchAll(/\('D\d+',\s*'(D\d+-Q\d+)'[^\n]+?\,\s*(true|false)\,\s*(true|false)\,\s*(true|false)\,/g)];
const uniqueQuestions = new Set(questionRows.map((match) => match[1]));
if (uniqueQuestions.size !== 68) failures.push(`Expected 68 unique Phase 5 questions in methodology seed; found ${uniqueQuestions.size}.`);

const criticalCount = questionRows.filter((match) => match[2] === 'true').length;
const hardGateCount = questionRows.filter((match) => match[3] === 'true').length;
const conditionalNACount = questionRows.filter((match) => match[4] === 'true').length;
if (criticalCount !== 19) failures.push(`Expected 19 critical controls; found ${criticalCount}.`);
if (hardGateCount !== 17) failures.push(`Expected 17 hard-gate controls; found ${hardGateCount}.`);
if (conditionalNACount !== 11) failures.push(`Expected 11 conditional N/A questions; found ${conditionalNACount}.`);

for (const domain of ['D1','D2','D3','D4','D5','D6','D7','D8','D9','D10']) {
  if (!seed.includes(`'${domain}'`)) failures.push(`Missing domain ${domain} in Phase 5 seed.`);
}

for (const exposure of ['EXP-01','EXP-02','EXP-03','EXP-04','EXP-05','EXP-06','EXP-07','EXP-08']) {
  if (!seed.includes(`'${exposure}'`)) failures.push(`Missing exposure factor ${exposure} in Phase 5 seed.`);
}

for (const hardGateNA of ['D8-Q01', 'D8-Q02', 'D8-Q08']) {
  const row = questionRows.find((match) => match[1] === hardGateNA);
  if (!row) failures.push(`Missing hard-gate N/A question ${hardGateNA}.`);
  else if (!(row[2] === 'true' && row[3] === 'true' && row[4] === 'true')) failures.push(`${hardGateNA} must remain critical, hard-gate and conditional N/A.`);
}

const guards = read('supabase/migrations/0005_phase5_v1_1_guards.sql');
for (const guard of [
  'guard_assessment_answer_write',
  'guard_exposure_answer_write',
  'prevent_methodology_mutation_after_use',
  'is_question_na_applicable',
  'Assessment answers cannot be changed after assessment lock/submission',
  'Methodology version',
  'profile_rule_d8_q01'
]) {
  if (!guards.includes(guard)) failures.push(`Phase 5 v1.1 guard migration missing: ${guard}`);
}

const assessmentPage = read('src/app/score/assessment/[assessmentRef]/page.tsx');
if (!assessmentPage.includes('validateResumeToken') || !assessmentPage.includes('consume: false')) {
  failures.push('Assessment page must validate resume token with consume:false before rendering the engine.');
}
if (!assessmentPage.includes('AssessmentEngine')) failures.push('Assessment page must render AssessmentEngine.');

const naRules = read('src/lib/respondent/na-rules.ts');
for (const ruleGuard of ['evaluateNAEligibility', 'profile_rule_d8_q01', "exposure['EXP-03']", "exposure['EXP-04']", 'requiresSystemProfileRule']) {
  if (!naRules.includes(ruleGuard)) failures.push(`N/A rule engine missing: ${ruleGuard}`);
}

const saveLib = read('src/lib/respondent/assessment-save.ts');
for (const guard of [
  'validateResumeToken',
  'evaluateNAEligibility',
  'questionIdsToClear',
  'assessment.status',
  'assessment_locked',
  'requires an N/A reason of at least 5 characters',
  "status: 'submitted'",
  'locked_at',
  'revoked_at'
]) {
  if (!saveLib.includes(guard)) failures.push(`Assessment save/submit logic missing guard: ${guard}`);
}
if (saveLib.includes(".from('score_runs')") || saveLib.includes('.from("score_runs")')) {
  failures.push('Phase 5 must not write to score_runs.');
}

const methodologyLib = read('src/lib/respondent/assessment-methodology.ts');
if (!methodologyLib.includes('>= 5')) failures.push('Progress must require N/A reason length of at least 5 characters before counting as complete.');

const engine = read('src/components/assessment/AssessmentEngine.tsx');
for (const uiGuard of ['autosaved', 'Submit assessment', 'Not Applicable', 'No scoring in Phase 5', 'evaluateNAEligibility', 'profile-controlled']) {
  const normalized = engine.toLowerCase();
  if (!normalized.includes(uiGuard.toLowerCase())) failures.push(`Assessment engine missing UI guard/label: ${uiGuard}`);
}

const allSourceFiles = [];
function collect(dir) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(rel);
    else if (/\.(ts|tsx)$/.test(entry.name)) allSourceFiles.push(rel);
  }
}
collect('src');
for (const file of allSourceFiles) {
  const content = read(file);
  if (content.includes("status: 'snapshot_available'") || content.includes('snapshot_available')) {
    if (!file.includes('domain.ts')) failures.push(`Phase 5 must not generate snapshot status in ${file}`);
  }
  if (content.includes(".from('score_runs')") || content.includes('.from("score_runs")')) {
    failures.push(`Phase 5 must not access score_runs in ${file}`);
  }
}

const phase5Docs = read('docs/PHASE_5_TEST_PLAN.md') + read('docs/PHASE_5_V1_1_TEST_MATRIX.md') + read('docs/PHASE_5_V1_1_REPAIR_LOG.md');
for (const required of [
  'Score runs',
  'Submitted assessment token',
  'N/A not allowed',
  'cross-assessment',
  'database trigger rejects',
  'methodology immutability',
  '19 critical controls',
  '17 hard gates'
]) {
  if (!phase5Docs.toLowerCase().includes(required.toLowerCase())) failures.push(`Phase 5 documentation missing: ${required}`);
}

if (failures.length) {
  console.error('Phase 5 v1.1 smoke check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Phase 5 v1.1 smoke check passed. Assessment engine, profile-derived N/A, hard-gate N/A protection, draft autosave, submit lock, database guardrails, methodology immutability and no-scoring guardrails are present.');
