import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'src/app/api/admin/login/route.ts',
  'src/app/api/admin/logout/route.ts',
  'src/app/api/admin/me/route.ts',
  'src/app/api/assessments/start/route.ts',
  'src/app/api/assessments/resume/route.ts',
  'src/app/admin/login/page.tsx',
  'src/components/admin/AdminLoginForm.tsx',
  'src/components/admin/AdminShell.tsx',
  'src/components/admin/ProtectedAdminPage.tsx',
  'src/components/assessment/StartAssessmentForm.tsx',
  'src/lib/auth/admin-route.ts',
  'src/lib/auth/session-cookies.ts',
  'src/lib/respondent/start-assessment.ts',
  'src/lib/respondent/tokens.ts',
  'src/lib/respondent/validation.ts',
  'src/lib/security/hash.ts',
  'src/lib/security/rate-limit.ts',
  'supabase/migrations/0001_phase2_v1_1_schema_rls.sql',
  'supabase/migrations/0002_phase4_dev_seed.sql',
  'supabase/migrations/0004_phase4_v1_2_rate_limiting.sql',
  'supabase/admin-bootstrap-template.sql',
  'docs/SUPABASE_DEV_SETUP_PHASE4.md',
  'docs/PHASE_4_TEST_PLAN.md',
  'docs/PHASE_4_EXIT_CARD.md',
  'docs/PHASE_4_V1_2_REPAIR_LOG.md'
];

const forbiddenStrings = [
  'read_only\'',
  'snapshot_generated',
  'paid_report_requested',
  'under_mk_review',
  'report_released',
  'verification_pending',
  'reviewed\'',
  'requireAdminShell',
  'phase-3-admin-shell'
];



function extractCreateTableBlocks(sqlText) {
  const blocks = [];
  const regex = /create\s+table\s+(?:if\s+not\s+exists\s+)?([\w.\"]+)\s*\(([^;]*)\);/gims;
  let match;
  while ((match = regex.exec(sqlText)) !== null) {
    blocks.push({ tableName: match[1], body: match[2] });
  }
  return blocks;
}

function findDuplicateSqlColumns(sqlText) {
  const duplicates = [];
  const constraintPrefixes = new Set(['constraint', 'primary', 'foreign', 'unique', 'check', 'exclude']);
  for (const block of extractCreateTableBlocks(sqlText)) {
    const seen = new Map();
    const lines = block.body.split('\n');
    for (const line of lines) {
      const cleaned = line.replace(/--.*$/, '').trim();
      if (!cleaned) continue;
      const firstToken = cleaned.split(/\s+/)[0]?.replace(/[",]/g, '').toLowerCase();
      if (!firstToken || constraintPrefixes.has(firstToken)) continue;
      const count = seen.get(firstToken) ?? 0;
      seen.set(firstToken, count + 1);
    }
    for (const [column, count] of seen.entries()) {
      if (count > 1) duplicates.push(`${block.tableName}.${column} appears ${count} times`);
    }
  }
  return duplicates;
}

function findBasicSqlSyntaxRisks(sqlText) {
  const risks = [];
  if (/,,/.test(sqlText)) risks.push('SQL contains a double comma sequence.');
  if (/create\s+table[\s\S]*?,\s*\);/im.test(sqlText)) risks.push('SQL contains a trailing comma before a create-table closing bracket.');
  if (/not\s+null\s+default\s+'\[\]'::jsonb\s*\n\s*[a-z_]+\s+jsonb/im.test(sqlText)) {
    risks.push('SQL may contain adjacent jsonb columns without a comma; inspect create-table blocks.');
  }
  return risks;
}

function assertAdminProtectionBeforeServiceQueries(filePath, text) {
  const hasSensitiveQuery = text.includes('createSupabaseServiceClient(') || text.includes('getAdminDashboardCounts(');
  if (!hasSensitiveQuery) return;
  const requireIndex = text.indexOf('requireAdmin(');
  const serviceIndex = text.includes('createSupabaseServiceClient(') ? text.indexOf('createSupabaseServiceClient(') : Number.POSITIVE_INFINITY;
  const dashboardIndex = text.includes('getAdminDashboardCounts(') ? text.indexOf('getAdminDashboardCounts(') : Number.POSITIVE_INFINITY;
  const firstSensitiveIndex = Math.min(serviceIndex, dashboardIndex);
  if (requireIndex === -1 || requireIndex > firstSensitiveIndex) {
    violations.push(`${path.relative(root, filePath)} must call requireAdmin() before any service-role query or dashboard data fetch.`);
  }
}

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error('Phase 4 smoke check failed. Missing files:');
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}

const filesToScan = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|json)$/.test(entry.name)) filesToScan.push(full);
    else if (/\.(md|sql)$/.test(entry.name) && !['SCHEMA_CONTRACT.md','PHASE_4_HANDOFF.md'].includes(entry.name)) filesToScan.push(full);
  }
}
walk(root);

