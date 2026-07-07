import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requiredFiles = [
  'package.json',
  '.env.example',
  'src/app/layout.tsx',
  'src/app/page.tsx',
  'src/app/start/page.tsx',
  'src/app/assessment/[assessmentRef]/page.tsx',
  'src/app/snapshot/[assessmentRef]/page.tsx',
  'src/app/report/request/[assessmentRef]/page.tsx',
  'src/app/admin/layout.tsx',
  'src/app/admin/page.tsx',
  'src/app/admin/assessments/page.tsx',
  'src/app/admin/methodology/page.tsx',
  'src/app/admin/orders/page.tsx',
  'src/app/admin/reports/page.tsx',
  'src/app/admin/settings/page.tsx',
  'src/app/api/health/route.ts',
  'src/components/ui/Button.tsx',
  'src/components/ui/Card.tsx',
  'src/lib/supabase/browser.ts',
  'src/lib/supabase/server.ts',
  'docs/PHASE_3_EXIT_CARD.md',
  'docs/PHASE_4_HANDOFF.md',
  'docs/SCHEMA_CONTRACT.md',
  'src/lib/types/domain.ts'
];

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error('Phase 3 smoke check failed. Missing files:');
  for (const file of missing) console.error(`- ${file}`);
  process.exit(1);
}

const secretPatterns = [
  /SUPABASE_SERVICE_ROLE_KEY\s*=\s*eyJ/i,
  /RESEND_API_KEY\s*=\s*re_/i,
  /ASSESSMENT_TOKEN_PEPPER\s*=\s*[A-Za-z0-9_-]{32,}/i
];

const textFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|js|mjs|json|md|example|css)$/.test(entry.name)) textFiles.push(full);
  }
}
walk(root);

const domainTypesPath = path.join(root, 'src/lib/types/domain.ts');
const domainTypes = fs.readFileSync(domainTypesPath, 'utf8');

const requiredSchemaContractValues = [
  'read_only_admin',
  'snapshot_available',
  'report_requested',
  'under_review',
  'closed',
  'awaiting_payment',
  'free_snapshot',
  'essential_self_assessment',
  'mk_validated',
  'respondent_token'
];

const missingContractValues = requiredSchemaContractValues.filter((value) => !domainTypes.includes(`'${value}'`));
if (missingContractValues.length) {
  console.error('Phase 3 smoke check failed. Missing Phase 2 schema-contract enum values in src/lib/types/domain.ts:');
  for (const value of missingContractValues) console.error(`- ${value}`);
  process.exit(1);
}

const forbiddenLegacyValues = [
  "'read_only'",
  "'snapshot_generated'",
  "'paid_report_requested'",
  "'under_mk_review'",
  "'report_released'",
  "'verification_pending'",
  "'reviewed'"
];

const legacyHits = [];
for (const file of textFiles) {
  const relative = path.relative(root, file);
  if (relative === 'scripts/phase3-smoke-check.mjs') continue;
  // Guardrail scripts (e.g. phase4-smoke-check.mjs) necessarily contain these literal
  // strings in their own denylists in order to detect them elsewhere - exclude any
  // scripts/phaseN-smoke-check.mjs file from this scan, not just this one.
  if (/^scripts\/phase\d+-smoke-check\.mjs$/.test(relative)) continue;
  const content = fs.readFileSync(file, 'utf8');
  for (const value of forbiddenLegacyValues) {
    if (content.includes(value)) legacyHits.push(`${relative}: ${value}`);
  }
}

if (legacyHits.length) {
  console.error('Phase 3 smoke check failed. Legacy scaffold enum/status values found:');
  for (const hit of legacyHits) console.error(`- ${hit}`);
  process.exit(1);
}

const leaks = [];
for (const file of textFiles) {
  const content = fs.readFileSync(file, 'utf8');
  for (const pattern of secretPatterns) {
    if (pattern.test(content)) leaks.push(path.relative(root, file));
  }
}

if (leaks.length) {
  console.error('Phase 3 smoke check failed. Possible secret leakage in:');
  for (const file of leaks) console.error(`- ${file}`);
  process.exit(1);
}

console.log('Phase 3 smoke check passed. Required scaffold files exist, schema-contract enum alignment is clean and no obvious secret leakage was detected.');
