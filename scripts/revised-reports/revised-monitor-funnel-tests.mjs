import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20261117120000_readonly_revised_funnel_monitor.sql');
const admin = read('src/lib/admin/monitoring.ts');
const page = read('src/app/score/admin/monitoring/page.tsx');
const legacy = read('src/lib/monitoring/production-monitor.ts');
const robots = read('src/app/robots.ts');
const sitemap = read('src/app/sitemap.ts');
const review = read('src/app/review/layout.tsx');
let passed = 0;
const check = (name, fn) => { fn(); passed++; console.log('PASS ' + name); };

check('RPC permits only server role', () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /revoke all on function public\.review_monitor_funnel\(timestamptz\) from public, anon, authenticated;/);
  assert.match(migration, /grant execute on function public\.review_monitor_funnel\(timestamptz\) to service_role;/);
});
check('RPC excludes fictional sessions without extracting private content', () => {
  assert.match(migration, /s\.fictional is false/);
  assert.doesNotMatch(migration, /link_tokens|full_name|customer_email|p_token|select\s+\*/i);
  for (const field of ['realSessionsStarted','respondentActiveSessions','respondentAnswers','ownerAnswers','commercialAssessmentsBound','paidOrdersRecorded']) assert.ok(migration.includes(field), field);
});
check('RPC distinguishes answers from corrections and owner declines', () => {
  for (const name of ['respondent.answer','respondent.correct','owner.answer','owner.decline']) assert.ok(migration.includes(name));
});
check('Unavailable revised funnel is not represented as zero', () => {
  assert.match(admin, /status: 'unavailable', metrics: null/);
  assert.match(admin, /db\.rpc\('review_monitor_funnel', \{ p_since: since \}\)/);
  assert.match(admin, /Number\.isSafeInteger/);
});
check('Admin presents old and new populations separately', () => {
  assert.match(page, /Revised Fraud Readiness activity, last 24 hours/);
  assert.match(page, /Previous-method assessment signals, last 24 hours/);
  assert.match(page, /Revised funnel data unavailable/);
  assert.match(page, /RETIRED \(revised review live\)/);
});
check('Historical monitoring and release routes remain unmodified', () => {
  assert.match(legacy, /db\.from\('assessment_events'\)/);
  assert.match(sitemap, /absoluteUrl\("\/fraud-readiness"\)/);
  assert.doesNotMatch(sitemap, /absoluteUrl\("\/review"\)/);
  assert.match(robots, /sitemap: absoluteUrl\("\/sitemap\.xml"\)/);
  assert.match(review, /index: false, follow: false/);
});
console.log(`Revised monitor funnel contract: ${passed} checks passed`);
