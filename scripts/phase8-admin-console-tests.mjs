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

function assertNotIncludes(file, needle, label) {
  const source = read(file);
  assert(!source.includes(needle), `${label}: expected ${file} not to include ${needle}`);
}

const requiredAdminRoutes = [
  'src/app/score/admin/page.tsx',
  'src/app/score/admin/assessments/page.tsx',
  'src/app/score/admin/assessments/[assessmentRef]/page.tsx',
  'src/app/score/admin/config/questions/page.tsx',
  'src/app/score/admin/config/products/page.tsx',
  'src/app/score/admin/config/content/page.tsx',
  'src/app/score/admin/audit-log/page.tsx'
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
assertIncludes('src/components/admin/AdminShell.tsx', 'Order controls', 'Admin shell uses customer-safe order label');
assertIncludes('src/components/admin/AdminShell.tsx', 'Report controls', 'Admin shell uses customer-safe report label');
assertNotIncludes('src/components/admin/AdminShell.tsx', 'Phase 9', 'Admin navigation must not expose phase labels');
assertNotIncludes('src/components/admin/AdminShell.tsx', 'Phase 10', 'Admin navigation must not expose phase labels');

// PR #31 regression: nav hrefs must resolve through scorePath(), not the raw /admin/* path
// (the raw form resolves outside the /score namespace and can fall through to the legacy
// /login page). Both assertions are needed together - the file could contain the correct
// substring for one link while still having the bug on another.
assertIncludes('src/components/admin/AdminShell.tsx', 'href={scorePath(link.href)}', 'Admin shell nav links must resolve href through scorePath(), not the raw /admin/* path (PR #31 regression)');
assertNotIncludes('src/components/admin/AdminShell.tsx', 'href={link.href}', 'Admin shell nav links must not use the raw, un-namespaced href (the exact PR #31 bug: resolves outside /score, can fall through to the legacy /login)');
{
  const adminShellSource = read('src/components/admin/AdminShell.tsx');
  const requiredAdminHrefs = [
    '/admin', '/admin/orders', '/admin/reports', '/admin/assessments',
    '/admin/config/questions', '/admin/config/products', '/admin/config/content',
    '/admin/audit-log', '/admin/enquiries', '/admin/phase14-activation', '/admin/security'
  ];
  for (const href of requiredAdminHrefs) {
    assert(adminShellSource.includes(`href: '${href}'`), `Admin shell must define a sidebar link for ${href} (resolves to /score${href} under the Fraud Readiness session)`);
  }
}
assertNotIncludes('src/components/admin/AdminShell.tsx', 'Phase 14', 'Admin navigation must not expose internal phase codenames (use business-meaningful labels like the existing Order/Report controls pattern)');

// Phase 14 activation + MFA: routes and pages must exist, and the mutation routes must not
// skip the AAL2 pre-check (defense-in-depth alongside the authoritative Postgres-side check).
const phase14ActivationRoutes = [
  'src/app/score/admin/security/page.tsx',
  'src/app/score/admin/phase14-activation/page.tsx',
  'src/app/score/api/admin/mfa/enroll/route.ts',
  'src/app/score/api/admin/mfa/verify/route.ts',
  'src/app/score/api/admin/mfa/factors/route.ts',
  'src/app/score/api/admin/mfa/unenroll/route.ts',
  'src/app/score/api/admin/phase14-activation/gate/route.ts',
  'src/app/score/api/admin/phase14-activation/feature-policy/route.ts',
  'src/app/score/api/admin/phase14-activation/ai-route-policy/route.ts',
  'src/app/score/api/admin/phase14-activation/settings/route.ts'
];
for (const route of phase14ActivationRoutes) {
  assert(fs.existsSync(path.join(root, route)), `Missing Phase 14 activation/MFA route: ${route}`);
}
const phase14MutationRoutes = [
  'src/app/score/api/admin/phase14-activation/gate/route.ts',
  'src/app/score/api/admin/phase14-activation/feature-policy/route.ts',
  'src/app/score/api/admin/phase14-activation/ai-route-policy/route.ts',
  'src/app/score/api/admin/phase14-activation/settings/route.ts'
];
for (const route of phase14MutationRoutes) {
  assertIncludes(route, 'decodeAalClaimForDisplayOnly', `${route} must pre-check AAL2 before calling its RPC (defense-in-depth; Postgres remains authoritative)`);
  assertIncludes(route, "requireAdmin(['platform_admin'])", `${route} must require the platform_admin role`);
  assertIncludes(route, 'createSupabaseAuthenticatedServerClient', `${route} must call its RPC with the real admin's own session (not a service-role client), or phase14_require_actor cannot resolve auth.uid()`);
}
// The MFA verify route must actually persist the fresh aal2 session back into cookies - a
// success response that leaves the old aal1 cookie in place would silently strand the admin at
// aal1 despite the app claiming MFA succeeded.
assertIncludes('src/app/score/api/admin/mfa/verify/route.ts', 'setAdminSessionCookies', 'MFA verify route must write the new aal2 session back into cookies after a successful verify');

assertIncludes('src/components/admin/AdminLoginForm.tsx', "const SCORE_BASE_PATH = '/score'", 'Admin login form knows score base path');
assertIncludes('src/components/admin/AdminLoginForm.tsx', "fetch(scorePath('/api/admin/login')", 'Admin login posts through score base path');
assertIncludes('src/components/admin/AdminLoginForm.tsx', "window.location.href = scorePath('/admin')", 'Admin login redirects through score base path');

assertIncludes('src/components/assessment/StartAssessmentForm.tsx', "fetch(scorePath('/api/assessments/start')", 'Respondent start posts through score base path');
assertIncludes('src/components/assessment/AssessmentEngine.tsx', 'fetch(`/score/api/assessments/${props.assessmentReference}/answers`', 'Assessment autosave posts through score namespace');
assertIncludes('src/components/assessment/AssessmentEngine.tsx', 'fetch(`/score/api/assessments/${props.assessmentReference}/submit`', 'Assessment submit posts through score namespace');
assertIncludes('src/components/assessment/FreeSnapshot.tsx', 'fetch(scorePath(`/api/assessments/${snapshot.assessmentReference}/report-request`)', 'Snapshot report interest posts through score base path');
assertIncludes('src/app/score/admin/assessments/page.tsx', 'action="/score/admin/assessments"', 'Admin assessment filter form preserves score base path');

assertIncludes('src/app/score/assessment/[assessmentRef]/page.tsx', 'publicDomains(methodology)', 'Assessment page must pass a customer-safe domain view model');
assertIncludes('src/app/score/assessment/[assessmentRef]/page.tsx', 'publicExposureFactors(methodology)', 'Assessment page must pass a customer-safe exposure view model');
assertIncludes('src/app/score/assessment/[assessmentRef]/page.tsx', 'publicSavedAnswers(saved)', 'Assessment page must strip saved question codes before client props');
assertIncludes('src/app/score/assessment/[assessmentRef]/page.tsx', 'publicSavedExposureAnswers(saved)', 'Assessment page must strip saved exposure codes before client props');
assertIncludes('src/app/score/assessment/[assessmentRef]/page.tsx', 'publicAssessmentProgress(progress)', 'Assessment page must strip domain progress codes before client props');
assertIncludes('src/components/assessment/AssessmentEngine.tsx', 'type Domain', 'Assessment engine must use a public domain projection type');
assertIncludes('src/components/assessment/AssessmentEngine.tsx', 'type ExposureFactor', 'Assessment engine must use a public exposure projection type');
assertIncludes('src/components/assessment/AssessmentEngine.tsx', 'publicLabel(', 'Assessment engine must strip any upstream code prefixes from display labels');
assertNotIncludes('src/components/assessment/AssessmentEngine.tsx', 'factorCode', 'Public assessment engine must not receive exposure factor codes');
assertNotIncludes('src/components/assessment/AssessmentEngine.tsx', 'domainCode', 'Public assessment engine must not receive domain codes');
assertNotIncludes('src/components/assessment/AssessmentEngine.tsx', 'questionCode', 'Public assessment engine must not receive question codes');
assertNotIncludes('src/components/assessment/AssessmentEngine.tsx', 'EXP-01', 'Public assessment engine must not carry raw exposure codes');
assertNotIncludes('src/components/assessment/AssessmentEngine.tsx', 'EXP-03', 'Public assessment engine must not carry raw exposure codes');
assertNotIncludes('src/components/assessment/AssessmentEngine.tsx', 'D1-Q01', 'Public assessment engine must not carry raw question codes');
assertNotIncludes('src/components/assessment/AssessmentEngine.tsx', 'N/A rule:', 'Public N/A guidance must not expose rule labels');
assertNotIncludes('src/components/assessment/AssessmentEngine.tsx', '<Badge>Hard gate</Badge>', 'Public question cards must not expose hard-gate labels');
assertNotIncludes('src/components/assessment/FreeSnapshot.tsx', '{domain.domainCode} · {domain.domainName}', 'Public snapshot must not show domain codes');
assertNotIncludes('src/components/assessment/FreeSnapshot.tsx', 'hard-gate', 'Public snapshot must not expose hard-gate language');
assertNotIncludes('src/lib/respondent/na-rules.ts', 'Complete EXP-', 'Respondent-facing applicability reason must not expose EXP labels');
assertNotIncludes('src/lib/respondent/na-rules.ts', 'questionCode', 'Respondent-facing applicability logic must not depend on question codes');

assertIncludes('src/app/score/admin/page.tsx', 'MK Fraud Readiness Score', 'Admin dashboard uses MK Fraud product language');
assertIncludes('src/app/score/admin/page.tsx', 'Internal review control room', 'Admin dashboard no longer reads like a scaffold');
assertIncludes('src/app/score/admin/page.tsx', 'Detailed report interest', 'Admin dashboard uses client-facing product terms');

assertIncludes('src/app/score/admin/assessments/page.tsx', "requireAdmin(['platform_admin', 'reviewer', 'approver', 'read_only_admin'])", 'Assessment list is admin guarded');
assertIncludes('src/app/score/admin/assessments/page.tsx', 'getAdminAssessmentList', 'Assessment list uses server-side data access');
assertIncludes('src/app/score/admin/assessments/page.tsx', 'statusOptions', 'Assessment list supports status filtering');
assertIncludes('src/app/score/admin/assessments/page.tsx', 'Client readiness queue', 'Assessment queue uses polished MK review copy');

assertIncludes('src/app/score/admin/assessments/[assessmentRef]/page.tsx', 'getAdminAssessmentDetail', 'Assessment detail loads admin detail model');
assertIncludes('src/app/score/admin/assessments/[assessmentRef]/page.tsx', 'Answer trace', 'Assessment detail shows answer trace');
assertIncludes('src/app/score/admin/assessments/[assessmentRef]/page.tsx', 'Question-level score trace', 'Assessment detail shows score trace');
assertIncludes('src/app/score/admin/assessments/[assessmentRef]/page.tsx', 'dataRequests', 'Assessment detail shows report request visibility');

assertIncludes('src/lib/admin/assessment-review.ts', 'admin_assessment_detail_viewed', 'Assessment detail access is audited');
assertIncludes('src/lib/admin/assessment-review.ts', 'score_question_traces', 'Admin detail reads score question trace');
assertIncludes('src/lib/admin/assessment-review.ts', 'score_domain_results', 'Admin detail reads domain score trace');
assertIncludes('src/lib/admin/assessment-review.ts', 'assessment_answers', 'Admin detail reads answer trace');
assertIncludes('src/lib/admin/assessment-review.ts', 'report_content_blocks', 'Admin config reads report content blocks');
assertIncludes('src/lib/admin/assessment-review.ts', 'products', 'Admin config reads product pricing foundation');
assertIncludes('src/lib/admin/assessment-review.ts', 'audit_logs', 'Admin audit log is visible');

assertIncludes('src/app/score/admin/config/questions/page.tsx', 'criticalCount', 'Question config shows critical controls');
assertIncludes('src/app/score/admin/config/questions/page.tsx', 'hardGateCount', 'Question config shows hard gates');
assertIncludes('src/app/score/admin/config/products/page.tsx', 'Release boundary', 'Product config uses release-boundary language');
assertIncludes('src/app/score/admin/config/content/page.tsx', 'does not generate reports', 'Content config blocks report generation');
assertIncludes('src/app/score/admin/audit-log/page.tsx', 'append-only', 'Audit log is documented as append-only');
assertNotIncludes('src/app/score/admin/config/products/page.tsx', 'Phase 9', 'Product config must not expose phase labels');
assert(!/>[^<{]*Phase\s+\d/i.test(read('src/app/score/admin/orders/page.tsx')), 'Order controls page must not expose phase labels in rendered copy');
assertNotIncludes('src/app/score/admin/reports/page.tsx', 'Phase', 'Report controls page must not expose phase labels');

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

console.log('Phase 0-8 closeout tests passed. Admin routes, respondent base-path routing, customer-safe public copy, code-free assessment props, assessment trace, score trace, config review, audit visibility, MK polish and no-go boundaries are covered.');
