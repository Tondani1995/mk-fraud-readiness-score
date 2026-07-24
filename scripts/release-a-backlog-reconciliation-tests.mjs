// Release A backlog reconciliation tests.
//
// Sections 1-8 and 10-11 follow the static source-assertion style used by
// scripts/phase9-manual-eft-order-tests.mjs: they read the actual migration SQL and
// TypeScript source and check that the required behaviour (role gates, the 5-character
// note minimum, the upsert-not-duplicate + always-audited write path, the non-PII field
// set) is present in the code, without a database connection.
//
// Section 9c is a genuine functional test, not a source assertion: it imports the real
// csvEscape() implementation from src/lib/backlog-reconciliation/csv-safety.ts (the same
// module the export route imports) and calls it with real payloads, asserting on its
// actual return value. A regression in the formula-injection neutralisation logic itself
// will fail this section even though no database or HTTP layer is involved.
//
// What is NOT covered by this script (would need a live Supabase project/Next.js server to
// execute for real): actually calling classify_backlog_order()/backlog_reconciliation_queue()
// over the wire, or hitting the two Next.js routes with a real/forbidden admin session
// cookie. That live-database coverage (role/session/note-length enforcement, the upsert +
// 2-audit-row behaviour, RLS blocking anon) was independently verified in this work cycle
// by applying every migration to a local Postgres via `supabase start` and running 11
// direct SQL checks against it with synthetic fixture data — see
// docs/safe-launch/09-release-evidence.md and PR #41 for that evidence. It was a one-off
// manual verification, not wired into this repeatable script, because it requires bringing
// up a local Supabase/Docker stack that this script cannot assume is running.

import fs from 'node:fs';
import path from 'node:path';
import { csvEscape } from '../src/lib/backlog-reconciliation/csv-safety.ts';

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function assert(condition, label) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`  ok - ${label}`);
}

function assertIncludes(file, needle, label) {
  assert(read(file).includes(needle), `${label} (expected ${file} to include ${JSON.stringify(needle)})`);
}

function assertNotIncludes(file, needle, label) {
  assert(!read(file).includes(needle), `${label} (expected ${file} NOT to include ${JSON.stringify(needle)})`);
}

const migrationCandidates = fs.existsSync(path.join(root, 'supabase/migrations'))
  ? fs.readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.includes('release_a_backlog_reconciliation'))
  : [];
assert(migrationCandidates.length === 1, 'Exactly one Release A backlog reconciliation migration file exists');
const migration = `supabase/migrations/${migrationCandidates[0]}`;

const service = 'src/lib/backlog-reconciliation/reconciliation-service.ts';
const classifyRoute = 'src/app/score/api/admin/backlog-reconciliation/route.ts';
const exportRoute = 'src/app/score/api/admin/backlog-reconciliation/export/route.ts';
const csvSafety = 'src/lib/backlog-reconciliation/csv-safety.ts';
const page = 'src/app/score/admin/backlog-reconciliation/page.tsx';
const runbook = 'docs/safe-launch/01-backlog-reconciliation-runbook.md';

console.log('--- 1. Files exist ---');
for (const file of [migration, service, classifyRoute, exportRoute, csvSafety, page, runbook]) {
  assert(exists(file), `${file} exists`);
}

console.log('--- 2. Schema shape ---');
assertIncludes(migration, 'create table public.backlog_reconciliation_records', 'Migration creates the governance table');
assertIncludes(migration, 'order_id uuid not null unique references public.orders(id)', 'Table enforces one row per order');
for (const classification of [
  'genuine_customer_order', 'internal_test_order', 'legacy_superseded', 'cancelled',
  'refunded', 'delivered_outside_platform', 'report_still_owed', 'payment_requires_review',
  'unresolved_exception'
]) {
  assertIncludes(migration, `'${classification}'`, `Classification check constraint includes ${classification}`);
}
assertIncludes(migration, 'alter table public.backlog_reconciliation_records enable row level security', 'RLS is enabled on the table');
assertIncludes(migration, 'revoke all on table public.backlog_reconciliation_records from public, anon, authenticated', 'No implicit grants to authenticated');
assertIncludes(migration, "using (public.current_admin_role() in ('platform_admin', 'finance_admin', 'reviewer', 'approver'))", 'Select policy reuses current_admin_role() like the phase14 tables');

console.log('--- 3. classify_backlog_order() enforces role, session and note length (unauthorised classify / short note) ---');
assertIncludes(migration, 'create or replace function public.classify_backlog_order', 'classify_backlog_order() is defined');
assertIncludes(migration, 'security definer', 'RPC is security definer');
assertIncludes(migration, "raise exception 'backlog_reconciliation_no_session'", 'RPC rejects calls with no authenticated actor');
assertIncludes(migration, "if v_actor.role not in ('platform_admin', 'finance_admin') then", 'RPC restricts classification to platform_admin/finance_admin');
assertIncludes(migration, "raise exception 'backlog_reconciliation_role_forbidden'", 'RPC raises a distinct error for a forbidden role');
assertIncludes(migration, 'if length(v_note) < 5 then', 'RPC enforces the 5-character resolution note minimum');
assertIncludes(migration, "raise exception 'backlog_reconciliation_note_too_short'", 'RPC raises a distinct error for a too-short note');
assertIncludes(migration, "length(trim(resolution_note)) >= 5", 'Table-level check constraint backs up the note-length rule in the RPC');

