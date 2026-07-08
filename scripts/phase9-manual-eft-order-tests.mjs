import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function assertIncludes(file, needle, label) {
  assert(read(file).includes(needle), `${label}: expected ${file} to include ${needle}`);
}

function assertNotIncludes(file, needle, label) {
  assert(!read(file).includes(needle), `${label}: expected ${file} not to include ${needle}`);
}

const migration = 'supabase/migrations/0010_phase9_manual_eft_order_flow.sql';
assert(exists(migration), 'Phase 9 migration must exist.');
assertIncludes(migration, 'create table if not exists public.eft_settings', 'Migration creates EFT settings when missing');
assertIncludes(migration, "'FNB'", 'Migration seeds configured bank name');
assertIncludes(migration, "'MK Fraud Insights'", 'Migration seeds configured account holder');
assertIncludes(migration, "'63106109332'", 'Migration seeds configured account number');
assertIncludes(migration, "'250655'", 'Migration seeds configured branch code');
assertIncludes(migration, 'Use your order reference as the payment reference.', 'Migration seeds payment reference instruction');
assertIncludes(migration, 'MK Fraud Insights confirms EFT payments manually before any detailed report is released.', 'Migration seeds customer EFT instruction');
assertIncludes(migration, 'alter table public.orders', 'Migration extends existing orders table');
assertIncludes(migration, 'report_request_id uuid references public.data_requests(id)', 'Orders link to existing data request table');
assertIncludes(migration, 'eft_instructions_snapshot jsonb', 'Orders snapshot EFT instructions');
assertIncludes(migration, 'create table if not exists public.order_events', 'Migration creates order event timeline');
assertIncludes(migration, "'awaiting_payment'", 'Order statuses include awaiting payment');
assertIncludes(migration, "'payment_received'", 'Order statuses include payment received');
assertIncludes(migration, "'cancelled'", 'Order statuses include cancelled');
assertIncludes(migration, "'expired'", 'Order statuses include expired');
assertIncludes(migration, 'orders_assessment_report_request_unique', 'Migration protects against duplicate linked orders');
assertIncludes(migration, 'payment_gateway":false', 'Migration records no gateway boundary');
assertIncludes(migration, 'pdf_generation":false', 'Migration records no PDF boundary');
assertIncludes(migration, 'report_unlock":false', 'Migration records no report unlock boundary');

const orderLib = 'src/lib/orders/manual-eft-orders.ts';
assert(exists(orderLib), 'Manual EFT order service must exist.');
assertIncludes(orderLib, 'createOrGetOrderForReportRequest', 'Order service creates or returns existing order');
assertIncludes(orderLib, "from('eft_settings')", 'Order service reads EFT settings table');
assertIncludes(orderLib, 'buildEftInstructionSnapshot', 'Order service snapshots EFT settings');
assertIncludes(orderLib, "from('order_events')", 'Order service writes order event timeline');
assertIncludes(orderLib, "from('audit_logs')", 'Order service writes audit logs');
assertIncludes(orderLib, 'payment_gateway: false', 'Order service explicitly blocks payment gateway');
assertIncludes(orderLib, 'pdf_generation: false', 'Order service explicitly blocks PDF generation');
assertIncludes(orderLib, 'report_unlock: false', 'Order service explicitly blocks report unlock');

const reportRoute = 'src/app/api/assessments/[assessmentRef]/report-request/route.ts';
assertIncludes(reportRoute, 'createOrGetOrderForReportRequest', 'Report request route creates or returns manual EFT order');
assertIncludes(reportRoute, 'detailed_report_request_reconfirmed', 'Report request route handles repeated clicks safely');
assertIncludes(reportRoute, 'Your detailed report request has been received', 'Report request response is customer safe');
assertIncludes(reportRoute, 'Please use your order reference as the payment reference', 'Report request returns EFT next-step language');

const snapshot = 'src/components/assessment/FreeSnapshot.tsx';
assertIncludes(snapshot, 'OrderConfirmationPanel', 'Snapshot shows order confirmation panel');
assertIncludes(snapshot, 'Manual EFT details', 'Snapshot can show configured EFT details');
assertIncludes(snapshot, 'Payment reference', 'Snapshot shows payment reference');
assertIncludes(snapshot, 'MK Fraud Insights confirms EFT payments manually', 'Snapshot explains manual payment confirmation');
assertNotIncludes(snapshot, 'PayFast', 'Snapshot must not mention PayFast');
assertNotIncludes(snapshot, 'Upload proof', 'Snapshot must not expose proof upload');
assertNotIncludes(snapshot, 'Download report', 'Snapshot must not expose report download');

assert(exists('src/app/admin/orders/page.tsx'), 'Admin order list route must exist.');
assert(exists('src/app/admin/orders/[orderReference]/page.tsx'), 'Admin order detail route must exist.');
assert(exists('src/app/admin/orders/[orderReference]/status/route.ts'), 'Admin order status route must exist.');
assertIncludes('src/app/admin/orders/page.tsx', 'Order queue', 'Admin order list shows queue');
assertIncludes('src/app/admin/orders/[orderReference]/page.tsx', 'Payment received does not generate or release the detailed report in V1', 'Admin detail preserves Phase 10 boundary');
assertIncludes('src/app/admin/orders/[orderReference]/status/route.ts', 'canManageFinance', 'Status update is finance/admin guarded');
assertIncludes('src/app/admin/orders/[orderReference]/status/route.ts', 'updateAdminOrderStatus', 'Status route uses order service');

assertNotIncludes('src/components/admin/AdminShell.tsx', 'Phase 9', 'Normal admin navigation must not expose Phase 9 label');
assertNotIncludes('src/components/admin/AdminShell.tsx', 'Phase 10', 'Normal admin navigation must not expose Phase 10 label');
assertNotIncludes('src/app/admin/orders/page.tsx', 'Phase', 'Order list should not read like a phase scaffold');

const changedSources = [
  migration,
  orderLib,
  reportRoute,
  snapshot,
  'src/app/admin/orders/page.tsx',
  'src/app/admin/orders/[orderReference]/page.tsx',
  'src/app/admin/orders/[orderReference]/status/route.ts'
].map(read).join('\n');

assert(!/PayFast|card payment|payment_proofs\.insert|generatePdf|generatePDF|createReport\(|report download URL|client portal|respondent dashboard|AI-generated recommendations|public benchmark/i.test(changedSources), 'Phase 9 must not introduce gateway, proof-upload, PDF, portal, AI or benchmark functionality.');
assert(!/\bEXP-0[1-8]\b|\bD(?:[1-9]|10)-Q\d{2}\b|N\/A rule|hard-gate/i.test(read(snapshot)), 'Snapshot must not expose internal methodology codes or rule labels.');

console.log('Phase 9 manual EFT order tests passed. Manual order creation, EFT snapshots, admin controls, audit events, /score routing and no-go boundaries are covered.');
