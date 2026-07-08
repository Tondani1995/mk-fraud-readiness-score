import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function assertIncludes(file, needle, label) {
  const source = read(file);
  assert(source.includes(needle), `${label}: expected ${file} to include ${needle}`);
}

const requiredAdminRoutes = [
  'src/app/admin/page.tsx',
  'src/app/admin/assessments/page.tsx',
  'src/app/admin/assessments/[assessmentRef]/page.tsx',
  'src/app/admin/config/questions/page.tsx',
  'src/app/admin/config/products/page.tsx',
  'src/app/admin/config/content/page.tsx',
  'src/app/admin/audit-log/page.tsx'
];

for (const route of requiredAdminRoutes) {
  assert(fs.existsSync(path.join(root, route)), `Missing Phase 8 admin route: ${route}`);
}

assertIncludes('src/components/admin/AdminShell.tsx', 'MK Fraud Insights', 'Admin shell carries MK Fraud branding');
assertIncludes('src/components/admin/AdminShell.tsx', 'Readiness Control Room', 'Admin shell uses branded control-room language');
assertIncludes('src/components/admin/AdminShell.tsx', "action={scorePath('/api/admin/logout')}", 'Admin logout posts through score base path');
assertIncludes('src/components/admin/AdminShell.tsx', '/admin/assessments', 'Admin shell links to assessment list');
assertIncludes('src/components/admin/AdminShell.tsx', '/admin/config/questions', 'Admin shell links to question config');
assertIncludes('src/components/admin/AdminShell.tsx', '/admin/config/products', 'Admin shell links to product config');
assertIncludes('src/components/admin/AdminShell.tsx', '/admin/audit-log', 'Admin shell links to audit log');

assertIncludes('src/components/admin/AdminLoginForm.tsx', "const SCORE_BASE_PATH = '/score'", 'Admin login form knows score base path');
assertIncludes('src/components/admin/AdminLoginForm.tsx', "fetch(scorePath('/api/admin/login')", 'Admin login posts through score base path');
assertIncludes('src/components/admin/AdminLoginForm.tsx', "window.location.href = scorePath('/admin')", 'Admin login redirects through score base path');

assertIncludes('src/components/assessment/StartAssessmentForm.tsx', "fetch(scorePath('/api/assessments/start')", 'Respondent start posts through score base path');
assertIncludes('src/components/assessment/AssessmentEngine.tsx', 'fetch(scorePath(`/api/assessments/${assessmentReference}/answers`)', 'Assessment autosave posts through score base path');
assertIncludes('src/components/assessment/AssessmentEngine.tsx', 'fetch(scorePath(`/api/assessments/${assessmentReference}/submit`)', 'Assessment submit posts through score base path');
assertIncludes('src/components/assessment/FreeSnapshot.tsx', 'fetch(scorePath(`/api/assessments/${snapshot.assessmentReference}/report-request`)', 'Snapshot report interest posts through score base path');
assertIncludes('src/app/admin/assessments/page.tsx', 'action="/score/admin/assessments"', 'Admin assessment filter form preserves score base path');

assertIncludes('src/app/admin/page.tsx', 'MK Fraud Readiness Score', 'Admin dashboard uses MK Fraud product language');
assertIncludes('src/app/admin/page.tsx', 'Internal review control room', 'Admin dashboard no longer reads like a scaffold');
assertIncludes('src/app/admin/page.tsx', 'Detailed report interest', 'Admin dashboard uses client-facing product terms');

assertIncludes('src/app/admin/assessments/page.tsx', "requireAdmin(['platform_admin', 'reviewer', 'approver', 'read_only_admin'])", 'Assessment list is admin guarded');
assertIncludes('src/app/admin/assessments/page.tsx', 'getAdminAssessmentList', 'Assessment list uses server-side data access');
assertIncludes('src/app/admin/assessments/page.tsx', 'statusOptions', 'Assessment list supports status filtering');
assertIncludes('src/app/admin/assessments/page.tsx', 'Client readiness queue', 'Assessment queue uses polished MK review copy');

assertIncludes('src/app/admin/assessments/[assessmentRef]/page.tsx', 'getAdminAssessmentDetail', 'Assessment detail loads admin detail model');
assertIncludes('src/app/admin/assessments/[assessmentRef]/page.tsx', 'Answer trace', 'Assessment detail shows answer trace');
assertIncludes('src/app/admin/assessments/[assessmentRef]/page.tsx', 'Question-level score trace', 'Assessment detail shows score trace');
assertIncludes('src/app/admin/assessments/[assessmentRef]/page.tsx', 'dataRequests', 'Assessment detail shows report request visibility');

assertIncludes('src/lib/admin/assessment-review.ts', 'admin_assessment_detail_viewed', 'Assessment detail access is audited');
assertIncludes('src/lib/admin/assessment-review.ts', 'score_question_traces', 'Admin detail reads score question trace');
assertIncludes('src/lib/admin/assessment-review.ts', 'score_domain_results', 'Admin detail reads domain score trace');
assertIncludes('src/lib/admin/assessment-review.ts', 'assessment_answers', 'Admin detail reads answer trace');
assertIncludes('src/lib/admin/assessment-review.ts', 'report_content_blocks', 'Admin config reads report content blocks');
assertIncludes('src/lib/admin/assessment-review.ts', 'products', 'Admin config reads product pricing foundation');
assertIncludes('src/lib/admin/assessment-review.ts', 'audit_logs', 'Admin audit log is visible');

assertIncludes('src/app/admin/config/questions/page.tsx', 'criticalCount', 'Question config shows critical controls');
assertIncludes('src/app/admin/config/questions/page.tsx', 'hardGateCount', 'Question config shows hard gates');
assertIncludes('src/app/admin/config/products/page.tsx', 'Phase 9', 'Product config parks Phase 9 actions');
assertIncludes('src/app/admin/config/content/page.tsx', 'does not generate reports', 'Content config blocks report generation');
assertIncludes('src/app/admin/audit-log/page.tsx', 'append-only', 'Audit log is documented as append-only');

const changedSources = requiredAdminRoutes.concat([
  'src/components/admin/AdminShell.tsx',
  'src/components/admin/AdminLoginForm.tsx',
  'src/components/assessment/StartAssessmentForm.tsx',
  'src/components/assessment/AssessmentEngine.tsx',
  'src/components/assessment/FreeSnapshot.tsx',
  'src/lib/admin/assessment-review.ts',
  'src/lib/admin/dashboard.ts'
]).map(read).join('\n');

assert(!/PayFast|card payment integration|respondent dashboard|client portal|AI-generated live/i.test(changedSources), 'Phase 8 admin code should not introduce parked V1 features.');
assert(!/generatePdf|generatePDF|createReport\(|payment_proofs\.insert|orders\.update/i.test(changedSources), 'Phase 8 must not generate reports or verify payment.');

console.log('Phase 0-8 closeout tests passed. Admin routes, respondent base-path routing, assessment trace, score trace, config review, audit visibility, MK polish and no-go boundaries are covered.');