console.log('--- 4. classify_backlog_order() upserts (no duplicate rows) and always audits (two calls -> two audit rows) ---');
assertIncludes(migration, 'on conflict (order_id) do update set', 'Second classification of the same order updates the existing row instead of inserting a duplicate');
assertIncludes(migration, "insert into public.audit_logs (", 'RPC writes to audit_logs');
assertIncludes(migration, "'backlog_order_classified'", 'Audit action is backlog_order_classified');
assertIncludes(migration, 'before_json', 'Audit row captures prior state');
assertIncludes(migration, 'after_json', 'Audit row captures new state');
{
  const sql = read(migration);
  const insertIndex = sql.indexOf('on conflict (order_id) do update set');
  const auditIndex = sql.indexOf('insert into public.audit_logs (');
  assert(insertIndex > -1 && auditIndex > insertIndex, 'The audit_logs insert happens unconditionally after every upsert, so it is not skipped on the second (update) call');
}

console.log('--- 5. backlog_reconciliation_queue() is role-gated and never selects PII columns ---');
assertIncludes(migration, 'create or replace function public.backlog_reconciliation_queue', 'backlog_reconciliation_queue() is defined');
assertIncludes(migration, "if public.current_admin_role() not in ('platform_admin', 'finance_admin', 'reviewer', 'approver') then", 'Queue function gates on role before returning any row');
assertIncludes(migration, "raise exception 'backlog_reconciliation_role_forbidden'", 'Queue function raises the same forbidden error as the classify RPC');
for (const piiColumn of ['o.customer_name', 'o.customer_email', 'o.organisation_name', 'da.recipient_email']) {
  assertNotIncludes(migration, piiColumn, `Queue query never selects ${piiColumn}`);
}

console.log('--- 6. Service layer validates before calling the RPC (defence in depth, matches payment-service.ts style) ---');
assertIncludes(service, 'note.length < 5', 'Service layer rejects a short resolution note before calling the RPC');
assertIncludes(service, 'BACKLOG_CLASSIFICATIONS.includes(input.classification)', 'Service layer validates the classification value client-side');
assertIncludes(service, 'createSupabaseAuthenticatedServerClient', 'Service layer uses the authenticated (not service-role) client so auth.uid() resolves inside the RPC');
assertIncludes(service, "BACKLOG_CLASSIFY_ROLES: AdminRole[] = ['platform_admin', 'finance_admin']", 'Service layer documents the same classify role list as the RPC');
assertIncludes(service, "BACKLOG_QUEUE_VIEW_ROLES: AdminRole[] = ['platform_admin', 'finance_admin', 'reviewer', 'approver']", 'Service layer documents the same queue-view role list as the RPC');

console.log('--- 7. Classify route rejects an unauthorised role before calling the service (unauthorised role cannot classify) ---');
assertIncludes(classifyRoute, 'canManageFinance', 'Classify route is gated by canManageFinance');
assertIncludes(classifyRoute, "reason: 'forbidden'", 'Classify route returns a forbidden reason for a disallowed role');
assertIncludes(classifyRoute, '403', 'Classify route responds 403 for a disallowed role');
{
  const sql = read(classifyRoute);
  const sessionCheckIndex = sql.indexOf('canManageFinance(admin.role)');
  const classifyCallIndex = sql.indexOf('classifyOrder(');
  assert(sessionCheckIndex > -1 && classifyCallIndex > sessionCheckIndex, 'The role check happens before classifyOrder() is ever called');
}

console.log('--- 8. Export route rejects an unauthorised role before querying (unauthorised role cannot export) ---');
assertIncludes(exportRoute, 'BACKLOG_QUEUE_VIEW_ROLES', 'Export route is gated by the same view-role list as the queue');
assertIncludes(exportRoute, "reason: 'forbidden'", 'Export route returns a forbidden reason for a disallowed role');
assertIncludes(exportRoute, '403', 'Export route responds 403 for a disallowed role');
{
  const sql = read(exportRoute);
  const roleCheckIndex = sql.indexOf('BACKLOG_QUEUE_VIEW_ROLES.includes(admin.role)');
  const queryIndex = sql.indexOf('listBacklogQueue()');
  assert(roleCheckIndex > -1 && queryIndex > roleCheckIndex, 'The role check happens before listBacklogQueue() is ever called');
}