const violations = [];
for (const file of filesToScan) {
  const text = fs.readFileSync(file, 'utf8');
  for (const forbidden of forbiddenStrings) {
    if (text.includes(forbidden)) {
      violations.push(`${path.relative(root, file)} contains forbidden legacy value: ${forbidden}`);
    }
  }
  if (path.relative(root, file).startsWith('src/app/admin/') && file.endsWith('.tsx')) {
    assertAdminProtectionBeforeServiceQueries(file, text);
  }
}

const migrationText = fs.readFileSync(path.join(root, 'supabase/migrations/0001_phase2_v1_1_schema_rls.sql'), 'utf8');
for (const duplicate of findDuplicateSqlColumns(migrationText)) {
  violations.push(`Duplicate SQL column definition detected: ${duplicate}`);
}
for (const risk of findBasicSqlSyntaxRisks(migrationText)) {
  violations.push(`Basic SQL syntax risk detected: ${risk}`);
}

const startAssessmentSource = fs.readFileSync(path.join(root, 'src/lib/respondent/start-assessment.ts'), 'utf8');
if (!startAssessmentSource.includes('assessment_tokens') || !startAssessmentSource.includes('token_hash')) {
  violations.push('start-assessment.ts must create an assessment_tokens row using token_hash.');
}
if (startAssessmentSource.includes('rawToken: token.rawToken') || startAssessmentSource.includes('token.rawToken,')) {
  violations.push('start-assessment.ts appears to persist or return raw token outside the resume URL contract.');
}

const adminRouteSource = fs.readFileSync(path.join(root, 'src/lib/auth/admin-route.ts'), 'utf8');
if (!adminRouteSource.includes('admin_profiles') || !adminRouteSource.includes("status', 'active")) {
  violations.push('admin-route.ts must enforce active admin_profiles records.');
}

const startPageSource = fs.readFileSync(path.join(root, 'src/components/assessment/StartAssessmentForm.tsx'), 'utf8');
if (startPageSource.includes('password') || startPageSource.includes('create account')) {
  violations.push('StartAssessmentForm must not introduce respondent passwords or account creation language.');
}

const rateLimitedRoutes = [
  'src/app/api/admin/login/route.ts',
  'src/app/api/assessments/start/route.ts',
  'src/app/api/assessments/resume/route.ts',
  'src/app/assessment/[assessmentRef]/page.tsx'
];
for (const relativePath of rateLimitedRoutes) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) continue;
  const source = fs.readFileSync(fullPath, 'utf8');
  if (!source.includes('checkRateLimits(')) {
    violations.push(`${relativePath} must call checkRateLimits() before performing the sensitive action - rate limiting must not silently regress.`);
  }
}

if (violations.length) {
  console.error('Phase 4 smoke check failed:');
  for (const issue of violations) console.error(`- ${issue}`);
  process.exit(1);
}

console.log('Phase 4 v1.2 smoke check passed. Admin auth, accountless start, token files, SQL duplicate-column guardrails, admin-before-query checks and rate-limit wiring are present.');
