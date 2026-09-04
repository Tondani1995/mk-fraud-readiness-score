import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const route = read('src/app/score/api/admin/comprehensive/synthetic/route.ts');
const service = read('src/lib/comprehensive/synthetic-fixture-generation.ts');
const download = read('src/app/score/api/admin/synthetic-reports/[reportId]/download/route.ts');
const migration = read('supabase/migrations/20260904150000_frozen_synthetic_report_generation_and_explainability.sql');
const commercial = read('src/app/score/api/admin/comprehensive/[orderReference]/generate/route.ts');
const dashboard = read('src/lib/admin/dashboard.ts');

assert.match(route, /requireAuthenticatedAdmin\(\['platform_admin'\]\)/);
assert.match(route, /x-idempotency-key/);
assert.match(route, /generateSyntheticComprehensiveReport/);
assert.doesNotMatch(route.slice(0, route.indexOf('/**')), /getAdminSession|orders|payments|invoices|email|customer delivery/i);

assert.match(service, /claim_synthetic_comprehensive_generation/);
assert.match(service, /complete_synthetic_comprehensive_generation/);
assert.match(service, /fail_synthetic_comprehensive_generation/);
assert.match(service, /renderComprehensiveReportPdf/);
assert.match(service, /maxRepairsPerSlot: 0/);
assert.match(service, /prependSyntheticSampleCover/);
assert.doesNotMatch(service, /registerComprehensivePackageAtomically|completeComprehensivePackage|createComprehensiveRecoveryRevision/);
assert.doesNotMatch(service.slice(0, service.indexOf('export const SYNTHETIC_COMPREHENSIVE_ENGINE_CONTRACT')), /createOrder|createPayment|send.*email|invoice/i);

assert.match(download, /requireAuthenticatedAdmin\(\['platform_admin'\]\)/);
assert.match(download, /synthetic_demonstration/);
assert.match(download, /readVerifiedPrivatePdf/);
assert.match(download, /recordPrivateReportAccessEvidence/);

assert.match(migration, /synthetic_demonstration boolean not null default false/);
assert.match(migration, /synthetic_report_generation_records/);
assert.match(migration, /synthetic_generation_service_role_required/);
assert.match(migration, /synthetic_generation_order_binding_forbidden/);
assert.match(migration, /customer_delivery_authorised.*false/);
assert.match(migration, /synthetic_score_explainability/);
assert.doesNotMatch(migration, /insert into public\.orders/i);
assert.doesNotMatch(migration, /insert into public\.(payments|invoices|email_events)/i);

assert.match(commercial, /orderReference/);
assert.match(commercial, /generateComprehensivePackage/);
assert.match(dashboard, /eq\('synthetic_demonstration', false\)/g);

console.log(JSON.stringify({ ok: true, assertions: 25, route: 'platform_admin_only', engine: 'shared_comprehensive_manual_generation', commercial_path_unchanged: true }));
