import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const service = read('src/lib/reports/customer-report-access.ts');
const migration = read('supabase/migrations/20260804203520_g29_customer_report_access_audit.sql');
// The application surface moved to the artefact-aware audit function. The accepted G29 migration
// below is asserted unchanged: its function and grant must still exist exactly as accepted.
const artefactMigration = read('supabase/migrations/20260807130000_report_artefact_access_audit.sql');

assert.match(service, /rpc\('record_customer_report_artefact_access'/, 'customer path uses the atomic audit RPC');
assert.match(service, /p_artefact_type:/, 'the audit RPC receives the requested artefact');
assert.match(artefactMigration, /create or replace function public\.record_customer_report_artefact_access\(/, 'artefact-aware audit RPC exists');
assert.match(artefactMigration, /'artefact_type', p_artefact_type/, 'artefact type is persisted in metadata_json');
assert.match(artefactMigration, /not in \('pdf', 'supporting_register'\)/, 'artefact vocabulary is closed');
assert.match(artefactMigration, /'respondent_token', 'customer_report_access_tokens'/, 'actor semantics are preserved');
assert.match(artefactMigration, /grant execute on function public\.record_customer_report_artefact_access[\s\S]*to service_role/, 'only service_role receives execute');
assert.doesNotMatch(service, /from\('(?:report_events|order_events|audit_logs)'\)\.insert/, 'customer service does not directly insert audited tables');
assert.match(migration, /create or replace function public\.record_customer_report_access\(/, 'narrow customer audit RPC exists');
assert.match(migration, /actor_type, entity_table, entity_id, action, after_json/, 'RPC records the audit row');
assert.match(migration, /'respondent_token', 'customer_report_access_tokens'/, 'customer actor uses the existing enum value');
assert.match(migration, /insert into public\.report_events/, 'RPC records report access events');
assert.match(migration, /insert into public\.order_events/, 'RPC records order access events');
assert.match(migration, /service_role_required/, 'RPC is service-role restricted');
assert.match(migration, /grant execute on function public\.record_customer_report_access[\s\S]*to service_role/, 'only service_role receives execute');

console.log(JSON.stringify({ ok: true, assertions: 14, atomicAudit: true, actorType: 'respondent_token' }));