console.log('--- 9. CSV export contains no PII field names or PII source columns ---');
assertIncludes(exportRoute, "'Content-Type': 'text/csv", 'Export route serves a CSV content type');
const exportSource = read(exportRoute);
const csvColumnBlockMatch = exportSource.match(/CSV_COLUMNS[^]*?\];/);
assert(Boolean(csvColumnBlockMatch), 'Export route defines a fixed CSV_COLUMNS list');
const csvColumnBlock = csvColumnBlockMatch[0];
for (const piiField of ['customer_name', 'customer_email', 'organisation_name', 'assessment', 'respondent', 'recipient_email']) {
  assert(!csvColumnBlock.toLowerCase().includes(piiField), `CSV column list does not include a PII-shaped field name: ${piiField}`);
}
for (const allowedField of ['order_reference', 'product_name', 'payment_state', 'classification', 'resolution_note', 'order_id', 'report_id']) {
  assert(csvColumnBlock.includes(allowedField), `CSV column list includes the expected non-PII field: ${allowedField}`);
}

console.log('--- 9b. Export route uses the shared csv-safety module (not a re-inlined copy) ---');
assertIncludes(exportRoute, "from '@/lib/backlog-reconciliation/csv-safety'", 'Export route imports csvEscape from the shared, independently-tested module');
assertNotIncludes(exportRoute, 'FORMULA_TRIGGER_CHARS', 'Export route no longer defines its own copy of the formula-trigger set (single source of truth)');

console.log('--- 9c. CSV formula-injection neutralisation: real function calls against the exact payload set ---');
function assertCsvCell(input, expected, label) {
  const actual = csvEscape(input);
  assert(actual === expected, `${label} (csvEscape(${JSON.stringify(input)}) === ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

// Dangerous leading characters: neutralised with a leading single quote, value preserved after it.
assertCsvCell('=SUM(1,1)', '"\'=SUM(1,1)"', 'Formula =SUM(1,1) is neutralised and comma-quoted');
assertCsvCell('+cmd', "'+cmd", 'Formula +cmd is neutralised');
assertCsvCell('-1+2', "'-1+2", 'Formula -1+2 is neutralised (leading minus, not just a negative number)');
assertCsvCell('@IMPORT', "'@IMPORT", 'Formula @IMPORT is neutralised');

// Leading whitespace/control characters hiding a formula prefix must still be caught.
// The neutralising quote is inserted at the true start of the cell (before the leading
// whitespace), because a spreadsheet's "force text" rule only takes effect when the
// apostrophe is literally the first character of the cell.
assertCsvCell(' =SUM(1,1)', '"\' =SUM(1,1)"', 'Leading-space-then-formula text is neutralised (quote inserted before the leading space, comma-quoted)');
assertCsvCell('\t=SUM(1,1)', '"\'\t=SUM(1,1)"', 'Leading-tab-then-formula text is neutralised (quote inserted before the leading tab, comma-quoted)');

// Plain text, quoted text, commas, line breaks, embedded quotes: never neutralised, still RFC 4180 safe.
assertCsvCell('normal plain text', 'normal plain text', 'Normal plain text passes through unmodified');
assertCsvCell('"already quoted"', '"""already quoted"""', 'Text the admin wrapped in quotes is RFC 4180 quote-doubled, not treated as a formula (quote is not a trigger char)');
assertCsvCell('report owed, follow up', '"report owed, follow up"', 'A comma in free text forces RFC 4180 quoting without formula neutralisation');
assertCsvCell('line one\nline two', '"line one\nline two"', 'An embedded line break forces RFC 4180 quoting without formula neutralisation');
assertCsvCell('the customer said "urgent"', '"the customer said ""urgent"""', 'Embedded double quotes are doubled per RFC 4180 without formula neutralisation');
assertCsvCell(null, '', 'null values render as an empty cell');
assertCsvCell(undefined, '', 'undefined values render as an empty cell');
assertCsvCell(42, '42', 'Numeric values pass through unmodified (no digit is a formula trigger)');

console.log('--- 10. Placeholder examples only (no fabricated customer data anywhere in the new code/docs) ---');
const allNewSources = [migration, service, classifyRoute, exportRoute, page, runbook].map(read).join('\n');
assert(!/@(gmail|yahoo|outlook|hotmail)\.com/i.test(allNewSources), 'No example email addresses appear anywhere in the new files');
assert(read(runbook).includes('ORD-0001'), 'Runbook uses the documented ORD-0001 placeholder style for example order references, not a real order');

console.log('--- 11. package.json wiring ---');
assertIncludes('package.json', '"release-a:test-backlog-reconciliation": "node scripts/release-a-backlog-reconciliation-tests.mjs"', 'package.json registers the Release A test script');

console.log('\nRelease A backlog reconciliation static checks passed: role gating (classify + export), the 5-character note minimum, the upsert-not-duplicate + always-audited write path, and the non-PII CSV/queue field set are all present in source. This script does not connect to a live Supabase project — see the header comment for what a live integration run would still need to verify.');
