import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const assessmentPage = read('src/app/score/admin/assessments/[assessmentRef]/page.tsx');
const actions = read('src/components/admin/AssessmentEssentialReportActions.tsx');
const generation = read('src/app/score/api/admin/assessments/[assessmentRef]/generate-essential-report/route.ts');
const download = read('src/app/score/api/admin/assessments/[assessmentRef]/reports/[reportId]/download/route.ts');
const loginPage = read('src/app/score/admin/login/page.tsx');

assert.match(assessmentPage, /requireAdmin/);
assert.match(assessmentPage, /ADMIN_MUTATION_ROLES/);
assert.doesNotMatch(assessmentPage, /getAdminMutationAuthState|authState|Sign in/);

assert.match(actions, /Generate Essential report/);
assert.match(actions, /Download Report/);
assert.doesNotMatch(actions, /Sign in to generate|authState|AdminMutationAuthState|localStorage|sessionStorage/);

for (const [label, source] of [['generation', generation], ['download', download]]) {
  assert.match(source, /getAdminSession/, `${label} must bind the deployment runtime actor`);
  assert.doesNotMatch(source, /getAuthenticatedAdminSession/, `${label} must not require browser Supabase Auth`);
}
assert.match(generation, /GENERATION_ROLES/);
assert.match(download, /DOWNLOAD_ROLES/);
assert.match(generation, /generateManualPhase1Report/);
assert.match(download, /createSecureAssessmentAdminReportAccess/);
assert.match(loginPage, /redirect\('\/score\/admin'\)/);

for (const removed of [
  'src/app/score/api/admin/session/login/route.ts',
  'src/app/score/api/admin/session/logout/route.ts',
  'src/components/admin/AdminSessionLoginForm.tsx',
  'src/components/admin/AdminLogoutButton.tsx'
]) assert.equal(fs.existsSync(path.join(root, removed)), false, `${removed} must not remain in the direct-link design`);

console.log('V12 admin direct-link access tests passed: the assessment console uses its deployment-bound runtime actor, the report actions have no browser-login gate, role boundaries remain, and the Supabase Auth seam is removed.');
