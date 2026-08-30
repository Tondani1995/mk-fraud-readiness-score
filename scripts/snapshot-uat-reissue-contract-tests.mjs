import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routePath = path.join(root, 'src/app/score/api/qa/uat/reissue-snapshot/[assessmentRef]/route.ts');
const route = fs.readFileSync(routePath, 'utf8');
const guardPath = path.join(root, 'src/lib/uat/snapshot-link-reissue-guard.ts');
const guard = fs.readFileSync(guardPath, 'utf8');

assert.match(route, /TEMPORARY — MUST NOT BE PROMOTED/);
assert.match(route, /createSnapshotTokenForAssessment/);
assert.match(route, /VERCEL_ENV/);
assert.match(route, /snapshot_uat_reissue_consumed/);
assert.match(route, /23505/);
assert.match(route, /revokeExisting: true/);
assert.match(route, /Cache-Control.*no-store/);
assert.match(route, /snapshotUrl/);
assert.match(route, /expiresAt/);
assert.match(route, /nonce_sha256/);
assert.match(guard, /UAT_NONCE_SHA256 = '[0-9a-f]{64}'/);
assert.match(guard, /timingSafeEqual/);
assert.doesNotMatch(route, /console\.(log|info|warn|error)\s*\(/);
assert.doesNotMatch(route, /requireAuthenticatedAdmin|getAdminSession|getAdminAccessTokenFromCookies/);
assert.doesNotMatch(route, /scoreSubmittedAssessment|buildCachedSnapshotNarrative|createPaidOrder|create_paid_order/);
assert.doesNotMatch(route, /tokenHash|token_hash|ASSESSMENT_TOKEN_PEPPER|SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(route, /process\.env\.VERCEL_ENV\s*!==\s*['"]production['"]/);
assert.match(guard, /vercelEnv === 'preview'/);
assert.match(guard, /cx\/v12-customer-experience-recovery-20260828/);
assert.match(guard, /penhenkzfrtmcxklodtu/);
assert.match(guard, /MKFRS-2026-3BCED59B03/);
assert.match(guard, /UAT_SNAPSHOT_ORIGIN = 'https:\/\/mk-fraud-platform-7ipe3p8kf-tondanis-projects\.vercel\.app'/);

const source = await import(`file://${guardPath}`);
assert.equal(source.supabaseProjectRef('https://penhenkzfrtmcxklodtu.supabase.co'), 'penhenkzfrtmcxklodtu');
assert.equal(source.supabaseProjectRef('https://jvjxlphdyzerrhwcgkup.supabase.co'), 'jvjxlphdyzerrhwcgkup');
assert.equal(source.supabaseProjectRef('not-a-url'), null);

const validBinding = {
  vercelEnv: 'preview',
  gitBranch: 'cx/v12-customer-experience-recovery-20260828',
  publicSupabaseUrl: 'https://penhenkzfrtmcxklodtu.supabase.co',
  serverSupabaseUrl: 'https://penhenkzfrtmcxklodtu.supabase.co'
};
assert.equal(source.isUatPreviewBinding(validBinding), true);
assert.equal(source.isUatPreviewBinding({ ...validBinding, vercelEnv: 'production' }), false);
assert.equal(source.isUatPreviewBinding({ ...validBinding, gitBranch: 'main' }), false);
assert.equal(source.isUatPreviewBinding({ ...validBinding, publicSupabaseUrl: 'https://iszihmmbgsfefawqmnwo.supabase.co' }), false);
assert.equal(source.isUatPreviewBinding({ ...validBinding, serverSupabaseUrl: 'https://jvjxlphdyzerrhwcgkup.supabase.co' }), false);

assert.equal(source.matchesUatNonce('not-the-uat-nonce'), false);
assert.equal(source.matchesUatNonce(''), false);
assert.equal(source.matchesUatNonce('x'.repeat(257)), false);
assert.equal(source.matchesUatNonce('b802eef15138e3b09c473c68a11151a88010d0b7c90a13365c82876724f86f7b'), false);

console.log('Snapshot UAT reissue contract tests: PASS');
